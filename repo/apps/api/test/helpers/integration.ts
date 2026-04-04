import argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import { beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../../src/server.js';

export const runIntegration = process.env.RUN_DB_TESTS === '1';

export const createIntegrationHarness = () => {
  let server: FastifyInstance;

  beforeAll(async () => {
    server = await buildServer();
    await server.ready();
  });

  afterAll(async () => {
    await server.close();
  });

  return {
    get server() {
      return server;
    }
  };
};

export const loginAsAdmin = async (server: FastifyInstance) => {
  return loginAsUser(
    server,
    process.env.DEFAULT_ADMIN_USERNAME ?? 'admin',
    process.env.DEFAULT_ADMIN_PASSWORD ?? 'ChangeMeNow!123'
  );
};

export const loginAsUser = async (server: FastifyInstance, username: string, password: string) => {
  const response = await server.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: {
      username,
      password
    }
  });

  if (response.statusCode !== 200) {
    throw new Error(`Login failed for ${username} with ${response.statusCode}: ${response.body}`);
  }

  const body = response.json() as { token: string };
  return {
    token: body.token
  };
};

export const createScopedPermissionUser = async (
  server: FastifyInstance,
  input: {
    permissionCodes: string[];
    warehouseCodes?: string[];
    departmentCodes?: string[];
    username?: string;
    password?: string;
    displayName?: string;
    roleCode?: string;
    roleName?: string;
  }
) => {
  const suffix = randomUUID().slice(0, 8);
  const username = input.username ?? `scoped_${suffix}`;
  const password = input.password ?? 'ScopedPerm!123';
  const displayName = input.displayName ?? `Scoped ${suffix}`;
  const roleCode = input.roleCode ?? `scoped_role_${suffix}`;
  const roleName = input.roleName ?? `Scoped Role ${suffix}`;
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });

  const roleResult = await server.db.query<{ id: string }>(
    `
      INSERT INTO roles (code, name)
      VALUES ($1, $2)
      RETURNING id
    `,
    [roleCode, roleName]
  );
  const roleId = roleResult.rows[0].id;

  if (input.permissionCodes.length) {
    const assignmentResult = await server.db.query(
      `
        INSERT INTO role_permissions (role_id, permission_id)
        SELECT $1, p.id
        FROM permissions p
        WHERE p.code = ANY($2::text[])
        ON CONFLICT DO NOTHING
      `,
      [roleId, input.permissionCodes]
    );

    if ((assignmentResult.rowCount ?? 0) !== new Set(input.permissionCodes).size) {
      throw new Error(`Failed to assign expected permissions for ${roleCode}`);
    }
  }

  const userResult = await server.db.query<{ id: string }>(
    `
      INSERT INTO users (username, display_name, password_hash, password_history)
      VALUES ($1, $2, $3, '[]'::jsonb)
      RETURNING id
    `,
    [username, displayName, passwordHash]
  );
  const userId = userResult.rows[0].id;

  await server.db.query(
    `INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)`,
    [userId, roleId]
  );

  if (input.warehouseCodes?.length) {
    await server.db.query(
      `
        INSERT INTO attribute_rules (user_id, resource_type, resource_id, rule_type, metadata)
        SELECT $1, 'warehouse', w.id, 'access', '{}'::jsonb
        FROM warehouses w
        WHERE w.code = ANY($2::text[])
      `,
      [userId, input.warehouseCodes]
    );
  }

  if (input.departmentCodes?.length) {
    await server.db.query(
      `
        INSERT INTO attribute_rules (user_id, resource_type, resource_id, rule_type, metadata)
        SELECT $1, 'department', d.id, 'access', '{}'::jsonb
        FROM departments d
        WHERE d.code = ANY($2::text[])
      `,
      [userId, input.departmentCodes]
    );
  }

  return {
    userId,
    roleId,
    username,
    password,
    roleCode,
    cleanup: async () => {
      await server.db.query(`DELETE FROM attribute_rules WHERE user_id = $1`, [userId]);
      await server.db.query(`DELETE FROM user_roles WHERE user_id = $1`, [userId]);
      await server.db.query(`DELETE FROM users WHERE id = $1`, [userId]);
      await server.db.query(`DELETE FROM role_permissions WHERE role_id = $1`, [roleId]);
      await server.db.query(`DELETE FROM roles WHERE id = $1`, [roleId]);
    }
  };
};
