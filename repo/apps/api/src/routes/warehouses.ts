import type { FastifyInstance } from 'fastify';
import { AccessControlService } from '../services/access-control.service.js';
import {
  CANONICAL_TEMPERATURE_BANDS,
  canonicalTemperatureBandListText,
  normalizeTemperatureBand
} from '../domain/temperature-band.js';

const numericFieldNames = ['maxLoadLbs', 'maxLengthIn', 'maxWidthIn', 'maxHeightIn'] as const;
const nonEmptyStringPattern = '^(?=.*\\S).+$';

const warehouseIdParamsSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['warehouseId'],
  properties: {
    warehouseId: { type: 'string', format: 'uuid' }
  }
} as const;

const zoneIdParamsSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['zoneId'],
  properties: {
    zoneId: { type: 'string', format: 'uuid' }
  }
} as const;

const binIdParamsSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['binId'],
  properties: {
    binId: { type: 'string', format: 'uuid' }
  }
} as const;

const warehouseCreateBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['departmentId', 'code', 'name'],
  properties: {
    departmentId: { type: 'string', format: 'uuid' },
    code: { type: 'string', minLength: 1, maxLength: 64, pattern: nonEmptyStringPattern },
    name: { type: 'string', minLength: 1, maxLength: 255, pattern: nonEmptyStringPattern },
    address: { anyOf: [{ type: 'string', minLength: 1, maxLength: 255, pattern: nonEmptyStringPattern }, { type: 'null' }] },
    isActive: { type: 'boolean' }
  }
} as const;

const warehouseUpdateBodySchema = {
  type: 'object',
  additionalProperties: false,
  minProperties: 1,
  properties: {
    departmentId: { type: 'string', format: 'uuid' },
    code: { type: 'string', minLength: 1, maxLength: 64, pattern: nonEmptyStringPattern },
    name: { type: 'string', minLength: 1, maxLength: 255, pattern: nonEmptyStringPattern },
    address: { anyOf: [{ type: 'string', minLength: 1, maxLength: 255, pattern: nonEmptyStringPattern }, { type: 'null' }] },
    isActive: { type: 'boolean' }
  }
} as const;

const zoneCreateBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['code', 'name'],
  properties: {
    code: { type: 'string', minLength: 1, maxLength: 64, pattern: nonEmptyStringPattern },
    name: { type: 'string', minLength: 1, maxLength: 255, pattern: nonEmptyStringPattern }
  }
} as const;

const zoneUpdateBodySchema = {
  type: 'object',
  additionalProperties: false,
  minProperties: 1,
  properties: {
    code: { type: 'string', minLength: 1, maxLength: 64, pattern: nonEmptyStringPattern },
    name: { type: 'string', minLength: 1, maxLength: 255, pattern: nonEmptyStringPattern }
  }
} as const;

const binCreateBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['code', 'temperatureBand', 'maxLoadLbs', 'maxLengthIn', 'maxWidthIn', 'maxHeightIn'],
  properties: {
    code: { type: 'string', minLength: 1, maxLength: 64, pattern: nonEmptyStringPattern },
    temperatureBand: { type: 'string', minLength: 1, maxLength: 64, pattern: nonEmptyStringPattern },
    maxLoadLbs: { type: 'number', exclusiveMinimum: 0 },
    maxLengthIn: { type: 'number', exclusiveMinimum: 0 },
    maxWidthIn: { type: 'number', exclusiveMinimum: 0 },
    maxHeightIn: { type: 'number', exclusiveMinimum: 0 },
    isActive: { type: 'boolean' },
    reason: { anyOf: [{ type: 'string', minLength: 1, maxLength: 255, pattern: nonEmptyStringPattern }, { type: 'null' }] }
  }
} as const;

const binUpdateBodySchema = {
  type: 'object',
  additionalProperties: false,
  minProperties: 1,
  properties: {
    code: { type: 'string', minLength: 1, maxLength: 64, pattern: nonEmptyStringPattern },
    temperatureBand: { type: 'string', minLength: 1, maxLength: 64, pattern: nonEmptyStringPattern },
    maxLoadLbs: { type: 'number', exclusiveMinimum: 0 },
    maxLengthIn: { type: 'number', exclusiveMinimum: 0 },
    maxWidthIn: { type: 'number', exclusiveMinimum: 0 },
    maxHeightIn: { type: 'number', exclusiveMinimum: 0 },
    isActive: { type: 'boolean' },
    reason: { anyOf: [{ type: 'string', minLength: 1, maxLength: 255, pattern: nonEmptyStringPattern }, { type: 'null' }] }
  }
} as const;

const binToggleBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['isActive'],
  properties: {
    isActive: { type: 'boolean' },
    reason: { anyOf: [{ type: 'string', minLength: 1, maxLength: 255, pattern: nonEmptyStringPattern }, { type: 'null' }] }
  }
} as const;

type BinPayloadInput = {
  code?: string;
  temperatureBand?: string;
  maxLoadLbs?: number;
  maxLengthIn?: number;
  maxWidthIn?: number;
  maxHeightIn?: number;
  isActive?: boolean;
  reason?: string | null;
};

const normalizeBinBody = (body: BinPayloadInput) => ({
  code: (body.code ?? '').trim(),
  temperatureBand: normalizeTemperatureBand(body.temperatureBand, { allowLegacyAliases: true }) ?? '',
  maxLoadLbs: Number(body.maxLoadLbs),
  maxLengthIn: Number(body.maxLengthIn),
  maxWidthIn: Number(body.maxWidthIn),
  maxHeightIn: Number(body.maxHeightIn),
  isActive: body.isActive ?? true,
  reason: typeof body.reason === 'string' ? body.reason.trim() : null
});

const assertValidBinPayload = (payload: ReturnType<typeof normalizeBinBody>) => {
  if (!payload.code) {
    const error = new Error('Bin code is required') as Error & { statusCode?: number };
    error.statusCode = 422;
    throw error;
  }

  if (!payload.temperatureBand) {
    const error = new Error(`Temperature band must be one of: ${canonicalTemperatureBandListText}`) as Error & { statusCode?: number };
    error.statusCode = 422;
    throw error;
  }

  if (numericFieldNames.some((field) => Number.isNaN(payload[field]) || payload[field] <= 0)) {
    const error = new Error('Bin dimensional and load limits must be greater than zero') as Error & { statusCode?: number };
    error.statusCode = 422;
    throw error;
  }
};

export const registerWarehouseRoutes = async (fastify: FastifyInstance) => {
  const accessControl = new AccessControlService(fastify);

  fastify.get('/warehouses', {
    preHandler: [fastify.authenticate, fastify.requirePermission('warehouses.read')]
  }, async (request) => {
    const user = request.authUser!;
    const values: unknown[] = [];
    let whereClause = 'w.deleted_at IS NULL';

    if (!user.roleCodes.includes('administrator') && !user.roleCodes.includes('manager')) {
      if (!user.assignedWarehouseIds.length) {
        whereClause += ' AND 1 = 0';
      } else {
        values.push(user.assignedWarehouseIds);
        whereClause += ` AND w.id = ANY($${values.length}::uuid[])`;
      }
    }

    const result = await fastify.db.query(
      `
        SELECT w.id, w.code, w.name, w.address, w.is_active, w.department_id, d.code AS department_code, d.name AS department_name
        FROM warehouses w
        JOIN departments d ON d.id = w.department_id
        WHERE ${whereClause}
        ORDER BY w.name ASC
      `,
      values
    );

    return result.rows;
  });

  fastify.get('/warehouse-setup/options', {
    preHandler: [fastify.authenticate, fastify.requirePermission('warehouses.manage')]
  }, async () => {
    const departments = await fastify.db.query(
      `SELECT id, code, name FROM departments ORDER BY name ASC`
    );

    return {
      departments: departments.rows,
      temperatureBands: [...CANONICAL_TEMPERATURE_BANDS]
    };
  });

  fastify.post('/warehouses', {
    preHandler: [fastify.authenticate, fastify.requirePermission('warehouses.manage')],
    schema: { body: warehouseCreateBodySchema }
  }, async (request, reply) => {
    const body = request.body as {
      departmentId: string;
      code: string;
      name: string;
      address?: string | null;
      isActive?: boolean;
    };

    const result = await fastify.db.query<{ id: string }>(
      `
        INSERT INTO warehouses (department_id, code, name, address, is_active)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id
      `,
      [body.departmentId, body.code.trim(), body.name.trim(), body.address?.trim() ?? null, body.isActive ?? true]
    );

    request.auditContext = {
      actionType: 'warehouse_create',
      resourceType: 'warehouse',
      resourceId: result.rows[0].id,
      details: {
        departmentId: body.departmentId,
        code: body.code.trim(),
        name: body.name.trim(),
        isActive: body.isActive ?? true
      }
    };

    return reply.code(201).send({ id: result.rows[0].id });
  });

  fastify.patch('/warehouses/:warehouseId', {
    preHandler: [fastify.authenticate, fastify.requirePermission('warehouses.manage')],
    schema: {
      params: warehouseIdParamsSchema,
      body: warehouseUpdateBodySchema
    }
  }, async (request, reply) => {
    const { warehouseId } = request.params as { warehouseId: string };
    await accessControl.ensureWarehouseAccess(request.authUser!, warehouseId, 'Warehouse is outside your assigned scope');

    const body = request.body as {
      departmentId?: string;
      code?: string;
      name?: string;
      address?: string | null;
      isActive?: boolean;
    };

    const values: unknown[] = [warehouseId];
    const assignments: string[] = [];

    if (body.departmentId !== undefined) {
      values.push(body.departmentId);
      assignments.push(`department_id = $${values.length}`);
    }
    if (body.code !== undefined) {
      values.push(body.code.trim());
      assignments.push(`code = $${values.length}`);
    }
    if (body.name !== undefined) {
      values.push(body.name.trim());
      assignments.push(`name = $${values.length}`);
    }
    if (body.address !== undefined) {
      values.push(body.address === null ? null : body.address.trim());
      assignments.push(`address = $${values.length}`);
    }
    if (body.isActive !== undefined) {
      values.push(body.isActive);
      assignments.push(`is_active = $${values.length}`);
    }

    const result = await fastify.db.query(
      `
        UPDATE warehouses
        SET ${assignments.join(', ')}, updated_at = NOW()
        WHERE id = $1
        RETURNING id
      `,
      values
    );

    if (!result.rowCount) {
      return reply.code(404).send({ message: 'Warehouse not found' });
    }

    request.auditContext = {
      actionType: 'warehouse_update',
      resourceType: 'warehouse',
      resourceId: warehouseId,
      details: body as Record<string, unknown>
    };

    return { success: true };
  });

  fastify.post('/warehouses/:warehouseId/zones', {
    preHandler: [fastify.authenticate, fastify.requirePermission('warehouses.manage')],
    schema: {
      params: warehouseIdParamsSchema,
      body: zoneCreateBodySchema
    }
  }, async (request, reply) => {
    const { warehouseId } = request.params as { warehouseId: string };
    await accessControl.ensureWarehouseAccess(request.authUser!, warehouseId, 'Warehouse is outside your assigned scope');

    const body = request.body as { code: string; name: string };
    const result = await fastify.db.query<{ id: string }>(
      `
        INSERT INTO zones (warehouse_id, code, name)
        VALUES ($1, $2, $3)
        RETURNING id
      `,
      [warehouseId, body.code.trim(), body.name.trim()]
    );

    request.auditContext = {
      actionType: 'zone_create',
      resourceType: 'zone',
      resourceId: result.rows[0].id,
      details: {
        warehouseId,
        code: body.code.trim(),
        name: body.name.trim()
      }
    };

    return reply.code(201).send({ id: result.rows[0].id });
  });

  fastify.patch('/zones/:zoneId', {
    preHandler: [fastify.authenticate, fastify.requirePermission('warehouses.manage')],
    schema: {
      params: zoneIdParamsSchema,
      body: zoneUpdateBodySchema
    }
  }, async (request, reply) => {
    const { zoneId } = request.params as { zoneId: string };
    const zoneResult = await fastify.db.query<{ warehouse_id: string }>(
      `SELECT warehouse_id FROM zones WHERE id = $1 AND deleted_at IS NULL`,
      [zoneId]
    );

    if (!zoneResult.rowCount) {
      return reply.code(404).send({ message: 'Zone not found' });
    }

    await accessControl.ensureWarehouseAccess(request.authUser!, zoneResult.rows[0].warehouse_id, 'Zone is outside your assigned scope');

    const body = request.body as { code?: string; name?: string };
    const values: unknown[] = [zoneId];
    const assignments: string[] = [];

    if (body.code !== undefined) {
      values.push(body.code.trim());
      assignments.push(`code = $${values.length}`);
    }
    if (body.name !== undefined) {
      values.push(body.name.trim());
      assignments.push(`name = $${values.length}`);
    }

    await fastify.db.query(
      `
        UPDATE zones
        SET ${assignments.join(', ')}
        WHERE id = $1
      `,
      values
    );

    request.auditContext = {
      actionType: 'zone_update',
      resourceType: 'zone',
      resourceId: zoneId,
      details: body as Record<string, unknown>
    };

    return { success: true };
  });

  fastify.post('/zones/:zoneId/bins', {
    preHandler: [fastify.authenticate, fastify.requirePermission('warehouses.manage')],
    schema: {
      params: zoneIdParamsSchema,
      body: binCreateBodySchema
    }
  }, async (request, reply) => {
    const { zoneId } = request.params as { zoneId: string };
    const zoneResult = await fastify.db.query<{ warehouse_id: string }>(
      `SELECT warehouse_id FROM zones WHERE id = $1 AND deleted_at IS NULL`,
      [zoneId]
    );

    if (!zoneResult.rowCount) {
      return reply.code(404).send({ message: 'Zone not found' });
    }

    await accessControl.ensureWarehouseAccess(request.authUser!, zoneResult.rows[0].warehouse_id, 'Zone is outside your assigned scope');

    const body = request.body as BinPayloadInput;
    const payload = normalizeBinBody(body);
    assertValidBinPayload(payload);

    const client = await fastify.db.connect();
    let binId = '';
    try {
      await client.query('BEGIN');
      const insertResult = await client.query<{ id: string }>(
        `
          INSERT INTO bins (
            zone_id,
            code,
            temperature_band,
            max_load_lbs,
            max_length_in,
            max_width_in,
            max_height_in,
            is_active
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          RETURNING id
        `,
        [
          zoneId,
          payload.code,
          payload.temperatureBand,
          payload.maxLoadLbs,
          payload.maxLengthIn,
          payload.maxWidthIn,
          payload.maxHeightIn,
          payload.isActive
        ]
      );
      binId = insertResult.rows[0].id;

      await client.query(
        `
          INSERT INTO bin_change_timeline (bin_id, changed_by, action, reason, details)
          VALUES ($1, $2, 'created', $3, $4::jsonb)
        `,
        [
          binId,
          request.authUser!.id,
          payload.reason,
          JSON.stringify({
            temperatureBand: payload.temperatureBand,
            maxLoadLbs: payload.maxLoadLbs,
            maxLengthIn: payload.maxLengthIn,
            maxWidthIn: payload.maxWidthIn,
            maxHeightIn: payload.maxHeightIn,
            isActive: payload.isActive
          })
        ]
      );

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    request.auditContext = {
      actionType: 'bin_create',
      resourceType: 'bin',
      resourceId: binId,
      details: {
        zoneId,
        code: payload.code,
        temperatureBand: payload.temperatureBand
      }
    };

    return reply.code(201).send({ id: binId });
  });

  fastify.patch('/bins/:binId', {
    preHandler: [fastify.authenticate, fastify.requirePermission('warehouses.manage')],
    schema: {
      params: binIdParamsSchema,
      body: binUpdateBodySchema
    }
  }, async (request, reply) => {
    const { binId } = request.params as { binId: string };
    await accessControl.ensureBinAccess(request.authUser!, binId, 'Bin is outside your assigned warehouse scope');

    const currentResult = await fastify.db.query<{
      code: string;
      temperature_band: string;
      max_load_lbs: string;
      max_length_in: string;
      max_width_in: string;
      max_height_in: string;
      is_active: boolean;
    }>(
      `
        SELECT code, temperature_band, max_load_lbs::text, max_length_in::text, max_width_in::text, max_height_in::text, is_active
        FROM bins
        WHERE id = $1 AND deleted_at IS NULL
      `,
      [binId]
    );

    if (!currentResult.rowCount) {
      return reply.code(404).send({ message: 'Bin not found' });
    }

    const current = currentResult.rows[0];
    const body = request.body as BinPayloadInput;
    const payload = normalizeBinBody({
      code: body.code ?? current.code,
      temperatureBand: body.temperatureBand ?? current.temperature_band,
      maxLoadLbs: body.maxLoadLbs ?? Number(current.max_load_lbs),
      maxLengthIn: body.maxLengthIn ?? Number(current.max_length_in),
      maxWidthIn: body.maxWidthIn ?? Number(current.max_width_in),
      maxHeightIn: body.maxHeightIn ?? Number(current.max_height_in),
      isActive: body.isActive ?? current.is_active,
      reason: body.reason ?? null
    });
    assertValidBinPayload(payload);

    const action = payload.isActive !== current.is_active
      ? (payload.isActive ? 'enabled' : 'disabled')
      : 'updated';

    const changedFields = {
      code: payload.code !== current.code ? payload.code : undefined,
      temperatureBand: payload.temperatureBand !== current.temperature_band ? payload.temperatureBand : undefined,
      maxLoadLbs: payload.maxLoadLbs !== Number(current.max_load_lbs) ? payload.maxLoadLbs : undefined,
      maxLengthIn: payload.maxLengthIn !== Number(current.max_length_in) ? payload.maxLengthIn : undefined,
      maxWidthIn: payload.maxWidthIn !== Number(current.max_width_in) ? payload.maxWidthIn : undefined,
      maxHeightIn: payload.maxHeightIn !== Number(current.max_height_in) ? payload.maxHeightIn : undefined,
      isActive: payload.isActive !== current.is_active ? payload.isActive : undefined
    };

    const client = await fastify.db.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `
          UPDATE bins
          SET code = $2,
              temperature_band = $3,
              max_load_lbs = $4,
              max_length_in = $5,
              max_width_in = $6,
              max_height_in = $7,
              is_active = $8,
              updated_at = NOW()
          WHERE id = $1
        `,
        [
          binId,
          payload.code,
          payload.temperatureBand,
          payload.maxLoadLbs,
          payload.maxLengthIn,
          payload.maxWidthIn,
          payload.maxHeightIn,
          payload.isActive
        ]
      );

      await client.query(
        `
          INSERT INTO bin_change_timeline (bin_id, changed_by, action, reason, details)
          VALUES ($1, $2, $3, $4, $5::jsonb)
        `,
        [binId, request.authUser!.id, action, payload.reason, JSON.stringify(changedFields)]
      );

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    request.auditContext = {
      actionType: action === 'enabled' ? 'bin_enable' : action === 'disabled' ? 'bin_disable' : 'bin_update',
      resourceType: 'bin',
      resourceId: binId,
      details: changedFields
    };

    return { success: true };
  });

  fastify.get('/warehouses/:warehouseId/tree', {
    preHandler: [fastify.authenticate, fastify.requirePermission('warehouses.read')],
    schema: {
      params: warehouseIdParamsSchema
    }
  }, async (request) => {
    const { warehouseId } = request.params as { warehouseId: string };
    await accessControl.ensureWarehouseAccess(request.authUser!, warehouseId, 'Warehouse tree is outside your assigned scope');
    const result = await fastify.db.query(
      `
        SELECT
          w.id AS warehouse_id,
          w.name AS warehouse_name,
          z.id AS zone_id,
          z.code AS zone_code,
          z.name AS zone_name,
          b.id AS bin_id,
          b.code AS bin_code,
          b.is_active,
          b.temperature_band,
          b.max_load_lbs,
          b.max_length_in,
          b.max_width_in,
          b.max_height_in
        FROM warehouses w
        LEFT JOIN zones z ON z.warehouse_id = w.id AND z.deleted_at IS NULL
        LEFT JOIN bins b ON b.zone_id = z.id AND b.deleted_at IS NULL
        WHERE w.id = $1
          AND w.deleted_at IS NULL
        ORDER BY z.code ASC, b.code ASC
      `,
      [warehouseId]
    );

    return result.rows;
  });

  fastify.post('/bins/:binId/toggle', {
    preHandler: [fastify.authenticate, fastify.requirePermission('bins.toggle')],
    schema: {
      params: binIdParamsSchema,
      body: binToggleBodySchema
    }
  }, async (request) => {
    const { binId } = request.params as { binId: string };
    const body = request.body as { isActive: boolean; reason?: string | null };
    await accessControl.ensureBinAccess(request.authUser!, binId, 'Bin is outside your assigned warehouse scope');

    const client = await fastify.db.connect();
    try {
      await client.query('BEGIN');
      await client.query(`UPDATE bins SET is_active = $2, updated_at = NOW() WHERE id = $1`, [binId, body.isActive]);
      await client.query(
        `
          INSERT INTO bin_change_timeline (bin_id, changed_by, action, reason, details)
          VALUES ($1, $2, $3, $4, $5::jsonb)
        `,
        [binId, request.authUser!.id, body.isActive ? 'enabled' : 'disabled', body.reason ?? null, JSON.stringify({ visibleInUi: true })]
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    request.auditContext = {
      actionType: body.isActive ? 'bin_enable' : 'bin_disable',
      resourceType: 'bin',
      resourceId: binId,
      details: { reason: body.reason ?? null }
    };

    return { success: true };
  });

  fastify.get('/bins/:binId/timeline', {
    preHandler: [fastify.authenticate, fastify.requirePermission('warehouses.read')],
    schema: {
      params: binIdParamsSchema
    }
  }, async (request) => {
    const { binId } = request.params as { binId: string };
    await accessControl.ensureBinAccess(request.authUser!, binId, 'Bin timeline is outside your assigned warehouse scope');
    const result = await fastify.db.query(
      `
        SELECT
          timeline.id,
          timeline.action,
          timeline.reason,
          timeline.details,
          timeline.created_at,
          users.display_name AS changed_by_name
        FROM bin_change_timeline timeline
        LEFT JOIN users ON users.id = timeline.changed_by
        WHERE timeline.bin_id = $1
        ORDER BY timeline.created_at DESC
      `,
      [binId]
    );

    return result.rows;
  });
};
