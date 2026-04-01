import type { FastifyInstance } from 'fastify';

type DocumentType = 'receiving' | 'shipping' | 'transfer' | 'cycle_count' | 'adjustment';

type AuthUserShape = {
  roleCodes: string[];
  assignedWarehouseIds: string[];
};

type CreateDocumentInput = {
  warehouseId: string;
  type: DocumentType;
  payload?: Record<string, unknown>;
};

type WarehouseRow = {
  id: string;
  department_id: string;
};

type ItemRow = {
  id: string;
  department_id: string;
};

type BinRow = {
  id: string;
  warehouse_id: string;
};

export class DocumentPayloadValidationError extends Error {
  readonly statusCode = 422;
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

const readObject = (value: unknown, field: string) => {
  if (!isObject(value)) {
    throw new DocumentPayloadValidationError(`${field} must be an object`);
  }

  return value;
};

const readString = (value: unknown, field: string, options?: { optional?: boolean; maxLength?: number }) => {
  if (value === undefined || value === null || value === '') {
    if (options?.optional) {
      return undefined;
    }

    throw new DocumentPayloadValidationError(`${field} is required`);
  }

  if (typeof value !== 'string') {
    throw new DocumentPayloadValidationError(`${field} must be a string`);
  }

  const trimmed = value.trim();
  if (!trimmed) {
    if (options?.optional) {
      return undefined;
    }

    throw new DocumentPayloadValidationError(`${field} is required`);
  }

  if (options?.maxLength && trimmed.length > options.maxLength) {
    throw new DocumentPayloadValidationError(`${field} exceeds ${options.maxLength} characters`);
  }

  return trimmed;
};

const requireString = (value: unknown, field: string, maxLength?: number) =>
  readString(value, field, { maxLength }) as string;

const optionalString = (value: unknown, field: string, maxLength?: number) =>
  readString(value, field, { optional: true, maxLength });

const readNumber = (
  value: unknown,
  field: string,
  options?: { allowZero?: boolean; optional?: boolean; allowNegative?: boolean }
) => {
  if (value === undefined || value === null || value === '') {
    if (options?.optional) {
      return undefined;
    }

    throw new DocumentPayloadValidationError(`${field} is required`);
  }

  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    throw new DocumentPayloadValidationError(`${field} must be a number`);
  }

  if (!options?.allowNegative && numeric < 0) {
    throw new DocumentPayloadValidationError(`${field} must be zero or greater`);
  }

  if (!options?.allowZero && numeric === 0) {
    throw new DocumentPayloadValidationError(`${field} must be greater than zero`);
  }

  return numeric;
};

const readDate = (value: unknown, field: string, options?: { optional?: boolean }) => {
  const parsed = readString(value, field, { optional: options?.optional, maxLength: 40 });
  if (!parsed) {
    return undefined;
  }

  const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;
  if (!isoDatePattern.test(parsed) || Number.isNaN(Date.parse(`${parsed}T00:00:00Z`))) {
    throw new DocumentPayloadValidationError(`${field} must be an ISO date (YYYY-MM-DD)`);
  }

  return parsed;
};

const requireDate = (value: unknown, field: string) => readDate(value, field) as string;

const optionalDate = (value: unknown, field: string) => readDate(value, field, { optional: true });

const readArray = (value: unknown, field: string) => {
  if (!Array.isArray(value) || !value.length) {
    throw new DocumentPayloadValidationError(`${field} must contain at least one line`);
  }

  return value;
};

const ensureScopedWarehouse = (user: AuthUserShape, warehouseId: string, field: string) => {
  if (!user.roleCodes.includes('administrator') && !user.roleCodes.includes('manager')
    && !user.assignedWarehouseIds.includes(warehouseId)) {
    throw new DocumentPayloadValidationError(`${field} is outside your warehouse scope`);
  }
};

export const isDocumentPayloadValidationError = (error: unknown): error is DocumentPayloadValidationError =>
  error instanceof DocumentPayloadValidationError;

export const validateDocumentPayload = async (
  fastify: FastifyInstance,
  user: AuthUserShape,
  input: CreateDocumentInput
) => {
  const payload = readObject(input.payload ?? {}, 'payload');
  const warehouseResult = await fastify.db.query<WarehouseRow>(
    `
      SELECT id, department_id
      FROM warehouses
      WHERE id = $1
        AND deleted_at IS NULL
    `,
    [input.warehouseId]
  );

  if (!warehouseResult.rowCount) {
    throw new DocumentPayloadValidationError('Selected warehouse does not exist');
  }

  const sourceWarehouse = warehouseResult.rows[0];
  const itemIds = new Set<string>();
  const sourceBinIds = new Set<string>();
  const targetBinIds = new Set<string>();
  let destinationWarehouseId: string | undefined;

  const reference = optionalString(payload.reference, 'payload.reference', 120);

  const normalizeLines = <T>(lines: T[]) => {
    if (!lines.length) {
      throw new DocumentPayloadValidationError('payload.lines must contain at least one line');
    }

    return lines;
  };

  let normalizedPayload: Record<string, unknown>;

  switch (input.type) {
    case 'receiving': {
      const source = requireString(payload.source, 'payload.source', 120);
      const expectedArrivalDate = optionalDate(payload.expectedArrivalDate, 'payload.expectedArrivalDate');
      const lines = normalizeLines(readArray(payload.lines, 'payload.lines').map((rawLine, index) => {
        const line = readObject(rawLine, `payload.lines[${index}]`);
        const itemId = requireString(line.itemId, `payload.lines[${index}].itemId`);
        const expectedQuantity = readNumber(line.expectedQuantity, `payload.lines[${index}].expectedQuantity`);
        const targetBinId = requireString(line.targetBinId, `payload.lines[${index}].targetBinId`);
        const lotCode = requireString(line.lotCode, `payload.lines[${index}].lotCode`, 80);
        const expirationDate = optionalDate(line.expirationDate, `payload.lines[${index}].expirationDate`);

        itemIds.add(itemId);
        targetBinIds.add(targetBinId);

        return { itemId, expectedQuantity, targetBinId, lotCode, expirationDate };
      }));

      normalizedPayload = { reference, source, expectedArrivalDate, lines };
      break;
    }
    case 'shipping': {
      const destination = requireString(payload.destination, 'payload.destination', 120);
      const requestedShipDate = optionalDate(payload.requestedShipDate, 'payload.requestedShipDate');
      const lines = normalizeLines(readArray(payload.lines, 'payload.lines').map((rawLine, index) => {
        const line = readObject(rawLine, `payload.lines[${index}]`);
        const itemId = requireString(line.itemId, `payload.lines[${index}].itemId`);
        const quantity = readNumber(line.quantity, `payload.lines[${index}].quantity`);
        const sourceBinId = requireString(line.sourceBinId, `payload.lines[${index}].sourceBinId`);
        const lotCode = requireString(line.lotCode, `payload.lines[${index}].lotCode`, 80);

        itemIds.add(itemId);
        sourceBinIds.add(sourceBinId);

        return { itemId, quantity, sourceBinId, lotCode };
      }));

      normalizedPayload = { reference, destination, requestedShipDate, lines };
      break;
    }
    case 'transfer': {
      destinationWarehouseId = requireString(payload.destinationWarehouseId, 'payload.destinationWarehouseId');
      if (destinationWarehouseId === input.warehouseId) {
        throw new DocumentPayloadValidationError('payload.destinationWarehouseId must differ from warehouseId');
      }

      ensureScopedWarehouse(user, destinationWarehouseId, 'payload.destinationWarehouseId');

      const requestedTransferDate = optionalDate(payload.requestedTransferDate, 'payload.requestedTransferDate');
      const lines = normalizeLines(readArray(payload.lines, 'payload.lines').map((rawLine, index) => {
        const line = readObject(rawLine, `payload.lines[${index}]`);
        const itemId = requireString(line.itemId, `payload.lines[${index}].itemId`);
        const quantity = readNumber(line.quantity, `payload.lines[${index}].quantity`);
        const sourceBinId = requireString(line.sourceBinId, `payload.lines[${index}].sourceBinId`);
        const targetBinId = requireString(line.targetBinId, `payload.lines[${index}].targetBinId`);
        const lotCode = requireString(line.lotCode, `payload.lines[${index}].lotCode`, 80);

        itemIds.add(itemId);
        sourceBinIds.add(sourceBinId);
        targetBinIds.add(targetBinId);

        return { itemId, quantity, sourceBinId, targetBinId, lotCode };
      }));

      normalizedPayload = { reference, destinationWarehouseId, requestedTransferDate, lines };
      break;
    }
    case 'cycle_count': {
      const scheduledDate = requireDate(payload.scheduledDate, 'payload.scheduledDate');
      const countScope = optionalString(payload.countScope, 'payload.countScope', 120);
      const lines = normalizeLines(readArray(payload.lines, 'payload.lines').map((rawLine, index) => {
        const line = readObject(rawLine, `payload.lines[${index}]`);
        const itemId = requireString(line.itemId, `payload.lines[${index}].itemId`);
        const binId = requireString(line.binId, `payload.lines[${index}].binId`);
        const expectedQuantity = readNumber(line.expectedQuantity, `payload.lines[${index}].expectedQuantity`, { allowZero: true });

        itemIds.add(itemId);
        sourceBinIds.add(binId);

        return { itemId, binId, expectedQuantity };
      }));

      normalizedPayload = { reference, scheduledDate, countScope, lines };
      break;
    }
    case 'adjustment': {
      const reasonCode = requireString(payload.reasonCode, 'payload.reasonCode', 80);
      const lines = normalizeLines(readArray(payload.lines, 'payload.lines').map((rawLine, index) => {
        const line = readObject(rawLine, `payload.lines[${index}]`);
        const itemId = requireString(line.itemId, `payload.lines[${index}].itemId`);
        const binId = requireString(line.binId, `payload.lines[${index}].binId`);
        const quantityDelta = readNumber(line.quantityDelta, `payload.lines[${index}].quantityDelta`, {
          allowNegative: true,
          allowZero: false
        });

        itemIds.add(itemId);
        sourceBinIds.add(binId);

        return { itemId, binId, quantityDelta };
      }));

      normalizedPayload = { reference, reasonCode, lines };
      break;
    }
    default:
      throw new DocumentPayloadValidationError('Unsupported document type');
  }

  if (itemIds.size) {
    const itemResult = await fastify.db.query<ItemRow>(
      `
        SELECT id, department_id
        FROM items
        WHERE id = ANY($1::uuid[])
          AND deleted_at IS NULL
      `,
      [[...itemIds]]
    );

    if (itemResult.rowCount !== itemIds.size) {
      throw new DocumentPayloadValidationError('One or more line items are invalid');
    }

    for (const item of itemResult.rows) {
      if (item.department_id !== sourceWarehouse.department_id) {
        throw new DocumentPayloadValidationError('Document items must belong to the same department as the warehouse');
      }
    }
  }

  if (destinationWarehouseId) {
    const destinationResult = await fastify.db.query<WarehouseRow>(
      `
        SELECT id, department_id
        FROM warehouses
        WHERE id = $1
          AND deleted_at IS NULL
      `,
      [destinationWarehouseId]
    );

    if (!destinationResult.rowCount) {
      throw new DocumentPayloadValidationError('Destination warehouse does not exist');
    }

    if (destinationResult.rows[0].department_id !== sourceWarehouse.department_id) {
      throw new DocumentPayloadValidationError('Transfer documents must stay within the same department');
    }
  }

  const allBinIds = [...sourceBinIds, ...targetBinIds];
  if (allBinIds.length) {
    const binResult = await fastify.db.query<BinRow>(
      `
        SELECT b.id, z.warehouse_id
        FROM bins b
        JOIN zones z ON z.id = b.zone_id
        WHERE b.id = ANY($1::uuid[])
          AND b.deleted_at IS NULL
      `,
      [allBinIds]
    );

    if (binResult.rowCount !== new Set(allBinIds).size) {
      throw new DocumentPayloadValidationError('One or more line bins are invalid');
    }

    const binsById = new Map(binResult.rows.map((row) => [row.id, row]));

    for (const binId of sourceBinIds) {
      if (binsById.get(binId)?.warehouse_id !== input.warehouseId) {
        throw new DocumentPayloadValidationError(`Bin ${binId} must belong to the source warehouse`);
      }
    }

    for (const binId of targetBinIds) {
      const expectedWarehouseId = destinationWarehouseId ?? input.warehouseId;
      if (binsById.get(binId)?.warehouse_id !== expectedWarehouseId) {
        throw new DocumentPayloadValidationError(`Bin ${binId} must belong to the target warehouse`);
      }
    }
  }

  return Object.fromEntries(Object.entries(normalizedPayload).filter(([, value]) => value !== undefined));
};
