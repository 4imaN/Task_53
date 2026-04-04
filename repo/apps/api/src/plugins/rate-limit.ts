import fp from 'fastify-plugin';
import rateLimit from '@fastify/rate-limit';
import type { FastifyRequest } from 'fastify';
import { config } from '../config.js';

const LOCALHOST_IPS = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

export default fp(async (fastify) => {
  await fastify.register(rateLimit, {
    global: true,
    max: config.apiRateLimitMax,
    timeWindow: config.apiRateLimitWindowMs,
    keyGenerator: (request) => request.ip,
    allowList: config.allowDevRateLimitBypassLocalhost
      ? ((request: FastifyRequest) => LOCALHOST_IPS.has(request.ip))
      : undefined
  });
});
