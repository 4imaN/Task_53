import net from 'node:net';

const webhookUrlError = (message: string) => Object.assign(new Error(message), { statusCode: 422 });

const isPrivateIpv4 = (hostname: string) => {
  const octets = hostname.split('.').map((entry) => Number(entry));
  if (octets.length !== 4 || octets.some((entry) => !Number.isInteger(entry) || entry < 0 || entry > 255)) {
    return false;
  }

  return (
    octets[0] === 10
    || octets[0] === 127
    || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31)
    || (octets[0] === 192 && octets[1] === 168)
  );
};

const isAllowedIpv6 = (hostname: string) => {
  const normalized = hostname.toLowerCase();
  return normalized === '::1'
    || normalized.startsWith('fc')
    || normalized.startsWith('fd')
    || normalized.startsWith('fe8')
    || normalized.startsWith('fe9')
    || normalized.startsWith('fea')
    || normalized.startsWith('feb');
};

const isInternalHostname = (hostname: string) => {
  const normalized = hostname.toLowerCase();
  if (normalized === 'localhost') {
    return true;
  }

  if (/^[a-z0-9-]+$/i.test(normalized)) {
    return true;
  }

  return normalized.endsWith('.local')
    || normalized.endsWith('.internal')
    || normalized.endsWith('.lan');
};

export const validateInternalWebhookUrl = (rawUrl: string) => {
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

  const hostname = parsed.hostname.toLowerCase();
  const ipVersion = net.isIP(hostname);

  const allowed = ipVersion === 4
    ? isPrivateIpv4(hostname)
    : ipVersion === 6
      ? isAllowedIpv6(hostname)
      : isInternalHostname(hostname);

  if (!allowed) {
    throw webhookUrlError('Webhook URL must target an internal network host');
  }

  return parsed.toString();
};
