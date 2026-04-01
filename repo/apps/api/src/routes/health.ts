import type { FastifyInstance } from 'fastify';

export const registerHealthRoutes = async (fastify: FastifyInstance) => {
  fastify.get('/health', async () => ({ status: 'ok', service: 'omnistock-api' }));
};
