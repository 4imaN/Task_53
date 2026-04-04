import { lookup } from 'node:dns/promises';
import net from 'node:net';

const webhookUrlError = (message: string) => Object.assign(new Error(message), { statusCode: 422 });

const PRIVATE_BLOCKS = new net.BlockList();
PRIVATE_BLOCKS.addSubnet('10.0.0.0', 8, 'ipv4');
PRIVATE_BLOCKS.addSubnet('172.16.0.0', 12, 'ipv4');
PRIVATE_BLOCKS.addSubnet('192.168.0.0', 16, 'ipv4');
PRIVATE_BLOCKS.addSubnet('fc00::', 7, 'ipv6');

const LOOPBACK_BLOCKS = new net.BlockList();
LOOPBACK_BLOCKS.addSubnet('127.0.0.0', 8, 'ipv4');
LOOPBACK_BLOCKS.addAddress('::1', 'ipv6');

const normalizeHostname = (hostname: string) => hostname.toLowerCase().replace(/\.+$/, '');
const normalizeSuffix = (suffix: string) => normalizeHostname(suffix).replace(/^\.+/, '');
const normalizeAllowedHostnames = (values: readonly string[]) => new Set(
  values
    .map((entry) => normalizeHostname(String(entry).trim()))
    .filter(Boolean)
);
const normalizeAllowedSuffixes = (values: readonly string[]) => values
  .map((entry) => normalizeSuffix(String(entry).trim()))
  .filter(Boolean);

const extractMappedIpv4 = (address: string) => {
  const mapped = address.toLowerCase().match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (!mapped) {
    return null;
  }

  return net.isIP(mapped[1]) === 4 ? mapped[1] : null;
};

const isAllowedIpAddress = (address: string, allowLoopback: boolean) => {
  const mappedIpv4 = extractMappedIpv4(address);
  const normalizedAddress = mappedIpv4 ?? address;
  const family = net.isIP(normalizedAddress);
  if (family !== 4 && family !== 6) {
    return false;
  }

  const network = family === 4 ? 'ipv4' : 'ipv6';
  if (PRIVATE_BLOCKS.check(normalizedAddress, network)) {
    return true;
  }

  return allowLoopback && LOOPBACK_BLOCKS.check(normalizedAddress, network);
};

const isAllowlistedHostname = (
  hostname: string,
  allowedHostnames: Set<string>,
  allowedSuffixes: readonly string[]
) => {
  if (allowedHostnames.has(hostname)) {
    return true;
  }

  return allowedSuffixes.some((suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`));
};

export type WebhookAddressRecord = {
  address: string;
  family: 4 | 6;
};

export type WebhookHostResolver = (hostname: string) => Promise<WebhookAddressRecord[]>;

export type InternalWebhookValidationOptions = {
  allowedHostnames?: readonly string[];
  allowedDomainSuffixes?: readonly string[];
  allowLoopback?: boolean;
  resolveHostname?: WebhookHostResolver;
};

const defaultResolveHostname: WebhookHostResolver = async (hostname) => {
  const records = await lookup(hostname, { all: true, verbatim: true });
  return records
    .map((record) => ({ address: record.address, family: record.family === 6 ? 6 : 4 as 4 | 6 }))
    .filter((record) => record.address);
};

export const validateInternalWebhookUrl = async (
  rawUrl: string,
  options: InternalWebhookValidationOptions = {}
) => {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    throw webhookUrlError('Webhook URL is required');
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw webhookUrlError('Webhook URL must be a valid absolute URL');
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw webhookUrlError('Webhook URL must use http or https');
  }

  if (parsed.username || parsed.password) {
    throw webhookUrlError('Webhook URL must not include embedded credentials');
  }

  const allowLoopback = options.allowLoopback ?? false;
  const hostname = normalizeHostname(parsed.hostname);
  const ipVersion = net.isIP(hostname);
  if (ipVersion === 4 || ipVersion === 6) {
    if (!isAllowedIpAddress(hostname, allowLoopback)) {
      throw webhookUrlError('Webhook URL must target a private internal IP address');
    }

    return parsed.toString();
  }

  const allowedHostnames = normalizeAllowedHostnames(options.allowedHostnames ?? []);
  const allowedSuffixes = normalizeAllowedSuffixes(options.allowedDomainSuffixes ?? []);
  const isSingleLabelHostname = !hostname.includes('.');

  if (isSingleLabelHostname && !allowedHostnames.has(hostname)) {
    throw webhookUrlError('Bare single-label webhook hostnames are not allowed unless explicitly allowlisted');
  }

  if (!isAllowlistedHostname(hostname, allowedHostnames, allowedSuffixes)) {
    throw webhookUrlError('Webhook URL host is not allowlisted for internal delivery');
  }

  const resolveHostname = options.resolveHostname ?? defaultResolveHostname;
  let resolvedAddresses: WebhookAddressRecord[];
  try {
    resolvedAddresses = await resolveHostname(hostname);
  } catch {
    throw webhookUrlError('Webhook URL host could not be resolved to internal addresses');
  }

  if (!resolvedAddresses.length) {
    throw webhookUrlError('Webhook URL host could not be resolved to internal addresses');
  }

  const hasDisallowedAddress = resolvedAddresses.some((record) => !isAllowedIpAddress(record.address, allowLoopback));
  if (hasDisallowedAddress) {
    throw webhookUrlError('Webhook URL host must resolve only to private internal IP addresses');
  }

  return parsed.toString();
};
