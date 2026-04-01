import { describe, expect, it } from 'vitest';
import { createIntegrationHarness, loginAsAdmin, runIntegration } from './helpers/integration.js';

const describeIfIntegration = runIntegration ? describe : describe.skip;

describeIfIntegration('documents API integration', () => {
  const harness = createIntegrationHarness();

  it('creates a document, returns detail, and records workflow transitions', async () => {
    const server = harness.server;
    const { token } = await loginAsAdmin(server);
    const warehouseResult = await server.db.query<{ id: string; item_id: string; bin_id: string }>(
      `
        SELECT
          w.id,
          i.id AS item_id,
          b.id AS bin_id
        FROM warehouses w
        JOIN items i ON i.department_id = w.department_id
        JOIN zones z ON z.warehouse_id = w.id
        JOIN bins b ON b.zone_id = z.id
        WHERE w.deleted_at IS NULL
          AND i.deleted_at IS NULL
          AND b.deleted_at IS NULL
          AND b.is_active = TRUE
        ORDER BY w.created_at ASC, i.created_at ASC, b.created_at ASC
        LIMIT 1
      `
    );
    const warehouse = warehouseResult.rows[0];

    const createResponse = await server.inject({
      method: 'POST',
      url: '/api/documents',
      headers: {
        authorization: `Bearer ${token}`
      },
      payload: {
        warehouseId: warehouse.id,
        type: 'receiving',
        payload: {
          reference: 'integration-test',
          source: 'district receiving dock',
          expectedArrivalDate: '2026-04-01',
          lines: [
            {
              itemId: warehouse.item_id,
              expectedQuantity: 24,
              targetBinId: warehouse.bin_id,
              lotCode: 'DOC-TEST-LOT-001',
              expirationDate: '2026-06-01'
            }
          ]
        }
      }
    });

    expect(createResponse.statusCode).toBe(201);
    const created = createResponse.json() as { id: string; documentNumber: string };
    expect(created.documentNumber).toContain('REC-');

    const detailResponse = await server.inject({
      method: 'GET',
      url: `/api/documents/${created.id}`,
      headers: {
        authorization: `Bearer ${token}`
      }
    });

    expect(detailResponse.statusCode).toBe(200);
    const detail = detailResponse.json() as {
      document: { status: string; payload: { lines: Array<{ expectedQuantity: number; lotCode: string }> } };
      workflow: Array<unknown>;
    };
    expect(detail.document.status).toBe('draft');
    expect(detail.document.payload.lines[0].expectedQuantity).toBe(24);
    expect(detail.document.payload.lines[0].lotCode).toBe('DOC-TEST-LOT-001');
    expect(detail.workflow).toHaveLength(1);

    const transitionResponse = await server.inject({
      method: 'POST',
      url: `/api/documents/${created.id}/transition`,
      headers: {
        authorization: `Bearer ${token}`
      },
      payload: {
        toStatus: 'submitted',
        notes: 'integration transition'
      }
    });

    expect(transitionResponse.statusCode).toBe(200);

    const transitionedDetailResponse = await server.inject({
      method: 'GET',
      url: `/api/documents/${created.id}`,
      headers: {
        authorization: `Bearer ${token}`
      }
    });

    expect(transitionedDetailResponse.statusCode).toBe(200);
    const transitionedDetail = transitionedDetailResponse.json() as {
      document: { status: string };
      workflow: Array<{ to_status: string }>;
    };
    expect(transitionedDetail.document.status).toBe('submitted');
    expect(transitionedDetail.workflow).toHaveLength(2);
    expect(transitionedDetail.workflow.at(-1)?.to_status).toBe('submitted');

    await server.db.query(`DELETE FROM documents WHERE id = $1`, [created.id]);
  });

  it('executes an approved receiving document into inventory and completes the workflow', async () => {
    const server = harness.server;
    const { token } = await loginAsAdmin(server);
    const warehouseResult = await server.db.query<{ id: string; item_id: string; bin_id: string }>(
      `
        SELECT
          w.id,
          i.id AS item_id,
          b.id AS bin_id
        FROM warehouses w
        JOIN items i ON i.department_id = w.department_id
        JOIN zones z ON z.warehouse_id = w.id
        JOIN bins b ON b.zone_id = z.id
        LEFT JOIN (
          SELECT ip2.bin_id, COALESCE(SUM(ip2.quantity * item2.weight_lbs), 0) AS current_load_lbs
          FROM inventory_positions ip2
          JOIN lots l2 ON l2.id = ip2.lot_id
          JOIN items item2 ON item2.id = l2.item_id
          GROUP BY ip2.bin_id
        ) load ON load.bin_id = b.id
        WHERE w.deleted_at IS NULL
          AND i.deleted_at IS NULL
          AND b.deleted_at IS NULL
          AND b.is_active = TRUE
          AND b.temperature_band = i.temperature_band
          AND b.max_length_in >= i.length_in
          AND b.max_width_in >= i.width_in
          AND b.max_height_in >= i.height_in
          AND COALESCE(load.current_load_lbs, 0) + (i.weight_lbs * 12) <= b.max_load_lbs
        ORDER BY w.created_at ASC, i.created_at ASC, b.created_at ASC
        LIMIT 1
      `
    );
    const warehouse = warehouseResult.rows[0];
    const lotCode = 'DOC-EXEC-LOT-001';

    const createResponse = await server.inject({
      method: 'POST',
      url: '/api/documents',
      headers: {
        authorization: `Bearer ${token}`
      },
      payload: {
        warehouseId: warehouse.id,
        type: 'receiving',
        payload: {
          reference: 'execution-test',
          source: 'district receiving dock',
          lines: [
            {
              itemId: warehouse.item_id,
              expectedQuantity: 12,
              targetBinId: warehouse.bin_id,
              lotCode
            }
          ]
        }
      }
    });

    expect(createResponse.statusCode).toBe(201);
    const created = createResponse.json() as { id: string };

    const submitResponse = await server.inject({
      method: 'POST',
      url: `/api/documents/${created.id}/transition`,
      headers: {
        authorization: `Bearer ${token}`
      },
      payload: {
        toStatus: 'submitted'
      }
    });
    expect(submitResponse.statusCode).toBe(200);

    const approveResponse = await server.inject({
      method: 'POST',
      url: `/api/documents/${created.id}/transition`,
      headers: {
        authorization: `Bearer ${token}`
      },
      payload: {
        toStatus: 'approved'
      }
    });
    expect(approveResponse.statusCode).toBe(200);

    const executeResponse = await server.inject({
      method: 'POST',
      url: `/api/documents/${created.id}/execute-receiving`,
      headers: {
        authorization: `Bearer ${token}`
      }
    });

    expect(executeResponse.statusCode).toBe(200);
    const executePayload = executeResponse.json() as { lotIds: string[] };
    expect(executePayload.lotIds).toHaveLength(1);

    const detailResponse = await server.inject({
      method: 'GET',
      url: `/api/documents/${created.id}`,
      headers: {
        authorization: `Bearer ${token}`
      }
    });

    expect(detailResponse.statusCode).toBe(200);
    const detail = detailResponse.json() as {
      document: { status: string; completed_at: string | null };
      workflow: Array<{ to_status: string }>;
    };
    expect(detail.document.status).toBe('completed');
    expect(detail.document.completed_at).toEqual(expect.any(String));
    expect(detail.workflow.at(-1)?.to_status).toBe('completed');

    const transactionResult = await server.db.query<{ quantity: string }>(
      `
        SELECT quantity
        FROM inventory_transactions
        WHERE document_id = $1
          AND transaction_type = 'receive'
      `,
      [created.id]
    );
    expect(transactionResult.rowCount).toBe(1);
    expect(Number(transactionResult.rows[0].quantity)).toBe(12);

    await server.db.query(`DELETE FROM inventory_transactions WHERE document_id = $1 OR lot_id = $2`, [created.id, executePayload.lotIds[0]]);
    await server.db.query(`DELETE FROM inventory_positions WHERE lot_id = $1`, [executePayload.lotIds[0]]);
    await server.db.query(`DELETE FROM lots WHERE id = $1`, [executePayload.lotIds[0]]);
    await server.db.query(`DELETE FROM documents WHERE id = $1`, [created.id]);
  });

  it('rejects invalid typed payloads', async () => {
    const server = harness.server;
    const { token } = await loginAsAdmin(server);
    const warehouseResult = await server.db.query<{ id: string; item_id: string; bin_id: string }>(
      `
        SELECT
          w.id,
          i.id AS item_id,
          b.id AS bin_id
        FROM warehouses w
        JOIN items i ON i.department_id = w.department_id
        JOIN zones z ON z.warehouse_id = w.id
        JOIN bins b ON b.zone_id = z.id
        WHERE w.deleted_at IS NULL
          AND i.deleted_at IS NULL
          AND b.deleted_at IS NULL
          AND b.is_active = TRUE
        ORDER BY w.created_at ASC, i.created_at ASC, b.created_at ASC
        LIMIT 1
      `
    );
    const warehouse = warehouseResult.rows[0];

    const response = await server.inject({
      method: 'POST',
      url: '/api/documents',
      headers: {
        authorization: `Bearer ${token}`
      },
      payload: {
        warehouseId: warehouse.id,
        type: 'adjustment',
        payload: {
          reasonCode: 'cycle-correction',
          lines: [
            {
              itemId: warehouse.item_id,
              binId: warehouse.bin_id,
              quantityDelta: 0
            }
          ]
        }
      }
    });

    expect(response.statusCode).toBe(422);
    expect(response.json()).toMatchObject({
      message: expect.stringContaining('quantityDelta')
    });
  });

  it('executes an approved shipping document against a specific lot and completes the workflow', async () => {
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
        JOIN departments d ON d.id = i.department_id
        JOIN warehouses w ON w.department_id = d.id
        JOIN zones z ON z.warehouse_id = w.id
        JOIN bins b ON b.zone_id = z.id
        WHERE i.deleted_at IS NULL
          AND b.deleted_at IS NULL
          AND b.is_active = TRUE
          AND b.temperature_band = i.temperature_band
          AND b.max_length_in >= i.length_in
          AND b.max_width_in >= i.width_in
          AND b.max_height_in >= i.height_in
        ORDER BY i.created_at ASC
        LIMIT 1
      `
    );
    const seed = seedResult.rows[0];
    const lotCode = 'DOC-SHIP-LOT-001';

    const lotInsert = await server.db.query<{ id: string }>(
      `
        INSERT INTO lots (item_id, warehouse_id, lot_code, quantity_on_hand, received_at)
        VALUES ($1, $2, $3, 5, NOW())
        RETURNING id
      `,
      [seed.item_id, seed.warehouse_id, lotCode]
    );
    const lotId = lotInsert.rows[0].id;

    await server.db.query(
      `
        INSERT INTO inventory_positions (lot_id, bin_id, quantity)
        VALUES ($1, $2, 5)
      `,
      [lotId, seed.bin_id]
    );

    try {
      const createResponse = await server.inject({
        method: 'POST',
        url: '/api/documents',
        headers: {
          authorization: `Bearer ${token}`
        },
        payload: {
          warehouseId: seed.warehouse_id,
          type: 'shipping',
          payload: {
            reference: 'shipping-execution-test',
            destination: 'School 17',
            lines: [
              {
                itemId: seed.item_id,
                quantity: 3,
                sourceBinId: seed.bin_id,
                lotCode
              }
            ]
          }
        }
      });

      expect(createResponse.statusCode).toBe(201);
      const created = createResponse.json() as { id: string };

      const submitResponse = await server.inject({
        method: 'POST',
        url: `/api/documents/${created.id}/transition`,
        headers: {
          authorization: `Bearer ${token}`
        },
        payload: { toStatus: 'submitted' }
      });
      expect(submitResponse.statusCode).toBe(200);

      const approveResponse = await server.inject({
        method: 'POST',
        url: `/api/documents/${created.id}/transition`,
        headers: {
          authorization: `Bearer ${token}`
        },
        payload: { toStatus: 'approved' }
      });
      expect(approveResponse.statusCode).toBe(200);

      const executeResponse = await server.inject({
        method: 'POST',
        url: `/api/documents/${created.id}/execute-shipping`,
        headers: {
          authorization: `Bearer ${token}`
        }
      });

      expect(executeResponse.statusCode).toBe(200);
      const executePayload = executeResponse.json() as { pickedLotIds: string[] };
      expect(executePayload.pickedLotIds).toEqual([lotId]);

      const detailResponse = await server.inject({
        method: 'GET',
        url: `/api/documents/${created.id}`,
        headers: {
          authorization: `Bearer ${token}`
        }
      });

      expect(detailResponse.statusCode).toBe(200);
      const detail = detailResponse.json() as {
        document: { status: string; completed_at: string | null };
        workflow: Array<{ to_status: string }>;
      };
      expect(detail.document.status).toBe('completed');
      expect(detail.document.completed_at).toEqual(expect.any(String));
      expect(detail.workflow.at(-1)?.to_status).toBe('completed');

      const lotResult = await server.db.query<{ quantity_on_hand: string }>(
        `SELECT quantity_on_hand FROM lots WHERE id = $1`,
        [lotId]
      );
      expect(Number(lotResult.rows[0].quantity_on_hand)).toBe(2);

      const positionResult = await server.db.query<{ quantity: string }>(
        `SELECT quantity FROM inventory_positions WHERE lot_id = $1 AND bin_id = $2`,
        [lotId, seed.bin_id]
      );
      expect(Number(positionResult.rows[0].quantity)).toBe(2);

      await server.db.query(`DELETE FROM inventory_transactions WHERE document_id = $1 OR lot_id = $2`, [created.id, lotId]);
      await server.db.query(`DELETE FROM inventory_positions WHERE lot_id = $1`, [lotId]);
      await server.db.query(`DELETE FROM lots WHERE id = $1`, [lotId]);
      await server.db.query(`DELETE FROM documents WHERE id = $1`, [created.id]);
    } catch (error) {
      await server.db.query(`DELETE FROM inventory_transactions WHERE lot_id = $1`, [lotId]);
      await server.db.query(`DELETE FROM inventory_positions WHERE lot_id = $1`, [lotId]);
      await server.db.query(`DELETE FROM lots WHERE id = $1`, [lotId]);
      throw error;
    }
  });

  it('executes an approved transfer document across warehouses and completes the workflow', async () => {
    const server = harness.server;
    const { token } = await loginAsAdmin(server);
    const seedResult = await server.db.query<{
      item_id: string;
      source_warehouse_id: string;
      source_bin_id: string;
      department_id: string;
      temperature_band: string;
      weight_lbs: string;
      length_in: string;
      width_in: string;
      height_in: string;
    }>(
      `
        SELECT
          i.id AS item_id,
          source_warehouse.id AS source_warehouse_id,
          source_bin.id AS source_bin_id,
          i.department_id,
          i.temperature_band::text AS temperature_band,
          i.weight_lbs::text AS weight_lbs,
          i.length_in::text AS length_in,
          i.width_in::text AS width_in,
          i.height_in::text AS height_in
        FROM items i
        JOIN warehouses source_warehouse ON source_warehouse.department_id = i.department_id
        JOIN zones source_zone ON source_zone.warehouse_id = source_warehouse.id
        JOIN bins source_bin ON source_bin.zone_id = source_zone.id
        WHERE i.deleted_at IS NULL
          AND source_bin.deleted_at IS NULL
          AND source_bin.is_active = TRUE
          AND source_bin.temperature_band = i.temperature_band
          AND source_bin.max_length_in >= i.length_in
          AND source_bin.max_width_in >= i.width_in
          AND source_bin.max_height_in >= i.height_in
        ORDER BY i.created_at ASC
        LIMIT 1
      `
    );
    const seed = seedResult.rows[0];
    expect(seed).toBeDefined();
    const lotCode = 'DOC-TRANSFER-LOT-001';
    let targetWarehouseId = '';
    let targetZoneId = '';
    let targetBinId = '';

    const targetWarehouseResult = await server.db.query<{ id: string }>(
      `
        INSERT INTO warehouses (department_id, code, name, address)
        VALUES ($1, $2, 'Integration Transfer Target', '500 Integration Way')
        RETURNING id
      `,
      [seed.department_id, `IT-WH-${Date.now()}`]
    );
    targetWarehouseId = targetWarehouseResult.rows[0].id;

    const targetZoneResult = await server.db.query<{ id: string }>(
      `
        INSERT INTO zones (warehouse_id, code, name)
        VALUES ($1, 'XFER', 'Transfer Zone')
        RETURNING id
      `,
      [targetWarehouseId]
    );
    targetZoneId = targetZoneResult.rows[0].id;

    const targetBinResult = await server.db.query<{ id: string }>(
      `
        INSERT INTO bins (
          zone_id,
          code,
          temperature_band,
          max_load_lbs,
          max_length_in,
          max_width_in,
          max_height_in
        )
        VALUES ($1, 'XFER-01', $2, $3, $4, $5, $6)
        RETURNING id
      `,
      [
        targetZoneId,
        seed.temperature_band,
        Math.max(Number(seed.weight_lbs) * 20, 1000),
        Math.max(Number(seed.length_in), 72),
        Math.max(Number(seed.width_in), 48),
        Math.max(Number(seed.height_in), 84)
      ]
    );
    targetBinId = targetBinResult.rows[0].id;

    const sourceLotInsert = await server.db.query<{ id: string }>(
      `
        INSERT INTO lots (item_id, warehouse_id, lot_code, quantity_on_hand, received_at)
        VALUES ($1, $2, $3, 6, NOW())
        RETURNING id
      `,
      [seed.item_id, seed.source_warehouse_id, lotCode]
    );
    const sourceLotId = sourceLotInsert.rows[0].id;

    await server.db.query(
      `
        INSERT INTO inventory_positions (lot_id, bin_id, quantity)
        VALUES ($1, $2, 6)
      `,
      [sourceLotId, seed.source_bin_id]
    );

    let createdDocumentId = '';
    let targetLotId = '';

    try {
      const createResponse = await server.inject({
        method: 'POST',
        url: '/api/documents',
        headers: {
          authorization: `Bearer ${token}`
        },
        payload: {
          warehouseId: seed.source_warehouse_id,
          type: 'transfer',
          payload: {
            reference: 'transfer-execution-test',
            destinationWarehouseId: targetWarehouseId,
            lines: [
              {
                itemId: seed.item_id,
                quantity: 4,
                sourceBinId: seed.source_bin_id,
                targetBinId,
                lotCode
              }
            ]
          }
        }
      });

      expect(createResponse.statusCode).toBe(201);
      createdDocumentId = (createResponse.json() as { id: string }).id;

      const submitResponse = await server.inject({
        method: 'POST',
        url: `/api/documents/${createdDocumentId}/transition`,
        headers: {
          authorization: `Bearer ${token}`
        },
        payload: { toStatus: 'submitted' }
      });
      expect(submitResponse.statusCode).toBe(200);

      const approveResponse = await server.inject({
        method: 'POST',
        url: `/api/documents/${createdDocumentId}/transition`,
        headers: {
          authorization: `Bearer ${token}`
        },
        payload: { toStatus: 'approved' }
      });
      expect(approveResponse.statusCode).toBe(200);

      const executeResponse = await server.inject({
        method: 'POST',
        url: `/api/documents/${createdDocumentId}/execute-transfer`,
        headers: {
          authorization: `Bearer ${token}`
        }
      });

      expect(executeResponse.statusCode).toBe(200);
      const executePayload = executeResponse.json() as { targetLotIds: string[] };
      expect(executePayload.targetLotIds).toHaveLength(1);
      targetLotId = executePayload.targetLotIds[0];

      const detailResponse = await server.inject({
        method: 'GET',
        url: `/api/documents/${createdDocumentId}`,
        headers: {
          authorization: `Bearer ${token}`
        }
      });

      expect(detailResponse.statusCode).toBe(200);
      const detail = detailResponse.json() as {
        document: { status: string; completed_at: string | null };
        workflow: Array<{ to_status: string }>;
      };
      expect(detail.document.status).toBe('completed');
      expect(detail.document.completed_at).toEqual(expect.any(String));
      expect(detail.workflow.at(-1)?.to_status).toBe('completed');

      const sourceLotResult = await server.db.query<{ quantity_on_hand: string }>(
        `SELECT quantity_on_hand FROM lots WHERE id = $1`,
        [sourceLotId]
      );
      expect(Number(sourceLotResult.rows[0].quantity_on_hand)).toBe(2);

      const sourcePositionResult = await server.db.query<{ quantity: string }>(
        `SELECT quantity FROM inventory_positions WHERE lot_id = $1 AND bin_id = $2`,
        [sourceLotId, seed.source_bin_id]
      );
      expect(Number(sourcePositionResult.rows[0].quantity)).toBe(2);

      const targetLotResult = await server.db.query<{ warehouse_id: string; quantity_on_hand: string }>(
        `SELECT warehouse_id, quantity_on_hand FROM lots WHERE id = $1`,
        [targetLotId]
      );
      expect(targetLotResult.rows[0].warehouse_id).toBe(targetWarehouseId);
      expect(Number(targetLotResult.rows[0].quantity_on_hand)).toBe(4);

      const targetPositionResult = await server.db.query<{ quantity: string }>(
        `SELECT quantity FROM inventory_positions WHERE lot_id = $1 AND bin_id = $2`,
        [targetLotId, targetBinId]
      );
      expect(Number(targetPositionResult.rows[0].quantity)).toBe(4);

      const transactionResult = await server.db.query<{ quantity: string }>(
        `
          SELECT quantity
          FROM inventory_transactions
          WHERE document_id = $1
            AND transaction_type = 'transfer'
        `,
        [createdDocumentId]
      );
      expect(transactionResult.rowCount).toBe(1);
      expect(Number(transactionResult.rows[0].quantity)).toBe(4);
    } finally {
      if (createdDocumentId) {
        await server.db.query(`DELETE FROM inventory_transactions WHERE document_id = $1 OR lot_id = $2 OR lot_id = $3`, [createdDocumentId, sourceLotId, targetLotId || null]);
        await server.db.query(`DELETE FROM inventory_positions WHERE lot_id = $1 OR lot_id = $2`, [sourceLotId, targetLotId || null]);
        await server.db.query(`DELETE FROM lots WHERE id = $1 OR id = $2`, [sourceLotId, targetLotId || null]);
        await server.db.query(`DELETE FROM documents WHERE id = $1`, [createdDocumentId]);
      } else {
        await server.db.query(`DELETE FROM inventory_transactions WHERE lot_id = $1`, [sourceLotId]);
        await server.db.query(`DELETE FROM inventory_positions WHERE lot_id = $1`, [sourceLotId]);
        await server.db.query(`DELETE FROM lots WHERE id = $1`, [sourceLotId]);
      }

      if (targetBinId) {
        await server.db.query(`DELETE FROM bins WHERE id = $1`, [targetBinId]);
      }
      if (targetZoneId) {
        await server.db.query(`DELETE FROM zones WHERE id = $1`, [targetZoneId]);
      }
      if (targetWarehouseId) {
        await server.db.query(`DELETE FROM operational_metrics WHERE warehouse_id = $1`, [targetWarehouseId]);
        await server.db.query(`DELETE FROM warehouses WHERE id = $1`, [targetWarehouseId]);
      }
    }
  });
});
