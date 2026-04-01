import type { FastifyInstance, FastifyReply } from 'fastify';
import { AuthService } from '../services/auth.service.js';

export const registerAuthRoutes = async (fastify: FastifyInstance) => {
  const authService = new AuthService(fastify);
  const sendAuthError = (
    reply: FastifyReply,
    error: unknown
  ) => {
    const handledError = error as Error & {
      statusCode?: number;
      details?: Record<string, unknown>;
    };
    const statusCode = handledError.statusCode ?? 500;
    if (statusCode >= 500) {
      return reply.code(statusCode).send({
        statusCode,
        error: 'Internal Server Error',
        message: 'Internal server error'
      });
    }

    return reply.code(statusCode).send({
      statusCode,
      error: handledError.name,
      message: handledError.message,
      ...(handledError.details ?? {})
    });
  };

  fastify.get('/auth/login-hints', async (request) => {
    const { username } = request.query as { username: string };
    return authService.getLoginHints(username);
  });

  fastify.get('/auth/captcha', async (request) => {
    const { username } = request.query as { username: string };
    return authService.getCaptcha(username);
  });

  fastify.post('/auth/login', async (request, reply) => {
    const body = request.body as {
      username: string;
      password: string;
      captchaId?: string;
      captchaAnswer?: string;
      loginActor?: 'administrator' | 'manager' | 'moderator' | 'catalog-editor' | 'warehouse-clerk';
    };

    try {
      const result = await authService.login({
        ...body,
        ipAddress: request.ip,
        userAgent: request.headers['user-agent']
      });

      reply.setCookie('omnistock_session', result.token, {
        httpOnly: true,
        sameSite: 'lax',
        path: '/'
      });

      return result;
    } catch (error) {
      return sendAuthError(reply, error);
    }
  });

  fastify.post('/auth/logout', { preHandler: fastify.authenticate }, async (request, reply) => {
    const sessionId = request.authUser!.sessionId;
    await authService.revokeSession(request.authUser!.id, sessionId);
    reply.clearCookie('omnistock_session', { path: '/' });
    return { success: true };
  });

  fastify.get('/auth/sessions', { preHandler: fastify.authenticate }, async (request) => {
    return authService.listSessions(request.authUser!.id);
  });

  fastify.get('/auth/me', { preHandler: fastify.authenticate }, async (request) => {
    const currentUser = await authService.getCurrentUser(request.authUser!.id);

    return {
      ...currentUser,
      sid: request.authUser!.sessionId
    };
  });

  fastify.post('/auth/change-password', { preHandler: fastify.authenticate }, async (request, reply) => {
    const body = request.body as { currentPassword: string; newPassword: string };
    try {
      await authService.changePassword({
        userId: request.authUser!.id,
        currentPassword: body.currentPassword,
        newPassword: body.newPassword,
        ipAddress: request.ip
      });

      return { success: true };
    } catch (error) {
      return sendAuthError(reply, error);
    }
  });

  fastify.post('/auth/sessions/:sessionId/revoke', { preHandler: fastify.authenticate }, async (request) => {
    const params = request.params as { sessionId: string };
    await authService.revokeSession(request.authUser!.id, params.sessionId);
    return { success: true };
  });
};
