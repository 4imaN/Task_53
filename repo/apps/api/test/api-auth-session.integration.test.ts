import argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createIntegrationHarness, loginAsAdmin, runIntegration } from './helpers/integration.js';

const describeIfIntegration = runIntegration ? describe : describe.skip;

const createTempUser = async (
  server: ReturnType<typeof createIntegrationHarness>['server'],
  username: string,
  password: string
) => {
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  const roleResult = await server.db.query<{ id: string }>(
    `SELECT id FROM roles WHERE code = 'warehouse_clerk'`
  );
  const warehouseResult = await server.db.query<{ id: string }>(
    `SELECT id FROM warehouses WHERE code = 'WH-01'`
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

  await server.db.query(
    `
      INSERT INTO attribute_rules (user_id, resource_type, resource_id, rule_type, metadata)
      VALUES ($1, 'warehouse', $2, 'access', '{}'::jsonb)
    `,
    [userId, warehouseResult.rows[0].id]
  );

  return { userId };
};

describeIfIntegration('auth session lifecycle API integration', () => {
  const harness = createIntegrationHarness();

  it('logs out and revokes the session so the old token is rejected on protected routes', async () => {
    const server = harness.server;
    const username = `logout_${randomUUID().slice(0, 8)}`;
    const password = 'LogoutTest!123';
    const { userId } = await createTempUser(server, username, password);

    try {
      const loginResponse = await server.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { username, password }
      });
      expect(loginResponse.statusCode).toBe(200);
      const { token } = loginResponse.json() as { token: string };

      const logoutResponse = await server.inject({
        method: 'POST',
        url: '/api/auth/logout',
        headers: { authorization: `Bearer ${token}` }
      });
      expect(logoutResponse.statusCode).toBe(200);
      expect(logoutResponse.json()).toEqual({ success: true });

      const protectedResponse = await server.inject({
        method: 'GET',
        url: '/api/auth/sessions',
        headers: { authorization: `Bearer ${token}` }
      });
      expect(protectedResponse.statusCode).toBe(401);
    } finally {
      await server.db.query(`DELETE FROM users WHERE id = $1`, [userId]);
    }
  });

  it('returns 401 when calling logout without a token', async () => {
    const server = harness.server;

    const response = await server.inject({
      method: 'POST',
      url: '/api/auth/logout'
    });
    expect(response.statusCode).toBe(401);
  });

  it('GET /api/auth/me returns current user info for authenticated admin', async () => {
    const server = harness.server;
    const { token } = await loginAsAdmin(server);

    const meResponse = await server.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { authorization: `Bearer ${token}` }
    });

    expect(meResponse.statusCode).toBe(200);
    const body = meResponse.json() as {
      username: string;
      displayName: string;
      roleCodes: string[];
      permissionCodes: string[];
      assignedWarehouseIds: string[];
      departmentIds: string[];
      sid: string;
    };
    expect(body.username).toBe('admin');
    expect(typeof body.displayName).toBe('string');
    expect(Array.isArray(body.roleCodes)).toBe(true);
    expect(Array.isArray(body.permissionCodes)).toBe(true);
    expect(Array.isArray(body.assignedWarehouseIds)).toBe(true);
    expect(Array.isArray(body.departmentIds)).toBe(true);
    expect(typeof body.sid).toBe('string');
    expect(body.sid.length).toBeGreaterThan(0);
  });

  it('GET /api/auth/me returns 401 when called without a token', async () => {
    const server = harness.server;

    const response = await server.inject({
      method: 'GET',
      url: '/api/auth/me'
    });
    expect(response.statusCode).toBe(401);
  });

  it('revokes a specific session by sessionId so that session token is rejected', async () => {
    const server = harness.server;
    const username = `revoke_${randomUUID().slice(0, 8)}`;
    const password = 'RevokeTest!123';
    const { userId } = await createTempUser(server, username, password);

    try {
      // First login — session to be revoked
      const firstLogin = await server.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { username, password }
      });
      expect(firstLogin.statusCode).toBe(200);
      const firstBody = firstLogin.json() as { token: string; user: { sid: string } };
      const firstToken = firstBody.token;
      const firstSid = firstBody.user.sid;

      // Second login — the active session used to perform the revoke
      const secondLogin = await server.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { username, password }
      });
      expect(secondLogin.statusCode).toBe(200);
      const secondBody = secondLogin.json() as { token: string; user: { sid: string } };
      const secondToken = secondBody.token;

      // Use the second token to revoke the first session
      const revokeResponse = await server.inject({
        method: 'POST',
        url: `/api/auth/sessions/${firstSid}/revoke`,
        headers: { authorization: `Bearer ${secondToken}` }
      });
      expect(revokeResponse.statusCode).toBe(200);
      expect(revokeResponse.json()).toEqual({ success: true });

      // The first token should now be rejected
      const rejectedResponse = await server.inject({
        method: 'GET',
        url: '/api/auth/sessions',
        headers: { authorization: `Bearer ${firstToken}` }
      });
      expect(rejectedResponse.statusCode).toBe(401);

      // The second token should still work
      const activeResponse = await server.inject({
        method: 'GET',
        url: '/api/auth/sessions',
        headers: { authorization: `Bearer ${secondToken}` }
      });
      expect(activeResponse.statusCode).toBe(200);
    } finally {
      await server.db.query(`DELETE FROM users WHERE id = $1`, [userId]);
    }
  });
});
