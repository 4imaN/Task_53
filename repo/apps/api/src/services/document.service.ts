import type { FastifyInstance } from 'fastify';
import { withTransaction, type DbExecutor } from '../utils/db.js';
import type { AuthenticatedUser } from '../types/fastify.js';
import { AccessControlService } from './access-control.service.js';
import { InventoryService } from './inventory.service.js';

type DocumentStatus = 'draft' | 'submitted' | 'approved' | 'in_progress' | 'completed' | 'cancelled' | 'archived';
type ExecutableDocumentType = 'receiving' | 'shipping' | 'transfer';

type TransitionDocumentInput = {
  documentId: string;
  toStatus: DocumentStatus;
  notes?: string;
  userId: string;
};

type ExecuteDocumentInput = {
  documentId: string;
  expectedType: ExecutableDocumentType;
  user: AuthenticatedUser;
};

type DocumentRow = {
  id: string;
  warehouse_id: string;
  type: ExecutableDocumentType;
  status: DocumentStatus;
  payload: Record<string, unknown>;
  completed_at: string | null;
};

type TransitionResult = {
  fromStatus: DocumentStatus;
  toStatus: DocumentStatus;
};

type DocumentExecutionResult = {
  response: { success: true; lotIds?: string[]; pickedLotIds?: string[]; targetLotIds?: string[] };
  auditDetails: Record<string, unknown>;
};

const transitions: Record<DocumentStatus, DocumentStatus[]> = {
  draft: ['submitted', 'cancelled'],
  submitted: ['approved', 'cancelled'],
  approved: ['in_progress', 'cancelled'],
  in_progress: ['completed', 'cancelled'],
  completed: ['archived'],
  cancelled: ['archived'],
  archived: []
};

const documentError = (statusCode: number, message: string, auditDetails?: Record<string, unknown>) =>
  Object.assign(new Error(message), { statusCode, auditDetails });

const isDocumentExecutionReady = (status: DocumentStatus) => ['approved', 'in_progress', 'completed'].includes(status);

export class DocumentService {
  private readonly inventoryService: InventoryService;

  private readonly accessControl: AccessControlService;

  constructor(private readonly fastify: FastifyInstance) {
    this.inventoryService = new InventoryService(fastify);
    this.accessControl = new AccessControlService(fastify);
  }

  async transitionDocument(input: TransitionDocumentInput): Promise<TransitionResult> {
    return withTransaction(this.fastify.db, async (client) => {
      const currentResult = await client.query<{ status: DocumentStatus }>(
        `SELECT status FROM documents WHERE id = $1 FOR UPDATE`,
        [input.documentId]
      );

      if (!currentResult.rowCount) {
        throw documentError(404, 'Document not found');
      }

      const fromStatus = currentResult.rows[0].status;
      if (!transitions[fromStatus]?.includes(input.toStatus)) {
        throw documentError(422, `Transition ${fromStatus} -> ${input.toStatus} is not allowed`);
      }

      await client.query(
        `
          UPDATE documents
          SET status = $2::document_status,
              approved_by = CASE WHEN $2::text = 'approved' THEN $3 ELSE approved_by END,
              completed_at = CASE WHEN $2::text = 'completed' THEN NOW() ELSE completed_at END,
              updated_at = NOW()
          WHERE id = $1
        `,
        [input.documentId, input.toStatus, input.userId]
      );

      await client.query(
        `
          INSERT INTO document_workflows (document_id, from_status, to_status, changed_by, notes)
          VALUES ($1, $2, $3, $4, $5)
        `,
        [input.documentId, fromStatus, input.toStatus, input.userId, input.notes ?? null]
      );

      return { fromStatus, toStatus: input.toStatus };
    });
  }

  async executeDocument(input: ExecuteDocumentInput): Promise<DocumentExecutionResult> {
    let auditDetails: Record<string, unknown> | undefined;

    try {
      return await withTransaction(this.fastify.db, async (client) => {
        const document = await this.loadDocumentForUpdate(client, input.documentId);
        if (!document) {
          throw documentError(404, 'Document not found');
        }

        await this.accessControl.ensureWarehouseAccess(input.user, document.warehouse_id, 'Document is outside your warehouse scope');
        auditDetails = {
          type: document.type,
          statusBefore: document.status
        };

        if (document.type !== input.expectedType) {
          throw documentError(422, `Only ${input.expectedType} documents can be executed from this endpoint`, auditDetails);
        }

        if (!isDocumentExecutionReady(document.status)) {
          throw documentError(
            422,
            `${this.capitalize(input.expectedType)} execution requires an approved or in_progress document, not ${document.status}`,
            auditDetails
          );
        }

        const lines = this.readExecutableLines(document);
        auditDetails = {
          ...auditDetails,
          lineCount: lines.length
        };

        if (!lines.length) {
          throw documentError(422, `${this.capitalize(input.expectedType)} document has no executable lines`, auditDetails);
        }

        if (document.status === 'completed') {
          return this.buildCompletedExecutionResult(client, document, lines);
        }

        const existingMutationResult = await client.query<{ count: string }>(
          `SELECT COUNT(*)::text AS count FROM inventory_transactions WHERE document_id = $1`,
          [document.id]
        );
        const existingMutationCount = Number(existingMutationResult.rows[0]?.count ?? 0);
        if (existingMutationCount > 0) {
          throw documentError(
            409,
            'Document has existing inventory mutations but is not completed. Manual review is required before retrying execution.',
            {
              ...auditDetails,
              existingMutationCount
            }
          );
        }

        if (document.type === 'transfer') {
          const destinationWarehouseId = String(document.payload.destinationWarehouseId ?? '').trim();
          if (!destinationWarehouseId) {
            throw documentError(422, 'Transfer document is missing a destination warehouse', auditDetails);
          }

          await this.accessControl.ensureWarehouseAccess(input.user, destinationWarehouseId, 'Transfer document is outside your warehouse scope');
        }

        if (document.status === 'approved') {
          await client.query(
            `UPDATE documents SET status = 'in_progress', updated_at = NOW() WHERE id = $1`,
            [document.id]
          );
          await client.query(
            `
              INSERT INTO document_workflows (document_id, from_status, to_status, changed_by, notes)
              VALUES ($1, 'approved', 'in_progress', $2, $3)
            `,
            [document.id, input.user.id, `${this.capitalize(document.type)} execution started`]
          );
        }

        const response = await this.applyExecution(client, document, lines, input.user);

        await client.query(
          `
            UPDATE documents
            SET status = 'completed',
                completed_at = COALESCE(completed_at, NOW()),
                updated_at = NOW()
            WHERE id = $1
          `,
          [document.id]
        );

        await client.query(
          `
            INSERT INTO document_workflows (document_id, from_status, to_status, changed_by, notes, created_at)
            VALUES ($1, 'in_progress', 'completed', $2, $3, NOW() + INTERVAL '1 millisecond')
          `,
          [document.id, input.user.id, `${this.capitalize(document.type)} execution finished`]
        );

        return {
          response,
          auditDetails: {
            type: document.type,
            statusBefore: document.status,
            lineCount: lines.length,
            ...this.responseAuditDetails(response)
          }
        };
      });
    } catch (error) {
      const handledError = error as Error & { auditDetails?: Record<string, unknown> };
      if (!handledError.auditDetails && auditDetails) {
        handledError.auditDetails = auditDetails;
      }
      throw handledError;
    }
  }

  private async loadDocumentForUpdate(db: DbExecutor, documentId: string): Promise<DocumentRow | null> {
    const result = await db.query<DocumentRow>(
      `
        SELECT id, warehouse_id, type, status, payload, completed_at
        FROM documents
        WHERE id = $1
        FOR UPDATE
      `,
      [documentId]
    );

    return result.rows[0] ?? null;
  }

  private readExecutableLines(document: DocumentRow) {
    const lines = Array.isArray(document.payload?.lines)
      ? document.payload.lines.filter((entry): entry is Record<string, unknown> => typeof entry === 'object' && entry !== null)
      : [];

    return lines;
  }

  private async applyExecution(
    db: DbExecutor,
    document: DocumentRow,
    lines: Record<string, unknown>[],
    user: AuthenticatedUser
  ): Promise<DocumentExecutionResult['response']> {
    switch (document.type) {
      case 'receiving': {
        const lotIds: string[] = [];
        for (const line of lines) {
          const result = await this.inventoryService.receiveInventoryInTransaction(db, {
            itemId: String(line.itemId),
            warehouseId: document.warehouse_id,
            binId: String(line.targetBinId),
            lotCode: String(line.lotCode),
            quantity: Number(line.expectedQuantity),
            expirationDate: line.expirationDate ? String(line.expirationDate) : undefined,
            documentId: document.id,
            user
          });
          lotIds.push(result.lotId);
        }

        return { success: true, lotIds };
      }
      case 'shipping': {
        const pickedLotIds: string[] = [];
        for (const line of lines) {
          const lotId = await this.resolveSourceLotId(
            db,
            String(line.itemId),
            document.warehouse_id,
            String(line.lotCode),
            String(line.sourceBinId),
            'Shipping line lot'
          );
          await this.inventoryService.pickInventoryInTransaction(db, {
            lotId,
            binId: String(line.sourceBinId),
            quantity: Number(line.quantity),
            documentId: document.id,
            user
          });
          pickedLotIds.push(lotId);
        }

        return { success: true, pickedLotIds };
      }
      case 'transfer': {
        const destinationWarehouseId = String(document.payload.destinationWarehouseId);
        const targetLotIds: string[] = [];
        for (const line of lines) {
          const lotLookup = await this.resolveSourceLot(db, {
            itemId: String(line.itemId),
            warehouseId: document.warehouse_id,
            lotCode: String(line.lotCode),
            binId: String(line.sourceBinId),
            prefix: 'Transfer line lot'
          });
          const result = await this.inventoryService.transferInventoryInTransaction(db, {
            sourceLotId: lotLookup.lotId,
            sourceBinId: String(line.sourceBinId),
            targetWarehouseId: destinationWarehouseId,
            targetBinId: String(line.targetBinId),
            quantity: Number(line.quantity),
            lotCode: String(line.lotCode),
            expirationDate: lotLookup.expirationDate ?? undefined,
            documentId: document.id,
            user
          });
          targetLotIds.push(result.targetLotId);
        }

        return { success: true, targetLotIds };
      }
    }
  }

  private async buildCompletedExecutionResult(
    db: DbExecutor,
    document: DocumentRow,
    lines: Record<string, unknown>[]
  ): Promise<DocumentExecutionResult> {
    switch (document.type) {
      case 'receiving': {
        const lotIds = await Promise.all(lines.map(async (line) => this.resolveLotIdByIdentity(
          db,
          String(line.itemId),
          document.warehouse_id,
          String(line.lotCode)
        )));
        return {
          response: { success: true, lotIds },
          auditDetails: {
            type: document.type,
            statusBefore: document.status,
            lineCount: lines.length,
            lotIds,
            idempotentReplay: true
          }
        };
      }
      case 'shipping': {
        const pickedLotIds = await Promise.all(lines.map(async (line) => this.resolveLotIdByIdentity(
          db,
          String(line.itemId),
          document.warehouse_id,
          String(line.lotCode)
        )));
        return {
          response: { success: true, pickedLotIds },
          auditDetails: {
            type: document.type,
            statusBefore: document.status,
            lineCount: lines.length,
            pickedLotIds,
            idempotentReplay: true
          }
        };
      }
      case 'transfer': {
        const destinationWarehouseId = String(document.payload.destinationWarehouseId ?? '').trim();
        const targetLotIds = await Promise.all(lines.map(async (line) => this.resolveLotIdByIdentity(
          db,
          String(line.itemId),
          destinationWarehouseId,
          String(line.lotCode)
        )));
        return {
          response: { success: true, targetLotIds },
          auditDetails: {
            type: document.type,
            statusBefore: document.status,
            lineCount: lines.length,
            targetLotIds,
            idempotentReplay: true
          }
        };
      }
    }
  }

  private async resolveSourceLot(
    db: DbExecutor,
    input: {
      itemId: string;
      warehouseId: string;
      lotCode: string;
      binId: string;
      prefix: string;
    }
  ) {
    const result = await db.query<{ lot_id: string; expiration_date: string | null }>(
      `
        SELECT l.id AS lot_id, l.expiration_date::text
        FROM lots l
        JOIN inventory_positions ip ON ip.lot_id = l.id
        WHERE l.item_id = $1
          AND l.warehouse_id = $2
          AND l.lot_code = $3
          AND ip.bin_id = $4
      `,
      [input.itemId, input.warehouseId, input.lotCode, input.binId]
    );

    if (!result.rowCount) {
      throw documentError(422, `${input.prefix} ${input.lotCode} was not found in the selected source bin`);
    }

    return {
      lotId: result.rows[0].lot_id,
      expirationDate: result.rows[0].expiration_date
    };
  }

  private async resolveSourceLotId(
    db: DbExecutor,
    itemId: string,
    warehouseId: string,
    lotCode: string,
    binId: string,
    prefix: string
  ) {
    const result = await this.resolveSourceLot(db, {
      itemId,
      warehouseId,
      lotCode,
      binId,
      prefix
    });

    return result.lotId;
  }

  private async resolveLotIdByIdentity(db: DbExecutor, itemId: string, warehouseId: string, lotCode: string) {
    const result = await db.query<{ id: string }>(
      `
        SELECT id
        FROM lots
        WHERE item_id = $1
          AND warehouse_id = $2
          AND lot_code = $3
      `,
      [itemId, warehouseId, lotCode]
    );

    if (!result.rowCount) {
      throw documentError(409, 'Completed document is missing one or more recorded lot mutations');
    }

    return result.rows[0].id;
  }

  private responseAuditDetails(response: DocumentExecutionResult['response']) {
    if (response.lotIds) {
      return { lotIds: response.lotIds };
    }

    if (response.pickedLotIds) {
      return { pickedLotIds: response.pickedLotIds };
    }

    return { targetLotIds: response.targetLotIds ?? [] };
  }

  private capitalize(value: string) {
    return value.charAt(0).toUpperCase() + value.slice(1);
  }
}
