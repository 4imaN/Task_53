import { describe, expect, it } from 'vitest';
import { createIntegrationHarness, loginAsAdmin, runIntegration } from './helpers/integration.js';

const describeIfIntegration = runIntegration ? describe : describe.skip;

describeIfIntegration('health API integration', () => {
  const harness = createIntegrationHarness();

  it('GET /api/health returns 200 with status ok for an authenticated user', async () => {
    const server = harness.server;
    const { token } = await loginAsAdmin(server);

    const response = await server.inject({
      method: 'GET',
      url: '/api/health',
      headers: { authorization: `Bearer ${token}` }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
  });

  it('GET /api/health returns 401 when called without a token', async () => {
    const server = harness.server;

    const response = await server.inject({
      method: 'GET',
      url: '/api/health'
    });

    expect(response.statusCode).toBe(401);
  });
});
