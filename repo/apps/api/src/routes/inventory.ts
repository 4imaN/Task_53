import type { FastifyInstance } from 'fastify';
import { INVENTORY_SCAN_PERMISSION } from '../domain/inventory-permissions.js';
import { InventoryService } from '../services/inventory.service.js';

const scanBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['code'],
  properties: {
    code: { type: 'string', minLength: 1, maxLength: 255 }
  }
} as const;

const moveBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['lotId', 'sourceBinId', 'targetBinId', 'quantity'],
  properties: {
    lotId: { type: 'string', format: 'uuid' },
    sourceBinId: { type: 'string', format: 'uuid' },
    targetBinId: { type: 'string', format: 'uuid' },
    quantity: { type: 'number', exclusiveMinimum: 0 }
  }
} as const;

const receiveBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['itemId', 'warehouseId', 'binId', 'lotCode', 'quantity'],
  properties: {
    itemId: { type: 'string', format: 'uuid' },
    warehouseId: { type: 'string', format: 'uuid' },
    binId: { type: 'string', format: 'uuid' },
    lotCode: { type: 'string', minLength: 1, maxLength: 80 },
    quantity: { type: 'number', exclusiveMinimum: 0 },
    expirationDate: { type: 'string', format: 'date' },
    documentId: { type: 'string', format: 'uuid' }
  }
} as const;

const pickBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['lotId', 'binId', 'quantity'],
  properties: {
    lotId: { type: 'string', format: 'uuid' },
    binId: { type: 'string', format: 'uuid' },
    quantity: { type: 'number', exclusiveMinimum: 0 }
  }
} as const;

export const registerInventoryRoutes = async (fastify: FastifyInstance) => {
  const inventoryService = new InventoryService(fastify);

  fastify.post('/inventory/scan', {
    preHandler: [fastify.authenticate, fastify.requirePermission(INVENTORY_SCAN_PERMISSION)],
    schema: { body: scanBodySchema }
  }, async (request) => {
    const body = request.body as { code: string };
    return inventoryService.lookupScan(body.code, request.authUser!);
  });

  fastify.post('/inventory/move', {
    preHandler: [fastify.authenticate, fastify.requirePermission('inventory.move')],
    schema: { body: moveBodySchema }
  }, async (request) => {
    const body = request.body as { lotId: string; sourceBinId: string; targetBinId: string; quantity: number };
    await inventoryService.moveInventory({ ...body, user: request.authUser! });

    request.auditContext = {
      actionType: 'inventory_move',
      resourceType: 'lot',
      resourceId: body.lotId,
      details: body
    };

    return { success: true };
  });

  fastify.post('/inventory/receive', {
    preHandler: [fastify.authenticate, fastify.requirePermission('inventory.receive')],
    schema: { body: receiveBodySchema }
  }, async (request) => {
    const body = request.body as {
      itemId: string;
      warehouseId: string;
      binId: string;
      lotCode: string;
      quantity: number;
      expirationDate?: string;
      documentId?: string;
    };
    const result = await inventoryService.receiveInventory({ ...body, user: request.authUser! });

    request.auditContext = {
      actionType: 'inventory_receive',
      resourceType: 'lot',
      resourceId: result.lotId,
      details: body
    };

    return { success: true, lotId: result.lotId };
  });

  fastify.post('/inventory/pick', {
    preHandler: [fastify.authenticate, fastify.requirePermission('inventory.pick')],
    schema: { body: pickBodySchema }
  }, async (request) => {
    const body = request.body as { lotId: string; binId: string; quantity: number };
    await inventoryService.pickInventory({ ...body, user: request.authUser! });

    request.auditContext = {
      actionType: 'inventory_pick',
      resourceType: 'lot',
      resourceId: body.lotId,
      details: body
    };

    return { success: true };
  });
};
