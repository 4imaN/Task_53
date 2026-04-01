const required = (name: string, fallback?: string): string => {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
};

const numberFromEnv = (name: string, fallback: number): number => {
  const value = process.env[name];
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    throw new Error(`Expected ${name} to be numeric`);
  }

  return parsed;
};

const numberListFromEnv = (name: string, fallback: number[]): number[] => {
  const value = process.env[name];
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

export const config = {
  appPort: numberFromEnv('APP_PORT', 3000),
  databaseUrl: required(
    'DATABASE_URL',
    `postgres://${encodeURIComponent(process.env.PGUSER ?? process.env.USER ?? 'postgres')}@localhost:5432/${process.env.PGDATABASE ?? 'postgres'}`
  ),
  jwtSecret: required('JWT_SECRET'),
  sessionTtlHours: numberFromEnv('SESSION_TTL_HOURS', 24),
  sessionIdleTimeoutMinutes: numberFromEnv('SESSION_IDLE_TIMEOUT_MINUTES', 120),
  argon2MemoryCost: numberFromEnv('ARGON2_MEMORY_COST', 19456),
  argon2TimeCost: numberFromEnv('ARGON2_TIME_COST', 2),
  argon2Parallelism: numberFromEnv('ARGON2_PARALLELISM', 1),
  passwordHistoryDepth: numberFromEnv('PASSWORD_HISTORY_DEPTH', 5),
  captchaTtlMinutes: numberFromEnv('CAPTCHA_TTL_MINUTES', 10),
  captchaFailureThreshold: numberFromEnv('CAPTCHA_FAILURE_THRESHOLD', 3),
  loginLockoutAttempts: numberFromEnv('LOGIN_LOCKOUT_ATTEMPTS', 7),
  loginLockoutMinutes: numberFromEnv('LOGIN_LOCKOUT_MINUTES', 15),
  uploadRoot: required('UPLOAD_ROOT', '/data/uploads'),
  uploadQuotaGb: numberFromEnv('UPLOAD_QUOTA_GB', 50),
  encryptionKey: required('ENCRYPTION_KEY'),
  defaultAdminUsername: required('DEFAULT_ADMIN_USERNAME', 'admin'),
  defaultAdminPassword: required('DEFAULT_ADMIN_PASSWORD'),
  integrationRateLimit: numberFromEnv('INTEGRATION_RATE_LIMIT', 120),
  integrationTimestampSkewSeconds: numberFromEnv('INTEGRATION_TIMESTAMP_SKEW_SECONDS', 300),
  integrationReplayTtlSeconds: numberFromEnv('INTEGRATION_REPLAY_TTL_SECONDS', 600),
  webhookRetryBackoffMs: numberListFromEnv('WEBHOOK_RETRY_BACKOFF_MS', [250, 750, 1500]),
  webhookRequestTimeoutMs: numberFromEnv('WEBHOOK_REQUEST_TIMEOUT_MS', 5000)
};
