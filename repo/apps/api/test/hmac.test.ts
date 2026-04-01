import { describe, expect, it } from 'vitest';
import { signPayload, timingSafeCompare } from '../src/utils/hmac.js';

describe('hmac helpers', () => {
  it('generates a deterministic signature', () => {
    const first = signPayload('1700000000.{"event":"sync"}', Buffer.from('secret'));
    const second = signPayload('1700000000.{"event":"sync"}', Buffer.from('secret'));
    expect(first).toBe(second);
  });

  it('compares signatures safely', () => {
    const signature = signPayload('payload', Buffer.from('secret'));
    expect(timingSafeCompare(signature, signature)).toBe(true);
    expect(timingSafeCompare(signature, `${signature}00`)).toBe(false);
  });
});
