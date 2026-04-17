import { describe, expect, it } from 'vitest';
import { createIntegrationHarness, createScopedPermissionUser, loginAsAdmin, loginAsUser, runIntegration } from './helpers/integration.js';

const describeIfIntegration = runIntegration ? describe : describe.skip;

describeIfIntegration('inventory pick API integration', () => {
  const harness = createIntegrationHarness();

  it('successfully picks inventory, decrements position and lot quantities, and records a transaction', async () => {
    const server = harness.server;
    const { token } = await loginAsAdmin(server);

    const positionResult = await server.db.query<{
      lot_id: string;
      bin_id: string;
      quantity: string;
    }>(
      `
        SELECT l.id AS lot_id, ip.bin_id, ip.quantity::text AS quantity
        FROM lots l
        JOIN inventory_positions ip ON ip.lot_id = l.id
        WHERE ip.quantity >= 2
        ORDER BY l.created_at ASC
        LIMIT 1
      `
    );

    if (!positionResult.rowCount) {
      throw new Error('No inventory position with quantity >= 2 found; seed data may be missing');
    }

    const lotId = positionResult.rows[0].lot_id;
    const binId = positionResult.rows[0].bin_id;
    const originalPositionQuantity = Number(positionResult.rows[0].quantity);

    const originalLotResult = await server.db.query<{ quantity_on_hand: string }>(
      `SELECT quantity_on_hand::text AS quantity_on_hand FROM lots WHERE id = $1`,
      [lotId]
    );
    const originalLotQuantity = Number(originalLotResult.rows[0].quantity_on_hand);

    let transactionCleanedUp = false;

    try {
      const pickResponse = await server.inject({
        method: 'POST',
        url: '/api/inventory/pick',
        headers: { authorization: `Bearer ${token}` },
        payload: { lotId, binId, quantity: 1 }
      });

      expect(pickResponse.statusCode).toBe(200);
      expect(pickResponse.json()).toEqual({ success: true });

      const positionAfter = await server.db.query<{ quantity: string }>(
        `SELECT quantity::text AS quantity FROM inventory_positions WHERE lot_id = $1 AND bin_id = $2`,
        [lotId, binId]
      );
      expect(Number(positionAfter.rows[0].quantity)).toBe(originalPositionQuantity - 1);

      const lotAfter = await server.db.query<{ quantity_on_hand: string }>(
        `SELECT quantity_on_hand::text AS quantity_on_hand FROM lots WHERE id = $1`,
        [lotId]
      );
      expect(Number(lotAfter.rows[0].quantity_on_hand)).toBe(originalLotQuantity - 1);
    } finally {
      // Restore inventory_positions quantity
      await server.db.query(
        `UPDATE inventory_positions SET quantity = $3 WHERE lot_id = $1 AND bin_id = $2`,
        [lotId, binId, originalPositionQuantity]
      );

      // Restore lots.quantity_on_hand
      await server.db.query(
        `UPDATE lots SET quantity_on_hand = quantity_on_hand + 1 WHERE id = $1`,
        [lotId]
      );

      // Delete the pick transaction
      await server.db.query(
        `
          DELETE FROM inventory_transactions WHERE id IN (
            SELECT id FROM inventory_transactions
            WHERE lot_id = $1 AND source_bin_id = $2 AND transaction_type = 'pick' AND quantity = 1
            ORDER BY created_at DESC LIMIT 1
          )
        `,
        [lotId, binId]
      );
      transactionCleanedUp = true;
    }

    expect(transactionCleanedUp).toBe(true);
  });

  it('returns 403 when the user lacks inventory.pick permission', async () => {
    const server = harness.server;

    const scopedUser = await createScopedPermissionUser(server, {
      permissionCodes: ['inventory.scan']
    });

    try {
      const { token } = await loginAsUser(server, scopedUser.username, scopedUser.password);

      // Find any lot and bin to attempt the pick (the 403 should fire before any DB write)
      const positionResult = await server.db.query<{ lot_id: string; bin_id: string }>(
        `
          SELECT l.id AS lot_id, ip.bin_id
          FROM lots l
          JOIN inventory_positions ip ON ip.lot_id = l.id
          WHERE ip.quantity >= 1
          ORDER BY l.created_at ASC
          LIMIT 1
        `
      );

      const { lot_id: lotId, bin_id: binId } = positionResult.rows[0];

      const response = await server.inject({
        method: 'POST',
        url: '/api/inventory/pick',
        headers: { authorization: `Bearer ${token}` },
        payload: { lotId, binId, quantity: 1 }
      });

      expect(response.statusCode).toBe(403);
    } finally {
      await scopedUser.cleanup();
    }
  });
});
