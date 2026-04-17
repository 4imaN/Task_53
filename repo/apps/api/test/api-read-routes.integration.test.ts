import { describe, expect, it } from 'vitest';
import {
  createIntegrationHarness,
  createScopedPermissionUser,
  loginAsAdmin,
  loginAsUser,
  runIntegration
} from './helpers/integration.js';

const describeIfIntegration = runIntegration ? describe : describe.skip;

describeIfIntegration('read-only route integration', () => {
  const harness = createIntegrationHarness();

  // -------------------------------------------------------------------------
  // GET /api/metrics/summary
  // -------------------------------------------------------------------------

  it('GET /api/metrics/summary returns 200 with an array for admin', async () => {
    const server = harness.server;
    const { token } = await loginAsAdmin(server);

    const response = await server.inject({
      method: 'GET',
      url: '/api/metrics/summary',
      headers: { authorization: `Bearer ${token}` }
    });

    expect(response.statusCode).toBe(200);
    expect(Array.isArray(response.json())).toBe(true);
  });

  it('GET /api/metrics/summary returns 401 when unauthenticated', async () => {
    const server = harness.server;

    const response = await server.inject({
      method: 'GET',
      url: '/api/metrics/summary'
    });

    expect(response.statusCode).toBe(401);
  });

  it('GET /api/metrics/summary returns 403 for user without metrics.read', async () => {
    const server = harness.server;
    const scopedUser = await createScopedPermissionUser(server, {
      permissionCodes: ['search.read']
    });

    try {
      const { token } = await loginAsUser(server, scopedUser.username, scopedUser.password);

      const response = await server.inject({
        method: 'GET',
        url: '/api/metrics/summary',
        headers: { authorization: `Bearer ${token}` }
      });

      expect(response.statusCode).toBe(403);
    } finally {
      await scopedUser.cleanup();
    }
  });

  // -------------------------------------------------------------------------
  // GET /api/documents
  // -------------------------------------------------------------------------

  it('GET /api/documents returns 200 with an array for admin', async () => {
    const server = harness.server;
    const { token } = await loginAsAdmin(server);

    const response = await server.inject({
      method: 'GET',
      url: '/api/documents',
      headers: { authorization: `Bearer ${token}` }
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as Array<{ id: string; type: string; status: string }>;
    expect(Array.isArray(body)).toBe(true);
    if (body.length > 0) {
      expect(body[0]).toHaveProperty('id');
      expect(body[0]).toHaveProperty('type');
      expect(body[0]).toHaveProperty('status');
    }
  });

  it('GET /api/documents returns 401 when unauthenticated', async () => {
    const server = harness.server;

    const response = await server.inject({
      method: 'GET',
      url: '/api/documents'
    });

    expect(response.statusCode).toBe(401);
  });

  it('GET /api/documents returns 403 for user without search.read', async () => {
    const server = harness.server;
    const scopedUser = await createScopedPermissionUser(server, {
      permissionCodes: ['warehouses.read']
    });

    try {
      const { token } = await loginAsUser(server, scopedUser.username, scopedUser.password);

      const response = await server.inject({
        method: 'GET',
        url: '/api/documents',
        headers: { authorization: `Bearer ${token}` }
      });

      expect(response.statusCode).toBe(403);
    } finally {
      await scopedUser.cleanup();
    }
  });

  // -------------------------------------------------------------------------
  // GET /api/search/views
  // -------------------------------------------------------------------------

  it('GET /api/search/views returns 200 with an array for admin', async () => {
    const server = harness.server;
    const { token } = await loginAsAdmin(server);

    const response = await server.inject({
      method: 'GET',
      url: '/api/search/views',
      headers: { authorization: `Bearer ${token}` }
    });

    expect(response.statusCode).toBe(200);
    expect(Array.isArray(response.json())).toBe(true);
  });

  it('GET /api/search/views returns 401 when unauthenticated', async () => {
    const server = harness.server;

    const response = await server.inject({
      method: 'GET',
      url: '/api/search/views'
    });

    expect(response.statusCode).toBe(401);
  });

  it('GET /api/search/views returns 403 for user without saved_views.manage', async () => {
    const server = harness.server;
    const scopedUser = await createScopedPermissionUser(server, {
      permissionCodes: ['search.read']
    });

    try {
      const { token } = await loginAsUser(server, scopedUser.username, scopedUser.password);

      const response = await server.inject({
        method: 'GET',
        url: '/api/search/views',
        headers: { authorization: `Bearer ${token}` }
      });

      expect(response.statusCode).toBe(403);
    } finally {
      await scopedUser.cleanup();
    }
  });

  // -------------------------------------------------------------------------
  // GET /api/bulk/templates/catalog-items
  // -------------------------------------------------------------------------

  it('GET /api/bulk/templates/catalog-items returns 200 with a file attachment for admin', async () => {
    const server = harness.server;
    const { token } = await loginAsAdmin(server);

    const response = await server.inject({
      method: 'GET',
      url: '/api/bulk/templates/catalog-items',
      headers: { authorization: `Bearer ${token}` }
    });

    expect(response.statusCode).toBe(200);
    // Should be CSV or XLSX content type
    const contentType = response.headers['content-type'] as string;
    expect(
      contentType.includes('text/csv') ||
      contentType.includes('application/vnd.openxmlformats') ||
      contentType.includes('application/octet-stream')
    ).toBe(true);
    expect(response.headers['content-disposition']).toContain('attachment');
  });

  it('GET /api/bulk/templates/catalog-items returns 401 when unauthenticated', async () => {
    const server = harness.server;

    const response = await server.inject({
      method: 'GET',
      url: '/api/bulk/templates/catalog-items'
    });

    expect(response.statusCode).toBe(401);
  });

  it('GET /api/bulk/templates/catalog-items returns 403 for user without allowed role', async () => {
    const server = harness.server;
    const scopedUser = await createScopedPermissionUser(server, {
      permissionCodes: ['search.read']
    });

    try {
      const { token } = await loginAsUser(server, scopedUser.username, scopedUser.password);

      const response = await server.inject({
        method: 'GET',
        url: '/api/bulk/templates/catalog-items',
        headers: { authorization: `Bearer ${token}` }
      });

      expect(response.statusCode).toBe(403);
    } finally {
      await scopedUser.cleanup();
    }
  });

  // -------------------------------------------------------------------------
  // GET /api/access-control/options
  // -------------------------------------------------------------------------

  it('GET /api/access-control/options returns 200 with roles, warehouses, departments for admin', async () => {
    const server = harness.server;
    const { token } = await loginAsAdmin(server);

    const response = await server.inject({
      method: 'GET',
      url: '/api/access-control/options',
      headers: { authorization: `Bearer ${token}` }
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      roles: Array<{ id: string; code: string; name: string }>;
      warehouses: Array<{ id: string; code: string; name: string }>;
      departments: Array<{ id: string; code: string; name: string }>;
    };
    expect(Array.isArray(body.roles)).toBe(true);
    expect(Array.isArray(body.warehouses)).toBe(true);
    expect(Array.isArray(body.departments)).toBe(true);
    expect(body.roles.length).toBeGreaterThan(0);
  });

  it('GET /api/access-control/options returns 401 when unauthenticated', async () => {
    const server = harness.server;

    const response = await server.inject({
      method: 'GET',
      url: '/api/access-control/options'
    });

    expect(response.statusCode).toBe(401);
  });

  it('GET /api/access-control/options returns 403 for non-admin user', async () => {
    const server = harness.server;
    // manager.demo has users.manage equivalent but not administrator role
    const { token } = await loginAsUser(server, 'manager.demo', 'ManagerDemo!123');

    const response = await server.inject({
      method: 'GET',
      url: '/api/access-control/options',
      headers: { authorization: `Bearer ${token}` }
    });

    // manager does not have users.manage permission so will get 403
    expect(response.statusCode).toBe(403);
  });

  // -------------------------------------------------------------------------
  // GET /api/audit-log
  // -------------------------------------------------------------------------

  it('GET /api/audit-log returns 200 with an array for admin', async () => {
    const server = harness.server;
    const { token } = await loginAsAdmin(server);

    const response = await server.inject({
      method: 'GET',
      url: '/api/audit-log',
      headers: { authorization: `Bearer ${token}` }
    });

    expect(response.statusCode).toBe(200);
    expect(Array.isArray(response.json())).toBe(true);
  });

  it('GET /api/audit-log returns 401 when unauthenticated', async () => {
    const server = harness.server;

    const response = await server.inject({
      method: 'GET',
      url: '/api/audit-log'
    });

    expect(response.statusCode).toBe(401);
  });

  it('GET /api/audit-log returns 403 for user without audit.read', async () => {
    const server = harness.server;
    const scopedUser = await createScopedPermissionUser(server, {
      permissionCodes: ['search.read']
    });

    try {
      const { token } = await loginAsUser(server, scopedUser.username, scopedUser.password);

      const response = await server.inject({
        method: 'GET',
        url: '/api/audit-log',
        headers: { authorization: `Bearer ${token}` }
      });

      expect(response.statusCode).toBe(403);
    } finally {
      await scopedUser.cleanup();
    }
  });
});
