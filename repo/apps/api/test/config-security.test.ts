import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

describe('deployment config hardening', () => {
  it('fails fast when required secrets are absent', () => {
    expect(() => loadConfig({
      ...process.env,
      JWT_SECRET: '',
      ENCRYPTION_KEY: '',
      DEFAULT_ADMIN_PASSWORD: ''
    })).toThrow(/Missing required environment variable/i);
  });

  it('rejects insecure-cookie dev override outside explicit development or test environments', () => {
    expect(() => loadConfig({
      ...process.env,
      APP_ENV: 'production',
      JWT_SECRET: 'test-jwt-secret',
      ENCRYPTION_KEY: 'test-encryption-key',
      DEFAULT_ADMIN_PASSWORD: 'ChangeMeNow!123',
      ALLOW_INSECURE_DEV_COOKIES: '1'
    })).toThrow(/ALLOW_INSECURE_DEV_COOKIES may only be enabled/i);
  });

  it('rejects dev webhook loopback override in production', () => {
    expect(() => loadConfig({
      ...process.env,
      APP_ENV: 'production',
      JWT_SECRET: 'test-jwt-secret',
      ENCRYPTION_KEY: 'test-encryption-key',
      DEFAULT_ADMIN_PASSWORD: 'ChangeMeNow!123',
      ALLOW_DEV_WEBHOOK_LOOPBACK: '1'
    })).toThrow(/ALLOW_DEV_WEBHOOK_LOOPBACK may only be enabled/i);
  });

  it('local bootstrap helper generates non-static secrets and explicit dev-safe flags', async () => {
    const { buildLocalDevelopmentEnv } = await import('../../../scripts/bootstrap-local-dev.mjs');
    const first = buildLocalDevelopmentEnv({
      rootEnvPath: path.join(repoRoot, '.tmp', 'missing-root.env'),
      rootEnvExamplePath: path.join(repoRoot, '.env.example'),
      apiEnvLocalPath: path.join(repoRoot, '.tmp', 'missing-api.env')
    });
    const second = buildLocalDevelopmentEnv({
      rootEnvPath: path.join(repoRoot, '.tmp', 'missing-root-2.env'),
      rootEnvExamplePath: path.join(repoRoot, '.env.example'),
      apiEnvLocalPath: path.join(repoRoot, '.tmp', 'missing-api-2.env')
    });

    expect(first.rootEnv.JWT_SECRET).not.toBe(second.rootEnv.JWT_SECRET);
    expect(first.rootEnv.ENCRYPTION_KEY).not.toBe(second.rootEnv.ENCRYPTION_KEY);
    expect(first.rootEnv.DEFAULT_ADMIN_PASSWORD).not.toBe(second.rootEnv.DEFAULT_ADMIN_PASSWORD);
    expect(first.rootEnv.ALLOW_INSECURE_DEV_COOKIES).toBe('1');
    expect(first.rootEnv.APP_ENV).toBe('development');
  });

  it('compose and docs no longer encourage static fallback secrets', () => {
    const compose = readFileSync(path.join(repoRoot, 'docker-compose.yml'), 'utf8');
    const readme = readFileSync(path.join(repoRoot, 'README.md'), 'utf8');

    expect(compose).not.toContain('omnistock-local-jwt-secret-change-before-production');
    expect(compose).not.toContain('omnistock-local-encryption-key-change-before-production');
    expect(compose).not.toContain('ChangeMeNow!123');
    expect(readme).not.toContain('No manual `.env` editing is required for local startup.');
    expect(readme).toContain('bootstrap-local-dev.mjs');
  });
});
