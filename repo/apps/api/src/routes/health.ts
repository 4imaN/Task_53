import type { FastifyInstance } from 'fastify';

export const registerHealthRoutes = async (fastify: FastifyInstance) => {
  fastify.get('/health', {
    preHandler: fastify.authenticate
  }, async () => ({ status: 'ok' }));
};
