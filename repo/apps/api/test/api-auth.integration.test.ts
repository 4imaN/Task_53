import argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createIntegrationHarness, loginAsAdmin, runIntegration } from './helpers/integration.js';

const describeIfIntegration = runIntegration ? describe : describe.skip;

const createTempUser = async (server: Awaited<ReturnType<typeof createIntegrationHarness>>['server'], username: string, password: string) => {
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  const roleResult = await server.db.query<{ id: string }>(
    `SELECT id FROM roles WHERE code = 'warehouse_clerk'`
  );

  const userResult = await server.db.query<{ id: string }>(
    `
      INSERT INTO users (username, display_name, password_hash, password_history)
      VALUES ($1, $2, $3, '[]'::jsonb)
      RETURNING id
    `,
    [username, username, passwordHash]
  );
  const userId = userResult.rows[0].id;

  await server.db.query(
    `INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)`,
    [userId, roleResult.rows[0].id]
  );

  return { userId };
};

describeIfIntegration('auth API integration', () => {
  const harness = createIntegrationHarness();

  it('enforces captcha escalation, account lockout, and admin unlock', async () => {
    const server = harness.server;
    const username = `locktest_${randomUUID().slice(0, 8)}`;
    const password = 'ChangeMeNow!123';
    const { userId } = await createTempUser(server, username, password);

    const failedLogin = async (payload: Record<string, unknown>) => server.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload
    });

    const fetchCaptchaAnswer = async (captchaId: string) => {
      const captchaResult = await server.db.query<{ answer: string }>(
        `SELECT answer FROM captcha_challenges WHERE id = $1`,
        [captchaId]
      );

      return captchaResult.rows[0].answer;
    };

    try {
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        const response = await failedLogin({
          username,
          password: 'WrongPassword!123'
        });

        expect(response.statusCode).toBe(401);
        if (attempt < 3) {
          expect(response.json()).toMatchObject({ captchaRequired: false });
        } else {
          expect(response.json()).toMatchObject({ captchaRequired: true });
        }
      }

      const hintsResponse = await server.inject({
        method: 'GET',
        url: `/api/auth/login-hints?username=${username}`
      });
      expect(hintsResponse.statusCode).toBe(200);
      expect(hintsResponse.json()).toMatchObject({ captchaRequired: true, lockedUntil: null });

      for (let attempt = 4; attempt <= 7; attempt += 1) {
        const captchaResponse = await server.inject({
          method: 'GET',
          url: `/api/auth/captcha?username=${username}`
        });

        expect(captchaResponse.statusCode).toBe(200);
        const challenge = captchaResponse.json() as { id: string };
        const captchaAnswer = await fetchCaptchaAnswer(challenge.id);

        const response = await failedLogin({
          username,
          password: 'WrongPassword!123',
          captchaId: challenge.id,
          captchaAnswer
        });

        if (attempt < 7) {
          expect(response.statusCode).toBe(401);
          expect(response.json()).toMatchObject({ captchaRequired: true, lockedUntil: null });
        } else {
          expect(response.statusCode).toBe(423);
          expect(response.json()).toMatchObject({
            captchaRequired: true,
            lockedUntil: expect.any(String)
          });
        }
      }

      const lockedLoginResponse = await failedLogin({
        username,
        password
      });
      expect(lockedLoginResponse.statusCode).toBe(423);

      const { token } = await loginAsAdmin(server);
      const unlockResponse = await server.inject({
        method: 'POST',
        url: `/api/users/${userId}/unlock`,
        headers: {
          authorization: `Bearer ${token}`
        }
      });

      expect(unlockResponse.statusCode).toBe(200);

      const successLoginResponse = await failedLogin({
        username,
        password
      });
      expect(successLoginResponse.statusCode).toBe(200);
      expect(successLoginResponse.json()).toMatchObject({
        token: expect.any(String),
        user: {
          username
        }
      });
    } finally {
      await server.db.query(`DELETE FROM users WHERE id = $1`, [userId]);
    }
  });

  it('counts invalid captcha submissions toward lockout progression', async () => {
    const server = harness.server;
    const username = `captchafail_${randomUUID().slice(0, 8)}`;
    const password = 'ChangeMeNow!123';
    const { userId } = await createTempUser(server, username, password);

    const failedLogin = async (payload: Record<string, unknown>) => server.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload
    });

    try {
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        const response = await failedLogin({
          username,
          password: 'WrongPassword!123'
        });

        expect(response.statusCode).toBe(401);
      }

      for (let attempt = 4; attempt <= 7; attempt += 1) {
        const response = await failedLogin({
          username,
          password: 'WrongPassword!123',
          captchaId: randomUUID(),
          captchaAnswer: 'bad'
        });

        if (attempt < 7) {
          expect(response.statusCode).toBe(401);
          expect(response.json()).toMatchObject({
            message: 'CAPTCHA validation failed',
            captchaRequired: true
          });
        } else {
          expect(response.statusCode).toBe(423);
          expect(response.json()).toMatchObject({
            captchaRequired: true,
            lockedUntil: expect.any(String)
          });
        }
      }

      const userResult = await server.db.query<{ failed_login_count: number; locked_until: string | null }>(
        `SELECT failed_login_count, locked_until FROM users WHERE id = $1`,
        [userId]
      );
      expect(userResult.rows[0].failed_login_count).toBe(7);
      expect(userResult.rows[0].locked_until).not.toBeNull();
    } finally {
      await server.db.query(`DELETE FROM users WHERE id = $1`, [userId]);
    }
  });

  it('changes passwords, revokes active sessions, and blocks password reuse', async () => {
    const server = harness.server;
    const username = `pwtest_${randomUUID().slice(0, 8)}`;
    const originalPassword = 'ChangeMeNow!123';
    const nextPassword = 'EvenStronger!456';
    const { userId } = await createTempUser(server, username, originalPassword);

    try {
      const loginResponse = await server.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: {
          username,
          password: originalPassword
        }
      });

      expect(loginResponse.statusCode).toBe(200);
      const loginPayload = loginResponse.json() as { token: string };

      const changeResponse = await server.inject({
        method: 'POST',
        url: '/api/auth/change-password',
        headers: {
          authorization: `Bearer ${loginPayload.token}`
        },
        payload: {
          currentPassword: originalPassword,
          newPassword: nextPassword
        }
      });

      expect(changeResponse.statusCode).toBe(200);

      const revokedSessionResponse = await server.inject({
        method: 'GET',
        url: '/api/auth/sessions',
        headers: {
          authorization: `Bearer ${loginPayload.token}`
        }
      });
      expect(revokedSessionResponse.statusCode).toBe(401);

      const reuseResponse = await server.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: {
          username,
          password: nextPassword
        }
      });
      expect(reuseResponse.statusCode).toBe(200);
      const reusePayload = reuseResponse.json() as { token: string };

      const rejectedReuseChange = await server.inject({
        method: 'POST',
        url: '/api/auth/change-password',
        headers: {
          authorization: `Bearer ${reusePayload.token}`
        },
        payload: {
          currentPassword: nextPassword,
          newPassword: originalPassword
        }
      });

      expect(rejectedReuseChange.statusCode).toBe(422);
      expect(rejectedReuseChange.json()).toMatchObject({
        message: 'New password must not match the last 5 passwords'
      });
    } finally {
      await server.db.query(`DELETE FROM users WHERE id = $1`, [userId]);
    }
  });

  it('rejects login through a mismatched actor portal', async () => {
    const server = harness.server;

    const wrongPortalResponse = await server.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {
        username: 'admin',
        password: 'ChangeMeNow!123',
        loginActor: 'warehouse-clerk'
      }
    });

    expect(wrongPortalResponse.statusCode).toBe(403);
    expect(wrongPortalResponse.json()).toMatchObject({
      message: 'This account cannot sign in through the warehouse-clerk login'
    });

    const rightPortalResponse = await server.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: {
        username: 'admin',
        password: 'ChangeMeNow!123',
        loginActor: 'administrator'
      }
    });

    expect(rightPortalResponse.statusCode).toBe(200);
    expect(rightPortalResponse.json()).toMatchObject({
      user: {
        username: 'admin'
      }
    });
  });

  it('enforces password history checks on admin password updates', async () => {
    const server = harness.server;
    const username = `adminpw_${randomUUID().slice(0, 8)}`;
    const originalPassword = 'ChangeMeNow!123';
    const nextPassword = 'EvenStronger!456';
    const { userId } = await createTempUser(server, username, originalPassword);
    const { token: adminToken } = await loginAsAdmin(server);

    try {
      const samePasswordResponse = await server.inject({
        method: 'PATCH',
        url: `/api/users/${userId}`,
        headers: {
          authorization: `Bearer ${adminToken}`
        },
        payload: {
          password: originalPassword
        }
      });

      expect(samePasswordResponse.statusCode).toBe(422);
      expect(samePasswordResponse.json()).toMatchObject({
        message: 'New password must not match the last 5 passwords'
      });

      const updateResponse = await server.inject({
        method: 'PATCH',
        url: `/api/users/${userId}`,
        headers: {
          authorization: `Bearer ${adminToken}`
        },
        payload: {
          password: nextPassword
        }
      });

      expect(updateResponse.statusCode).toBe(200);

      const reuseResponse = await server.inject({
        method: 'PATCH',
        url: `/api/users/${userId}`,
        headers: {
          authorization: `Bearer ${adminToken}`
        },
        payload: {
          password: originalPassword
        }
      });

      expect(reuseResponse.statusCode).toBe(422);
      expect(reuseResponse.json()).toMatchObject({
        message: 'New password must not match the last 5 passwords'
      });
    } finally {
      await server.db.query(`DELETE FROM users WHERE id = $1`, [userId]);
    }
  });

  it('invalidates existing sessions after access-control updates', async () => {
    const server = harness.server;
    const username = `accessctl_${randomUUID().slice(0, 8)}`;
    const password = 'ChangeMeNow!123';
    const { userId } = await createTempUser(server, username, password);
    const { token: adminToken } = await loginAsAdmin(server);

    try {
      const loginResponse = await server.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { username, password }
      });
      expect(loginResponse.statusCode).toBe(200);
      const userToken = (loginResponse.json() as { token: string }).token;

      const beforeVersion = await server.db.query<{ authz_version: number }>(
        `SELECT authz_version FROM users WHERE id = $1`,
        [userId]
      );

      const updateResponse = await server.inject({
        method: 'PUT',
        url: `/api/users/${userId}/access-control`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          roleCodes: ['warehouse_clerk'],
          warehouseIds: [],
          departmentIds: []
        }
      });
      expect(updateResponse.statusCode).toBe(200);

      const blockedResponse = await server.inject({
        method: 'GET',
        url: '/api/auth/sessions',
        headers: { authorization: `Bearer ${userToken}` }
      });
      expect(blockedResponse.statusCode).toBe(401);

      const afterVersion = await server.db.query<{ authz_version: number }>(
        `SELECT authz_version FROM users WHERE id = $1`,
        [userId]
      );
      expect(afterVersion.rows[0].authz_version).toBe(beforeVersion.rows[0].authz_version + 1);
    } finally {
      await server.db.query(`DELETE FROM users WHERE id = $1`, [userId]);
    }
  });

  it('invalidates existing sessions when an admin deactivates the user', async () => {
    const server = harness.server;
    const username = `deactivate_${randomUUID().slice(0, 8)}`;
    const password = 'ChangeMeNow!123';
    const { userId } = await createTempUser(server, username, password);
    const { token: adminToken } = await loginAsAdmin(server);

    try {
      const loginResponse = await server.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { username, password }
      });
      expect(loginResponse.statusCode).toBe(200);
      const userToken = (loginResponse.json() as { token: string }).token;

      const deactivateResponse = await server.inject({
        method: 'PATCH',
        url: `/api/users/${userId}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { isActive: false }
      });
      expect(deactivateResponse.statusCode).toBe(200);

      const blockedResponse = await server.inject({
        method: 'GET',
        url: '/api/auth/sessions',
        headers: { authorization: `Bearer ${userToken}` }
      });
      expect(blockedResponse.statusCode).toBe(401);

      const reloginResponse = await server.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { username, password }
      });
      expect(reloginResponse.statusCode).toBe(401);
    } finally {
      await server.db.query(`DELETE FROM users WHERE id = $1`, [userId]);
    }
  });

  it('invalidates existing sessions when an admin resets a user password', async () => {
    const server = harness.server;
    const username = `adminreset_${randomUUID().slice(0, 8)}`;
    const password = 'ChangeMeNow!123';
    const nextPassword = 'EvenStronger!456';
    const { userId } = await createTempUser(server, username, password);
    const { token: adminToken } = await loginAsAdmin(server);

    try {
      const loginResponse = await server.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { username, password }
      });
      expect(loginResponse.statusCode).toBe(200);
      const userToken = (loginResponse.json() as { token: string }).token;

      const resetResponse = await server.inject({
        method: 'PATCH',
        url: `/api/users/${userId}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { password: nextPassword }
      });
      expect(resetResponse.statusCode).toBe(200);

      const blockedResponse = await server.inject({
        method: 'GET',
        url: '/api/auth/sessions',
        headers: { authorization: `Bearer ${userToken}` }
      });
      expect(blockedResponse.statusCode).toBe(401);

      const oldPasswordLogin = await server.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { username, password }
      });
      expect(oldPasswordLogin.statusCode).toBe(401);

      const newPasswordLogin = await server.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { username, password: nextPassword }
      });
      expect(newPasswordLogin.statusCode).toBe(200);
    } finally {
      await server.db.query(`DELETE FROM users WHERE id = $1`, [userId]);
    }
  });

  it('rejects existing sessions if a user is made inactive directly in storage', async () => {
    const server = harness.server;
    const username = `inactive_${randomUUID().slice(0, 8)}`;
    const password = 'ChangeMeNow!123';
    const { userId } = await createTempUser(server, username, password);

    try {
      const loginResponse = await server.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { username, password }
      });
      expect(loginResponse.statusCode).toBe(200);
      const userToken = (loginResponse.json() as { token: string }).token;

      await server.db.query(
        `UPDATE users SET is_active = FALSE, updated_at = NOW() WHERE id = $1`,
        [userId]
      );

      const blockedResponse = await server.inject({
        method: 'GET',
        url: '/api/auth/sessions',
        headers: { authorization: `Bearer ${userToken}` }
      });
      expect(blockedResponse.statusCode).toBe(401);
    } finally {
      await server.db.query(`DELETE FROM users WHERE id = $1`, [userId]);
    }
  });

  it('rejects existing sessions if a user is soft-deleted directly in storage', async () => {
    const server = harness.server;
    const username = `deleted_${randomUUID().slice(0, 8)}`;
    const password = 'ChangeMeNow!123';
    const { userId } = await createTempUser(server, username, password);

    try {
      const loginResponse = await server.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { username, password }
      });
      expect(loginResponse.statusCode).toBe(200);
      const userToken = (loginResponse.json() as { token: string }).token;

      await server.db.query(
        `UPDATE users SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1`,
        [userId]
      );

      const blockedResponse = await server.inject({
        method: 'GET',
        url: '/api/auth/sessions',
        headers: { authorization: `Bearer ${userToken}` }
      });
      expect(blockedResponse.statusCode).toBe(401);
    } finally {
      await server.db.query(`DELETE FROM users WHERE id = $1`, [userId]);
    }
  });
});
