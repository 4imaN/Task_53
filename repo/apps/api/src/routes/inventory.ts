import type { FastifyInstance } from 'fastify';
import { InventoryService } from '../services/inventory.service.js';

const invalidQuantity = () => Object.assign(new Error('Quantity must be greater than zero'), { statusCode: 422 });

export const registerInventoryRoutes = async (fastify: FastifyInstance) => {
  const inventoryService = new InventoryService(fastify);

  fastify.post('/inventory/scan', {
    preHandler: [fastify.authenticate, fastify.requirePermission(['inventory.receive'])]
  }, async (request) => {
    const body = request.body as { code: string };
    return inventoryService.lookupScan(body.code, request.authUser!);
  });

  fastify.post('/inventory/move', {
    preHandler: [fastify.authenticate, fastify.requirePermission('inventory.move')]
  }, async (request) => {
    const body = request.body as { lotId: string; sourceBinId: string; targetBinId: string; quantity: number };
    if (!Number.isFinite(Number(body.quantity)) || Number(body.quantity) <= 0) {
      throw invalidQuantity();
    }
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
    preHandler: [fastify.authenticate, fastify.requirePermission('inventory.receive')]
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
    if (!Number.isFinite(Number(body.quantity)) || Number(body.quantity) <= 0) {
      throw invalidQuantity();
    }
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
    preHandler: [fastify.authenticate, fastify.requirePermission('inventory.pick')]
  }, async (request) => {
    const body = request.body as { lotId: string; binId: string; quantity: number };
    if (!Number.isFinite(Number(body.quantity)) || Number(body.quantity) <= 0) {
      throw invalidQuantity();
    }
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
