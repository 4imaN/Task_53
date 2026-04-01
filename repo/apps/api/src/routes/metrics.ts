import type { FastifyInstance } from 'fastify';

export const registerMetricsRoutes = async (fastify: FastifyInstance) => {
  fastify.get('/metrics/summary', {
    preHandler: [fastify.authenticate, fastify.requirePermission('metrics.read')]
  }, async () => {
    const result = await fastify.db.query(
      `
        SELECT metric_type, metric_value, period_start, period_end, warehouse_id
        FROM operational_metrics
        ORDER BY created_at DESC
        LIMIT 25
      `
    );

    return result.rows;
  });
};
