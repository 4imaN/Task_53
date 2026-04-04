import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { config } from '../config.js';
import { AuthService } from '../services/auth.service.js';

const usernameQuerySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['username'],
  properties: {
    username: { type: 'string', minLength: 1, maxLength: 255 }
  }
} as const;

const loginBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['username', 'password'],
  properties: {
    username: { type: 'string', minLength: 1, maxLength: 255 },
    password: { type: 'string', minLength: 1, maxLength: 255 },
    captchaId: { type: 'string', format: 'uuid' },
    captchaAnswer: { type: 'string', minLength: 1, maxLength: 255 },
    loginActor: { type: 'string', enum: ['administrator', 'manager', 'moderator', 'catalog-editor', 'warehouse-clerk'] }
  }
} as const;

const changePasswordBodySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['currentPassword', 'newPassword'],
  properties: {
    currentPassword: { type: 'string', minLength: 1, maxLength: 255 },
    newPassword: { type: 'string', minLength: 1, maxLength: 255 }
  }
} as const;

const sessionParamsSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['sessionId'],
  properties: {
    sessionId: { type: 'string', format: 'uuid' }
  }
} as const;

const buildLoginThrottleKey = (request: FastifyRequest) => {
  const body = request.body as { username?: unknown } | null | undefined;
  const username = typeof body?.username === 'string'
    ? body.username.trim().toLowerCase()
    : '';

  return `${request.ip}:${username || '__missing_username__'}`;
};

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

  fastify.get('/auth/login-hints', {
    schema: { querystring: usernameQuerySchema },
    config: {
      rateLimit: {
        max: config.loginHintsRateLimitMax,
        timeWindow: config.loginHintsRateLimitWindowMs
      }
    }
  }, async (request) => {
    const { username } = request.query as { username: string };
    return authService.getLoginHints(username);
  });

  fastify.get('/auth/captcha', {
    schema: { querystring: usernameQuerySchema }
  }, async (request) => {
    const { username } = request.query as { username: string };
    return authService.getCaptcha(username);
  });

  fastify.post('/auth/login', {
    schema: { body: loginBodySchema },
    config: {
      rateLimit: {
        hook: 'preHandler',
        max: config.loginRateLimitMax,
        timeWindow: config.loginRateLimitWindowMs,
        keyGenerator: buildLoginThrottleKey
      }
    }
  }, async (request, reply) => {
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
        secure: config.secureSessionCookie,
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
    reply.clearCookie('omnistock_session', {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.secureSessionCookie,
      path: '/'
    });
    return { success: true };
  });

  fastify.post('/auth/sessions/rotate', { preHandler: fastify.authenticate }, async (request, reply) => {
    try {
      const result = await authService.rotateSession({
        sessionId: request.authUser!.sessionId,
        userId: request.authUser!.id,
        authzVersion: request.authUser!.authzVersion,
        ipAddress: request.ip,
        userAgent: request.headers['user-agent']
      });

      reply.setCookie('omnistock_session', result.token, {
        httpOnly: true,
        sameSite: 'lax',
        secure: config.secureSessionCookie,
        path: '/'
      });

      return result;
    } catch (error) {
      return sendAuthError(reply, error);
    }
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

  fastify.post('/auth/change-password', {
    preHandler: fastify.authenticate,
    schema: { body: changePasswordBodySchema }
  }, async (request, reply) => {
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

  fastify.post('/auth/sessions/:sessionId/revoke', {
    preHandler: fastify.authenticate,
    schema: { params: sessionParamsSchema }
  }, async (request) => {
    const params = request.params as { sessionId: string };
    await authService.revokeSession(request.authUser!.id, params.sessionId);
    return { success: true };
  });
};
