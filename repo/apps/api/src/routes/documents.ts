import type { FastifyInstance } from 'fastify';
import {
  isDocumentPayloadValidationError,
  validateDocumentPayload
} from '../services/document-payload.service.js';
import { InventoryService } from '../services/inventory.service.js';
import { AccessControlService } from '../services/access-control.service.js';

const transitions: Record<string, string[]> = {
  draft: ['submitted', 'cancelled'],
  submitted: ['approved', 'cancelled'],
  approved: ['in_progress', 'cancelled'],
  in_progress: ['completed', 'cancelled'],
  completed: ['archived'],
  cancelled: ['archived'],
  archived: []
};

const isDocumentExecutionReady = (status: string) => ['approved', 'in_progress'].includes(status);

export const registerDocumentRoutes = async (fastify: FastifyInstance) => {
  const inventoryService = new InventoryService(fastify);
  const accessControl = new AccessControlService(fastify);

  fastify.post('/documents', {
    preHandler: [fastify.authenticate, fastify.requirePermission('inventory.receive')]
  }, async (request, reply) => {
    const body = request.body as {
      warehouseId: string;
      type: 'receiving' | 'shipping' | 'transfer' | 'cycle_count' | 'adjustment';
      payload?: Record<string, unknown>;
      documentNumber?: string;
    };

    const user = request.authUser!;
    if (!['administrator', 'manager'].some((role) => user.roleCodes.includes(role))
      && !user.assignedWarehouseIds.includes(body.warehouseId)) {
      return reply.code(403).send({ message: 'Document creation is limited to assigned warehouses' });
    }

    let normalizedPayload: Record<string, unknown>;
    try {
      normalizedPayload = await validateDocumentPayload(fastify, user, body);
    } catch (error) {
      if (isDocumentPayloadValidationError(error)) {
        return reply.code(error.statusCode).send({ message: error.message });
      }

      throw error;
    }

    const documentNumber = body.documentNumber?.trim()
      || `${body.type.slice(0, 3).toUpperCase()}-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Date.now().toString().slice(-6)}`;

    const client = await fastify.db.connect();
    try {
      await client.query('BEGIN');
      const insertResult = await client.query<{ id: string }>(
        `
          INSERT INTO documents (warehouse_id, document_number, type, status, created_by, payload)
          VALUES ($1, $2, $3, 'draft', $4, $5::jsonb)
          RETURNING id
        `,
        [body.warehouseId, documentNumber, body.type, user.id, JSON.stringify(normalizedPayload)]
      );

      await client.query(
        `
          INSERT INTO document_workflows (document_id, from_status, to_status, changed_by, notes)
          VALUES ($1, NULL, 'draft', $2, $3)
        `,
        [insertResult.rows[0].id, user.id, 'Document created']
      );

      await client.query('COMMIT');

      request.auditContext = {
        actionType: 'document_create',
        resourceType: 'document',
        resourceId: insertResult.rows[0].id,
        details: {
          documentNumber,
          type: body.type,
          warehouseId: body.warehouseId,
          lineCount: Array.isArray(normalizedPayload.lines) ? normalizedPayload.lines.length : 0
        }
      };

      return reply.code(201).send({ id: insertResult.rows[0].id, documentNumber });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

  fastify.get('/documents', {
    preHandler: [fastify.authenticate, fastify.requirePermission('search.read')]
  }, async (request) => {
    const query = request.query as { status?: string };
    const values: unknown[] = [];
    let whereClause = '1 = 1';

    if (!['administrator', 'manager'].some((role) => request.authUser!.roleCodes.includes(role))) {
      values.push(request.authUser!.assignedWarehouseIds);
      whereClause += ` AND d.warehouse_id = ANY($${values.length}::uuid[])`;
    }

    if (query.status) {
      values.push(query.status);
      whereClause += ` AND d.status = $${values.length}`;
    }

    const result = await fastify.db.query(
      `
        SELECT d.id, d.document_number, d.type, d.status, d.created_at, d.updated_at, w.name AS warehouse_name
        FROM documents d
        JOIN warehouses w ON w.id = d.warehouse_id
        WHERE ${whereClause}
        ORDER BY d.updated_at DESC
      `,
      values
    );

    return result.rows;
  });

  fastify.get('/documents/:documentId', {
    preHandler: [fastify.authenticate, fastify.requirePermission('search.read')]
  }, async (request, reply) => {
    const { documentId } = request.params as { documentId: string };
    const user = request.authUser!;

    const documentResult = await fastify.db.query(
      `
        SELECT
          d.id,
          d.document_number,
          d.type,
          d.status,
          d.payload,
          d.created_at,
          d.updated_at,
          d.completed_at,
          w.id AS warehouse_id,
          w.code AS warehouse_code,
          w.name AS warehouse_name,
          creator.display_name AS created_by_name,
          approver.display_name AS approved_by_name
        FROM documents d
        JOIN warehouses w ON w.id = d.warehouse_id
        LEFT JOIN users creator ON creator.id = d.created_by
        LEFT JOIN users approver ON approver.id = d.approved_by
        WHERE d.id = $1
      `,
      [documentId]
    );

    if (!documentResult.rowCount) {
      return reply.code(404).send({ message: 'Document not found' });
    }

    const document = documentResult.rows[0] as { warehouse_id: string };
    accessControl.ensureWarehouseAccess(user, document.warehouse_id, 'Document is outside your warehouse scope');

    const workflowResult = await fastify.db.query(
      `
        SELECT
          dw.id,
          dw.from_status,
          dw.to_status,
          dw.notes,
          dw.created_at,
          u.display_name AS changed_by_name
        FROM document_workflows dw
        LEFT JOIN users u ON u.id = dw.changed_by
        WHERE dw.document_id = $1
        ORDER BY dw.created_at ASC
      `,
      [documentId]
    );

    return {
      document,
      workflow: workflowResult.rows
    };
  });

  fastify.post('/documents/:documentId/transition', {
    preHandler: [fastify.authenticate, fastify.requirePermission('documents.approve')]
  }, async (request, reply) => {
    const { documentId } = request.params as { documentId: string };
    const body = request.body as { toStatus: string; notes?: string };
    await accessControl.ensureDocumentAccess(request.authUser!, documentId, 'Document is outside your warehouse scope');

    const currentResult = await fastify.db.query<{ status: string }>(
      `SELECT status FROM documents WHERE id = $1`,
      [documentId]
    );

    if (!currentResult.rowCount) {
      return reply.code(404).send({ message: 'Document not found' });
    }

    const fromStatus = currentResult.rows[0].status;
    if (!transitions[fromStatus]?.includes(body.toStatus)) {
      return reply.code(422).send({ message: `Transition ${fromStatus} -> ${body.toStatus} is not allowed` });
    }

    const client = await fastify.db.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `
          UPDATE documents
          SET status = $2::document_status,
              approved_by = CASE WHEN $2::text = 'approved' THEN $3 ELSE approved_by END,
              completed_at = CASE WHEN $2::text = 'completed' THEN NOW() ELSE completed_at END,
              updated_at = NOW()
          WHERE id = $1
        `,
        [documentId, body.toStatus, request.authUser!.id]
      );
      await client.query(
        `
          INSERT INTO document_workflows (document_id, from_status, to_status, changed_by, notes)
          VALUES ($1, $2, $3, $4, $5)
        `,
        [documentId, fromStatus, body.toStatus, request.authUser!.id, body.notes ?? null]
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    request.auditContext = {
      actionType: 'document_transition',
      resourceType: 'document',
      resourceId: documentId,
      details: { fromStatus, toStatus: body.toStatus }
    };

    return { success: true };
  });

  fastify.post('/documents/:documentId/execute-receiving', {
    preHandler: [fastify.authenticate, fastify.requirePermission('inventory.receive')]
  }, async (request, reply) => {
    const { documentId } = request.params as { documentId: string };
    const user = request.authUser!;

    const documentResult = await fastify.db.query<{
      id: string;
      warehouse_id: string;
      type: string;
      status: string;
      payload: {
        lines?: Array<{
          itemId: string;
          expectedQuantity: number;
          targetBinId: string;
          lotCode: string;
          expirationDate?: string;
        }>;
      };
    }>(
      `
        SELECT id, warehouse_id, type, status, payload
        FROM documents
        WHERE id = $1
      `,
      [documentId]
    );

    if (!documentResult.rowCount) {
      return reply.code(404).send({ message: 'Document not found' });
    }

    const document = documentResult.rows[0];
    accessControl.ensureWarehouseAccess(user, document.warehouse_id, 'Document is outside your warehouse scope');

    if (document.type !== 'receiving') {
      return reply.code(422).send({ message: 'Only receiving documents can be executed from this endpoint' });
    }

    if (!isDocumentExecutionReady(document.status)) {
      return reply.code(422).send({ message: `Receiving execution requires an approved or in_progress document, not ${document.status}` });
    }

    const lines = Array.isArray(document.payload?.lines) ? document.payload.lines : [];
    if (!lines.length) {
      return reply.code(422).send({ message: 'Receiving document has no executable lines' });
    }

    const lotIds: string[] = [];
    for (const line of lines) {
      const result = await inventoryService.receiveInventory({
        itemId: line.itemId,
        warehouseId: document.warehouse_id,
        binId: line.targetBinId,
        lotCode: line.lotCode,
        quantity: Number(line.expectedQuantity),
        expirationDate: line.expirationDate,
        documentId,
        user
      });

      lotIds.push(result.lotId);
    }

    const client = await fastify.db.connect();
    try {
      await client.query('BEGIN');

      if (document.status === 'approved') {
        await client.query(
          `
            INSERT INTO document_workflows (document_id, from_status, to_status, changed_by, notes, created_at)
            VALUES ($1, 'approved', 'in_progress', $2, $3, NOW())
          `,
          [documentId, user.id, 'Receiving execution started']
        );
      }

      await client.query(
        `
          UPDATE documents
          SET status = 'completed',
              completed_at = NOW(),
              updated_at = NOW()
          WHERE id = $1
        `,
        [documentId]
      );

      await client.query(
        `
          INSERT INTO document_workflows (document_id, from_status, to_status, changed_by, notes, created_at)
          VALUES ($1, $2::document_status, 'completed', $3, $4, NOW() + INTERVAL '1 millisecond')
        `,
        [documentId, document.status === 'approved' ? 'in_progress' : 'in_progress', user.id, 'Receiving execution finished']
      );

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    request.auditContext = {
      actionType: 'document_execute',
      resourceType: 'document',
      resourceId: documentId,
      details: { type: document.type, lineCount: lines.length, lotIds }
    };

    return { success: true, lotIds };
  });

  fastify.post('/documents/:documentId/execute-shipping', {
    preHandler: [fastify.authenticate, fastify.requirePermission('inventory.pick')]
  }, async (request, reply) => {
    const { documentId } = request.params as { documentId: string };
    const user = request.authUser!;

    const documentResult = await fastify.db.query<{
      id: string;
      warehouse_id: string;
      type: string;
      status: string;
      payload: {
        lines?: Array<{
          itemId: string;
          quantity: number;
          sourceBinId: string;
          lotCode: string;
        }>;
      };
    }>(
      `
        SELECT id, warehouse_id, type, status, payload
        FROM documents
        WHERE id = $1
      `,
      [documentId]
    );

    if (!documentResult.rowCount) {
      return reply.code(404).send({ message: 'Document not found' });
    }

    const document = documentResult.rows[0];
    accessControl.ensureWarehouseAccess(user, document.warehouse_id, 'Document is outside your warehouse scope');

    if (document.type !== 'shipping') {
      return reply.code(422).send({ message: 'Only shipping documents can be executed from this endpoint' });
    }

    if (!isDocumentExecutionReady(document.status)) {
      return reply.code(422).send({ message: `Shipping execution requires an approved or in_progress document, not ${document.status}` });
    }

    const lines = Array.isArray(document.payload?.lines) ? document.payload.lines : [];
    if (!lines.length) {
      return reply.code(422).send({ message: 'Shipping document has no executable lines' });
    }

    const pickedLotIds: string[] = [];
    for (const line of lines) {
      const lotResult = await fastify.db.query<{ lot_id: string }>(
        `
          SELECT l.id AS lot_id
          FROM lots l
          JOIN inventory_positions ip ON ip.lot_id = l.id
          WHERE l.item_id = $1
            AND l.warehouse_id = $2
            AND l.lot_code = $3
            AND ip.bin_id = $4
        `,
        [line.itemId, document.warehouse_id, line.lotCode, line.sourceBinId]
      );

      if (!lotResult.rowCount) {
        return reply.code(422).send({
          message: `Shipping line lot ${line.lotCode} was not found in the selected source bin`
        });
      }

      const lotId = lotResult.rows[0].lot_id;
      await inventoryService.pickInventory({
        lotId,
        binId: line.sourceBinId,
        quantity: Number(line.quantity),
        documentId,
        user
      });
      pickedLotIds.push(lotId);
    }

    const client = await fastify.db.connect();
    try {
      await client.query('BEGIN');

      if (document.status === 'approved') {
        await client.query(
          `
            INSERT INTO document_workflows (document_id, from_status, to_status, changed_by, notes, created_at)
            VALUES ($1, 'approved', 'in_progress', $2, $3, NOW())
          `,
          [documentId, user.id, 'Shipping execution started']
        );
      }

      await client.query(
        `
          UPDATE documents
          SET status = 'completed',
              completed_at = NOW(),
              updated_at = NOW()
          WHERE id = $1
        `,
        [documentId]
      );

      await client.query(
        `
          INSERT INTO document_workflows (document_id, from_status, to_status, changed_by, notes, created_at)
          VALUES ($1, 'in_progress', 'completed', $2, $3, NOW() + INTERVAL '1 millisecond')
        `,
        [documentId, user.id, 'Shipping execution finished']
      );

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    request.auditContext = {
      actionType: 'document_execute',
      resourceType: 'document',
      resourceId: documentId,
      details: { type: document.type, lineCount: lines.length, pickedLotIds }
    };

    return { success: true, pickedLotIds };
  });

  fastify.post('/documents/:documentId/execute-transfer', {
    preHandler: [fastify.authenticate, fastify.requirePermission('inventory.move')]
  }, async (request, reply) => {
    const { documentId } = request.params as { documentId: string };
    const user = request.authUser!;

    const documentResult = await fastify.db.query<{
      id: string;
      warehouse_id: string;
      type: string;
      status: string;
      payload: {
        destinationWarehouseId?: string;
        lines?: Array<{
          itemId: string;
          quantity: number;
          sourceBinId: string;
          targetBinId: string;
          lotCode: string;
        }>;
      };
    }>(
      `
        SELECT id, warehouse_id, type, status, payload
        FROM documents
        WHERE id = $1
      `,
      [documentId]
    );

    if (!documentResult.rowCount) {
      return reply.code(404).send({ message: 'Document not found' });
    }

    const document = documentResult.rows[0];
    const destinationWarehouseId = document.payload?.destinationWarehouseId;
    accessControl.ensureWarehouseAccess(user, document.warehouse_id, 'Transfer document is outside your warehouse scope');

    if (document.type !== 'transfer') {
      return reply.code(422).send({ message: 'Only transfer documents can be executed from this endpoint' });
    }

    if (!isDocumentExecutionReady(document.status)) {
      return reply.code(422).send({ message: `Transfer execution requires an approved or in_progress document, not ${document.status}` });
    }

    if (!destinationWarehouseId) {
      return reply.code(422).send({ message: 'Transfer document is missing a destination warehouse' });
    }

    accessControl.ensureWarehouseAccess(user, destinationWarehouseId, 'Transfer document is outside your warehouse scope');

    const lines = Array.isArray(document.payload?.lines) ? document.payload.lines : [];
    if (!lines.length) {
      return reply.code(422).send({ message: 'Transfer document has no executable lines' });
    }

    const targetLotIds: string[] = [];
    for (const line of lines) {
      const lotResult = await fastify.db.query<{ lot_id: string; expiration_date: string | null }>(
        `
          SELECT l.id AS lot_id, l.expiration_date
          FROM lots l
          JOIN inventory_positions ip ON ip.lot_id = l.id
          WHERE l.item_id = $1
            AND l.warehouse_id = $2
            AND l.lot_code = $3
            AND ip.bin_id = $4
        `,
        [line.itemId, document.warehouse_id, line.lotCode, line.sourceBinId]
      );

      if (!lotResult.rowCount) {
        return reply.code(422).send({
          message: `Transfer line lot ${line.lotCode} was not found in the selected source bin`
        });
      }

      const lot = lotResult.rows[0];
      const result = await inventoryService.transferInventory({
        sourceLotId: lot.lot_id,
        sourceBinId: line.sourceBinId,
        targetWarehouseId: destinationWarehouseId,
        targetBinId: line.targetBinId,
        quantity: Number(line.quantity),
        lotCode: line.lotCode,
        expirationDate: lot.expiration_date ?? undefined,
        documentId,
        user
      });

      targetLotIds.push(result.targetLotId);
    }

    const client = await fastify.db.connect();
    try {
      await client.query('BEGIN');

      if (document.status === 'approved') {
        await client.query(
          `
            INSERT INTO document_workflows (document_id, from_status, to_status, changed_by, notes, created_at)
            VALUES ($1, 'approved', 'in_progress', $2, $3, NOW())
          `,
          [documentId, user.id, 'Transfer execution started']
        );
      }

      await client.query(
        `
          UPDATE documents
          SET status = 'completed',
              completed_at = NOW(),
              updated_at = NOW()
          WHERE id = $1
        `,
        [documentId]
      );

      await client.query(
        `
          INSERT INTO document_workflows (document_id, from_status, to_status, changed_by, notes, created_at)
          VALUES ($1, 'in_progress', 'completed', $2, $3, NOW() + INTERVAL '1 millisecond')
        `,
        [documentId, user.id, 'Transfer execution finished']
      );

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    request.auditContext = {
      actionType: 'document_execute',
      resourceType: 'document',
      resourceId: documentId,
      details: { type: document.type, lineCount: lines.length, targetLotIds }
    };

    return { success: true, targetLotIds };
  });
};
