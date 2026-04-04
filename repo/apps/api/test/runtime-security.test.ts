import { afterEach, describe, expect, it, vi } from 'vitest';

const originalEnv = { ...process.env };

const applyBaseEnv = (overrides: Record<string, string | undefined> = {}) => {
  process.env = {
    ...originalEnv,
    DATABASE_URL: 'postgres://test-user@localhost:5432/postgres',
    JWT_SECRET: 'test-jwt-secret',
    ENCRYPTION_KEY: 'test-encryption-key',
    DEFAULT_ADMIN_PASSWORD: 'ChangeMeNow!123',
    APP_ENV: 'production',
    TRUST_PROXY: '0',
    API_RATE_LIMIT_MAX: '600',
    API_RATE_LIMIT_WINDOW_MS: '60000',
    ...overrides
  };
};

const createLoginPayload = () => ({
  token: 'mock-token',
  user: {
    sub: 'user-1',
    sid: 'sid-1',
    authzVersion: 1,
    username: 'admin',
    displayName: 'Admin',
    roleCodes: ['administrator'],
    permissionCodes: ['users.manage'],
    assignedWarehouseIds: [],
    departmentIds: []
  }
});

const stubAuthenticatedSession = async () => {
  const authModule = await import('../src/services/auth.service.js');
  vi.spyOn(authModule.AuthService.prototype, 'touchSession').mockResolvedValue(true);
};

const createHealthAuthHeader = (server: any) => ({
  authorization: `Bearer ${server.jwt.sign(createLoginPayload().user)}`
});

afterEach(() => {
  process.env = { ...originalEnv };
  vi.restoreAllMocks();
  vi.resetModules();
});

describe('runtime transport and rate-limit security', () => {
  it('sets secure session cookies by default and only disables them in explicit dev mode', async () => {
    applyBaseEnv();
    const authModule = await import('../src/services/auth.service.js');
    vi.spyOn(authModule.AuthService.prototype, 'login').mockResolvedValue(createLoginPayload());
    let server: any = null;

    try {
      const serverModule = await import('../src/server.js');
      server = await serverModule.buildServer({ logger: false });
      await server.ready();

      const response = await server.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: {
          username: 'admin',
          password: 'ChangeMeNow!123'
        }
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['set-cookie']).toContain('Secure');
      expect(response.headers['set-cookie']).toContain('HttpOnly');
      expect(response.headers['set-cookie']).toContain('SameSite=Lax');
    } finally {
      await server?.close();
    }

    applyBaseEnv({
      APP_ENV: 'development',
      ALLOW_INSECURE_DEV_COOKIES: '1'
    });
    vi.resetModules();
    const insecureAuthModule = await import('../src/services/auth.service.js');
    vi.spyOn(insecureAuthModule.AuthService.prototype, 'login').mockResolvedValue(createLoginPayload());
    let insecureServer: any = null;

    try {
      const serverModule = await import('../src/server.js');
      insecureServer = await serverModule.buildServer({ logger: false });
      await insecureServer.ready();

      const response = await insecureServer.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: {
          username: 'admin',
          password: 'ChangeMeNow!123'
        }
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['set-cookie']).not.toContain('Secure');
      expect(response.headers['set-cookie']).toContain('HttpOnly');
    } finally {
      await insecureServer?.close();
    }
  });

  it('protects the health endpoint and keeps its response minimal', async () => {
    applyBaseEnv();
    await stubAuthenticatedSession();
    const { buildServer } = await import('../src/server.js');
    const server = await buildServer({ logger: false });
    await server.ready();

    try {
      const unauthenticated = await server.inject({ method: 'GET', url: '/api/health' });
      expect(unauthenticated.statusCode).toBe(401);

      const authenticated = await server.inject({
        method: 'GET',
        url: '/api/health',
        headers: createHealthAuthHeader(server)
      });
      expect(authenticated.statusCode).toBe(200);
      expect(authenticated.json()).toEqual({ status: 'ok' });
    } finally {
      await server.close();
    }
  });

  it('does not bypass the global API rate limit in non-development mode', async () => {
    applyBaseEnv({
      APP_ENV: 'production',
      API_RATE_LIMIT_MAX: '1',
      API_RATE_LIMIT_WINDOW_MS: '60000'
    });

    await stubAuthenticatedSession();
    const { buildServer } = await import('../src/server.js');
    const server = await buildServer({ logger: false });
    await server.ready();

    try {
      const headers = createHealthAuthHeader(server);
      const first = await server.inject({ method: 'GET', url: '/api/health', headers });
      const second = await server.inject({ method: 'GET', url: '/api/health', headers });

      expect(first.statusCode).toBe(200);
      expect(second.statusCode).toBe(429);
    } finally {
      await server.close();
    }
  });

  it('only enables localhost rate-limit bypass when explicitly configured for development', async () => {
    applyBaseEnv({
      APP_ENV: 'development',
      API_RATE_LIMIT_MAX: '1',
      API_RATE_LIMIT_WINDOW_MS: '60000',
      ALLOW_DEV_RATE_LIMIT_LOCALHOST_BYPASS: '1'
    });

    await stubAuthenticatedSession();
    const { buildServer } = await import('../src/server.js');
    const server = await buildServer({ logger: false });
    await server.ready();

    try {
      const headers = createHealthAuthHeader(server);
      const first = await server.inject({ method: 'GET', url: '/api/health', headers });
      const second = await server.inject({ method: 'GET', url: '/api/health', headers });

      expect(first.statusCode).toBe(200);
      expect(second.statusCode).toBe(200);
    } finally {
      await server.close();
    }
  });
});
