import { beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../../src/server.js';

export const runIntegration = process.env.RUN_DB_TESTS === '1';

export const createIntegrationHarness = () => {
  let server: FastifyInstance;

  beforeAll(async () => {
    server = await buildServer();
    await server.ready();
  });

  afterAll(async () => {
    await server.close();
  });

  return {
    get server() {
      return server;
    }
  };
};

export const loginAsAdmin = async (server: FastifyInstance) => {
  return loginAsUser(
    server,
    process.env.DEFAULT_ADMIN_USERNAME ?? 'admin',
    process.env.DEFAULT_ADMIN_PASSWORD ?? 'ChangeMeNow!123'
  );
};

export const loginAsUser = async (server: FastifyInstance, username: string, password: string) => {
  const response = await server.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: {
      username,
      password
    }
  });

  if (response.statusCode !== 200) {
    throw new Error(`Login failed for ${username} with ${response.statusCode}: ${response.body}`);
  }

  const body = response.json() as { token: string };
  return {
    token: body.token
  };
};
