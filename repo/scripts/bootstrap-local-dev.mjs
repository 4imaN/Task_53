import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomBytes } from 'node:crypto';

const scriptPath = fileURLToPath(import.meta.url);
const scriptDir = path.dirname(scriptPath);
const repoRoot = path.resolve(scriptDir, '..');

const rootEnvPath = path.join(repoRoot, '.env');
const rootEnvExamplePath = path.join(repoRoot, '.env.example');
const apiEnvLocalPath = path.join(repoRoot, 'apps', 'api', '.env.local');

const parseEnvFile = (fileContents) => {
  const entries = new Map();

  for (const rawLine of fileContents.split(/\r?\n/)) {
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const separatorIndex = rawLine.indexOf('=');
    if (separatorIndex <= 0) {
      continue;
    }

    const key = rawLine.slice(0, separatorIndex).trim();
    let value = rawLine.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    entries.set(key, value);
  }

  return entries;
};

const readEnvFile = (filePath) => {
  if (!existsSync(filePath)) {
    return new Map();
  }

  return parseEnvFile(readFileSync(filePath, 'utf8'));
};

const generateSecretHex = (bytes = 32) => randomBytes(bytes).toString('hex');

const generateAdminPassword = () => {
  const base = randomBytes(18).toString('base64url');
  return `Omni-${base}A1!`;
};

export const buildLocalDevelopmentEnv = (options = {}) => {
  const rootCurrent = readEnvFile(options.rootEnvPath ?? rootEnvPath);
  const rootExample = readEnvFile(options.rootEnvExamplePath ?? rootEnvExamplePath);
  const apiCurrent = readEnvFile(options.apiEnvLocalPath ?? apiEnvLocalPath);
  const generated = new Map();

  const getRootValue = (key, fallback = '') => {
    const current = rootCurrent.get(key)?.trim();
    if (current) {
      return current;
    }

    const example = rootExample.get(key)?.trim();
    if (example) {
      return example;
    }

    return fallback;
  };

  const postgresDb = getRootValue('POSTGRES_DB', 'omnistock');
  const postgresUser = getRootValue('POSTGRES_USER', 'omnistock');
  const postgresPassword = getRootValue('POSTGRES_PASSWORD') || generateSecretHex(24);
  if (!getRootValue('POSTGRES_PASSWORD')) {
    generated.set('POSTGRES_PASSWORD', postgresPassword);
  }

  const jwtSecret = getRootValue('JWT_SECRET') || generateSecretHex(32);
  if (!getRootValue('JWT_SECRET')) {
    generated.set('JWT_SECRET', jwtSecret);
  }

  const encryptionKey = getRootValue('ENCRYPTION_KEY') || generateSecretHex(32);
  if (!getRootValue('ENCRYPTION_KEY')) {
    generated.set('ENCRYPTION_KEY', encryptionKey);
  }

  const defaultAdminPassword = getRootValue('DEFAULT_ADMIN_PASSWORD') || generateAdminPassword();
  if (!getRootValue('DEFAULT_ADMIN_PASSWORD')) {
    generated.set('DEFAULT_ADMIN_PASSWORD', defaultAdminPassword);
  }

  const rootEnv = {
    COMPOSE_PROJECT_NAME: getRootValue('COMPOSE_PROJECT_NAME', 'omnistock'),
    POSTGRES_DB: postgresDb,
    POSTGRES_USER: postgresUser,
    POSTGRES_PASSWORD: postgresPassword,
    DATABASE_URL: getRootValue('DATABASE_URL') || `postgres://${encodeURIComponent(postgresUser)}:${encodeURIComponent(postgresPassword)}@omnistock-db:5432/${postgresDb}`,
    APP_ENV: getRootValue('APP_ENV', 'development'),
    TRUST_PROXY: getRootValue('TRUST_PROXY', '1'),
    JWT_SECRET: jwtSecret,
    SESSION_TTL_HOURS: getRootValue('SESSION_TTL_HOURS', '24'),
    SESSION_IDLE_TIMEOUT_MINUTES: getRootValue('SESSION_IDLE_TIMEOUT_MINUTES', '120'),
    ARGON2_MEMORY_COST: getRootValue('ARGON2_MEMORY_COST', '19456'),
    ARGON2_TIME_COST: getRootValue('ARGON2_TIME_COST', '2'),
    ARGON2_PARALLELISM: getRootValue('ARGON2_PARALLELISM', '1'),
    PASSWORD_HISTORY_DEPTH: getRootValue('PASSWORD_HISTORY_DEPTH', '5'),
    CAPTCHA_TTL_MINUTES: getRootValue('CAPTCHA_TTL_MINUTES', '10'),
    CAPTCHA_FAILURE_THRESHOLD: getRootValue('CAPTCHA_FAILURE_THRESHOLD', '3'),
    LOGIN_LOCKOUT_ATTEMPTS: getRootValue('LOGIN_LOCKOUT_ATTEMPTS', '7'),
    LOGIN_LOCKOUT_MINUTES: getRootValue('LOGIN_LOCKOUT_MINUTES', '15'),
    LOGIN_HINTS_RATE_LIMIT_MAX: getRootValue('LOGIN_HINTS_RATE_LIMIT_MAX', '15'),
    LOGIN_HINTS_RATE_LIMIT_WINDOW_MS: getRootValue('LOGIN_HINTS_RATE_LIMIT_WINDOW_MS', '60000'),
    LOGIN_RATE_LIMIT_MAX: getRootValue('LOGIN_RATE_LIMIT_MAX', '100'),
    LOGIN_RATE_LIMIT_WINDOW_MS: getRootValue('LOGIN_RATE_LIMIT_WINDOW_MS', '60000'),
    UPLOAD_ROOT: getRootValue('UPLOAD_ROOT', '/data/uploads'),
    UPLOAD_QUOTA_GB: getRootValue('UPLOAD_QUOTA_GB', '50'),
    ENCRYPTION_KEY: encryptionKey,
    DEFAULT_ADMIN_USERNAME: getRootValue('DEFAULT_ADMIN_USERNAME', 'admin'),
    DEFAULT_ADMIN_PASSWORD: defaultAdminPassword,
    SEED_DEMO_USERS: getRootValue('SEED_DEMO_USERS', '0'),
    ALLOW_INSECURE_DEV_COOKIES: getRootValue('ALLOW_INSECURE_DEV_COOKIES', '1'),
    ALLOW_DEV_RATE_LIMIT_LOCALHOST_BYPASS: getRootValue('ALLOW_DEV_RATE_LIMIT_LOCALHOST_BYPASS', '0'),
    ALLOW_DEV_WEBHOOK_LOOPBACK: getRootValue('ALLOW_DEV_WEBHOOK_LOOPBACK', '1'),
    INTEGRATION_RATE_LIMIT: getRootValue('INTEGRATION_RATE_LIMIT', '120'),
    WEBHOOK_ALLOWED_HOSTNAMES: getRootValue('WEBHOOK_ALLOWED_HOSTNAMES', ''),
    WEBHOOK_ALLOWED_DOMAIN_SUFFIXES: getRootValue('WEBHOOK_ALLOWED_DOMAIN_SUFFIXES', ''),
    APP_PORT: getRootValue('APP_PORT', '3000'),
    WEB_PORT: getRootValue('WEB_PORT', '80')
  };

  const apiEnv = {
    APP_ENV: apiCurrent.get('APP_ENV')?.trim() || 'development',
    TRUST_PROXY: apiCurrent.get('TRUST_PROXY')?.trim() || '0',
    JWT_SECRET: apiCurrent.get('JWT_SECRET')?.trim() || jwtSecret,
    ENCRYPTION_KEY: apiCurrent.get('ENCRYPTION_KEY')?.trim() || encryptionKey,
    DEFAULT_ADMIN_USERNAME: apiCurrent.get('DEFAULT_ADMIN_USERNAME')?.trim() || rootEnv.DEFAULT_ADMIN_USERNAME,
    DEFAULT_ADMIN_PASSWORD: apiCurrent.get('DEFAULT_ADMIN_PASSWORD')?.trim() || defaultAdminPassword,
    SEED_DEMO_USERS: apiCurrent.get('SEED_DEMO_USERS')?.trim() || rootEnv.SEED_DEMO_USERS,
    ALLOW_INSECURE_DEV_COOKIES: apiCurrent.get('ALLOW_INSECURE_DEV_COOKIES')?.trim() || '1',
    ALLOW_DEV_WEBHOOK_LOOPBACK: apiCurrent.get('ALLOW_DEV_WEBHOOK_LOOPBACK')?.trim() || '1',
    LOGIN_HINTS_RATE_LIMIT_MAX: apiCurrent.get('LOGIN_HINTS_RATE_LIMIT_MAX')?.trim() || '15',
    LOGIN_HINTS_RATE_LIMIT_WINDOW_MS: apiCurrent.get('LOGIN_HINTS_RATE_LIMIT_WINDOW_MS')?.trim() || '60000',
    LOGIN_RATE_LIMIT_MAX: apiCurrent.get('LOGIN_RATE_LIMIT_MAX')?.trim() || '100',
    LOGIN_RATE_LIMIT_WINDOW_MS: apiCurrent.get('LOGIN_RATE_LIMIT_WINDOW_MS')?.trim() || '60000',
    WEBHOOK_ALLOWED_HOSTNAMES: apiCurrent.get('WEBHOOK_ALLOWED_HOSTNAMES')?.trim() || '',
    WEBHOOK_ALLOWED_DOMAIN_SUFFIXES: apiCurrent.get('WEBHOOK_ALLOWED_DOMAIN_SUFFIXES')?.trim() || ''
  };

  const apiDatabaseUrl = apiCurrent.get('DATABASE_URL')?.trim();
  if (apiDatabaseUrl) {
    apiEnv.DATABASE_URL = apiDatabaseUrl;
  }

  return { rootEnv, apiEnv, generated };
};

const serializeEnv = (values, headerLines = []) => {
  const lines = [...headerLines];
  for (const [key, value] of Object.entries(values)) {
    lines.push(`${key}=${value}`);
  }
  lines.push('');
  return lines.join('\n');
};

const main = () => {
  const { rootEnv, apiEnv, generated } = buildLocalDevelopmentEnv();

  writeFileSync(
    rootEnvPath,
    serializeEnv(rootEnv, [
      '# OmniStock local Docker Compose environment',
      '# Generated by node scripts/bootstrap-local-dev.mjs',
      '# Review and rotate before using any non-local deployment.'
    ]),
    'utf8'
  );

  writeFileSync(
    apiEnvLocalPath,
    serializeEnv(apiEnv, [
      '# OmniStock API local (non-Docker) environment',
      '# Generated by ../../scripts/bootstrap-local-dev.mjs',
      '# Optional: add DATABASE_URL=postgres://<local-user>@localhost:5432/postgres if needed.'
    ]),
    'utf8'
  );

  console.log(`Wrote ${path.relative(repoRoot, rootEnvPath)}`);
  console.log(`Wrote ${path.relative(repoRoot, apiEnvLocalPath)}`);
  if (generated.size) {
    console.log('Generated fresh local secrets:');
    for (const [key, value] of generated.entries()) {
      console.log(`- ${key}=${value}`);
    }
  } else {
    console.log('Existing local secret values were preserved.');
  }
};

const isMain = process.argv[1] ? import.meta.url === pathToFileURL(process.argv[1]).href : false;

if (isMain) {
  main();
}
