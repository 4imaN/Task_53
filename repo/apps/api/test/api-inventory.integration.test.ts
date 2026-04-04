import { describe, expect, it } from 'vitest';
import { createIntegrationHarness, createScopedPermissionUser, loginAsAdmin, loginAsUser, runIntegration } from './helpers/integration.js';

const describeIfIntegration = runIntegration ? describe : describe.skip;
const canonicalTemperatureBands = ['ambient', 'chilled', 'frozen'] as const;

const createSinglePositionMultiBarcodeFixture = async (
  server: ReturnType<typeof createIntegrationHarness>['server'],
  suffix: string
) => {
  const scopeResult = await server.db.query<{
    warehouse_id: string;
    department_id: string;
    zone_id: string;
  }>(
    `
      SELECT w.id AS warehouse_id, w.department_id::text AS department_id, z.id AS zone_id
      FROM warehouses w
      JOIN zones z ON z.warehouse_id = w.id AND z.deleted_at IS NULL
      WHERE w.deleted_at IS NULL
      ORDER BY w.created_at ASC, z.created_at ASC
      LIMIT 1
    `
  );
  const scope = scopeResult.rows[0];
  const sku = `SKU-SCAN-SINGLE-${suffix}`;
  const barcodeA = `A-SCAN-SINGLE-${suffix}`;
  const barcodeB = `Z-SCAN-SINGLE-${suffix}`;
  const lotCode = `LOT-SCAN-SINGLE-${suffix}`;
  const binCode = `SCAN-SINGLE-${suffix}`;

  const itemResult = await server.db.query<{ id: string }>(
    `
      INSERT INTO items (department_id, sku, name, description, unit_of_measure, temperature_band, weight_lbs, length_in, width_in, height_in)
      VALUES ($1, $2, $3, $4, 'ea', 'ambient', 1, 12, 10, 8)
      RETURNING id
    `,
    [scope.department_id, sku, `Scan Single ${suffix}`, 'Scan single-position fixture']
  );
  const itemId = itemResult.rows[0].id;

  await server.db.query(
    `
      INSERT INTO barcodes (item_id, barcode)
      VALUES ($1, $2), ($1, $3)
    `,
    [itemId, barcodeA, barcodeB]
  );

  const binResult = await server.db.query<{ id: string }>(
    `
      INSERT INTO bins (zone_id, code, temperature_band, max_load_lbs, max_length_in, max_width_in, max_height_in, is_active)
      VALUES ($1, $2, 'ambient', 500, 40, 40, 40, TRUE)
      RETURNING id
    `,
    [scope.zone_id, binCode]
  );
  const binId = binResult.rows[0].id;

  const lotResult = await server.db.query<{ id: string }>(
    `
      INSERT INTO lots (item_id, warehouse_id, lot_code, quantity_on_hand, received_at)
      VALUES ($1, $2, $3, 5, NOW())
      RETURNING id
    `,
    [itemId, scope.warehouse_id, lotCode]
  );
  const lotId = lotResult.rows[0].id;

  await server.db.query(
    `
      INSERT INTO inventory_positions (lot_id, bin_id, quantity)
      VALUES ($1, $2, 5)
    `,
    [lotId, binId]
  );

  return {
    itemId,
    lotId,
    binId,
    sku,
    lotCode,
    barcodeA,
    barcodeB
  };
};

describeIfIntegration('inventory API integration', () => {
  const harness = createIntegrationHarness();

  it('returns an explicit no_match result when scanning a barcode/lot/sku that does not exist', async () => {
    const server = harness.server;
    const { token } = await loginAsAdmin(server);
    const missingCode = `IT-NOT-FOUND-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

    const response = await server.inject({
      method: 'POST',
      url: '/api/inventory/scan',
      headers: {
        authorization: `Bearer ${token}`
      },
      payload: {
        code: missingCode
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      kind: 'no_match',
      code: missingCode,
      message: 'No matching item or lot found'
    });
  });

  it('returns an item-only scan result for a barcode tied to an item without any visible lots', async () => {
    const server = harness.server;
    const { token } = await loginAsAdmin(server);
    const suffix = Date.now().toString().slice(-8);
    const warehouseResult = await server.db.query<{ department_id: string }>(
      `SELECT department_id::text AS department_id FROM warehouses WHERE deleted_at IS NULL ORDER BY created_at ASC LIMIT 1`
    );
    const departmentId = warehouseResult.rows[0].department_id;
    const barcode = `IT-SCAN-ITEM-ONLY-${suffix}`;
    const sku = `SKU-SCAN-ITEM-ONLY-${suffix}`;

    const itemResult = await server.db.query<{ id: string }>(
      `
        INSERT INTO items (department_id, sku, name, description, unit_of_measure, temperature_band, weight_lbs, length_in, width_in, height_in)
        VALUES ($1, $2, $3, $4, 'ea', 'ambient', 1, 12, 10, 8)
        RETURNING id
      `,
      [departmentId, sku, `Scan Item Only ${suffix}`, 'First receipt via scan']
    );
    const itemId = itemResult.rows[0].id;
    await server.db.query(`INSERT INTO barcodes (item_id, barcode) VALUES ($1, $2)`, [itemId, barcode]);

    try {
      const response = await server.inject({
        method: 'POST',
        url: '/api/inventory/scan',
        headers: {
          authorization: `Bearer ${token}`
        },
        payload: {
          code: barcode
        }
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        kind: 'item_only',
        item: {
          item_id: itemId,
          sku,
          barcode
        }
      });
      expect((response.json() as { receiving_warehouses?: Array<{ warehouse_id: string }> }).receiving_warehouses?.length).toBeGreaterThan(0);
    } finally {
      await server.db.query(`DELETE FROM barcodes WHERE item_id = $1`, [itemId]);
      await server.db.query(`DELETE FROM items WHERE id = $1`, [itemId]);
    }
  });

  it('returns an explicit multi-match result instead of choosing an arbitrary visible lot position', async () => {
    const server = harness.server;
    const { token } = await loginAsAdmin(server);
    const suffix = Date.now().toString().slice(-8);
    const scopeResult = await server.db.query<{
      warehouse_id: string;
      department_id: string;
      zone_id: string;
    }>(
      `
        SELECT w.id AS warehouse_id, w.department_id::text AS department_id, z.id AS zone_id
        FROM warehouses w
        JOIN zones z ON z.warehouse_id = w.id AND z.deleted_at IS NULL
        WHERE w.deleted_at IS NULL
        ORDER BY w.created_at ASC, z.created_at ASC
        LIMIT 1
      `
    );
    const scope = scopeResult.rows[0];
    const sku = `SKU-SCAN-MULTI-${suffix}`;
    const barcode = `BC-SCAN-MULTI-${suffix}`;
    const lotCodes = [`LOT-A-${suffix}`, `LOT-B-${suffix}`];

    const itemResult = await server.db.query<{ id: string }>(
      `
        INSERT INTO items (department_id, sku, name, description, unit_of_measure, temperature_band, weight_lbs, length_in, width_in, height_in)
        VALUES ($1, $2, $3, $4, 'ea', 'ambient', 1, 12, 10, 8)
        RETURNING id
      `,
      [scope.department_id, sku, `Scan Multi ${suffix}`, 'Scan multi-match fixture']
    );
    const itemId = itemResult.rows[0].id;
    await server.db.query(`INSERT INTO barcodes (item_id, barcode) VALUES ($1, $2)`, [itemId, barcode]);

    const binResult = await server.db.query<{ id: string; code: string }>(
      `
        INSERT INTO bins (zone_id, code, temperature_band, max_load_lbs, max_length_in, max_width_in, max_height_in, is_active)
        VALUES
          ($1, $2, 'ambient', 500, 40, 40, 40, TRUE),
          ($1, $3, 'ambient', 500, 40, 40, 40, TRUE)
        RETURNING id, code
      `,
      [scope.zone_id, `SCAN-A-${suffix}`, `SCAN-B-${suffix}`]
    );
    const [binA, binB] = binResult.rows;

    const lotResult = await server.db.query<{ id: string; lot_code: string }>(
      `
        INSERT INTO lots (item_id, warehouse_id, lot_code, quantity_on_hand, received_at)
        VALUES
          ($1, $2, $3, 2, NOW()),
          ($1, $2, $4, 3, NOW())
        RETURNING id, lot_code
      `,
      [itemId, scope.warehouse_id, lotCodes[0], lotCodes[1]]
    );
    const [lotA, lotB] = lotResult.rows;

    await server.db.query(
      `
        INSERT INTO inventory_positions (lot_id, bin_id, quantity)
        VALUES ($1, $2, 2), ($3, $4, 3)
      `,
      [lotA.id, binA.id, lotB.id, binB.id]
    );

    try {
      const response = await server.inject({
        method: 'POST',
        url: '/api/inventory/scan',
        headers: {
          authorization: `Bearer ${token}`
        },
        payload: {
          code: barcode
        }
      });

      expect(response.statusCode).toBe(200);
      const body = response.json() as {
        kind: string;
        matches: Array<{ lot_code: string; bin_code: string }>;
      };
      expect(body.kind).toBe('multiple_positions');
      expect(body.matches).toHaveLength(2);
      expect(body.matches.map((match) => match.lot_code)).toEqual([...lotCodes].sort());
      expect(body.matches.map((match) => match.bin_code)).toEqual(['SCAN-A-' + suffix, 'SCAN-B-' + suffix]);
    } finally {
      await server.db.query(`DELETE FROM inventory_positions WHERE lot_id = ANY($1::uuid[])`, [[lotA.id, lotB.id]]);
      await server.db.query(`DELETE FROM lots WHERE id = ANY($1::uuid[])`, [[lotA.id, lotB.id]]);
      await server.db.query(`DELETE FROM bins WHERE id = ANY($1::uuid[])`, [[binA.id, binB.id]]);
      await server.db.query(`DELETE FROM barcodes WHERE item_id = $1`, [itemId]);
      await server.db.query(`DELETE FROM items WHERE id = $1`, [itemId]);
    }
  });

  it('returns single_position for lot-code scans when one logical position exists even with multiple item barcodes', async () => {
    const server = harness.server;
    const { token } = await loginAsAdmin(server);
    const suffix = Date.now().toString().slice(-8);
    const fixture = await createSinglePositionMultiBarcodeFixture(server, `${suffix}-lot`);

    try {
      const response = await server.inject({
        method: 'POST',
        url: '/api/inventory/scan',
        headers: {
          authorization: `Bearer ${token}`
        },
        payload: {
          code: fixture.lotCode
        }
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        kind: 'single_position',
        match: {
          item_id: fixture.itemId,
          lot_id: fixture.lotId,
          bin_id: fixture.binId,
          sku: fixture.sku,
          lot_code: fixture.lotCode,
          barcode: fixture.barcodeA
        }
      });
    } finally {
      await server.db.query(`DELETE FROM inventory_positions WHERE lot_id = $1`, [fixture.lotId]);
      await server.db.query(`DELETE FROM lots WHERE id = $1`, [fixture.lotId]);
      await server.db.query(`DELETE FROM bins WHERE id = $1`, [fixture.binId]);
      await server.db.query(`DELETE FROM barcodes WHERE item_id = $1`, [fixture.itemId]);
      await server.db.query(`DELETE FROM items WHERE id = $1`, [fixture.itemId]);
    }
  });

  it('returns single_position for sku scans without false multiple_positions from barcode row multiplication', async () => {
    const server = harness.server;
    const { token } = await loginAsAdmin(server);
    const suffix = Date.now().toString().slice(-8);
    const fixture = await createSinglePositionMultiBarcodeFixture(server, `${suffix}-sku`);

    try {
      const response = await server.inject({
        method: 'POST',
        url: '/api/inventory/scan',
        headers: {
          authorization: `Bearer ${token}`
        },
        payload: {
          code: fixture.sku
        }
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        kind: 'single_position',
        match: {
          item_id: fixture.itemId,
          lot_id: fixture.lotId,
          bin_id: fixture.binId,
          sku: fixture.sku,
          lot_code: fixture.lotCode,
          barcode: fixture.barcodeA
        }
      });
      expect((response.json() as { kind: string }).kind).not.toBe('multiple_positions');
    } finally {
      await server.db.query(`DELETE FROM inventory_positions WHERE lot_id = $1`, [fixture.lotId]);
      await server.db.query(`DELETE FROM lots WHERE id = $1`, [fixture.lotId]);
      await server.db.query(`DELETE FROM bins WHERE id = $1`, [fixture.binId]);
      await server.db.query(`DELETE FROM barcodes WHERE item_id = $1`, [fixture.itemId]);
      await server.db.query(`DELETE FROM items WHERE id = $1`, [fixture.itemId]);
    }
  });

  it('allows scan lookup with inventory.scan without requiring inventory.receive', async () => {
    const server = harness.server;
    const seedResult = await server.db.query<{
      warehouse_code: string;
      warehouse_id: string;
      barcode: string | null;
      lot_code: string | null;
      sku: string;
    }>(
      `
        SELECT
          w.code AS warehouse_code,
          w.id AS warehouse_id,
          b.barcode,
          l.lot_code,
          i.sku
        FROM lots l
        JOIN items i ON i.id = l.item_id
        JOIN inventory_positions ip ON ip.lot_id = l.id
        JOIN warehouses w ON w.id = l.warehouse_id
        LEFT JOIN barcodes b ON b.item_id = i.id
        WHERE i.deleted_at IS NULL
        GROUP BY w.code, w.id, b.barcode, l.lot_code, i.sku
        HAVING COUNT(*) = 1
        ORDER BY MIN(l.created_at) ASC
        LIMIT 1
      `
    );
    const seed = seedResult.rows[0];
    const scopedUser = await createScopedPermissionUser(server, {
      permissionCodes: ['inventory.scan'],
      warehouseCodes: [seed.warehouse_code]
    });

    try {
      const { token } = await loginAsUser(server, scopedUser.username, scopedUser.password);
      const response = await server.inject({
        method: 'POST',
        url: '/api/inventory/scan',
        headers: {
          authorization: `Bearer ${token}`
        },
        payload: {
          code: seed.lot_code ?? seed.barcode ?? seed.sku
        }
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        kind: 'single_position',
        match: {
          warehouse_id: seed.warehouse_id
        }
      });
    } finally {
      await scopedUser.cleanup();
    }
  });

  it('receives quantity into a bin and records the resulting lot', async () => {
    const server = harness.server;
    const { token } = await loginAsAdmin(server);
    const seedResult = await server.db.query<{
      item_id: string;
      warehouse_id: string;
      bin_id: string;
    }>(
      `
        SELECT i.id AS item_id, w.id AS warehouse_id, b.id AS bin_id
        FROM items i
        JOIN lots l ON l.item_id = i.id
        JOIN warehouses w ON w.id = l.warehouse_id
        JOIN zones z ON z.warehouse_id = w.id
        JOIN bins b ON b.zone_id = z.id
        LEFT JOIN (
          SELECT ip2.bin_id, COALESCE(SUM(ip2.quantity * item2.weight_lbs), 0) AS current_load_lbs
          FROM inventory_positions ip2
          JOIN lots l2 ON l2.id = ip2.lot_id
          JOIN items item2 ON item2.id = l2.item_id
          GROUP BY ip2.bin_id
        ) load ON load.bin_id = b.id
        WHERE b.is_active = TRUE
          AND b.temperature_band = i.temperature_band
          AND b.max_length_in >= i.length_in
          AND b.max_width_in >= i.width_in
          AND b.max_height_in >= i.height_in
          AND COALESCE(load.current_load_lbs, 0) + i.weight_lbs <= b.max_load_lbs
        ORDER BY i.created_at ASC
        LIMIT 1
      `
    );

    const seed = seedResult.rows[0];
    const lotCode = `IT-RECV-${Date.now().toString().slice(-6)}`;

    const receiveResponse = await server.inject({
      method: 'POST',
      url: '/api/inventory/receive',
      headers: {
        authorization: `Bearer ${token}`
      },
      payload: {
        itemId: seed.item_id,
        warehouseId: seed.warehouse_id,
        binId: seed.bin_id,
        lotCode,
        quantity: 1
      }
    });

    expect(receiveResponse.statusCode).toBe(200);
    const body = receiveResponse.json() as { success: boolean; lotId: string };
    expect(body.success).toBe(true);

    const lotResult = await server.db.query<{ quantity_on_hand: string }>(
      `SELECT quantity_on_hand FROM lots WHERE id = $1`,
      [body.lotId]
    );
    expect(Number(lotResult.rows[0].quantity_on_hand)).toBe(1);

    const positionResult = await server.db.query<{ quantity: string }>(
      `SELECT quantity FROM inventory_positions WHERE lot_id = $1 AND bin_id = $2`,
      [body.lotId, seed.bin_id]
    );
    expect(Number(positionResult.rows[0].quantity)).toBe(1);

    await server.db.query(`DELETE FROM inventory_transactions WHERE lot_id = $1`, [body.lotId]);
    await server.db.query(`DELETE FROM inventory_positions WHERE lot_id = $1`, [body.lotId]);
    await server.db.query(`DELETE FROM lots WHERE id = $1`, [body.lotId]);
  });

  it('returns 422 when receiving inventory into a bin with mismatched temperature band', async () => {
    const server = harness.server;
    const { token } = await loginAsAdmin(server);
    const seedResult = await server.db.query<{
      item_id: string;
      warehouse_id: string;
      bin_id: string;
    }>(
      `
        SELECT
          i.id AS item_id,
          w.id AS warehouse_id,
          b.id AS bin_id
        FROM items i
        JOIN lots l ON l.item_id = i.id
        JOIN warehouses w ON w.id = l.warehouse_id
        JOIN zones z ON z.warehouse_id = w.id
        JOIN bins b ON b.zone_id = z.id
        WHERE b.is_active = TRUE
          AND b.temperature_band <> i.temperature_band
        ORDER BY i.created_at ASC
        LIMIT 1
      `
    );

    expect(seedResult.rowCount).toBeGreaterThan(0);
    const seed = seedResult.rows[0];

    const receiveResponse = await server.inject({
      method: 'POST',
      url: '/api/inventory/receive',
      headers: {
        authorization: `Bearer ${token}`
      },
      payload: {
        itemId: seed.item_id,
        warehouseId: seed.warehouse_id,
        binId: seed.bin_id,
        lotCode: `IT-TEMP-${Date.now().toString().slice(-6)}`,
        quantity: 1
      }
    });

    expect(receiveResponse.statusCode).toBe(422);
    expect(receiveResponse.json()).toMatchObject({
      statusCode: 422,
      message: 'Temperature band mismatch'
    });
  });

  it('accepts matching canonical temperatures and rejects mismatches across ambient/chilled/frozen', async () => {
    const server = harness.server;
    const { token } = await loginAsAdmin(server);
    const warehouseResult = await server.db.query<{ id: string; department_id: string }>(
      `SELECT id, department_id::text AS department_id FROM warehouses WHERE deleted_at IS NULL ORDER BY created_at ASC LIMIT 1`
    );
    expect(warehouseResult.rowCount).toBe(1);
    const warehouse = warehouseResult.rows[0];
    const suffix = Date.now().toString().slice(-7);
    let zoneId = '';
    const binIds: string[] = [];
    const itemIds: string[] = [];
    const lotIds: string[] = [];

    try {
      const zoneResult = await server.db.query<{ id: string }>(
        `
          INSERT INTO zones (warehouse_id, code, name)
          VALUES ($1, $2, $3)
          RETURNING id
        `,
        [warehouse.id, `TMP-TEMP-${suffix}`, `Temp Zone ${suffix}`]
      );
      zoneId = zoneResult.rows[0].id;

      const binByBand = {} as Record<(typeof canonicalTemperatureBands)[number], string>;
      for (const [index, band] of canonicalTemperatureBands.entries()) {
        const binResult = await server.db.query<{ id: string }>(
          `
            INSERT INTO bins (zone_id, code, temperature_band, max_load_lbs, max_length_in, max_width_in, max_height_in, is_active)
            VALUES ($1, $2, $3, 1000, 40, 40, 40, TRUE)
            RETURNING id
          `,
          [zoneId, `TMP-${band.toUpperCase()}-${index}-${suffix}`, band]
        );
        const binId = binResult.rows[0].id;
        binIds.push(binId);
        binByBand[band] = binId;
      }

      for (const [index, band] of canonicalTemperatureBands.entries()) {
        const itemResult = await server.db.query<{ id: string }>(
          `
            INSERT INTO items (department_id, sku, name, description, unit_of_measure, temperature_band, weight_lbs, length_in, width_in, height_in)
            VALUES ($1, $2, $3, $4, 'each', $5, 1, 1, 1, 1)
            RETURNING id
          `,
          [
            warehouse.department_id,
            `TMP-TEMP-SKU-${band.toUpperCase()}-${suffix}-${index}`,
            `Temp ${band}`,
            `Compatibility test ${band}`,
            band
          ]
        );
        const itemId = itemResult.rows[0].id;
        itemIds.push(itemId);

        const receiveResponse = await server.inject({
          method: 'POST',
          url: '/api/inventory/receive',
          headers: {
            authorization: `Bearer ${token}`
          },
          payload: {
            itemId,
            warehouseId: warehouse.id,
            binId: binByBand[band],
            lotCode: `TMP-MATCH-${band}-${suffix}-${index}`,
            quantity: 1
          }
        });
        expect(receiveResponse.statusCode).toBe(200);
        const receiveBody = receiveResponse.json() as { lotId: string };
        lotIds.push(receiveBody.lotId);

        const mismatchBand = canonicalTemperatureBands.find((candidate) => candidate !== band)!;
        const mismatchResponse = await server.inject({
          method: 'POST',
          url: '/api/inventory/receive',
          headers: {
            authorization: `Bearer ${token}`
          },
          payload: {
            itemId,
            warehouseId: warehouse.id,
            binId: binByBand[mismatchBand],
            lotCode: `TMP-MISMATCH-${band}-${suffix}-${index}`,
            quantity: 1
          }
        });
        expect(mismatchResponse.statusCode).toBe(422);
        expect(mismatchResponse.json()).toMatchObject({
          statusCode: 422,
          message: 'Temperature band mismatch'
        });
      }
    } finally {
      if (lotIds.length) {
        await server.db.query(`DELETE FROM inventory_transactions WHERE lot_id = ANY($1::uuid[])`, [lotIds]);
        await server.db.query(`DELETE FROM inventory_positions WHERE lot_id = ANY($1::uuid[])`, [lotIds]);
        await server.db.query(`DELETE FROM lots WHERE id = ANY($1::uuid[])`, [lotIds]);
      }
      if (itemIds.length) {
        await server.db.query(`DELETE FROM items WHERE id = ANY($1::uuid[])`, [itemIds]);
      }
      if (binIds.length) {
        await server.db.query(`DELETE FROM bin_change_timeline WHERE bin_id = ANY($1::uuid[])`, [binIds]);
        await server.db.query(`DELETE FROM bins WHERE id = ANY($1::uuid[])`, [binIds]);
      }
      if (zoneId) {
        await server.db.query(`DELETE FROM zones WHERE id = $1`, [zoneId]);
      }
    }
  });

  it('returns 422 when moving inventory into a bin with mismatched temperature band', async () => {
    const server = harness.server;
    const { token } = await loginAsAdmin(server);
    const seedResult = await server.db.query<{
      lot_id: string;
      source_bin_id: string;
      target_bin_id: string;
    }>(
      `
        SELECT
          l.id AS lot_id,
          src.bin_id AS source_bin_id,
          target.id AS target_bin_id
        FROM lots l
        JOIN items i ON i.id = l.item_id
        JOIN inventory_positions src ON src.lot_id = l.id
        JOIN bins source_bin ON source_bin.id = src.bin_id
        JOIN zones source_zone ON source_zone.id = source_bin.zone_id
        JOIN bins target ON target.id <> source_bin.id
        JOIN zones target_zone ON target_zone.id = target.zone_id
        WHERE src.quantity >= 1
          AND source_zone.warehouse_id = l.warehouse_id
          AND target_zone.warehouse_id = l.warehouse_id
          AND target.is_active = TRUE
          AND target.temperature_band <> i.temperature_band
        ORDER BY l.created_at ASC
        LIMIT 1
      `
    );

    expect(seedResult.rowCount).toBeGreaterThan(0);
    const seed = seedResult.rows[0];

    const moveResponse = await server.inject({
      method: 'POST',
      url: '/api/inventory/move',
      headers: {
        authorization: `Bearer ${token}`
      },
      payload: {
        lotId: seed.lot_id,
        sourceBinId: seed.source_bin_id,
        targetBinId: seed.target_bin_id,
        quantity: 1
      }
    });

    expect(moveResponse.statusCode).toBe(422);
    expect(moveResponse.json()).toMatchObject({
      statusCode: 422,
      message: 'Temperature band mismatch'
    });
  });

  it('moves inventory between bins without server errors', async () => {
    const server = harness.server;
    const { token } = await loginAsAdmin(server);
    const seedResult = await server.db.query<{
      lot_id: string;
      source_bin_id: string;
      target_bin_id: string;
      source_quantity: string;
      target_quantity: string | null;
    }>(
      `
        SELECT
          l.id AS lot_id,
          src.bin_id AS source_bin_id,
          target.id AS target_bin_id,
          src.quantity AS source_quantity,
          target_pos.quantity AS target_quantity
        FROM lots l
        JOIN items i ON i.id = l.item_id
        JOIN inventory_positions src ON src.lot_id = l.id
        JOIN bins source_bin ON source_bin.id = src.bin_id
        JOIN zones source_zone ON source_zone.id = source_bin.zone_id
        JOIN bins target ON target.id <> source_bin.id
        JOIN zones target_zone ON target_zone.id = target.zone_id
        LEFT JOIN inventory_positions target_pos ON target_pos.lot_id = l.id AND target_pos.bin_id = target.id
        LEFT JOIN (
          SELECT ip.bin_id, COALESCE(SUM(ip.quantity * item.weight_lbs), 0) AS current_load_lbs
          FROM inventory_positions ip
          JOIN lots lot ON lot.id = ip.lot_id
          JOIN items item ON item.id = lot.item_id
          GROUP BY ip.bin_id
        ) load ON load.bin_id = target.id
        WHERE src.quantity >= 1
          AND source_zone.warehouse_id = l.warehouse_id
          AND target_zone.warehouse_id = l.warehouse_id
          AND target.is_active = TRUE
          AND target.temperature_band = i.temperature_band
          AND target.max_length_in >= i.length_in
          AND target.max_width_in >= i.width_in
          AND target.max_height_in >= i.height_in
          AND COALESCE(load.current_load_lbs, 0) + i.weight_lbs <= target.max_load_lbs
        ORDER BY l.created_at ASC
        LIMIT 1
      `
    );

    expect(seedResult.rowCount).toBeGreaterThan(0);
    const seed = seedResult.rows[0];
    const moveQuantity = 1;
    const sourceBefore = Number(seed.source_quantity);
    const targetBefore = seed.target_quantity === null ? null : Number(seed.target_quantity);

    try {
      const moveResponse = await server.inject({
        method: 'POST',
        url: '/api/inventory/move',
        headers: {
          authorization: `Bearer ${token}`
        },
        payload: {
          lotId: seed.lot_id,
          sourceBinId: seed.source_bin_id,
          targetBinId: seed.target_bin_id,
          quantity: moveQuantity
        }
      });

      expect(moveResponse.statusCode).toBe(200);
      expect(moveResponse.json()).toMatchObject({ success: true });

      const sourceAfterResult = await server.db.query<{ quantity: string }>(
        `SELECT quantity FROM inventory_positions WHERE lot_id = $1 AND bin_id = $2`,
        [seed.lot_id, seed.source_bin_id]
      );
      const targetAfterResult = await server.db.query<{ quantity: string }>(
        `SELECT quantity FROM inventory_positions WHERE lot_id = $1 AND bin_id = $2`,
        [seed.lot_id, seed.target_bin_id]
      );

      expect(Number(sourceAfterResult.rows[0].quantity)).toBe(sourceBefore - moveQuantity);
      expect(Number(targetAfterResult.rows[0].quantity)).toBe((targetBefore ?? 0) + moveQuantity);
    } finally {
      await server.db.query(
        `UPDATE inventory_positions SET quantity = $3 WHERE lot_id = $1 AND bin_id = $2`,
        [seed.lot_id, seed.source_bin_id, sourceBefore]
      );

      if (targetBefore === null) {
        await server.db.query(
          `DELETE FROM inventory_positions WHERE lot_id = $1 AND bin_id = $2`,
          [seed.lot_id, seed.target_bin_id]
        );
      } else {
        await server.db.query(
          `UPDATE inventory_positions SET quantity = $3 WHERE lot_id = $1 AND bin_id = $2`,
          [seed.lot_id, seed.target_bin_id, targetBefore]
        );
      }

      await server.db.query(
        `
          DELETE FROM inventory_transactions
          WHERE id IN (
            SELECT id
            FROM inventory_transactions
            WHERE lot_id = $1
              AND source_bin_id = $2
              AND target_bin_id = $3
              AND transaction_type = 'move'
              AND quantity = $4
            ORDER BY created_at DESC
            LIMIT 1
          )
        `,
        [seed.lot_id, seed.source_bin_id, seed.target_bin_id, moveQuantity]
      );
    }
  });

  it('rejects non-positive quantities across receive, move, and pick flows', async () => {
    const server = harness.server;
    const { token } = await loginAsAdmin(server);
    const seedResult = await server.db.query<{
      item_id: string;
      warehouse_id: string;
      lot_id: string;
      source_bin_id: string;
      target_bin_id: string;
    }>(
      `
        SELECT
          i.id AS item_id,
          l.warehouse_id,
          l.id AS lot_id,
          src.bin_id AS source_bin_id,
          target.id AS target_bin_id
        FROM items i
        JOIN lots l ON l.item_id = i.id
        JOIN inventory_positions src ON src.lot_id = l.id
        JOIN bins source_bin ON source_bin.id = src.bin_id
        JOIN zones source_zone ON source_zone.id = source_bin.zone_id
        JOIN bins target ON target.id <> source_bin.id
        JOIN zones target_zone ON target_zone.id = target.zone_id
        WHERE src.quantity > 1
          AND target.is_active = TRUE
          AND source_zone.warehouse_id = l.warehouse_id
          AND target_zone.warehouse_id = l.warehouse_id
          AND target.temperature_band = i.temperature_band
          AND target.max_length_in >= i.length_in
          AND target.max_width_in >= i.width_in
          AND target.max_height_in >= i.height_in
        ORDER BY l.created_at ASC
        LIMIT 1
      `
    );

    const seed = seedResult.rows[0];

    const receiveResponse = await server.inject({
      method: 'POST',
      url: '/api/inventory/receive',
      headers: {
        authorization: `Bearer ${token}`
      },
      payload: {
        itemId: seed.item_id,
        warehouseId: seed.warehouse_id,
        binId: seed.source_bin_id,
        lotCode: `IT-BAD-${Date.now().toString().slice(-6)}`,
        quantity: 0
      }
    });
    expect(receiveResponse.statusCode).toBe(422);

    const moveResponse = await server.inject({
      method: 'POST',
      url: '/api/inventory/move',
      headers: {
        authorization: `Bearer ${token}`
      },
      payload: {
        lotId: seed.lot_id,
        sourceBinId: seed.source_bin_id,
        targetBinId: seed.target_bin_id,
        quantity: -1
      }
    });
    expect(moveResponse.statusCode).toBe(422);

    const pickResponse = await server.inject({
      method: 'POST',
      url: '/api/inventory/pick',
      headers: {
        authorization: `Bearer ${token}`
      },
      payload: {
        lotId: seed.lot_id,
        binId: seed.source_bin_id,
        quantity: 0
      }
    });
    expect(pickResponse.statusCode).toBe(422);
  });
});
