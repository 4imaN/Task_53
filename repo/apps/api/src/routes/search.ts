import type { FastifyInstance } from 'fastify';
import { SearchService } from '../services/search.service.js';

const searchQuerySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    item: { type: 'string', minLength: 1, maxLength: 255 },
    lot: { type: 'string', minLength: 1, maxLength: 255 },
    warehouseId: { type: 'string', format: 'uuid' },
    documentStatus: { type: 'string', enum: ['draft', 'submitted', 'approved', 'in_progress', 'completed', 'cancelled', 'archived'] },
    dateFrom: { anyOf: [{ type: 'string', format: 'date-time' }, { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' }] },
    dateTo: { anyOf: [{ type: 'string', format: 'date-time' }, { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' }] },
    sortBy: { type: 'string', enum: ['itemName', 'sku', 'warehouse', 'lot', 'documentStatus', 'updatedAt'] },
    sortDir: { type: 'string', enum: ['asc', 'desc'] },
    page: { type: 'integer', minimum: 1 },
    pageSize: { type: 'integer', minimum: 1, maximum: 100 }
  }
} as const;

const saveViewBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['viewName', 'filters'],
  properties: {
    viewName: { type: 'string', minLength: 1, maxLength: 120 },
    filters: { type: 'object' }
  }
} as const;

export const registerSearchRoutes = async (fastify: FastifyInstance) => {
  const searchService = new SearchService(fastify);

  fastify.get('/search', {
    preHandler: [fastify.authenticate, fastify.requirePermission('search.read')],
    schema: { querystring: searchQuerySchema }
  }, async (request) => {
    const query = request.query as Record<string, string | number | undefined>;
    return searchService.search(request.authUser!, {
      item: typeof query.item === 'string' ? query.item : undefined,
      lot: typeof query.lot === 'string' ? query.lot : undefined,
      warehouseId: typeof query.warehouseId === 'string' ? query.warehouseId : undefined,
      documentStatus: typeof query.documentStatus === 'string' ? query.documentStatus : undefined,
      dateFrom: typeof query.dateFrom === 'string' ? query.dateFrom : undefined,
      dateTo: typeof query.dateTo === 'string' ? query.dateTo : undefined,
      sortBy: typeof query.sortBy === 'string' ? query.sortBy : undefined,
      sortDir: query.sortDir as 'asc' | 'desc' | undefined,
      page: typeof query.page === 'number' ? query.page : undefined,
      pageSize: typeof query.pageSize === 'number' ? query.pageSize : undefined
    });
  });

  fastify.get('/search/views', {
    preHandler: [fastify.authenticate, fastify.requirePermission('saved_views.manage')]
  }, async (request) => {
    return searchService.listSavedViews(request.authUser!.id);
  });

  fastify.post('/search/views', {
    preHandler: [fastify.authenticate, fastify.requirePermission('saved_views.manage')],
    schema: { body: saveViewBodySchema }
  }, async (request, reply) => {
    const body = request.body as { viewName: string; filters: Record<string, unknown> };
    const result = await searchService.saveView(request.authUser!.id, body.viewName, body.filters);
    const savedView = result.savedView;

    request.auditContext = {
      actionType: 'saved_view_upsert',
      resourceType: 'saved_view',
      resourceId: savedView.id,
      details: { viewName: body.viewName }
    };

    return reply.code(result.operation === 'created' ? 201 : 200).send(savedView);
  });
};
