import type { FastifyInstance } from 'fastify';
import { SearchService } from '../services/search.service.js';

export const registerSearchRoutes = async (fastify: FastifyInstance) => {
  const searchService = new SearchService(fastify);

  fastify.get('/search', {
    preHandler: [fastify.authenticate, fastify.requirePermission('search.read')]
  }, async (request) => {
    const query = request.query as Record<string, string | undefined>;
    return searchService.search(request.authUser!, {
      item: query.item,
      lot: query.lot,
      warehouseId: query.warehouseId,
      documentStatus: query.documentStatus,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
      sortBy: query.sortBy,
      sortDir: query.sortDir as 'asc' | 'desc' | undefined,
      page: query.page ? Number(query.page) : undefined,
      pageSize: query.pageSize ? Number(query.pageSize) : undefined
    });
  });

  fastify.get('/search/views', {
    preHandler: [fastify.authenticate, fastify.requirePermission('saved_views.manage')]
  }, async (request) => {
    return searchService.listSavedViews(request.authUser!.id);
  });

  fastify.post('/search/views', {
    preHandler: [fastify.authenticate, fastify.requirePermission('saved_views.manage')]
  }, async (request) => {
    const body = request.body as { viewName: string; filters: Record<string, unknown> };
    const savedView = await searchService.saveView(request.authUser!.id, body.viewName, body.filters);

    request.auditContext = {
      actionType: 'saved_view_upsert',
      resourceType: 'saved_view',
      resourceId: savedView.id,
      details: { viewName: body.viewName }
    };

    return savedView;
  });
};
