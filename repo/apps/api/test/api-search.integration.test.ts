import { describe, expect, it } from 'vitest';
import { createIntegrationHarness, createScopedPermissionUser, loginAsAdmin, loginAsUser, runIntegration } from './helpers/integration.js';

const describeIfIntegration = runIntegration ? describe : describe.skip;

const getDepartmentId = async (
  server: ReturnType<typeof createIntegrationHarness>['server'],
  departmentCode: string
) => {
  const result = await server.db.query<{ id: string }>(
    `SELECT id FROM departments WHERE code = $1`,
    [departmentCode]
  );

  return result.rows[0].id;
};

const getWarehouseId = async (
  server: ReturnType<typeof createIntegrationHarness>['server'],
  warehouseCode: string
) => {
  const result = await server.db.query<{ id: string }>(
    `SELECT id FROM warehouses WHERE code = $1`,
    [warehouseCode]
  );

  return result.rows[0].id;
};

const createSearchItem = async (
  server: ReturnType<typeof createIntegrationHarness>['server'],
  input: { departmentCode: string; sku: string; name: string }
) => {
  const departmentId = await getDepartmentId(server, input.departmentCode);
  const result = await server.db.query<{ id: string }>(
    `
      INSERT INTO items (department_id, sku, name, description, unit_of_measure, temperature_band)
      VALUES ($1, $2, $3, 'Search scope coverage fixture', 'each', 'ambient')
      RETURNING id
    `,
    [departmentId, input.sku, input.name]
  );

  return result.rows[0].id;
};

const createLot = async (
  server: ReturnType<typeof createIntegrationHarness>['server'],
  input: { itemId: string; warehouseCode: string; lotCode: string; quantityOnHand?: number }
) => {
  const warehouseId = await getWarehouseId(server, input.warehouseCode);
  const result = await server.db.query<{ id: string }>(
    `
      INSERT INTO lots (item_id, warehouse_id, lot_code, quantity_on_hand, received_at)
      VALUES ($1, $2, $3, $4, NOW())
      RETURNING id
    `,
    [input.itemId, warehouseId, input.lotCode, input.quantityOnHand ?? 10]
  );

  return {
    lotId: result.rows[0].id,
    warehouseId
  };
};

const createBarcode = async (
  server: ReturnType<typeof createIntegrationHarness>['server'],
  input: { itemId: string; barcode: string }
) => {
  await server.db.query(
    `
      INSERT INTO barcodes (item_id, barcode)
      VALUES ($1, $2)
    `,
    [input.itemId, input.barcode]
  );
};

const createDocumentTransaction = async (
  server: ReturnType<typeof createIntegrationHarness>['server'],
  input: {
    warehouseId: string;
    itemId: string;
    lotId: string;
    documentNumber: string;
    status: 'draft' | 'submitted' | 'approved' | 'in_progress' | 'completed' | 'cancelled' | 'archived';
    timestamp: string;
  }
) => {
  const documentResult = await server.db.query<{ id: string }>(
    `
      INSERT INTO documents (warehouse_id, document_number, type, status, payload, created_at, updated_at)
      VALUES ($1, $2, 'receiving', $3, '{}'::jsonb, $4, $4)
      RETURNING id
    `,
    [input.warehouseId, input.documentNumber, input.status, input.timestamp]
  );

  await server.db.query(
    `
      INSERT INTO inventory_transactions (warehouse_id, item_id, lot_id, document_id, transaction_type, quantity, created_at)
      VALUES ($1, $2, $3, $4, 'receive', 1, $5)
    `,
    [input.warehouseId, input.itemId, input.lotId, documentResult.rows[0].id, input.timestamp]
  );

  return documentResult.rows[0].id;
};

describeIfIntegration('search API integration', () => {
  const harness = createIntegrationHarness();

  it('gives moderator and catalog users department-scoped search visibility without requiring warehouse assignments', async () => {
    const server = harness.server;
    const suffix = Date.now().toString().slice(-6);
    const districtSku = `SEARCH-DISTRICT-${suffix}`;
    const southSku = `SEARCH-SOUTH-${suffix}`;
    const sharedTerm = `Scoped Department Search ${suffix}`;
    const districtItemId = await createSearchItem(server, {
      departmentCode: 'district-ops',
      sku: districtSku,
      name: `${sharedTerm} District`
    });
    const southItemId = await createSearchItem(server, {
      departmentCode: 'south-middle',
      sku: southSku,
      name: `${sharedTerm} South`
    });

    try {
      const [{ token: moderatorToken }, { token: catalogToken }] = await Promise.all([
        loginAsUser(server, 'moderator.demo', 'ModeratorDemo!123'),
        loginAsUser(server, 'catalog.demo', 'CatalogDemo!123')
      ]);

      for (const token of [moderatorToken, catalogToken]) {
        const response = await server.inject({
          method: 'GET',
          url: `/api/search?item=${encodeURIComponent(sharedTerm)}`,
          headers: {
            authorization: `Bearer ${token}`
          }
        });

        expect(response.statusCode).toBe(200);
        const body = response.json() as {
          total: number;
          results: Array<{ sku: string; item_name: string; warehouse_id: string | null }>;
        };

        expect(body.total).toBe(1);
        expect(body.results).toHaveLength(1);
        expect(body.results[0].sku).toBe(districtSku);
        expect(body.results[0].item_name).toContain('District');
        expect(body.results[0].warehouse_id).toBeNull();
        expect(body.results.some((row) => row.sku === southSku)).toBe(false);
      }
    } finally {
      await server.db.query(`DELETE FROM items WHERE id = ANY($1::uuid[])`, [[districtItemId, southItemId]]);
    }
  });

  it('keeps warehouse clerks constrained to assigned warehouses in search results', async () => {
    const server = harness.server;
    const suffix = Date.now().toString().slice(-6);
    const itemSku = `SEARCH-WAREHOUSE-${suffix}`;
    const itemName = `Scoped Warehouse Search ${suffix}`;
    const itemId = await createSearchItem(server, {
      departmentCode: 'district-ops',
      sku: itemSku,
      name: itemName
    });

    try {
      await createLot(server, {
        itemId,
        warehouseCode: 'WH-01',
        lotCode: `LOT-WH01-${suffix}`,
        quantityOnHand: 4
      });
      await createLot(server, {
        itemId,
        warehouseCode: 'WH-02',
        lotCode: `LOT-WH02-${suffix}`,
        quantityOnHand: 9
      });

      const { token } = await loginAsUser(server, 'clerk.demo', 'ClerkDemo!123');
      const response = await server.inject({
        method: 'GET',
        url: `/api/search?item=${encodeURIComponent(itemName)}`,
        headers: {
          authorization: `Bearer ${token}`
        }
      });

      expect(response.statusCode).toBe(200);
      const body = response.json() as {
        total: number;
        results: Array<{ sku: string; warehouse_name: string; lot_code: string }>;
      };

      expect(body.total).toBe(1);
      expect(body.results).toHaveLength(1);
      expect(body.results[0].sku).toBe(itemSku);
      expect(body.results[0].warehouse_name).toBe('Central District Warehouse');
      expect(body.results[0].lot_code).toBe(`LOT-WH01-${suffix}`);
      expect(body.results.some((row) => row.warehouse_name === 'East District Overflow Warehouse')).toBe(false);
    } finally {
      await server.db.query(`DELETE FROM lots WHERE item_id = $1`, [itemId]);
      await server.db.query(`DELETE FROM items WHERE id = $1`, [itemId]);
    }
  });

  it('deduplicates logical result rows and keeps totals exact when an item has multiple barcodes and lots', async () => {
    const server = harness.server;
    const { token } = await loginAsAdmin(server);
    const suffix = Date.now().toString().slice(-6);
    const sku = `SEARCH-DEDUP-${suffix}`;
    const itemName = `Search Dedup ${suffix}`;
    const itemId = await createSearchItem(server, {
      departmentCode: 'district-ops',
      sku,
      name: itemName
    });
    const barcodeA = `A${suffix}000001`;
    const barcodeZ = `Z${suffix}000002`;
    const lotOneCode = `LOT-A-${suffix}`;
    const lotTwoCode = `LOT-B-${suffix}`;

    try {
      await createBarcode(server, { itemId, barcode: barcodeZ });
      await createBarcode(server, { itemId, barcode: barcodeA });
      await createLot(server, {
        itemId,
        warehouseCode: 'WH-01',
        lotCode: lotOneCode,
        quantityOnHand: 4
      });
      await createLot(server, {
        itemId,
        warehouseCode: 'WH-02',
        lotCode: lotTwoCode,
        quantityOnHand: 9
      });

      const byNameResponse = await server.inject({
        method: 'GET',
        url: `/api/search?item=${encodeURIComponent(itemName)}&sortBy=lot&sortDir=asc`,
        headers: {
          authorization: `Bearer ${token}`
        }
      });

      expect(byNameResponse.statusCode).toBe(200);
      const byNameBody = byNameResponse.json() as {
        total: number;
        totalPages: number;
        results: Array<{ sku: string; lot_code: string; warehouse_name: string; barcode: string }>;
      };
      expect(byNameBody.total).toBe(2);
      expect(byNameBody.totalPages).toBe(1);
      expect(byNameBody.results).toHaveLength(2);
      expect(byNameBody.results.map((row) => `${row.lot_code}:${row.warehouse_name}`)).toEqual([
        `${lotOneCode}:Central District Warehouse`,
        `${lotTwoCode}:East District Overflow Warehouse`
      ]);
      expect(byNameBody.results.every((row) => row.sku === sku)).toBe(true);
      expect(byNameBody.results.every((row) => row.barcode === barcodeA)).toBe(true);

      const byBarcodeResponse = await server.inject({
        method: 'GET',
        url: `/api/search?item=${encodeURIComponent(barcodeZ)}&sortBy=lot&sortDir=asc`,
        headers: {
          authorization: `Bearer ${token}`
        }
      });

      expect(byBarcodeResponse.statusCode).toBe(200);
      const byBarcodeBody = byBarcodeResponse.json() as {
        total: number;
        results: Array<{ lot_code: string }>;
      };
      expect(byBarcodeBody.total).toBe(2);
      expect(byBarcodeBody.results.map((row) => row.lot_code)).toEqual([lotOneCode, lotTwoCode]);
    } finally {
      await server.db.query(`DELETE FROM lots WHERE item_id = $1`, [itemId]);
      await server.db.query(`DELETE FROM barcodes WHERE item_id = $1`, [itemId]);
      await server.db.query(`DELETE FROM items WHERE id = $1`, [itemId]);
    }
  });

  it('returns stable page boundaries and sort order for real search rows', async () => {
    const server = harness.server;
    const { token } = await loginAsAdmin(server);
    const suffix = Date.now().toString().slice(-6);
    const createdItemIds: string[] = [];

    try {
      for (const [index, label] of ['Alpha', 'Bravo', 'Charlie'].entries()) {
        const itemId = await createSearchItem(server, {
          departmentCode: 'district-ops',
          sku: `SEARCH-PAGE-${label.toUpperCase()}-${suffix}`,
          name: `Search Page ${label} ${suffix}`
        });
        createdItemIds.push(itemId);
        await createBarcode(server, {
          itemId,
          barcode: `P${suffix}${index.toString().padStart(5, '0')}`
        });
        await createLot(server, {
          itemId,
          warehouseCode: 'WH-01',
          lotCode: `PAGE-${label.toUpperCase()}-${suffix}`,
          quantityOnHand: index + 1
        });
      }

      const pageOneResponse = await server.inject({
        method: 'GET',
        url: `/api/search?item=${encodeURIComponent(suffix)}&sortBy=itemName&sortDir=asc&page=1&pageSize=2`,
        headers: {
          authorization: `Bearer ${token}`
        }
      });

      expect(pageOneResponse.statusCode).toBe(200);
      const pageOneBody = pageOneResponse.json() as {
        total: number;
        totalPages: number;
        page: number;
        pageSize: number;
        results: Array<{ item_name: string }>;
      };
      expect(pageOneBody.total).toBe(3);
      expect(pageOneBody.totalPages).toBe(2);
      expect(pageOneBody.page).toBe(1);
      expect(pageOneBody.pageSize).toBe(2);
      expect(pageOneBody.results.map((row) => row.item_name)).toEqual([
        `Search Page Alpha ${suffix}`,
        `Search Page Bravo ${suffix}`
      ]);

      const pageTwoResponse = await server.inject({
        method: 'GET',
        url: `/api/search?item=${encodeURIComponent(suffix)}&sortBy=itemName&sortDir=asc&page=2&pageSize=2`,
        headers: {
          authorization: `Bearer ${token}`
        }
      });

      expect(pageTwoResponse.statusCode).toBe(200);
      const pageTwoBody = pageTwoResponse.json() as {
        total: number;
        results: Array<{ item_name: string }>;
      };
      expect(pageTwoBody.total).toBe(3);
      expect(pageTwoBody.results.map((row) => row.item_name)).toEqual([
        `Search Page Charlie ${suffix}`
      ]);

      const descendingResponse = await server.inject({
        method: 'GET',
        url: `/api/search?item=${encodeURIComponent(suffix)}&sortBy=itemName&sortDir=desc&page=1&pageSize=3`,
        headers: {
          authorization: `Bearer ${token}`
        }
      });

      expect(descendingResponse.statusCode).toBe(200);
      const descendingBody = descendingResponse.json() as {
        results: Array<{ item_name: string }>;
      };
      expect(descendingBody.results.map((row) => row.item_name)).toEqual([
        `Search Page Charlie ${suffix}`,
        `Search Page Bravo ${suffix}`,
        `Search Page Alpha ${suffix}`
      ]);
    } finally {
      if (createdItemIds.length) {
        await server.db.query(`DELETE FROM lots WHERE item_id = ANY($1::uuid[])`, [createdItemIds]);
        await server.db.query(`DELETE FROM barcodes WHERE item_id = ANY($1::uuid[])`, [createdItemIds]);
        await server.db.query(`DELETE FROM items WHERE id = ANY($1::uuid[])`, [createdItemIds]);
      }
    }
  });

  it('applies document and date filters with exact row counts against the logical search rows', async () => {
    const server = harness.server;
    const { token } = await loginAsAdmin(server);
    const suffix = Date.now().toString().slice(-6);
    const createdItemIds: string[] = [];
    const createdDocumentIds: string[] = [];

    try {
      const fixtures = [
        {
          label: 'February',
          sku: `SEARCH-DOC-FEB-${suffix}`,
          timestamp: '2026-02-10T09:00:00.000Z',
          status: 'completed' as const
        },
        {
          label: 'March',
          sku: `SEARCH-DOC-MAR-${suffix}`,
          timestamp: '2026-03-05T10:30:00.000Z',
          status: 'completed' as const
        },
        {
          label: 'Draft',
          sku: `SEARCH-DOC-DRAFT-${suffix}`,
          timestamp: '2026-03-15T08:15:00.000Z',
          status: 'draft' as const
        }
      ];

      for (const fixture of fixtures) {
        const itemId = await createSearchItem(server, {
          departmentCode: 'district-ops',
          sku: fixture.sku,
          name: `Search Document ${fixture.label} ${suffix}`
        });
        createdItemIds.push(itemId);
        await createBarcode(server, {
          itemId,
          barcode: `D${suffix}${createdItemIds.length.toString().padStart(5, '0')}`
        });
        const lot = await createLot(server, {
          itemId,
          warehouseCode: 'WH-01',
          lotCode: `DOC-${fixture.label.toUpperCase()}-${suffix}`,
          quantityOnHand: 2
        });
        createdDocumentIds.push(await createDocumentTransaction(server, {
          warehouseId: lot.warehouseId,
          itemId,
          lotId: lot.lotId,
          documentNumber: `DOC-${fixture.label.toUpperCase()}-${suffix}`,
          status: fixture.status,
          timestamp: fixture.timestamp
        }));
      }

      const completedResponse = await server.inject({
        method: 'GET',
        url: `/api/search?item=${encodeURIComponent(suffix)}&documentStatus=completed&sortBy=updatedAt&sortDir=asc`,
        headers: {
          authorization: `Bearer ${token}`
        }
      });

      expect(completedResponse.statusCode).toBe(200);
      const completedBody = completedResponse.json() as {
        total: number;
        results: Array<{ sku: string }>;
      };
      expect(completedBody.total).toBe(2);
      expect(completedBody.results.map((row) => row.sku)).toEqual([
        `SEARCH-DOC-FEB-${suffix}`,
        `SEARCH-DOC-MAR-${suffix}`
      ]);

      const filteredResponse = await server.inject({
        method: 'GET',
        url: `/api/search?item=${encodeURIComponent(suffix)}&documentStatus=completed&dateFrom=2026-03-01&dateTo=2026-03-31&sortBy=updatedAt&sortDir=asc`,
        headers: {
          authorization: `Bearer ${token}`
        }
      });

      expect(filteredResponse.statusCode).toBe(200);
      const filteredBody = filteredResponse.json() as {
        total: number;
        totalPages: number;
        results: Array<{ sku: string; document_status: string }>;
      };
      expect(filteredBody.total).toBe(1);
      expect(filteredBody.totalPages).toBe(1);
      expect(filteredBody.results).toEqual([
        expect.objectContaining({
          sku: `SEARCH-DOC-MAR-${suffix}`,
          document_status: 'completed'
        })
      ]);
    } finally {
      if (createdItemIds.length) {
        await server.db.query(`DELETE FROM inventory_transactions WHERE item_id = ANY($1::uuid[])`, [createdItemIds]);
        await server.db.query(`DELETE FROM documents WHERE id = ANY($1::uuid[])`, [createdDocumentIds]);
        await server.db.query(`DELETE FROM lots WHERE item_id = ANY($1::uuid[])`, [createdItemIds]);
        await server.db.query(`DELETE FROM barcodes WHERE item_id = ANY($1::uuid[])`, [createdItemIds]);
        await server.db.query(`DELETE FROM items WHERE id = ANY($1::uuid[])`, [createdItemIds]);
      }
    }
  });

  it('allows creating saved views up to the configured cap', async () => {
    const server = harness.server;
    const scopedUser = await createScopedPermissionUser(server, {
      permissionCodes: ['saved_views.manage']
    });

    try {
      await server.db.query(
        `
          INSERT INTO saved_views (user_id, view_name, filters)
          SELECT $1, 'view-' || gs::text, '{}'::jsonb
          FROM generate_series(1, 49) AS gs
        `,
        [scopedUser.userId]
      );
      const { token } = await loginAsUser(server, scopedUser.username, scopedUser.password);

      const response = await server.inject({
        method: 'POST',
        url: '/api/search/views',
        headers: {
          authorization: `Bearer ${token}`
        },
        payload: {
          viewName: 'view-50',
          filters: { item: 'paper towels', pageSize: 10 }
        }
      });

      expect(response.statusCode).toBe(201);
      expect(response.json()).toMatchObject({
        view_name: 'view-50',
        filters: { item: 'paper towels', pageSize: 10 }
      });

      const countResult = await server.db.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM saved_views WHERE user_id = $1`,
        [scopedUser.userId]
      );
      expect(Number(countResult.rows[0].count)).toBe(50);
    } finally {
      await scopedUser.cleanup();
    }
  });

  it('returns a typed conflict instead of a generic 500 when the saved-view cap is exceeded', async () => {
    const server = harness.server;
    const scopedUser = await createScopedPermissionUser(server, {
      permissionCodes: ['saved_views.manage']
    });

    try {
      await server.db.query(
        `
          INSERT INTO saved_views (user_id, view_name, filters)
          SELECT $1, 'view-' || gs::text, '{}'::jsonb
          FROM generate_series(1, 50) AS gs
        `,
        [scopedUser.userId]
      );
      const { token } = await loginAsUser(server, scopedUser.username, scopedUser.password);

      const response = await server.inject({
        method: 'POST',
        url: '/api/search/views',
        headers: {
          authorization: `Bearer ${token}`
        },
        payload: {
          viewName: 'view-51',
          filters: { item: 'overflow attempt' }
        }
      });

      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({
        statusCode: 409,
        error: 'Conflict',
        message: 'Saved view limit reached. Update an existing view or delete one before creating another.'
      });
      expect(response.body).not.toContain('Internal server error');
    } finally {
      await scopedUser.cleanup();
    }
  });

  it('allows updating an existing saved view even when the user is already at the cap', async () => {
    const server = harness.server;
    const scopedUser = await createScopedPermissionUser(server, {
      permissionCodes: ['saved_views.manage']
    });

    try {
      await server.db.query(
        `
          INSERT INTO saved_views (user_id, view_name, filters)
          SELECT $1, 'view-' || gs::text, '{}'::jsonb
          FROM generate_series(1, 49) AS gs
        `,
        [scopedUser.userId]
      );
      await server.db.query(
        `
          INSERT INTO saved_views (user_id, view_name, filters)
          VALUES ($1, 'ops-focus', '{"item":"before"}'::jsonb)
        `,
        [scopedUser.userId]
      );
      const { token } = await loginAsUser(server, scopedUser.username, scopedUser.password);

      const response = await server.inject({
        method: 'POST',
        url: '/api/search/views',
        headers: {
          authorization: `Bearer ${token}`
        },
        payload: {
          viewName: 'ops-focus',
          filters: { item: 'after', sortBy: 'updatedAt', sortDir: 'asc' }
        }
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        view_name: 'ops-focus',
        filters: { item: 'after', sortBy: 'updatedAt', sortDir: 'asc' }
      });

      const countResult = await server.db.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM saved_views WHERE user_id = $1`,
        [scopedUser.userId]
      );
      expect(Number(countResult.rows[0].count)).toBe(50);
    } finally {
      await scopedUser.cleanup();
    }
  });
});
