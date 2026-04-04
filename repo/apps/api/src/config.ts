export type AppEnvironment = 'development' | 'test' | 'production';

type EnvironmentSource = NodeJS.ProcessEnv;

const required = (env: EnvironmentSource, name: string, fallback?: string): string => {
  const value = env[name] ?? fallback;
  if (!value?.trim()) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
};

const numberFromEnv = (env: EnvironmentSource, name: string, fallback: number): number => {
  const value = env[name];
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    throw new Error(`Expected ${name} to be numeric`);
  }

  return parsed;
};

const numberListFromEnv = (env: EnvironmentSource, name: string, fallback: number[]): number[] => {
  const value = env[name];
  if (!value) {
    return fallback;
  }

  const parsed = value
    .split(',')
    .map((entry) => Number(entry.trim()))
    .filter((entry) => Number.isFinite(entry) && entry >= 0);

  if (!parsed.length) {
    throw new Error(`Expected ${name} to contain a comma-separated numeric list`);
  }

  return parsed;
};

const listFromEnv = (env: EnvironmentSource, name: string, fallback: string[] = []): string[] => {
  const value = env[name];
  if (!value) {
    return fallback;
  }

  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
};

const booleanFromEnv = (env: EnvironmentSource, name: string, fallback = false): boolean => {
  const value = env[name];
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true;
  }

  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false;
  }

  throw new Error(`Expected ${name} to be a boolean-like value`);
};

const normalizeAppEnvironment = (env: EnvironmentSource): AppEnvironment => {
  const candidate = (env.APP_ENV ?? env.NODE_ENV ?? 'production').trim().toLowerCase();
  if (candidate === 'development' || candidate === 'test' || candidate === 'production') {
    return candidate;
  }

  throw new Error(`Unsupported APP_ENV/NODE_ENV value: ${candidate}`);
};

export const loadConfig = (env: EnvironmentSource = process.env) => {
  const appEnv = normalizeAppEnvironment(env);
  const allowInsecureDevCookies = booleanFromEnv(env, 'ALLOW_INSECURE_DEV_COOKIES', false);
  const allowDevRateLimitBypassLocalhost = booleanFromEnv(env, 'ALLOW_DEV_RATE_LIMIT_LOCALHOST_BYPASS', false);
  const allowDevWebhookLoopback = booleanFromEnv(env, 'ALLOW_DEV_WEBHOOK_LOOPBACK', appEnv !== 'production');

  if (allowInsecureDevCookies && appEnv === 'production') {
    throw new Error('ALLOW_INSECURE_DEV_COOKIES may only be enabled in explicit development or test environments');
  }

  if (allowDevRateLimitBypassLocalhost && appEnv !== 'development') {
    throw new Error('ALLOW_DEV_RATE_LIMIT_LOCALHOST_BYPASS may only be enabled when APP_ENV=development');
  }

  if (allowDevWebhookLoopback && appEnv === 'production') {
    throw new Error('ALLOW_DEV_WEBHOOK_LOOPBACK may only be enabled when APP_ENV=development or APP_ENV=test');
  }

  const webhookDeliveryRetentionDays = numberFromEnv(env, 'WEBHOOK_DELIVERY_RETENTION_DAYS', 30);
  if (webhookDeliveryRetentionDays < 1) {
    throw new Error('WEBHOOK_DELIVERY_RETENTION_DAYS must be at least 1');
  }

  return {
    appEnv,
    appPort: numberFromEnv(env, 'APP_PORT', 3000),
    databaseUrl: required(
      env,
      'DATABASE_URL',
      `postgres://${encodeURIComponent(env.PGUSER ?? env.USER ?? 'postgres')}@localhost:5432/${env.PGDATABASE ?? 'postgres'}`
    ),
    trustProxy: booleanFromEnv(env, 'TRUST_PROXY', false),
    jwtSecret: required(env, 'JWT_SECRET'),
    secureSessionCookie: !allowInsecureDevCookies,
    allowInsecureDevCookies,
    sessionTtlHours: numberFromEnv(env, 'SESSION_TTL_HOURS', 24),
    sessionIdleTimeoutMinutes: numberFromEnv(env, 'SESSION_IDLE_TIMEOUT_MINUTES', 120),
    argon2MemoryCost: numberFromEnv(env, 'ARGON2_MEMORY_COST', 19456),
    argon2TimeCost: numberFromEnv(env, 'ARGON2_TIME_COST', 2),
    argon2Parallelism: numberFromEnv(env, 'ARGON2_PARALLELISM', 1),
    passwordHistoryDepth: numberFromEnv(env, 'PASSWORD_HISTORY_DEPTH', 5),
    captchaTtlMinutes: numberFromEnv(env, 'CAPTCHA_TTL_MINUTES', 10),
    captchaFailureThreshold: numberFromEnv(env, 'CAPTCHA_FAILURE_THRESHOLD', 3),
    loginLockoutAttempts: numberFromEnv(env, 'LOGIN_LOCKOUT_ATTEMPTS', 7),
    loginLockoutMinutes: numberFromEnv(env, 'LOGIN_LOCKOUT_MINUTES', 15),
    loginHintsRateLimitMax: numberFromEnv(env, 'LOGIN_HINTS_RATE_LIMIT_MAX', 15),
    loginHintsRateLimitWindowMs: numberFromEnv(env, 'LOGIN_HINTS_RATE_LIMIT_WINDOW_MS', 60_000),
    loginRateLimitMax: numberFromEnv(env, 'LOGIN_RATE_LIMIT_MAX', 100),
    loginRateLimitWindowMs: numberFromEnv(env, 'LOGIN_RATE_LIMIT_WINDOW_MS', 60_000),
    uploadRoot: required(env, 'UPLOAD_ROOT', '/data/uploads'),
    uploadQuotaGb: numberFromEnv(env, 'UPLOAD_QUOTA_GB', 50),
    encryptionKey: required(env, 'ENCRYPTION_KEY'),
    defaultAdminUsername: required(env, 'DEFAULT_ADMIN_USERNAME', 'admin'),
    defaultAdminPassword: required(env, 'DEFAULT_ADMIN_PASSWORD'),
    apiRateLimitMax: numberFromEnv(env, 'API_RATE_LIMIT_MAX', 600),
    apiRateLimitWindowMs: numberFromEnv(env, 'API_RATE_LIMIT_WINDOW_MS', 60_000),
    allowDevRateLimitBypassLocalhost,
    integrationRateLimit: numberFromEnv(env, 'INTEGRATION_RATE_LIMIT', 120),
    integrationTimestampSkewSeconds: numberFromEnv(env, 'INTEGRATION_TIMESTAMP_SKEW_SECONDS', 300),
    integrationReplayTtlSeconds: numberFromEnv(env, 'INTEGRATION_REPLAY_TTL_SECONDS', 600),
    webhookRetryBackoffMs: numberListFromEnv(env, 'WEBHOOK_RETRY_BACKOFF_MS', [250, 750, 1500]),
    webhookRequestTimeoutMs: numberFromEnv(env, 'WEBHOOK_REQUEST_TIMEOUT_MS', 5000),
    webhookDeliveryRetentionDays,
    webhookAllowedHostnames: listFromEnv(env, 'WEBHOOK_ALLOWED_HOSTNAMES', []),
    webhookAllowedDomainSuffixes: listFromEnv(env, 'WEBHOOK_ALLOWED_DOMAIN_SUFFIXES', []),
    allowDevWebhookLoopback
  };
};

export const config = loadConfig();
