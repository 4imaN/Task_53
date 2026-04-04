import type { FastifyInstance } from 'fastify';
import { config } from '../config.js';
import { validateRoleScopeAssignments } from '../services/access-control.service.js';
import { IntegrationClientService } from '../services/integration-client.service.js';
import { validateInternalWebhookUrl } from '../services/webhook-url.service.js';
import { AuthService } from '../services/auth.service.js';
import { assertPasswordNotReused, PASSWORD_REUSE_MESSAGE } from '../utils/password-history.js';
import { assertPasswordComplexity, hashPassword, PasswordPolicyError } from '../utils/password-policy.js';

type AccessControlBody = {
  roleCodes?: string[];
  warehouseIds?: string[];
  departmentIds?: string[];
};

const userIdParamsSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['userId'],
  properties: {
    userId: { type: 'string', format: 'uuid' }
  }
} as const;

const createUserBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['username', 'displayName', 'password'],
  properties: {
    username: { type: 'string', minLength: 1, maxLength: 255 },
    displayName: { type: 'string', minLength: 1, maxLength: 255 },
    password: { type: 'string', minLength: 1, maxLength: 255 },
    phoneNumber: { type: 'string', minLength: 1, maxLength: 64 },
    personalEmail: { type: 'string', minLength: 3, maxLength: 255 },
    isActive: { type: 'boolean' },
    roleCodes: {
      type: 'array',
      items: { type: 'string', minLength: 1, maxLength: 64 },
      maxItems: 20
    },
    warehouseIds: {
      type: 'array',
      items: { type: 'string', format: 'uuid' },
      maxItems: 100
    },
    departmentIds: {
      type: 'array',
      items: { type: 'string', format: 'uuid' },
      maxItems: 100
    }
  }
} as const;

const updateUserBodySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    username: { type: 'string', minLength: 1, maxLength: 255 },
    displayName: { type: 'string', minLength: 1, maxLength: 255 },
    isActive: { type: 'boolean' },
    password: { type: 'string', minLength: 1, maxLength: 255 },
    phoneNumber: { anyOf: [{ type: 'string', minLength: 1, maxLength: 64 }, { type: 'null' }] },
    personalEmail: { anyOf: [{ type: 'string', minLength: 3, maxLength: 255 }, { type: 'null' }] }
  }
} as const;

const accessControlBodySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    roleCodes: {
      type: 'array',
      items: { type: 'string', minLength: 1, maxLength: 64 },
      maxItems: 20
    },
    warehouseIds: {
      type: 'array',
      items: { type: 'string', format: 'uuid' },
      maxItems: 100
    },
    departmentIds: {
      type: 'array',
      items: { type: 'string', format: 'uuid' },
      maxItems: 100
    }
  }
} as const;

const auditLogQuerySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    limit: { type: 'integer', minimum: 1, maximum: 100 }
  }
} as const;

const integrationClientBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['name', 'clientKey', 'hmacSecret'],
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 255 },
    clientKey: { type: 'string', minLength: 1, maxLength: 255 },
    hmacSecret: { type: 'string', minLength: 1, maxLength: 1024 },
    allowedDepartments: {
      type: 'array',
      items: { type: 'string', minLength: 1, maxLength: 255 },
      maxItems: 100
    },
    scopes: {
      type: 'array',
      items: { type: 'string', minLength: 1, maxLength: 255 },
      maxItems: 50
    },
    rateLimitPerMinute: { type: 'integer', minimum: 1, maximum: 100000 },
    webhookUrl: { anyOf: [{ type: 'string', minLength: 1, maxLength: 2048 }, { type: 'null' }] },
    isActive: { type: 'boolean' }
  }
} as const;

const assertAdminOnly = (user: { roleCodes: string[] }) => {
  if (!user.roleCodes.includes('administrator')) {
    const error = new Error('Only administrators can manage access control') as Error & { statusCode?: number };
    error.statusCode = 403;
    throw error;
  }
};

const validateRoleCodes = async (fastify: FastifyInstance, roleCodes: string[]) => {
  if (!roleCodes.length) {
    const error = new Error('At least one role must be assigned') as Error & { statusCode?: number };
    error.statusCode = 422;
    throw error;
  }

  const roleResult = await fastify.db.query<{ code: string }>(
    `SELECT code FROM roles WHERE code = ANY($1::text[])`,
    [roleCodes]
  );

  if (roleResult.rowCount !== new Set(roleCodes).size) {
    const error = new Error('One or more role codes are invalid') as Error & { statusCode?: number };
    error.statusCode = 422;
    throw error;
  }
};

const validateScopeIds = async (fastify: FastifyInstance, table: 'warehouses' | 'departments', ids: string[]) => {
  if (!ids.length) {
    return;
  }

  const result = await fastify.db.query<{ id: string }>(
    `SELECT id FROM ${table} WHERE id = ANY($1::uuid[])`,
    [ids]
  );

  if (result.rowCount !== new Set(ids).size) {
    const error = new Error(`One or more ${table} are invalid`) as Error & { statusCode?: number };
    error.statusCode = 422;
    throw error;
  }
};

const syncAccessControl = async (
  fastify: FastifyInstance,
  userId: string,
  accessControl: Required<AccessControlBody>
) => {
  const client = await fastify.db.connect();
  try {
    await client.query('BEGIN');

    await client.query(`DELETE FROM user_roles WHERE user_id = $1`, [userId]);
    if (accessControl.roleCodes.length) {
      await client.query(
        `
          INSERT INTO user_roles (user_id, role_id)
          SELECT $1, r.id
          FROM roles r
          WHERE r.code = ANY($2::text[])
        `,
        [userId, accessControl.roleCodes]
      );
    }

    await client.query(
      `DELETE FROM attribute_rules WHERE user_id = $1 AND rule_type = 'access' AND resource_type IN ('warehouse', 'department')`,
      [userId]
    );

    if (accessControl.warehouseIds.length) {
      await client.query(
        `
          INSERT INTO attribute_rules (user_id, resource_type, resource_id, rule_type, metadata)
          SELECT $1, 'warehouse', warehouse_id, 'access', '{}'::jsonb
          FROM unnest($2::uuid[]) AS warehouse_id
        `,
        [userId, accessControl.warehouseIds]
      );
    }

    if (accessControl.departmentIds.length) {
      await client.query(
        `
          INSERT INTO attribute_rules (user_id, resource_type, resource_id, rule_type, metadata)
          SELECT $1, 'department', department_id, 'access', '{}'::jsonb
          FROM unnest($2::uuid[]) AS department_id
        `,
        [userId, accessControl.departmentIds]
      );
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

export const registerAdminRoutes = async (fastify: FastifyInstance) => {
  const integrationClients = new IntegrationClientService(fastify);
  const authService = new AuthService(fastify);

  fastify.get('/users', {
    preHandler: [fastify.authenticate, fastify.requirePermission('users.manage')]
  }, async (request) => {
    assertAdminOnly(request.authUser!);
    const result = await fastify.db.query(
      `
        SELECT
          u.id,
          u.username,
          u.display_name,
          u.failed_login_count,
          u.locked_until,
          u.is_active,
          COALESCE(array_agg(DISTINCT r.code) FILTER (WHERE r.code IS NOT NULL), ARRAY[]::text[]) AS roles,
          COALESCE(array_agg(DISTINCT w.code) FILTER (WHERE w.code IS NOT NULL), ARRAY[]::text[]) AS warehouses,
          COALESCE(array_agg(DISTINCT w.id::text) FILTER (WHERE w.id IS NOT NULL), ARRAY[]::text[]) AS warehouse_ids,
          COALESCE(array_agg(DISTINCT d.code) FILTER (WHERE d.code IS NOT NULL), ARRAY[]::text[]) AS departments,
          COALESCE(array_agg(DISTINCT d.id::text) FILTER (WHERE d.id IS NOT NULL), ARRAY[]::text[]) AS department_ids
        FROM users u
        LEFT JOIN user_roles ur ON ur.user_id = u.id
        LEFT JOIN roles r ON r.id = ur.role_id
        LEFT JOIN attribute_rules arw ON arw.user_id = u.id AND arw.resource_type = 'warehouse' AND arw.rule_type = 'access'
        LEFT JOIN warehouses w ON w.id = arw.resource_id
        LEFT JOIN attribute_rules ard ON ard.user_id = u.id AND ard.resource_type = 'department' AND ard.rule_type = 'access'
        LEFT JOIN departments d ON d.id = ard.resource_id
        WHERE u.deleted_at IS NULL
        GROUP BY u.id
        ORDER BY u.display_name ASC
      `
    );

    return result.rows;
  });

  fastify.get('/access-control/options', {
    preHandler: [fastify.authenticate, fastify.requirePermission('users.manage')]
  }, async (request) => {
    assertAdminOnly(request.authUser!);

    const [roles, warehouses, departments] = await Promise.all([
      fastify.db.query(`SELECT id, code, name FROM roles ORDER BY name ASC`),
      fastify.db.query(`SELECT id, code, name FROM warehouses WHERE deleted_at IS NULL ORDER BY name ASC`),
      fastify.db.query(`SELECT id, code, name FROM departments ORDER BY name ASC`)
    ]);

    return {
      roles: roles.rows,
      warehouses: warehouses.rows,
      departments: departments.rows
    };
  });

  fastify.post('/users', {
    preHandler: [fastify.authenticate, fastify.requirePermission('users.manage')],
    schema: { body: createUserBodySchema }
  }, async (request, reply) => {
    assertAdminOnly(request.authUser!);

    const body = request.body as {
      username: string;
      displayName: string;
      password: string;
      phoneNumber?: string;
      personalEmail?: string;
      isActive?: boolean;
      roleCodes?: string[];
      warehouseIds?: string[];
      departmentIds?: string[];
    };

    try {
      assertPasswordComplexity(body.password);
    } catch (error) {
      if (error instanceof PasswordPolicyError) {
        return reply.code(error.statusCode).send({ message: error.message });
      }

      throw error;
    }

    const roleCodes = [...new Set(body.roleCodes ?? ['warehouse_clerk'])];
    const warehouseIds = [...new Set(body.warehouseIds ?? [])];
    const departmentIds = [...new Set(body.departmentIds ?? [])];

    await validateRoleCodes(fastify, roleCodes);
    await validateScopeIds(fastify, 'warehouses', warehouseIds);
    await validateScopeIds(fastify, 'departments', departmentIds);
    validateRoleScopeAssignments({ roleCodes, warehouseIds, departmentIds });

    const passwordHash = await hashPassword(body.password);

    const client = await fastify.db.connect();
    let createdUserId = '';
    try {
      await client.query('BEGIN');

      const insertResult = await client.query<{ id: string }>(
        `
          INSERT INTO users (
            username,
            display_name,
            password_hash,
            password_history,
            is_active,
            phone_number,
            personal_email
          )
          VALUES (
            $1,
            $2,
            $3,
            '[]'::jsonb,
            $4,
            CASE
              WHEN $5::text IS NULL OR btrim($5::text) = '' THEN NULL
              ELSE pgp_sym_encrypt($5::text, $7::text, 'cipher-algo=aes256,compress-algo=0')
            END,
            CASE
              WHEN $6::text IS NULL OR btrim($6::text) = '' THEN NULL
              ELSE pgp_sym_encrypt($6::text, $7::text, 'cipher-algo=aes256,compress-algo=0')
            END
          )
          RETURNING id
        `,
        [
          body.username.trim(),
          body.displayName.trim(),
          passwordHash,
          body.isActive ?? true,
          body.phoneNumber?.trim() || null,
          body.personalEmail?.trim() || null,
          config.encryptionKey
        ]
      );
      createdUserId = insertResult.rows[0].id;

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    await syncAccessControl(fastify, createdUserId, {
      roleCodes,
      warehouseIds,
      departmentIds
    });

    request.auditContext = {
      actionType: 'user_create',
      resourceType: 'user',
      resourceId: createdUserId,
      details: {
        username: body.username.trim(),
        roleCodes,
        warehouseIds,
        departmentIds,
        isActive: body.isActive ?? true
      }
    };

    return reply.code(201).send({ id: createdUserId });
  });

  fastify.patch('/users/:userId', {
    preHandler: [fastify.authenticate, fastify.requirePermission('users.manage')],
    schema: {
      params: userIdParamsSchema,
      body: updateUserBodySchema
    }
  }, async (request, reply) => {
    assertAdminOnly(request.authUser!);
    const { userId } = request.params as { userId: string };
    const body = request.body as {
      username?: string;
      displayName?: string;
      isActive?: boolean;
      password?: string;
      phoneNumber?: string | null;
      personalEmail?: string | null;
    };

    const assignments: string[] = [];
    const values: unknown[] = [userId];
    let currentUserRecord: { is_active: boolean; password_hash: string; password_history: string[] } | null = null;

    if (body.isActive !== undefined || body.password) {
      const currentResult = await fastify.db.query<{
        is_active: boolean;
        password_hash: string;
        password_history: string[];
      }>(
        `SELECT is_active, password_hash, password_history FROM users WHERE id = $1 AND deleted_at IS NULL`,
        [userId]
      );

      if (!currentResult.rowCount) {
        return reply.code(404).send({ message: 'User not found' });
      }

      currentUserRecord = currentResult.rows[0];
    }

    if (body.username !== undefined) {
      values.push(body.username.trim());
      assignments.push(`username = $${values.length}`);
    }

    if (body.displayName !== undefined) {
      values.push(body.displayName.trim());
      assignments.push(`display_name = $${values.length}`);
    }

    if (body.isActive !== undefined) {
      values.push(body.isActive);
      assignments.push(`is_active = $${values.length}`);
    }

    if (body.phoneNumber !== undefined) {
      values.push(body.phoneNumber?.trim() || null);
      values.push(config.encryptionKey);
      assignments.push(
        `phone_number = CASE
          WHEN $${values.length - 1}::text IS NULL OR btrim($${values.length - 1}::text) = '' THEN NULL
          ELSE pgp_sym_encrypt($${values.length - 1}::text, $${values.length}::text, 'cipher-algo=aes256,compress-algo=0')
        END`
      );
    }

    if (body.personalEmail !== undefined) {
      values.push(body.personalEmail?.trim() || null);
      values.push(config.encryptionKey);
      assignments.push(
        `personal_email = CASE
          WHEN $${values.length - 1}::text IS NULL OR btrim($${values.length - 1}::text) = '' THEN NULL
          ELSE pgp_sym_encrypt($${values.length - 1}::text, $${values.length}::text, 'cipher-algo=aes256,compress-algo=0')
        END`
      );
    }

    if (body.password) {
      try {
        assertPasswordComplexity(body.password);
      } catch (error) {
        if (error instanceof PasswordPolicyError) {
          return reply.code(error.statusCode).send({ message: error.message });
        }

        throw error;
      }
      const currentRecord = currentUserRecord;
      if (!currentRecord) {
        return reply.code(404).send({ message: 'User not found' });
      }

      try {
        await assertPasswordNotReused(
          body.password,
          currentRecord.password_hash,
          currentRecord.password_history,
          config.passwordHistoryDepth
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : PASSWORD_REUSE_MESSAGE;
        return reply.code(422).send({ message });
      }

      const passwordHash = await hashPassword(body.password);
      const nextHistory = [
        currentRecord.password_hash,
        ...(currentRecord.password_history ?? [])
      ].slice(0, config.passwordHistoryDepth);

      values.push(passwordHash);
      assignments.push(`password_hash = $${values.length}`);
      values.push(JSON.stringify(nextHistory));
      assignments.push(`password_history = $${values.length}::jsonb`);
      assignments.push(`password_changed_at = NOW()`);
    }

    if (!assignments.length) {
      const userResult = await fastify.db.query<{ id: string }>(
        `SELECT id FROM users WHERE id = $1 AND deleted_at IS NULL`,
        [userId]
      );

      if (!userResult.rowCount) {
        return reply.code(404).send({ message: 'User not found' });
      }

      return { success: true };
    }

    const result = await fastify.db.query(
      `
        UPDATE users
        SET ${assignments.join(', ')}, updated_at = NOW()
        WHERE id = $1
          AND deleted_at IS NULL
        RETURNING id
      `,
      values
    );

    if (!result.rowCount) {
      return reply.code(404).send({ message: 'User not found' });
    }

    let authInvalidationReason: string | null = null;
    if (body.password) {
      authInvalidationReason = 'admin_password_reset';
    } else if (body.isActive === false) {
      authInvalidationReason = 'user_deactivated';
    } else if (
      body.isActive === true
      && currentUserRecord
      && currentUserRecord.is_active === false
    ) {
      authInvalidationReason = 'user_reactivated';
    }

    if (authInvalidationReason) {
      await authService.invalidateAuthorizationState(userId, authInvalidationReason);
    }

    request.auditContext = {
      actionType: 'user_update',
      resourceType: 'user',
      resourceId: userId,
      details: {
        username: body.username?.trim(),
        displayName: body.displayName?.trim(),
        isActive: body.isActive,
        passwordUpdated: Boolean(body.password),
        phoneNumberUpdated: body.phoneNumber !== undefined,
        personalEmailUpdated: body.personalEmail !== undefined
      }
    };

    return { success: true };
  });

  fastify.put('/users/:userId/access-control', {
    preHandler: [fastify.authenticate, fastify.requirePermission('users.manage')],
    schema: {
      params: userIdParamsSchema,
      body: accessControlBodySchema
    }
  }, async (request, reply) => {
    assertAdminOnly(request.authUser!);
    const { userId } = request.params as { userId: string };
    const body = request.body as AccessControlBody;

    const roleCodes = [...new Set(body.roleCodes ?? [])];
    const warehouseIds = [...new Set(body.warehouseIds ?? [])];
    const departmentIds = [...new Set(body.departmentIds ?? [])];

    await validateRoleCodes(fastify, roleCodes);
    await validateScopeIds(fastify, 'warehouses', warehouseIds);
    await validateScopeIds(fastify, 'departments', departmentIds);
    validateRoleScopeAssignments({ roleCodes, warehouseIds, departmentIds });

    const userResult = await fastify.db.query(`SELECT id FROM users WHERE id = $1 AND deleted_at IS NULL`, [userId]);
    if (!userResult.rowCount) {
      return reply.code(404).send({ message: 'User not found' });
    }

    await syncAccessControl(fastify, userId, {
      roleCodes,
      warehouseIds,
      departmentIds
    });
    await authService.invalidateAuthorizationState(userId, 'access_control_update');

    request.auditContext = {
      actionType: 'access_control_update',
      resourceType: 'user',
      resourceId: userId,
      details: {
        roleCodes,
        warehouseIds,
        departmentIds
      }
    };

    return { success: true };
  });

  fastify.post('/users/:userId/unlock', {
    preHandler: [fastify.authenticate, fastify.requirePermission('users.manage')],
    schema: { params: userIdParamsSchema }
  }, async (request, reply) => {
    assertAdminOnly(request.authUser!);
    const { userId } = request.params as { userId: string };
    const result = await fastify.db.query<{ id: string }>(
      `
        UPDATE users
        SET failed_login_count = 0, locked_until = NULL, updated_at = NOW()
        WHERE id = $1
          AND deleted_at IS NULL
        RETURNING id
      `,
      [userId]
    );

    if (!result.rowCount) {
      return reply.code(404).send({ message: 'User not found' });
    }

    request.auditContext = {
      actionType: 'user_unlock',
      resourceType: 'user',
      resourceId: userId
    };

    return { success: true };
  });

  fastify.get('/audit-log', {
    preHandler: [fastify.authenticate, fastify.requirePermission('audit.read')],
    schema: { querystring: auditLogQuerySchema }
  }, async (request) => {
    const query = request.query as { limit?: number };
    const limit = query.limit ?? 25;
    const result = await fastify.db.query(
      `
        SELECT timestamp, action_type, resource_type, resource_id, details, ip_address, user_id
        FROM audit_log
        ORDER BY timestamp DESC
        LIMIT $1
      `,
      [limit]
    );

    return result.rows;
  });

  fastify.get('/integration-clients', {
    preHandler: [fastify.authenticate, fastify.requirePermission('integrations.manage')]
  }, async (request) => {
    assertAdminOnly(request.authUser!);
    return integrationClients.listClients();
  });

  fastify.post('/integration-clients', {
    preHandler: [fastify.authenticate, fastify.requirePermission('integrations.manage')],
    schema: { body: integrationClientBodySchema }
  }, async (request, reply) => {
    assertAdminOnly(request.authUser!);

    const body = request.body as {
      name: string;
      clientKey: string;
      hmacSecret: string;
      allowedDepartments?: string[];
      scopes?: string[];
      rateLimitPerMinute?: number;
      webhookUrl?: string | null;
      isActive?: boolean;
    };

    if (!body.name?.trim() || !body.clientKey?.trim() || !body.hmacSecret) {
      return reply.code(422).send({ message: 'Name, client key, and shared secret are required' });
    }

    const departments = [...new Set((body.allowedDepartments ?? []).map((entry) => String(entry).trim()).filter(Boolean))];
    const scopes = [...new Set((body.scopes ?? []).map((entry) => String(entry).trim()).filter(Boolean))];
    const webhookUrl = body.webhookUrl
      ? await validateInternalWebhookUrl(body.webhookUrl, {
        allowedHostnames: config.webhookAllowedHostnames,
        allowedDomainSuffixes: config.webhookAllowedDomainSuffixes,
        allowLoopback: config.allowDevWebhookLoopback
      })
      : null;

    const created = await integrationClients.createClient({
      name: body.name,
      clientKey: body.clientKey,
      hmacSecret: Buffer.from(body.hmacSecret, 'utf8'),
      allowedDepartments: departments,
      scopes,
      rateLimitPerMinute: body.rateLimitPerMinute,
      webhookUrl,
      isActive: body.isActive ?? true
    });

    request.auditContext = {
      actionType: 'integration_client_create',
      resourceType: 'integration_client',
      resourceId: created.id,
      details: {
        clientKey: body.clientKey.trim(),
        allowedDepartments: departments,
        scopes,
        rateLimitPerMinute: body.rateLimitPerMinute ?? config.integrationRateLimit,
        webhookConfigured: Boolean(webhookUrl)
      }
    };

    return reply.code(201).send({ id: created.id });
  });
};
