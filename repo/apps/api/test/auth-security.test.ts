import type { FastifyInstance } from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import { AuthService } from '../src/services/auth.service.js';

const createService = () => {
  const fastify = {
    db: { query: vi.fn() },
    writeAudit: vi.fn(),
    jwt: { sign: vi.fn() }
  } as unknown as FastifyInstance;

  return {
    service: new AuthService(fastify),
    fastify
  };
};

describe('auth security guards', () => {
  it('counts failed attempts when captcha verification fails', async () => {
    const { service } = createService();

    const user = {
      id: 'user-1',
      username: 'captchatest',
      display_name: 'Captcha Test',
      password_hash: 'ignored',
      password_history: [],
      failed_login_count: 3,
      locked_until: null,
      is_active: true
    };

    vi.spyOn(service as any, 'fetchUserByUsername').mockResolvedValue(user);
    (service as any).captchaService = { verify: vi.fn().mockResolvedValue(false) };
    const failedSpy = vi
      .spyOn(service as any, 'recordFailedAttempt')
      .mockResolvedValue({ captchaRequired: true, lockedUntil: null });

    await expect(
      service.login({
        username: user.username,
        password: 'WrongPassword!123',
        captchaId: 'captcha-1',
        captchaAnswer: 'bad'
      })
    ).rejects.toMatchObject({
      statusCode: 401,
      message: 'CAPTCHA validation failed',
      details: {
        captchaRequired: true,
        lockedUntil: null
      }
    });

    expect(failedSpy).toHaveBeenCalledWith(user.id, 4, undefined);
  });

  it('locks account on captcha failure when threshold is reached', async () => {
    const { service } = createService();

    const user = {
      id: 'user-2',
      username: 'captchalock',
      display_name: 'Captcha Lock',
      password_hash: 'ignored',
      password_history: [],
      failed_login_count: 6,
      locked_until: null,
      is_active: true
    };

    vi.spyOn(service as any, 'fetchUserByUsername').mockResolvedValue(user);
    (service as any).captchaService = { verify: vi.fn().mockResolvedValue(false) };
    const lockedUntil = new Date(Date.now() + 15 * 60_000).toISOString();
    const failedSpy = vi
      .spyOn(service as any, 'recordFailedAttempt')
      .mockResolvedValue({ captchaRequired: true, lockedUntil });

    await expect(
      service.login({
        username: user.username,
        password: 'WrongPassword!123',
        captchaId: 'captcha-2',
        captchaAnswer: 'bad'
      })
    ).rejects.toMatchObject({
      statusCode: 423,
      message: `Account locked until ${lockedUntil}`,
      details: {
        captchaRequired: true,
        lockedUntil
      }
    });

    expect(failedSpy).toHaveBeenCalledWith(user.id, 7, undefined);
  });
});
