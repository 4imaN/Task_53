import { describe, expect, it } from 'vitest';
import { createIntegrationHarness, loginAsAdmin, runIntegration } from './helpers/integration.js';

const describeIfIntegration = runIntegration ? describe : describe.skip;

describeIfIntegration('request validation integration', () => {
  const harness = createIntegrationHarness();

  it('returns deterministic 4xx responses for invalid UUID params', async () => {
    const server = harness.server;
    const { token } = await loginAsAdmin(server);

    const responses = await Promise.all([
      server.inject({
        method: 'GET',
        url: '/api/documents/not-a-uuid',
        headers: { authorization: `Bearer ${token}` }
      }),
      server.inject({
        method: 'GET',
        url: '/api/warehouses/not-a-uuid/tree',
        headers: { authorization: `Bearer ${token}` }
      }),
      server.inject({
        method: 'GET',
        url: '/api/bins/not-a-uuid/timeline',
        headers: { authorization: `Bearer ${token}` }
      }),
      server.inject({
        method: 'POST',
        url: '/api/users/not-a-uuid/unlock',
        headers: { authorization: `Bearer ${token}` }
      })
    ]);

    for (const response of responses) {
      expect(response.statusCode).toBe(422);
      expect(response.json()).toMatchObject({
        statusCode: 422,
        error: 'Unprocessable Entity',
        message: 'Validation failed'
      });
      expect(response.body).not.toContain('invalid input syntax for type uuid');
    }
  });

  it('returns 404 for well-formed nonexistent warehouse resources instead of misleading success or downstream failures', async () => {
    const server = harness.server;
    const { token } = await loginAsAdmin(server);
    const warehouseId = '11111111-1111-1111-1111-111111111111';

    const [treeResponse, zoneCreateResponse] = await Promise.all([
      server.inject({
        method: 'GET',
        url: `/api/warehouses/${warehouseId}/tree`,
        headers: { authorization: `Bearer ${token}` }
      }),
      server.inject({
        method: 'POST',
        url: `/api/warehouses/${warehouseId}/zones`,
        headers: { authorization: `Bearer ${token}` },
        payload: {
          code: 'ZONE-404',
          name: 'Missing Warehouse Zone'
        }
      })
    ]);

    for (const response of [treeResponse, zoneCreateResponse]) {
      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({
        statusCode: 404,
        message: 'Warehouse not found'
      });
      expect(response.body).not.toContain('invalid input syntax');
      expect(response.body).not.toContain('violates foreign key');
    }
  });

  it('returns deterministic 4xx responses for invalid pagination queries', async () => {
    const server = harness.server;
    const { token } = await loginAsAdmin(server);

    const badSearch = await server.inject({
      method: 'GET',
      url: '/api/search?page=0&pageSize=500',
      headers: { authorization: `Bearer ${token}` }
    });

    expect(badSearch.statusCode).toBe(422);
    expect(badSearch.json()).toMatchObject({
      statusCode: 422,
      error: 'Unprocessable Entity',
      message: 'Validation failed'
    });

    const badAuditLimit = await server.inject({
      method: 'GET',
      url: '/api/audit-log?limit=0',
      headers: { authorization: `Bearer ${token}` }
    });

    expect(badAuditLimit.statusCode).toBe(422);
    expect(badAuditLimit.json()).toMatchObject({
      statusCode: 422,
      error: 'Unprocessable Entity',
      message: 'Validation failed'
    });
  });

  it('returns deterministic 4xx responses for invalid enums and malformed bodies', async () => {
    const server = harness.server;
    const { token } = await loginAsAdmin(server);
    const documentId = '11111111-1111-1111-1111-111111111111';

    const invalidTransition = await server.inject({
      method: 'POST',
      url: `/api/documents/${documentId}/transition`,
      headers: { authorization: `Bearer ${token}` },
      payload: { toStatus: 'done' }
    });

    expect(invalidTransition.statusCode).toBe(422);
    expect(invalidTransition.json()).toMatchObject({
      statusCode: 422,
      error: 'Unprocessable Entity',
      message: 'Validation failed'
    });

    const malformedUserCreate = await server.inject({
      method: 'POST',
      url: '/api/users',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        username: 'bad-user',
        displayName: 'Bad User',
        password: 'ValidPassword!123',
        warehouseIds: 'not-an-array'
      }
    });

    expect(malformedUserCreate.statusCode).toBe(422);
    expect(malformedUserCreate.json()).toMatchObject({
      statusCode: 422,
      error: 'Unprocessable Entity',
      message: 'Validation failed'
    });
    expect(malformedUserCreate.body).not.toContain('TypeError');
    expect(malformedUserCreate.body).not.toContain('invalid input syntax');
  });

  it('returns deterministic 4xx responses for malformed warehouse, zone, and bin writes', async () => {
    const server = harness.server;
    const { token } = await loginAsAdmin(server);
    const scopeResult = await server.db.query<{
      warehouse_id: string;
      zone_id: string;
      bin_id: string;
    }>(
      `
        SELECT w.id AS warehouse_id, z.id AS zone_id, b.id AS bin_id
        FROM warehouses w
        JOIN zones z ON z.warehouse_id = w.id AND z.deleted_at IS NULL
        JOIN bins b ON b.zone_id = z.id AND b.deleted_at IS NULL
        WHERE w.deleted_at IS NULL
        ORDER BY w.created_at ASC, z.created_at ASC, b.created_at ASC
        LIMIT 1
      `
    );
    const scope = scopeResult.rows[0];

    const responses = await Promise.all([
      server.inject({
        method: 'POST',
        url: '/api/warehouses',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          departmentId: 'not-a-uuid',
          code: '',
          name: '   '
        }
      }),
      server.inject({
        method: 'PATCH',
        url: `/api/warehouses/${scope.warehouse_id}`,
        headers: { authorization: `Bearer ${token}` },
        payload: {
          code: '   ',
          isActive: 'yes'
        }
      }),
      server.inject({
        method: 'POST',
        url: `/api/warehouses/${scope.warehouse_id}/zones`,
        headers: { authorization: `Bearer ${token}` },
        payload: { code: { value: 'bad' }, name: '' }
      }),
      server.inject({
        method: 'PATCH',
        url: `/api/zones/${scope.zone_id}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { name: '   ' }
      }),
      server.inject({
        method: 'PATCH',
        url: `/api/bins/${scope.bin_id}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { maxLoadLbs: 0, code: '' }
      }),
      server.inject({
        method: 'POST',
        url: `/api/bins/${scope.bin_id}/toggle`,
        headers: { authorization: `Bearer ${token}` },
        payload: { isActive: { value: true }, reason: ['bad'] }
      }),
      server.inject({
        method: 'POST',
        url: '/api/warehouses/not-a-uuid/zones',
        headers: { authorization: `Bearer ${token}` },
        payload: { code: 'ZONE-NEW', name: 'Zone New' }
      }),
      server.inject({
        method: 'PATCH',
        url: '/api/zones/not-a-uuid',
        headers: { authorization: `Bearer ${token}` },
        payload: { name: 'Valid Name' }
      }),
      server.inject({
        method: 'POST',
        url: '/api/bins/not-a-uuid/toggle',
        headers: { authorization: `Bearer ${token}` },
        payload: { isActive: true }
      })
    ]);

    for (const response of responses) {
      expect(response.statusCode).toBe(422);
      expect(response.json()).toMatchObject({
        statusCode: 422,
        error: 'Unprocessable Entity',
        message: 'Validation failed'
      });
      expect(response.body).not.toContain('TypeError');
      expect(response.body).not.toContain('invalid input syntax');
    }
  });
});
