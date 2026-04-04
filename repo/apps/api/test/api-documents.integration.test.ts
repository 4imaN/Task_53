import { describe, expect, it, vi } from 'vitest';
import { createIntegrationHarness, createScopedPermissionUser, loginAsAdmin, loginAsUser, runIntegration } from './helpers/integration.js';
import { InventoryService } from '../src/services/inventory.service.js';

const describeIfIntegration = runIntegration ? describe : describe.skip;

const selectShippingFixture = async (server: ReturnType<typeof createIntegrationHarness>['server']) => {
  const result = await server.db.query<{
    warehouse_code: string;
    warehouse_id: string;
    item_id: string;
    source_bin_id: string;
  }>(
    `
      SELECT
        w.code AS warehouse_code,
        w.id AS warehouse_id,
        i.id AS item_id,
        b.id AS source_bin_id
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

  return result.rows[0];
};

const selectTransferFixture = async (server: ReturnType<typeof createIntegrationHarness>['server']) => {
  const result = await server.db.query<{
    source_warehouse_code: string;
    source_warehouse_id: string;
    source_bin_id: string;
    target_warehouse_code: string;
    target_warehouse_id: string;
    target_bin_id: string;
    item_id: string;
  }>(
    `
      SELECT
        source_w.code AS source_warehouse_code,
        source_w.id AS source_warehouse_id,
        source_bin.id AS source_bin_id,
        target_w.code AS target_warehouse_code,
        target_w.id AS target_warehouse_id,
        target_bin.id AS target_bin_id,
        i.id AS item_id
      FROM warehouses source_w
      JOIN warehouses target_w
        ON target_w.department_id = source_w.department_id
       AND target_w.id <> source_w.id
      JOIN items i ON i.department_id = source_w.department_id
      JOIN zones source_z ON source_z.warehouse_id = source_w.id
      JOIN bins source_bin ON source_bin.zone_id = source_z.id
      JOIN zones target_z ON target_z.warehouse_id = target_w.id
      JOIN bins target_bin ON target_bin.zone_id = target_z.id
      WHERE source_w.deleted_at IS NULL
        AND target_w.deleted_at IS NULL
        AND i.deleted_at IS NULL
        AND source_bin.deleted_at IS NULL
        AND target_bin.deleted_at IS NULL
        AND source_bin.is_active = TRUE
        AND target_bin.is_active = TRUE
      ORDER BY source_w.created_at ASC, target_w.created_at ASC, i.created_at ASC, source_bin.created_at ASC, target_bin.created_at ASC
      LIMIT 1
    `
  );

  return result.rows[0];
};

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

  it('allows least-privilege users to create only the document types their operation permissions authorize', async () => {
    const server = harness.server;
    const shippingFixture = await selectShippingFixture(server);
    const transferFixture = await selectTransferFixture(server);
    const createdDocumentIds: string[] = [];
    const scopedUsers = await Promise.all([
      createScopedPermissionUser(server, {
        permissionCodes: ['inventory.pick'],
        warehouseCodes: [shippingFixture.warehouse_code]
      }),
      createScopedPermissionUser(server, {
        permissionCodes: ['inventory.move'],
        warehouseCodes: [transferFixture.source_warehouse_code, transferFixture.target_warehouse_code]
      }),
      createScopedPermissionUser(server, {
        permissionCodes: ['inventory.count'],
        warehouseCodes: [shippingFixture.warehouse_code]
      }),
      createScopedPermissionUser(server, {
        permissionCodes: ['inventory.adjust'],
        warehouseCodes: [shippingFixture.warehouse_code]
      })
    ]);

    const [pickUser, moveUser, countUser, adjustUser] = scopedUsers;

    try {
      const [
        pickToken,
        moveToken,
        countToken,
        adjustToken
      ] = await Promise.all([
        loginAsUser(server, pickUser.username, pickUser.password),
        loginAsUser(server, moveUser.username, moveUser.password),
        loginAsUser(server, countUser.username, countUser.password),
        loginAsUser(server, adjustUser.username, adjustUser.password)
      ]);

      const shippingResponse = await server.inject({
        method: 'POST',
        url: '/api/documents',
        headers: { authorization: `Bearer ${pickToken.token}` },
        payload: {
          warehouseId: shippingFixture.warehouse_id,
          type: 'shipping',
          payload: {
            destination: 'School dock',
            lines: [
              {
                itemId: shippingFixture.item_id,
                quantity: 2,
                sourceBinId: shippingFixture.source_bin_id,
                lotCode: `SHIP-${Date.now()}`
              }
            ]
          }
        }
      });
      expect(shippingResponse.statusCode).toBe(201);
      createdDocumentIds.push((shippingResponse.json() as { id: string }).id);

      const transferResponse = await server.inject({
        method: 'POST',
        url: '/api/documents',
        headers: { authorization: `Bearer ${moveToken.token}` },
        payload: {
          warehouseId: transferFixture.source_warehouse_id,
          type: 'transfer',
          payload: {
            destinationWarehouseId: transferFixture.target_warehouse_id,
            lines: [
              {
                itemId: transferFixture.item_id,
                quantity: 1,
                sourceBinId: transferFixture.source_bin_id,
                targetBinId: transferFixture.target_bin_id,
                lotCode: `XFER-${Date.now()}`
              }
            ]
          }
        }
      });
      expect(transferResponse.statusCode).toBe(201);
      createdDocumentIds.push((transferResponse.json() as { id: string }).id);

      const cycleCountResponse = await server.inject({
        method: 'POST',
        url: '/api/documents',
        headers: { authorization: `Bearer ${countToken.token}` },
        payload: {
          warehouseId: shippingFixture.warehouse_id,
          type: 'cycle_count',
          payload: {
            scheduledDate: '2026-04-01',
            lines: [
              {
                itemId: shippingFixture.item_id,
                binId: shippingFixture.source_bin_id,
                expectedQuantity: 0
              }
            ]
          }
        }
      });
      expect(cycleCountResponse.statusCode).toBe(201);
      createdDocumentIds.push((cycleCountResponse.json() as { id: string }).id);

      const adjustmentResponse = await server.inject({
        method: 'POST',
        url: '/api/documents',
        headers: { authorization: `Bearer ${adjustToken.token}` },
        payload: {
          warehouseId: shippingFixture.warehouse_id,
          type: 'adjustment',
          payload: {
            reasonCode: 'LOSS',
            lines: [
              {
                itemId: shippingFixture.item_id,
                binId: shippingFixture.source_bin_id,
                quantityDelta: 1
              }
            ]
          }
        }
      });
      expect(adjustmentResponse.statusCode).toBe(201);
      createdDocumentIds.push((adjustmentResponse.json() as { id: string }).id);
    } finally {
      if (createdDocumentIds.length) {
        await server.db.query(`DELETE FROM document_workflows WHERE document_id = ANY($1::uuid[])`, [createdDocumentIds]);
        await server.db.query(`DELETE FROM documents WHERE id = ANY($1::uuid[])`, [createdDocumentIds]);
      }

      for (const scopedUser of scopedUsers.reverse()) {
        await scopedUser.cleanup();
      }
    }
  });

  it('rejects document creation when the caller lacks the permission for that document type', async () => {
    const server = harness.server;
    const shippingFixture = await selectShippingFixture(server);
    const transferFixture = await selectTransferFixture(server);
    const moveOnlyUser = await createScopedPermissionUser(server, {
      permissionCodes: ['inventory.move'],
      warehouseCodes: [transferFixture.source_warehouse_code, transferFixture.target_warehouse_code]
    });
    const pickOnlyUser = await createScopedPermissionUser(server, {
      permissionCodes: ['inventory.pick'],
      warehouseCodes: [shippingFixture.warehouse_code]
    });

    try {
      const [{ token: moveToken }, { token: pickToken }] = await Promise.all([
        loginAsUser(server, moveOnlyUser.username, moveOnlyUser.password),
        loginAsUser(server, pickOnlyUser.username, pickOnlyUser.password)
      ]);

      const receivingDenied = await server.inject({
        method: 'POST',
        url: '/api/documents',
        headers: { authorization: `Bearer ${moveToken}` },
        payload: {
          warehouseId: shippingFixture.warehouse_id,
          type: 'receiving',
          payload: {
            source: 'Supplier dock',
            lines: [
              {
                itemId: shippingFixture.item_id,
                expectedQuantity: 1,
                targetBinId: shippingFixture.source_bin_id,
                lotCode: `REC-${Date.now()}`
              }
            ]
          }
        }
      });
      expect(receivingDenied.statusCode).toBe(403);
      expect(receivingDenied.json()).toMatchObject({
        message: 'Creating receiving documents requires inventory.receive'
      });

      const transferDenied = await server.inject({
        method: 'POST',
        url: '/api/documents',
        headers: { authorization: `Bearer ${pickToken}` },
        payload: {
          warehouseId: transferFixture.source_warehouse_id,
          type: 'transfer',
          payload: {
            destinationWarehouseId: transferFixture.target_warehouse_id,
            lines: [
              {
                itemId: transferFixture.item_id,
                quantity: 1,
                sourceBinId: transferFixture.source_bin_id,
                targetBinId: transferFixture.target_bin_id,
                lotCode: `NOPE-${Date.now()}`
              }
            ]
          }
        }
      });
      expect(transferDenied.statusCode).toBe(403);
      expect(transferDenied.json()).toMatchObject({
        message: 'Creating transfer documents requires inventory.move'
      });
    } finally {
      await pickOnlyUser.cleanup();
      await moveOnlyUser.cleanup();
    }
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

  it('rolls back all inventory mutations and document state when execution fails mid-run', async () => {
    const server = harness.server;
    const { token } = await loginAsAdmin(server);
    const lotCodeOne = `DOC-FAIL-LOT-A-${Date.now()}`;
    const lotCodeTwo = `DOC-FAIL-LOT-B-${Date.now()}`;
    const seedResult = await server.db.query<{
      warehouse_id: string;
      item_id: string;
      valid_bin_id: string;
      invalid_bin_id: string;
    }>(
      `
        SELECT
          w.id AS warehouse_id,
          i.id AS item_id,
          valid_bin.id AS valid_bin_id,
          invalid_bin.id AS invalid_bin_id
        FROM items i
        JOIN warehouses w ON w.department_id = i.department_id
        JOIN zones valid_zone ON valid_zone.warehouse_id = w.id
        JOIN bins valid_bin ON valid_bin.zone_id = valid_zone.id
        JOIN zones invalid_zone ON invalid_zone.warehouse_id = w.id
        JOIN bins invalid_bin ON invalid_bin.zone_id = invalid_zone.id
        LEFT JOIN (
          SELECT ip.bin_id, COALESCE(SUM(ip.quantity * item.weight_lbs), 0) AS current_load_lbs
          FROM inventory_positions ip
          JOIN lots lot ON lot.id = ip.lot_id
          JOIN items item ON item.id = lot.item_id
          GROUP BY ip.bin_id
        ) load ON load.bin_id = valid_bin.id
        WHERE valid_bin.is_active = TRUE
          AND valid_bin.temperature_band = i.temperature_band
          AND valid_bin.max_length_in >= i.length_in
          AND valid_bin.max_width_in >= i.width_in
          AND valid_bin.max_height_in >= i.height_in
          AND COALESCE(load.current_load_lbs, 0) + i.weight_lbs <= valid_bin.max_load_lbs
          AND invalid_bin.is_active = TRUE
          AND invalid_bin.temperature_band <> i.temperature_band
        ORDER BY i.created_at ASC
        LIMIT 1
      `
    );
    const seed = seedResult.rows[0];

    const createResponse = await server.inject({
      method: 'POST',
      url: '/api/documents',
      headers: {
        authorization: `Bearer ${token}`
      },
      payload: {
        warehouseId: seed.warehouse_id,
        type: 'receiving',
        payload: {
          reference: 'rollback-test',
          source: 'integration dock',
          lines: [
            {
              itemId: seed.item_id,
              expectedQuantity: 1,
              targetBinId: seed.valid_bin_id,
              lotCode: lotCodeOne
            },
            {
              itemId: seed.item_id,
              expectedQuantity: 1,
              targetBinId: seed.invalid_bin_id,
              lotCode: lotCodeTwo
            }
          ]
        }
      }
    });

    expect(createResponse.statusCode).toBe(201);
    const documentId = (createResponse.json() as { id: string }).id;

    try {
      for (const toStatus of ['submitted', 'approved'] as const) {
        const transitionResponse = await server.inject({
          method: 'POST',
          url: `/api/documents/${documentId}/transition`,
          headers: {
            authorization: `Bearer ${token}`
          },
          payload: { toStatus }
        });
        expect(transitionResponse.statusCode).toBe(200);
      }

      const executeResponse = await server.inject({
        method: 'POST',
        url: `/api/documents/${documentId}/execute-receiving`,
        headers: {
          authorization: `Bearer ${token}`
        }
      });

      expect(executeResponse.statusCode).toBe(422);
      expect(executeResponse.json()).toMatchObject({
        statusCode: 422,
        message: 'Temperature band mismatch'
      });

      const documentState = await server.db.query<{ status: string; completed_at: string | null }>(
        `SELECT status, completed_at FROM documents WHERE id = $1`,
        [documentId]
      );
      expect(documentState.rows[0].status).toBe('approved');
      expect(documentState.rows[0].completed_at).toBeNull();

      const workflowTransitions = await server.db.query<{ count: string }>(
        `
          SELECT COUNT(*)::text AS count
          FROM document_workflows
          WHERE document_id = $1
            AND to_status IN ('in_progress', 'completed')
        `,
        [documentId]
      );
      expect(Number(workflowTransitions.rows[0].count)).toBe(0);

      const transactionCount = await server.db.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM inventory_transactions WHERE document_id = $1`,
        [documentId]
      );
      expect(Number(transactionCount.rows[0].count)).toBe(0);

      const createdLots = await server.db.query<{ count: string }>(
        `
          SELECT COUNT(*)::text AS count
          FROM lots
          WHERE warehouse_id = $1
            AND lot_code IN ($2, $3)
        `,
        [seed.warehouse_id, lotCodeOne, lotCodeTwo]
      );
      expect(Number(createdLots.rows[0].count)).toBe(0);

      const auditResult = await server.db.query<{ action_type: string; details: { message: string } }>(
        `
          SELECT action_type, details
          FROM audit_log
          WHERE action_type = 'document_execute_failed'
            AND resource_id = $1
          ORDER BY timestamp DESC
          LIMIT 1
        `,
        [documentId]
      );
      expect(auditResult.rowCount).toBe(1);
      expect(auditResult.rows[0].action_type).toBe('document_execute_failed');
      expect((auditResult.rows[0].details as { message: string }).message).toBe('Temperature band mismatch');
    } finally {
      await server.db.query(`DELETE FROM inventory_transactions WHERE document_id = $1`, [documentId]);
      await server.db.query(`DELETE FROM documents WHERE id = $1`, [documentId]);
    }
  });

  it('prevents concurrent duplicate execution and keeps retries idempotent', async () => {
    const server = harness.server;
    const { token } = await loginAsAdmin(server);
    const lotCode = `DOC-IDEMPOTENT-LOT-${Date.now()}`;
    const seedResult = await server.db.query<{
      warehouse_id: string;
      item_id: string;
      bin_id: string;
    }>(
      `
        SELECT
          w.id AS warehouse_id,
          i.id AS item_id,
          b.id AS bin_id
        FROM warehouses w
        JOIN items i ON i.department_id = w.department_id
        JOIN zones z ON z.warehouse_id = w.id
        JOIN bins b ON b.zone_id = z.id
        LEFT JOIN (
          SELECT ip.bin_id, COALESCE(SUM(ip.quantity * item.weight_lbs), 0) AS current_load_lbs
          FROM inventory_positions ip
          JOIN lots lot ON lot.id = ip.lot_id
          JOIN items item ON item.id = lot.item_id
          GROUP BY ip.bin_id
        ) load ON load.bin_id = b.id
        WHERE b.is_active = TRUE
          AND b.temperature_band = i.temperature_band
          AND b.max_length_in >= i.length_in
          AND b.max_width_in >= i.width_in
          AND b.max_height_in >= i.height_in
          AND COALESCE(load.current_load_lbs, 0) + (i.weight_lbs * 2) <= b.max_load_lbs
        ORDER BY i.created_at ASC
        LIMIT 1
      `
    );
    const seed = seedResult.rows[0];

    const createResponse = await server.inject({
      method: 'POST',
      url: '/api/documents',
      headers: {
        authorization: `Bearer ${token}`
      },
      payload: {
        warehouseId: seed.warehouse_id,
        type: 'receiving',
        payload: {
          reference: 'idempotent-test',
          source: 'integration dock',
          lines: [
            {
              itemId: seed.item_id,
              expectedQuantity: 2,
              targetBinId: seed.bin_id,
              lotCode
            }
          ]
        }
      }
    });

    expect(createResponse.statusCode).toBe(201);
    const documentId = (createResponse.json() as { id: string }).id;

    try {
      for (const toStatus of ['submitted', 'approved'] as const) {
        const transitionResponse = await server.inject({
          method: 'POST',
          url: `/api/documents/${documentId}/transition`,
          headers: {
            authorization: `Bearer ${token}`
          },
          payload: { toStatus }
        });
        expect(transitionResponse.statusCode).toBe(200);
      }

      const originalReceive = InventoryService.prototype.receiveInventoryInTransaction;
      let unblockFirstExecution: (() => void) | null = null;
      const firstExecutionReachedMutation = new Promise<void>((resolve) => {
        vi.spyOn(InventoryService.prototype, 'receiveInventoryInTransaction').mockImplementation(async function (...args) {
          resolve();
          await new Promise<void>((resume) => {
            unblockFirstExecution = resume;
          });
          return originalReceive.apply(this, args);
        });
      });

      const firstExecute = server.inject({
        method: 'POST',
        url: `/api/documents/${documentId}/execute-receiving`,
        headers: {
          authorization: `Bearer ${token}`
        }
      });

      await firstExecutionReachedMutation;

      const secondExecute = server.inject({
        method: 'POST',
        url: `/api/documents/${documentId}/execute-receiving`,
        headers: {
          authorization: `Bearer ${token}`
        }
      });

      unblockFirstExecution?.();

      const [firstResponse, secondResponse] = await Promise.all([firstExecute, secondExecute]);
      expect(firstResponse.statusCode).toBe(200);
      expect(secondResponse.statusCode).toBe(200);

      const firstPayload = firstResponse.json() as { lotIds: string[] };
      const secondPayload = secondResponse.json() as { lotIds: string[] };
      expect(firstPayload.lotIds).toHaveLength(1);
      expect(secondPayload.lotIds).toEqual(firstPayload.lotIds);

      const thirdResponse = await server.inject({
        method: 'POST',
        url: `/api/documents/${documentId}/execute-receiving`,
        headers: {
          authorization: `Bearer ${token}`
        }
      });

      expect(thirdResponse.statusCode).toBe(200);
      expect((thirdResponse.json() as { lotIds: string[] }).lotIds).toEqual(firstPayload.lotIds);

      const transactionResult = await server.db.query<{ count: string }>(
        `
          SELECT COUNT(*)::text AS count
          FROM inventory_transactions
          WHERE document_id = $1
            AND transaction_type = 'receive'
        `,
        [documentId]
      );
      expect(Number(transactionResult.rows[0].count)).toBe(1);

      const lotResult = await server.db.query<{ quantity_on_hand: string }>(
        `SELECT quantity_on_hand FROM lots WHERE id = $1`,
        [firstPayload.lotIds[0]]
      );
      expect(Number(lotResult.rows[0].quantity_on_hand)).toBe(2);

      const workflowResult = await server.db.query<{ count: string }>(
        `
          SELECT COUNT(*)::text AS count
          FROM document_workflows
          WHERE document_id = $1
            AND to_status = 'completed'
        `,
        [documentId]
      );
      expect(Number(workflowResult.rows[0].count)).toBe(1);

      const auditResult = await server.db.query<{ details: { idempotentReplay?: boolean } }>(
        `
          SELECT details
          FROM audit_log
          WHERE action_type = 'document_execute'
            AND resource_id = $1
          ORDER BY timestamp DESC
        `,
        [documentId]
      );
      expect(auditResult.rowCount).toBeGreaterThanOrEqual(2);
      expect(auditResult.rows.some((row) => Boolean((row.details as { idempotentReplay?: boolean }).idempotentReplay))).toBe(true);
    } finally {
      vi.restoreAllMocks();
      const lotResult = await server.db.query<{ id: string }>(
        `SELECT id FROM lots WHERE warehouse_id = $1 AND lot_code = $2`,
        [seed.warehouse_id, lotCode]
      );
      const lotId = lotResult.rows[0]?.id ?? null;
      await server.db.query(`DELETE FROM inventory_transactions WHERE document_id = $1 OR lot_id = $2`, [documentId, lotId]);
      await server.db.query(`DELETE FROM inventory_positions WHERE lot_id = $1`, [lotId]);
      await server.db.query(`DELETE FROM lots WHERE id = $1`, [lotId]);
      await server.db.query(`DELETE FROM documents WHERE id = $1`, [documentId]);
    }
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
