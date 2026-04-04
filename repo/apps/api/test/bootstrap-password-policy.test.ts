import { afterEach, describe, expect, it, vi } from 'vitest';

describe('bootstrap password policy enforcement', () => {
  const originalPassword = process.env.DEFAULT_ADMIN_PASSWORD;
  const originalSeedFlag = process.env.SEED_DEMO_USERS;

  afterEach(() => {
    process.env.DEFAULT_ADMIN_PASSWORD = originalPassword;
    process.env.SEED_DEMO_USERS = originalSeedFlag;
    vi.resetModules();
  });

  it('fails fast for a weak configured bootstrap password', async () => {
    process.env.DEFAULT_ADMIN_PASSWORD = 'weak';
    delete process.env.SEED_DEMO_USERS;
    vi.resetModules();

    const { validateBootstrapPasswords } = await import('../src/db/bootstrap-admin.ts');

    expect(() => validateBootstrapPasswords()).toThrow(/Default admin password does not satisfy the password policy/i);
  });

  it('fails seeded demo credentials that do not satisfy the shared policy', async () => {
    const { validateSeedUserPasswords } = await import('../src/db/bootstrap-admin.ts');

    expect(() => validateSeedUserPasswords([
      { username: 'demo.weak', password: 'weak' }
    ])).toThrow(/Seeded password for demo\.weak does not satisfy the password policy/i);
  });

  it('accepts strong bootstrap and seeded passwords', async () => {
    process.env.DEFAULT_ADMIN_PASSWORD = 'BootstrapStrong!123';
    process.env.SEED_DEMO_USERS = '1';
    vi.resetModules();

    const { validateBootstrapPasswords, validateSeedUserPasswords } = await import('../src/db/bootstrap-admin.ts');

    expect(() => validateBootstrapPasswords()).not.toThrow();
    expect(() => validateSeedUserPasswords([
      { username: 'demo.strong', password: 'DemoStrong!456' }
    ])).not.toThrow();
  });
});
