import type { FastifyInstance } from 'fastify';
import { getDocumentCreatePermission, type DocumentCreationType } from '../domain/inventory-permissions.js';
import {
  isDocumentPayloadValidationError,
  validateDocumentPayload
} from '../services/document-payload.service.js';
import { AccessControlService } from '../services/access-control.service.js';
import { DocumentService } from '../services/document.service.js';

const documentStatusEnum = ['draft', 'submitted', 'approved', 'in_progress', 'completed', 'cancelled', 'archived'] as const;
const documentTypeEnum = ['receiving', 'shipping', 'transfer', 'cycle_count', 'adjustment'] as const;

const documentIdParamsSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['documentId'],
  properties: {
    documentId: { type: 'string', format: 'uuid' }
  }
} as const;

const documentListQuerySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    status: { type: 'string', enum: documentStatusEnum }
  }
} as const;

const createDocumentBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['warehouseId', 'type'],
  properties: {
    warehouseId: { type: 'string', format: 'uuid' },
    type: { type: 'string', enum: documentTypeEnum },
    payload: { type: 'object' },
    documentNumber: { type: 'string', minLength: 1, maxLength: 120 }
  }
} as const;

const transitionBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['toStatus'],
  properties: {
    toStatus: { type: 'string', enum: documentStatusEnum },
    notes: { type: 'string', minLength: 1, maxLength: 2000 }
  }
} as const;

export const registerDocumentRoutes = async (fastify: FastifyInstance) => {
  const accessControl = new AccessControlService(fastify);
  const documentService = new DocumentService(fastify);
  const requireDocumentCreatePermission = async (request: any, reply: any) => {
    const body = request.body as { type: DocumentCreationType };
    const requiredPermission = getDocumentCreatePermission(body.type);
    if (!request.authUser?.permissionCodes.includes(requiredPermission)) {
      return reply.code(403).send({ message: `Creating ${body.type} documents requires ${requiredPermission}` });
    }
  };

  const executeDocument = async (
    request: any,
    expectedType: 'receiving' | 'shipping' | 'transfer'
  ) => {
    const { documentId } = request.params as { documentId: string };

    try {
      const result = await documentService.executeDocument({
        documentId,
        expectedType,
        user: request.authUser!
      });

      request.auditContext = {
        actionType: 'document_execute',
        resourceType: 'document',
        resourceId: documentId,
        details: result.auditDetails
      };

      return result.response;
    } catch (error) {
      const handledError = error as Error & { auditDetails?: Record<string, unknown> };
      if (handledError.auditDetails) {
        request.auditContext = {
          actionType: 'document_execute_failed',
          resourceType: 'document',
          resourceId: documentId,
          details: {
            ...handledError.auditDetails,
            message: handledError.message
          }
        };
      }

      throw error;
    }
  };

  fastify.post('/documents', {
    preHandler: [fastify.authenticate, requireDocumentCreatePermission],
    schema: { body: createDocumentBodySchema }
  }, async (request, reply) => {
    const body = request.body as {
      warehouseId: string;
      type: 'receiving' | 'shipping' | 'transfer' | 'cycle_count' | 'adjustment';
      payload?: Record<string, unknown>;
      documentNumber?: string;
    };

    const user = request.authUser!;
    if (
      !['administrator', 'manager'].some((role) => user.roleCodes.includes(role))
      && !user.assignedWarehouseIds.includes(body.warehouseId)
    ) {
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
    preHandler: [fastify.authenticate, fastify.requirePermission('search.read')],
    schema: { querystring: documentListQuerySchema }
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
    preHandler: [fastify.authenticate, fastify.requirePermission('search.read')],
    schema: { params: documentIdParamsSchema }
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
    await accessControl.ensureWarehouseAccess(user, document.warehouse_id, 'Document is outside your warehouse scope');

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
    preHandler: [fastify.authenticate, fastify.requirePermission('documents.approve')],
    schema: {
      params: documentIdParamsSchema,
      body: transitionBodySchema
    }
  }, async (request, reply) => {
    const { documentId } = request.params as { documentId: string };
    const body = request.body as { toStatus: typeof documentStatusEnum[number]; notes?: string };
    await accessControl.ensureDocumentAccess(request.authUser!, documentId, 'Document is outside your warehouse scope');

    const result = await documentService.transitionDocument({
      documentId,
      toStatus: body.toStatus,
      notes: body.notes,
      userId: request.authUser!.id
    });

    request.auditContext = {
      actionType: 'document_transition',
      resourceType: 'document',
      resourceId: documentId,
      details: { fromStatus: result.fromStatus, toStatus: result.toStatus }
    };

    return reply.send({ success: true });
  });

  fastify.post('/documents/:documentId/execute-receiving', {
    preHandler: [fastify.authenticate, fastify.requirePermission('inventory.receive')],
    schema: { params: documentIdParamsSchema }
  }, async (request) => executeDocument(request, 'receiving'));

  fastify.post('/documents/:documentId/execute-shipping', {
    preHandler: [fastify.authenticate, fastify.requirePermission('inventory.pick')],
    schema: { params: documentIdParamsSchema }
  }, async (request) => executeDocument(request, 'shipping'));

  fastify.post('/documents/:documentId/execute-transfer', {
    preHandler: [fastify.authenticate, fastify.requirePermission('inventory.move')],
    schema: { params: documentIdParamsSchema }
  }, async (request) => executeDocument(request, 'transfer'));
};
