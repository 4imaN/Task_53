import { describe, expect, it } from 'vitest';
import { createIntegrationHarness, loginAsAdmin, runIntegration } from './helpers/integration.js';

const describeIfIntegration = runIntegration ? describe : describe.skip;

describeIfIntegration('search API integration', () => {
  const harness = createIntegrationHarness();

  it('does not duplicate or misattribute document rows across documents in the same warehouse', async () => {
    const server = harness.server;
    const { token } = await loginAsAdmin(server);
    const suffix = Date.now().toString();

    const warehouseResult = await server.db.query<{ id: string }>(
      `
        INSERT INTO warehouses (department_id, code, name, address)
        SELECT id, $1, $2, 'Search Validation Yard'
        FROM departments
        WHERE code = 'district-ops'
        RETURNING id
      `,
      [`WH-SRCH-${suffix}`, `Search Validation ${suffix}`]
    );
    const warehouseId = warehouseResult.rows[0].id;

    const itemAResult = await server.db.query<{ id: string }>(
      `
        INSERT INTO items (department_id, sku, name, description, unit_of_measure, temperature_band)
        SELECT id, $1, $2, 'Search validation item A', 'each', 'ambient'
        FROM departments
        WHERE code = 'district-ops'
        RETURNING id
      `,
      [`SRCH-A-${suffix}`, `Search Target ${suffix}`]
    );
    const itemAId = itemAResult.rows[0].id;

    const itemBResult = await server.db.query<{ id: string }>(
      `
        INSERT INTO items (department_id, sku, name, description, unit_of_measure, temperature_band)
        SELECT id, $1, $2, 'Search validation item B', 'each', 'ambient'
        FROM departments
        WHERE code = 'district-ops'
        RETURNING id
      `,
      [`SRCH-B-${suffix}`, `Search Distractor ${suffix}`]
    );
    const itemBId = itemBResult.rows[0].id;

    await server.db.query(`INSERT INTO barcodes (item_id, barcode) VALUES ($1, $2), ($3, $4)`, [
      itemAId,
      `BAR-A-${suffix}`,
      itemBId,
      `BAR-B-${suffix}`
    ]);

    const lotResult = await server.db.query<{ a_lot_id: string; b_lot_id: string }>(
      `
        WITH lot_a AS (
          INSERT INTO lots (item_id, warehouse_id, lot_code, quantity_on_hand, received_at)
          VALUES ($1, $2, $3, 5, NOW())
          RETURNING id
        ),
        lot_b AS (
          INSERT INTO lots (item_id, warehouse_id, lot_code, quantity_on_hand, received_at)
          VALUES ($4, $2, $5, 3, NOW())
          RETURNING id
        )
        SELECT (SELECT id FROM lot_a) AS a_lot_id, (SELECT id FROM lot_b) AS b_lot_id
      `,
      [itemAId, warehouseId, `LOT-A-${suffix}`, itemBId, `LOT-B-${suffix}`]
    );

    const itemALotId = lotResult.rows[0].a_lot_id;
    const itemBLotId = lotResult.rows[0].b_lot_id;

    const documentResult = await server.db.query<{ completed_id: string; draft_id: string }>(
      `
        WITH completed_doc AS (
          INSERT INTO documents (warehouse_id, document_number, type, status, payload)
          VALUES ($1, $2, 'receiving', 'completed', '{}'::jsonb)
          RETURNING id
        ),
        draft_doc AS (
          INSERT INTO documents (warehouse_id, document_number, type, status, payload)
          VALUES ($1, $3, 'receiving', 'draft', '{}'::jsonb)
          RETURNING id
        )
        SELECT
          (SELECT id FROM completed_doc) AS completed_id,
          (SELECT id FROM draft_doc) AS draft_id
      `,
      [warehouseId, `DOC-C-${suffix}`, `DOC-D-${suffix}`]
    );

    await server.db.query(
      `
        INSERT INTO inventory_transactions (warehouse_id, item_id, lot_id, document_id, transaction_type, quantity)
        VALUES
          ($1, $2, $3, $4, 'receive', 5),
          ($1, $5, $6, $7, 'receive', 3)
      `,
      [warehouseId, itemAId, itemALotId, documentResult.rows[0].completed_id, itemBId, itemBLotId, documentResult.rows[0].draft_id]
    );

    const completedSearch = await server.inject({
      method: 'GET',
      url: `/api/search?item=${encodeURIComponent(`Search Target ${suffix}`)}&documentStatus=completed`,
      headers: { authorization: `Bearer ${token}` }
    });

    expect(completedSearch.statusCode).toBe(200);
    const completedBody = completedSearch.json() as {
      total: number;
      results: Array<{ item_id: string; document_status: string }>;
    };

    expect(completedBody.total).toBe(1);
    expect(completedBody.results).toHaveLength(1);
    expect(completedBody.results[0].item_id).toBe(itemAId);
    expect(completedBody.results[0].document_status).toBe('completed');

    const draftSearch = await server.inject({
      method: 'GET',
      url: `/api/search?item=${encodeURIComponent(`Search Target ${suffix}`)}&documentStatus=draft`,
      headers: { authorization: `Bearer ${token}` }
    });

    expect(draftSearch.statusCode).toBe(200);
    const draftBody = draftSearch.json() as {
      total: number;
      results: Array<{ item_id: string; document_status: string }>;
    };

    expect(draftBody.total).toBe(0);
    expect(draftBody.results).toHaveLength(0);

    await server.db.query(`DELETE FROM inventory_transactions WHERE warehouse_id = $1`, [warehouseId]);
    await server.db.query(`DELETE FROM documents WHERE warehouse_id = $1`, [warehouseId]);
    await server.db.query(`DELETE FROM barcodes WHERE item_id = ANY($1::uuid[])`, [[itemAId, itemBId]]);
    await server.db.query(`DELETE FROM lots WHERE warehouse_id = $1`, [warehouseId]);
    await server.db.query(`DELETE FROM items WHERE id = ANY($1::uuid[])`, [[itemAId, itemBId]]);
    await server.db.query(`DELETE FROM warehouses WHERE id = $1`, [warehouseId]);
  });
});
