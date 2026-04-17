import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  createIntegrationHarness,
  createScopedPermissionUser,
  loginAsAdmin,
  loginAsUser,
  runIntegration
} from './helpers/integration.js';

const describeIfIntegration = runIntegration ? describe : describe.skip;

describeIfIntegration('warehouse write API integration', () => {
  const harness = createIntegrationHarness();

  it('GET /api/warehouses returns 200 with array of warehouses having id, code, name', async () => {
    const server = harness.server;
    const { token } = await loginAsAdmin(server);

    const response = await server.inject({
      method: 'GET',
      url: '/api/warehouses',
      headers: { authorization: `Bearer ${token}` }
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as Array<{ id: string; code: string; name: string }>;
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThan(0);
    for (const warehouse of body) {
      expect(warehouse).toHaveProperty('id');
      expect(warehouse).toHaveProperty('code');
      expect(warehouse).toHaveProperty('name');
    }
  });

  it('GET /api/warehouses returns 401 when unauthenticated', async () => {
    const server = harness.server;

    const response = await server.inject({
      method: 'GET',
      url: '/api/warehouses'
    });

    expect(response.statusCode).toBe(401);
  });

  it('POST /api/warehouses creates a warehouse and returns 201 with id', async () => {
    const server = harness.server;
    const { token } = await loginAsAdmin(server);
    const suffix = randomUUID().replace(/-/g, '').slice(0, 8);
    let warehouseId: string | null = null;

    const departmentResult = await server.db.query<{ id: string }>(
      `SELECT id FROM departments ORDER BY created_at ASC LIMIT 1`
    );
    const departmentId = departmentResult.rows[0].id;

    try {
      const response = await server.inject({
        method: 'POST',
        url: '/api/warehouses',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          departmentId,
          code: `WH-TEST-${suffix}`,
          name: `Test Warehouse ${suffix}`
        }
      });

      expect(response.statusCode).toBe(201);
      const body = response.json() as { id: string };
      expect(body).toHaveProperty('id');
      warehouseId = body.id;

      const dbResult = await server.db.query<{ id: string; code: string }>(
        `SELECT id, code FROM warehouses WHERE id = $1`,
        [warehouseId]
      );
      expect(dbResult.rowCount).toBe(1);
      expect(dbResult.rows[0].code).toBe(`WH-TEST-${suffix}`);
    } finally {
      if (warehouseId) {
        await server.db.query(`DELETE FROM warehouses WHERE id = $1`, [warehouseId]);
      }
    }
  });

  it('PATCH /api/warehouses/:warehouseId updates a warehouse and returns 200 with success', async () => {
    const server = harness.server;
    const { token } = await loginAsAdmin(server);
    const suffix = randomUUID().replace(/-/g, '').slice(0, 8);
    let warehouseId: string | null = null;

    const departmentResult = await server.db.query<{ id: string }>(
      `SELECT id FROM departments ORDER BY created_at ASC LIMIT 1`
    );
    const departmentId = departmentResult.rows[0].id;

    try {
      const createResponse = await server.inject({
        method: 'POST',
        url: '/api/warehouses',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          departmentId,
          code: `WH-PATCH-${suffix}`,
          name: `Patch Warehouse ${suffix}`
        }
      });

      expect(createResponse.statusCode).toBe(201);
      warehouseId = (createResponse.json() as { id: string }).id;

      const patchResponse = await server.inject({
        method: 'PATCH',
        url: `/api/warehouses/${warehouseId}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { name: 'Updated Name' }
      });

      expect(patchResponse.statusCode).toBe(200);
      expect(patchResponse.json()).toMatchObject({ success: true });

      const dbResult = await server.db.query<{ name: string }>(
        `SELECT name FROM warehouses WHERE id = $1`,
        [warehouseId]
      );
      expect(dbResult.rows[0].name).toBe('Updated Name');
    } finally {
      if (warehouseId) {
        await server.db.query(`DELETE FROM warehouses WHERE id = $1`, [warehouseId]);
      }
    }
  });

  it('PATCH /api/zones/:zoneId updates a zone name and returns 200', async () => {
    const server = harness.server;
    const { token } = await loginAsAdmin(server);

    const zoneResult = await server.db.query<{ id: string; name: string }>(
      `
        SELECT z.id, z.name
        FROM zones z
        JOIN warehouses w ON w.id = z.warehouse_id
        WHERE w.deleted_at IS NULL AND z.deleted_at IS NULL
        LIMIT 1
      `
    );
    expect(zoneResult.rowCount).toBeGreaterThan(0);
    const { id: zoneId, name: originalName } = zoneResult.rows[0];

    try {
      const patchResponse = await server.inject({
        method: 'PATCH',
        url: `/api/zones/${zoneId}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { name: 'Updated Zone Name' }
      });

      expect(patchResponse.statusCode).toBe(200);

      const dbResult = await server.db.query<{ name: string }>(
        `SELECT name FROM zones WHERE id = $1`,
        [zoneId]
      );
      expect(dbResult.rows[0].name).toBe('Updated Zone Name');
    } finally {
      await server.db.query(
        `UPDATE zones SET name = $2 WHERE id = $1`,
        [zoneId, originalName]
      );
    }
  });

  it('POST /api/zones/:zoneId/bins creates a bin and returns 201 with id', async () => {
    const server = harness.server;
    const { token } = await loginAsAdmin(server);
    const suffix = randomUUID().replace(/-/g, '').slice(0, 8);
    let binId: string | null = null;

    const zoneResult = await server.db.query<{ id: string }>(
      `
        SELECT z.id
        FROM zones z
        JOIN warehouses w ON w.id = z.warehouse_id
        WHERE w.deleted_at IS NULL AND z.deleted_at IS NULL
        LIMIT 1
      `
    );
    expect(zoneResult.rowCount).toBeGreaterThan(0);
    const zoneId = zoneResult.rows[0].id;

    try {
      const response = await server.inject({
        method: 'POST',
        url: `/api/zones/${zoneId}/bins`,
        headers: { authorization: `Bearer ${token}` },
        payload: {
          code: `BIN-TEST-${suffix}`,
          temperatureBand: 'ambient',
          maxLoadLbs: 500,
          maxLengthIn: 40,
          maxWidthIn: 40,
          maxHeightIn: 40
        }
      });

      expect(response.statusCode).toBe(201);
      const body = response.json() as { id: string };
      expect(body).toHaveProperty('id');
      binId = body.id;

      const dbResult = await server.db.query<{ id: string; code: string }>(
        `SELECT id, code FROM bins WHERE id = $1`,
        [binId]
      );
      expect(dbResult.rowCount).toBe(1);
      expect(dbResult.rows[0].code).toBe(`BIN-TEST-${suffix}`);
    } finally {
      if (binId) {
        await server.db.query(`DELETE FROM bin_change_timeline WHERE bin_id = $1`, [binId]);
        await server.db.query(`DELETE FROM bins WHERE id = $1`, [binId]);
      }
    }
  });

  it('PATCH /api/bins/:binId updates a bin and returns 200', async () => {
    const server = harness.server;
    const { token } = await loginAsAdmin(server);
    const suffix = randomUUID().replace(/-/g, '').slice(0, 8);
    let binId: string | null = null;

    const zoneResult = await server.db.query<{ id: string }>(
      `
        SELECT z.id
        FROM zones z
        JOIN warehouses w ON w.id = z.warehouse_id
        WHERE w.deleted_at IS NULL AND z.deleted_at IS NULL
        LIMIT 1
      `
    );
    expect(zoneResult.rowCount).toBeGreaterThan(0);
    const zoneId = zoneResult.rows[0].id;

    try {
      const createResponse = await server.inject({
        method: 'POST',
        url: `/api/zones/${zoneId}/bins`,
        headers: { authorization: `Bearer ${token}` },
        payload: {
          code: `BIN-PATCH-${suffix}`,
          temperatureBand: 'ambient',
          maxLoadLbs: 500,
          maxLengthIn: 40,
          maxWidthIn: 40,
          maxHeightIn: 40
        }
      });

      expect(createResponse.statusCode).toBe(201);
      binId = (createResponse.json() as { id: string }).id;

      const patchResponse = await server.inject({
        method: 'PATCH',
        url: `/api/bins/${binId}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { maxLoadLbs: 600 }
      });

      expect(patchResponse.statusCode).toBe(200);

      const dbResult = await server.db.query<{ max_load_lbs: string }>(
        `SELECT max_load_lbs::text FROM bins WHERE id = $1`,
        [binId]
      );
      expect(Number(dbResult.rows[0].max_load_lbs)).toBe(600);
    } finally {
      if (binId) {
        await server.db.query(`DELETE FROM bin_change_timeline WHERE bin_id = $1`, [binId]);
        await server.db.query(`DELETE FROM bins WHERE id = $1`, [binId]);
      }
    }
  });

  it('POST /api/bins/:binId/toggle toggles a bin to inactive and returns 200 with success', async () => {
    const server = harness.server;
    const { token } = await loginAsAdmin(server);
    const suffix = randomUUID().replace(/-/g, '').slice(0, 8);
    let binId: string | null = null;

    const zoneResult = await server.db.query<{ id: string }>(
      `
        SELECT z.id
        FROM zones z
        JOIN warehouses w ON w.id = z.warehouse_id
        WHERE w.deleted_at IS NULL AND z.deleted_at IS NULL
        LIMIT 1
      `
    );
    expect(zoneResult.rowCount).toBeGreaterThan(0);
    const zoneId = zoneResult.rows[0].id;

    try {
      const createResponse = await server.inject({
        method: 'POST',
        url: `/api/zones/${zoneId}/bins`,
        headers: { authorization: `Bearer ${token}` },
        payload: {
          code: `BIN-TOGGLE-${suffix}`,
          temperatureBand: 'ambient',
          maxLoadLbs: 500,
          maxLengthIn: 40,
          maxWidthIn: 40,
          maxHeightIn: 40
        }
      });

      expect(createResponse.statusCode).toBe(201);
      binId = (createResponse.json() as { id: string }).id;

      const toggleResponse = await server.inject({
        method: 'POST',
        url: `/api/bins/${binId}/toggle`,
        headers: { authorization: `Bearer ${token}` },
        payload: { isActive: false, reason: 'Test toggle' }
      });

      expect(toggleResponse.statusCode).toBe(200);
      expect(toggleResponse.json()).toMatchObject({ success: true });

      const dbResult = await server.db.query<{ is_active: boolean }>(
        `SELECT is_active FROM bins WHERE id = $1`,
        [binId]
      );
      expect(dbResult.rows[0].is_active).toBe(false);
    } finally {
      if (binId) {
        await server.db.query(`DELETE FROM bin_change_timeline WHERE bin_id = $1`, [binId]);
        await server.db.query(`DELETE FROM bins WHERE id = $1`, [binId]);
      }
    }
  });

  it('POST /api/warehouses returns 403 for user with only warehouses.read permission', async () => {
    const server = harness.server;
    const scopedUser = await createScopedPermissionUser(server, {
      permissionCodes: ['warehouses.read']
    });

    const departmentResult = await server.db.query<{ id: string }>(
      `SELECT id FROM departments ORDER BY created_at ASC LIMIT 1`
    );
    const departmentId = departmentResult.rows[0].id;
    const suffix = randomUUID().replace(/-/g, '').slice(0, 8);

    try {
      const { token } = await loginAsUser(server, scopedUser.username, scopedUser.password);

      const response = await server.inject({
        method: 'POST',
        url: '/api/warehouses',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          departmentId,
          code: `WH-DENY-${suffix}`,
          name: `Denied Warehouse ${suffix}`
        }
      });

      expect(response.statusCode).toBe(403);
    } finally {
      await scopedUser.cleanup();
    }
  });
});
