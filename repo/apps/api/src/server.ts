import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import dbPlugin from './plugins/db.js';
import auditPlugin from './plugins/audit.js';
import authPlugin from './plugins/auth.js';
import rbacPlugin from './plugins/rbac.js';
import rateLimitPlugin from './plugins/rate-limit.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerHealthRoutes } from './routes/health.js';
import { registerSearchRoutes } from './routes/search.js';
import { registerWarehouseRoutes } from './routes/warehouses.js';
import { registerInventoryRoutes } from './routes/inventory.js';
import { registerModerationRoutes } from './routes/moderation.js';
import { registerIntegrationRoutes } from './routes/integrations.js';
import { registerMetricsRoutes } from './routes/metrics.js';
import { registerCatalogRoutes } from './routes/catalog.js';
import { registerAdminRoutes } from './routes/admin.js';
import { registerDocumentRoutes } from './routes/documents.js';
import { registerBulkRoutes } from './routes/bulk.js';

const redactSensitiveText = (value: string): string => value
  .replace(/\bpostgres(?:ql)?:\/\/[^\s)]+/gi, '[REDACTED_DSN]')
  .replace(/\b[\w.-]*(?:jwt|token|secret|password|encryption[_-]?key|api[_-]?key)[\w.-]*\s*[=:]\s*[^\s,;]+/gi, '[REDACTED_SECRET]')
  .replace(/\bBearer\s+[A-Za-z0-9\-._~+/]+=*/gi, 'Bearer [REDACTED_TOKEN]');

export const sanitizeErrorForLog = (error: unknown): { name: string; message: string; stack?: string } => {
  if (!(error instanceof Error)) {
    return {
      name: 'Error',
      message: 'Unknown error'
    };
  }

  return {
    name: redactSensitiveText(error.name || 'Error'),
    message: redactSensitiveText(error.message || 'Internal server error'),
    stack: typeof error.stack === 'string' ? redactSensitiveText(error.stack) : undefined
  };
};

export const buildServer = async (options: { logger?: Parameters<typeof Fastify>[0]['logger'] } = {}) => {
  const fastify = Fastify({
    logger: options.logger ?? true,
    schemaErrorFormatter: (errors, dataVar) => {
      const validationError = new Error('Validation failed') as Error & {
        code?: string;
        statusCode?: number;
        validation?: typeof errors;
        validationContext?: string;
        details?: Array<{
          field: string;
          message: string;
          keyword: string | undefined;
        }>;
      };
      validationError.code = 'FST_ERR_VALIDATION';
      validationError.statusCode = 422;
      validationError.validation = errors;
      validationError.validationContext = dataVar;
      validationError.details = errors.map((entry) => ({
        field: entry.instancePath || dataVar,
        message: entry.message || 'Invalid value',
        keyword: entry.keyword
      }));
      return validationError;
    }
  });

  await fastify.register(multipart);
  await fastify.register(dbPlugin);
  await fastify.register(rateLimitPlugin);
  await fastify.register(authPlugin);
  await fastify.register(rbacPlugin);
  await fastify.register(auditPlugin);

  await fastify.register(async (api) => {
    await registerHealthRoutes(api);
    await registerAuthRoutes(api);
    await registerSearchRoutes(api);
    await registerWarehouseRoutes(api);
    await registerInventoryRoutes(api);
    await registerModerationRoutes(api);
    await registerIntegrationRoutes(api);
    await registerMetricsRoutes(api);
    await registerCatalogRoutes(api);
    await registerAdminRoutes(api);
    await registerDocumentRoutes(api);
    await registerBulkRoutes(api);
  }, { prefix: '/api' });

  fastify.setErrorHandler((error, request, reply) => {
    request.log.error({ error: sanitizeErrorForLog(error) }, 'request_error');
    const handledError = error as Error & {
      code?: string;
      statusCode?: number;
      validation?: Array<{
        instancePath?: string;
        message?: string;
        keyword?: string;
        params?: unknown;
      }>;
      validationContext?: string;
      details?: Record<string, unknown>;
    };

    const statusCode = handledError.statusCode ?? 500;
    const validationDetails = Array.isArray(handledError.validation) ? handledError.validation : [];
    const hasValidationContext = typeof handledError.validationContext === 'string';
    const isValidationError = validationDetails.length > 0
      || handledError.code === 'FST_ERR_VALIDATION'
      || (statusCode === 400 && hasValidationContext);

    if (isValidationError) {
      reply.status(422).send({
        statusCode: 422,
        error: 'Unprocessable Entity',
        message: 'Validation failed',
        details: validationDetails.map((entry) => ({
          field: entry.instancePath || '',
          message: entry.message || 'Invalid value',
          keyword: entry.keyword
        }))
      });
      return;
    }

    if (statusCode >= 500) {
      reply.status(statusCode).send({
        statusCode,
        error: 'Internal Server Error',
        message: 'Internal server error'
      });
      return;
    }

    reply.status(statusCode).send({
      error: handledError.name,
      message: handledError.message,
      statusCode,
      ...(handledError.details ?? {})
    });
  });

  return fastify;
};
