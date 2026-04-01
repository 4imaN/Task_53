import fp from 'fastify-plugin';
import rateLimit from '@fastify/rate-limit';

export default fp(async (fastify) => {
  await fastify.register(rateLimit, {
    global: true,
    max: 600,
    timeWindow: '1 minute',
    keyGenerator: (request) => request.ip,
    allowList: ['127.0.0.1']
  });
});
