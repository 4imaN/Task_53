import { describe, expect, it } from 'vitest';
import { createIntegrationHarness, loginAsAdmin, runIntegration } from './helpers/integration.js';

const describeIfIntegration = runIntegration ? describe : describe.skip;

describeIfIntegration('inventory API integration', () => {
  const harness = createIntegrationHarness();

  it('returns 404 when scanning a barcode/lot/sku that does not exist', async () => {
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

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({
      statusCode: 404,
      message: 'No matching item or lot found'
    });
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
