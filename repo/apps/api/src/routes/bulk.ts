import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { BulkImportService } from '../services/bulk-import.service.js';
import { AccessControlService } from '../services/access-control.service.js';

const allowedRoles = new Set(['administrator', 'manager', 'catalog_editor']);
const formatQuerySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    format: { type: 'string', enum: ['csv', 'xlsx'] }
  }
} as const;

const bulkFileBodySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    filename: { type: 'string', minLength: 1, maxLength: 255 },
    content: { type: 'string', minLength: 1 },
    contentBase64: { type: 'string', minLength: 1 }
  },
  anyOf: [
    { required: ['content'] },
    { required: ['contentBase64'] }
  ]
} as const;

const jobParamsSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['jobId'],
  properties: {
    jobId: { type: 'string', format: 'uuid' }
  }
} as const;

export const registerBulkRoutes = async (fastify: FastifyInstance) => {
  const bulkImportService = new BulkImportService(fastify);
  const accessControl = new AccessControlService(fastify);

  const requireBulkAccess = async (request: FastifyRequest, reply: FastifyReply) => {
    const roleCodes = request.authUser?.roleCodes ?? [];
    const hasAccess = roleCodes.some((role) => allowedRoles.has(role));
    if (!hasAccess) {
      return reply.code(403).send({ message: 'Bulk processing is restricted to administrators, managers, and catalog editors' });
    }
  };

  fastify.get('/bulk/templates/catalog-items', {
    preHandler: [fastify.authenticate, requireBulkAccess],
    schema: { querystring: formatQuerySchema }
  }, async (request, reply) => {
    const query = request.query as { format?: 'csv' | 'xlsx' };
    const format = query.format === 'xlsx' ? 'xlsx' : 'csv';
    const template = await bulkImportService.template(format);

    request.auditContext = {
      actionType: 'bulk_template_download',
      resourceType: 'batch_template',
      details: { entityType: 'catalog_item', format }
    };

    reply.header('content-type', template.contentType);
    reply.header('content-disposition', `attachment; filename="${template.filename}"`);
    return reply.send(template.body);
  });

  fastify.post('/bulk/catalog-items/precheck', {
    preHandler: [fastify.authenticate, requireBulkAccess],
    schema: { body: bulkFileBodySchema }
  }, async (request) => {
    const body = request.body as { filename?: string; content?: string; contentBase64?: string };
    const allowedDepartmentIds = await accessControl.getAllowedDepartmentIds(request.authUser!);
    if (allowedDepartmentIds !== null && !allowedDepartmentIds.length) {
      return {
        summary: {
          totalRows: 0,
          validRows: 0,
          warningRows: 0,
          errorRows: 0
        },
        rows: []
      };
    }

    return bulkImportService.precheckCatalogItems({
      filename: body.filename ?? 'catalog-items.csv',
      content: body.content,
      contentBase64: body.contentBase64
    }, allowedDepartmentIds);
  });

  fastify.post('/bulk/catalog-items/import', {
    preHandler: [fastify.authenticate, requireBulkAccess],
    schema: { body: bulkFileBodySchema }
  }, async (request) => {
    const body = request.body as { filename?: string; content?: string; contentBase64?: string };
    const allowedDepartmentIds = await accessControl.getAllowedDepartmentIds(request.authUser!);
    const result = await bulkImportService.importCatalogItems(
      request.authUser!.id,
      {
        filename: body.filename ?? 'catalog-items.csv',
        content: body.content,
        contentBase64: body.contentBase64
      },
      allowedDepartmentIds
    );

    request.auditContext = {
      actionType: result.status === 'completed' ? 'bulk_import_completed' : 'bulk_import_failed',
      resourceType: 'batch_job',
      resourceId: result.jobId,
      details: {
        entityType: 'catalog_item',
        status: result.status,
        summary: result.summary
      }
    };

    return result;
  });

  fastify.get('/bulk/catalog-items/export', {
    preHandler: [fastify.authenticate, requireBulkAccess],
    schema: { querystring: formatQuerySchema }
  }, async (request, reply) => {
    const query = request.query as { format?: 'csv' | 'xlsx' };
    const format = query.format === 'xlsx' ? 'xlsx' : 'csv';
    const allowedDepartmentIds = await accessControl.getAllowedDepartmentIds(request.authUser!);
    const exportFile = await bulkImportService.exportCatalogItems(format, allowedDepartmentIds);

    request.auditContext = {
      actionType: 'bulk_export_completed',
      resourceType: 'batch_export',
      details: { entityType: 'catalog_item', format }
    };

    reply.header('content-type', exportFile.contentType);
    reply.header('content-disposition', `attachment; filename="${exportFile.filename}"`);
    return reply.send(exportFile.body);
  });

  fastify.get('/bulk/jobs', {
    preHandler: [fastify.authenticate, requireBulkAccess]
  }, async (request) => {
    const allowedDepartmentIds = await accessControl.getAllowedDepartmentIds(request.authUser!);
    return bulkImportService.listJobsForUser(request.authUser!, allowedDepartmentIds);
  });

  fastify.get('/bulk/jobs/:jobId/results', {
    preHandler: [fastify.authenticate, requireBulkAccess],
    schema: { params: jobParamsSchema }
  }, async (request) => {
    const { jobId } = request.params as { jobId: string };
    const allowedDepartmentIds = await accessControl.getAllowedDepartmentIds(request.authUser!);
    return bulkImportService.jobResultsForUser(request.authUser!, jobId, allowedDepartmentIds);
  });
};
