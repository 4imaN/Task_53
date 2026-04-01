import argon2 from 'argon2';
import { describe, expect, it } from 'vitest';
import { assertPasswordNotReused, PASSWORD_REUSE_MESSAGE } from '../src/utils/password-history.js';

describe('password history enforcement', () => {
  it('rejects reusing the current password hash', async () => {
    const currentHash = await argon2.hash('CurrentPass!123', { type: argon2.argon2id });

    await expect(
      assertPasswordNotReused('CurrentPass!123', currentHash, [], 5)
    ).rejects.toThrow(PASSWORD_REUSE_MESSAGE);
  });

  it('rejects reusing a password from history', async () => {
    const currentHash = await argon2.hash('CurrentPass!123', { type: argon2.argon2id });
    const historyHash = await argon2.hash('OldPass!456', { type: argon2.argon2id });

    await expect(
      assertPasswordNotReused('OldPass!456', currentHash, [historyHash], 5)
    ).rejects.toThrow(PASSWORD_REUSE_MESSAGE);
  });

  it('allows a fresh password', async () => {
    const currentHash = await argon2.hash('CurrentPass!123', { type: argon2.argon2id });
    const historyHash = await argon2.hash('OldPass!456', { type: argon2.argon2id });

    await expect(
      assertPasswordNotReused('BrandNew!789', currentHash, [historyHash], 5)
    ).resolves.toBeUndefined();
  });
});
