import fp from 'fastify-plugin';
import cookie from '@fastify/cookie';
import jwt from '@fastify/jwt';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { config } from '../config.js';
import { AuthService } from '../services/auth.service.js';

export default fp(async (fastify) => {
  await fastify.register(cookie);
  await fastify.register(jwt, {
    secret: config.jwtSecret,
    cookie: {
      cookieName: 'omnistock_session',
      signed: false
    }
  });

  const authService = new AuthService(fastify);
  fastify.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const token = request.cookies.omnistock_session
        ?? request.headers.authorization?.replace(/^Bearer\s+/i, '');

      if (!token) {
        return reply.code(401).send({ message: 'Authentication required' });
      }

      const payload = await request.jwtVerify<{
        sub: string;
        sid: string;
        authzVersion: number;
        username: string;
        displayName: string;
        roleCodes: string[];
        permissionCodes: string[];
        assignedWarehouseIds: string[];
        departmentIds: string[];
      }>({ onlyCookie: false });

      const active = await authService.touchSession({
        sessionId: payload.sid,
        userId: payload.sub,
        authzVersion: payload.authzVersion
      });
      if (!active) {
        return reply.code(401).send({ message: 'Session expired or revoked' });
      }

      request.authUser = {
        id: payload.sub,
        sessionId: payload.sid,
        authzVersion: payload.authzVersion,
        username: payload.username,
        displayName: payload.displayName,
        roleCodes: payload.roleCodes,
        permissionCodes: payload.permissionCodes,
        assignedWarehouseIds: payload.assignedWarehouseIds,
        departmentIds: payload.departmentIds
      };
    } catch (error) {
      return reply.code(401).send({ message: 'Authentication required' });
    }
  });
});
