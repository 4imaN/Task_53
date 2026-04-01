import { createServer } from 'node:http';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import argon2 from 'argon2';
import { describe, expect, it } from 'vitest';
import { createIntegrationHarness, loginAsAdmin, loginAsUser, runIntegration } from './helpers/integration.js';
import { signPayload } from '../src/utils/hmac.js';
import { SchedulerService } from '../src/services/scheduler.service.js';
import { WebhookDeliveryService } from '../src/services/webhook-delivery.service.js';

const describeIfIntegration = runIntegration ? describe : describe.skip;

const createDepartmentScopedUser = async (
  server: Awaited<ReturnType<typeof createIntegrationHarness>>['server'],
  input: {
    username: string;
    password: string;
    displayName: string;
    roleCode: string;
    departmentCodes: string[];
  }
) => {
  const passwordHash = await argon2.hash(input.password, { type: argon2.argon2id });
  const userResult = await server.db.query<{ id: string }>(
    `
      INSERT INTO users (username, display_name, password_hash, password_history)
      VALUES ($1, $2, $3, '[]'::jsonb)
      RETURNING id
    `,
    [input.username, input.displayName, passwordHash]
  );
  const userId = userResult.rows[0].id;

  const roleResult = await server.db.query<{ id: string }>(
    `SELECT id FROM roles WHERE code = $1`,
    [input.roleCode]
  );
  await server.db.query(
    `INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)`,
    [userId, roleResult.rows[0].id]
  );

  if (input.departmentCodes.length) {
    await server.db.query(
      `
        INSERT INTO attribute_rules (user_id, resource_type, resource_id, rule_type, metadata)
        SELECT $1, 'department', d.id, 'access', '{}'::jsonb
        FROM departments d
        WHERE d.code = ANY($2::text[])
      `,
      [userId, input.departmentCodes]
    );
  }

  return {
    userId,
    cleanup: async () => {
      await server.db.query(`DELETE FROM attribute_rules WHERE user_id = $1`, [userId]);
      await server.db.query(`DELETE FROM user_roles WHERE user_id = $1`, [userId]);
      await server.db.query(`DELETE FROM users WHERE id = $1`, [userId]);
    }
  };
};

describeIfIntegration('security and scheduler integration', () => {
  const harness = createIntegrationHarness();

  it('forbids a clerk from accessing another warehouse tree and bin timeline', async () => {
    const server = harness.server;
    const warehouseCode = `WH-EXT-${Date.now().toString().slice(-6)}`;
    const zoneCode = `ZONE-${Date.now().toString().slice(-4)}`;
    const binCode = `BIN-${Date.now().toString().slice(-4)}`;

    const warehouseResult = await server.db.query<{ id: string }>(
      `
        INSERT INTO warehouses (department_id, code, name, address)
        SELECT id, $1, 'Restricted Warehouse', '200 Remote Yard'
        FROM departments
        WHERE code = 'north-high'
        RETURNING id
      `,
      [warehouseCode]
    );
    const warehouseId = warehouseResult.rows[0].id;

    const zoneResult = await server.db.query<{ id: string }>(
      `
        INSERT INTO zones (warehouse_id, code, name)
        VALUES ($1, $2, 'Restricted Zone')
        RETURNING id
      `,
      [warehouseId, zoneCode]
    );
    const zoneId = zoneResult.rows[0].id;

    const binResult = await server.db.query<{ id: string }>(
      `
        INSERT INTO bins (zone_id, code, temperature_band, max_load_lbs, max_length_in, max_width_in, max_height_in)
        VALUES ($1, $2, 'ambient', 500, 36, 24, 24)
        RETURNING id
      `,
      [zoneId, binCode]
    );
    const binId = binResult.rows[0].id;

    const { token } = await loginAsUser(server, 'clerk.demo', 'ClerkDemo!123');

    const treeResponse = await server.inject({
      method: 'GET',
      url: `/api/warehouses/${warehouseId}/tree`,
      headers: { authorization: `Bearer ${token}` }
    });

    expect(treeResponse.statusCode).toBe(403);

    const timelineResponse = await server.inject({
      method: 'GET',
      url: `/api/bins/${binId}/timeline`,
      headers: { authorization: `Bearer ${token}` }
    });

    expect(timelineResponse.statusCode).toBe(403);

    await server.db.query(`DELETE FROM bins WHERE id = $1`, [binId]);
    await server.db.query(`DELETE FROM zones WHERE id = $1`, [zoneId]);
    await server.db.query(`DELETE FROM warehouses WHERE id = $1`, [warehouseId]);
  });

  it('forbids non catalog editors from answering Q&A threads through the API', async () => {
    const server = harness.server;
    const { token: clerkToken } = await loginAsUser(server, 'clerk.demo', 'ClerkDemo!123');
    const { token: managerToken } = await loginAsUser(server, 'manager.demo', 'ManagerDemo!123');
    const itemResult = await server.db.query<{ id: string }>(`SELECT id FROM items ORDER BY created_at ASC LIMIT 1`);
    const questionText = `Permission test question ${Date.now()}?`;

    const questionResponse = await server.inject({
      method: 'POST',
      url: `/api/catalog/items/${itemResult.rows[0].id}/questions`,
      headers: { authorization: `Bearer ${clerkToken}` },
      payload: { question: questionText }
    });

    expect(questionResponse.statusCode).toBe(201);
    const question = questionResponse.json() as { questionId: string };

    const answerResponse = await server.inject({
      method: 'POST',
      url: `/api/catalog/questions/${question.questionId}/answers`,
      headers: { authorization: `Bearer ${managerToken}` },
      payload: { body: 'Managers should not be able to answer' }
    });

    expect(answerResponse.statusCode).toBe(403);

    const answerCount = await server.db.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM qa_answers WHERE thread_id = $1`,
      [question.questionId]
    );
    expect(Number(answerCount.rows[0].count)).toBe(0);

    await server.db.query(`DELETE FROM qa_threads WHERE id = $1`, [question.questionId]);
  });

  it('enforces department ABAC across catalog item list and item actions', async () => {
    const server = harness.server;
    const timestamp = Date.now();
    const northSku = `SKU-NORTH-${timestamp}`;
    const southSku = `SKU-SOUTH-${timestamp}`;

    const northItemResult = await server.db.query<{ id: string }>(
      `
        INSERT INTO items (department_id, sku, name, unit_of_measure, temperature_band)
        SELECT d.id, $2, 'North Scoped Item', 'each', 'ambient'
        FROM departments d
        WHERE d.code = $1
        RETURNING id
      `,
      ['north-high', northSku]
    );
    const southItemResult = await server.db.query<{ id: string }>(
      `
        INSERT INTO items (department_id, sku, name, unit_of_measure, temperature_band)
        SELECT d.id, $2, 'South Scoped Item', 'each', 'ambient'
        FROM departments d
        WHERE d.code = $1
        RETURNING id
      `,
      ['south-middle', southSku]
    );
    const northItemId = northItemResult.rows[0].id;
    const southItemId = southItemResult.rows[0].id;

    const scopedUser = await createDepartmentScopedUser(server, {
      username: `catalog.north.${timestamp}`,
      password: 'CatalogNorth!123',
      displayName: 'Catalog North',
      roleCode: 'catalog_editor',
      departmentCodes: ['north-high']
    });

    try {
      const { token } = await loginAsUser(server, `catalog.north.${timestamp}`, 'CatalogNorth!123');

      const listResponse = await server.inject({
        method: 'GET',
        url: '/api/catalog/items',
        headers: { authorization: `Bearer ${token}` }
      });
      expect(listResponse.statusCode).toBe(200);
      expect(listResponse.body).toContain(northSku);
      expect(listResponse.body).not.toContain(southSku);

      const deniedItemResponse = await server.inject({
        method: 'GET',
        url: `/api/catalog/items/${southItemId}`,
        headers: { authorization: `Bearer ${token}` }
      });
      expect(deniedItemResponse.statusCode).toBe(403);

      const deniedQuestionResponse = await server.inject({
        method: 'POST',
        url: `/api/catalog/items/${southItemId}/questions`,
        headers: { authorization: `Bearer ${token}` },
        payload: { question: 'Should not be allowed?' }
      });
      expect(deniedQuestionResponse.statusCode).toBe(403);

      const allowedQuestionResponse = await server.inject({
        method: 'POST',
        url: `/api/catalog/items/${northItemId}/questions`,
        headers: { authorization: `Bearer ${token}` },
        payload: { question: 'Allowed in-scope question?' }
      });
      expect(allowedQuestionResponse.statusCode).toBe(201);
      const allowedQuestion = allowedQuestionResponse.json() as { questionId: string };
      await server.db.query(`DELETE FROM qa_threads WHERE id = $1`, [allowedQuestion.questionId]);
    } finally {
      await scopedUser.cleanup();
      await server.db.query(`DELETE FROM barcodes WHERE item_id IN ($1, $2)`, [northItemId, southItemId]);
      await server.db.query(`DELETE FROM items WHERE id IN ($1, $2)`, [northItemId, southItemId]);
    }
  });

  it('scopes bulk jobs and batch results by owner or department overlap', async () => {
    const server = harness.server;
    const timestamp = Date.now();
    const ownerUsername = `bulk.owner.${timestamp}`;
    const peerUsername = `bulk.peer.${timestamp}`;
    const outsiderUsername = `bulk.outsider.${timestamp}`;
    const ownerPassword = 'BulkOwner!123';
    const peerPassword = 'BulkPeer!123';
    const outsiderPassword = 'BulkOutsider!123';
    const importSku = `SKU-BULK-${timestamp}`;
    const importBarcode = `8800${timestamp}`;

    const owner = await createDepartmentScopedUser(server, {
      username: ownerUsername,
      password: ownerPassword,
      displayName: 'Bulk Owner',
      roleCode: 'catalog_editor',
      departmentCodes: ['north-high']
    });
    const peer = await createDepartmentScopedUser(server, {
      username: peerUsername,
      password: peerPassword,
      displayName: 'Bulk Peer',
      roleCode: 'catalog_editor',
      departmentCodes: ['north-high']
    });
    const outsider = await createDepartmentScopedUser(server, {
      username: outsiderUsername,
      password: outsiderPassword,
      displayName: 'Bulk Outsider',
      roleCode: 'catalog_editor',
      departmentCodes: ['south-middle']
    });

    try {
      const ownerLogin = await loginAsUser(server, ownerUsername, ownerPassword);
      const csv = [
        'department_code,sku,name,description,unit_of_measure,temperature_band,barcode,weight_lbs,length_in,width_in,height_in',
        `north-high,${importSku},Scoped Bulk Item,Imported by scoped user,each,ambient,${importBarcode},1,1,1,1`
      ].join('\n');

      const importResponse = await server.inject({
        method: 'POST',
        url: '/api/bulk/catalog-items/import',
        headers: { authorization: `Bearer ${ownerLogin.token}` },
        payload: {
          filename: 'scoped.csv',
          content: csv
        }
      });
      expect(importResponse.statusCode).toBe(200);
      const importPayload = importResponse.json() as { jobId: string };
      const jobId = importPayload.jobId;

      const peerLogin = await loginAsUser(server, peerUsername, peerPassword);
      const peerJobsResponse = await server.inject({
        method: 'GET',
        url: '/api/bulk/jobs',
        headers: { authorization: `Bearer ${peerLogin.token}` }
      });
      expect(peerJobsResponse.statusCode).toBe(200);
      expect(peerJobsResponse.body).toContain(jobId);

      const peerResultsResponse = await server.inject({
        method: 'GET',
        url: `/api/bulk/jobs/${jobId}/results`,
        headers: { authorization: `Bearer ${peerLogin.token}` }
      });
      expect(peerResultsResponse.statusCode).toBe(200);

      const outsiderLogin = await loginAsUser(server, outsiderUsername, outsiderPassword);
      const outsiderJobsResponse = await server.inject({
        method: 'GET',
        url: '/api/bulk/jobs',
        headers: { authorization: `Bearer ${outsiderLogin.token}` }
      });
      expect(outsiderJobsResponse.statusCode).toBe(200);
      expect(outsiderJobsResponse.body).not.toContain(jobId);

      const outsiderResultsResponse = await server.inject({
        method: 'GET',
        url: `/api/bulk/jobs/${jobId}/results`,
        headers: { authorization: `Bearer ${outsiderLogin.token}` }
      });
      expect(outsiderResultsResponse.statusCode).toBe(404);

      await server.db.query(`DELETE FROM batch_job_results WHERE batch_job_id = $1`, [jobId]);
      await server.db.query(`DELETE FROM batch_jobs WHERE id = $1`, [jobId]);
      await server.db.query(`DELETE FROM barcodes WHERE barcode = $1`, [importBarcode]);
      await server.db.query(`DELETE FROM items WHERE sku = $1`, [importSku]);
    } finally {
      await owner.cleanup();
      await peer.cleanup();
      await outsider.cleanup();
    }
  });

  it('maps write-endpoint schema validation failures to 422', async () => {
    const server = harness.server;
    const { token } = await loginAsAdmin(server);

    const invalidImportResponse = await server.inject({
      method: 'POST',
      url: '/api/bulk/catalog-items/import',
      headers: { authorization: `Bearer ${token}` },
      payload: {}
    });

    expect(invalidImportResponse.statusCode).toBe(422);
    expect(invalidImportResponse.json()).toMatchObject({
      statusCode: 422,
      error: 'Unprocessable Entity',
      message: 'Validation failed'
    });
  });

  it('enforces integration rate limits, timestamp freshness, replay protection, and department isolation', async () => {
    const server = harness.server;
    const clientKey = `integration-${Date.now()}`;
    const secret = Buffer.from(`secret-${Date.now()}`);
    const clientResult = await server.db.query<{ id: string }>(
      `
        INSERT INTO integration_clients (name, client_key, hmac_secret, allowed_departments, scopes, rate_limit_per_minute, is_active)
        VALUES ($1, $2, $3, '["district-ops"]'::jsonb, '["inventory:write"]'::jsonb, 5, TRUE)
        RETURNING id
      `,
      [clientKey, clientKey, secret]
    );

    const validPayload = {
      departmentCode: 'district-ops',
      records: [{ departmentCode: 'district-ops', sku: 'SKU-1001', quantity: 1 }]
    };
    const timestamp = String(Date.now());
    const signature = signPayload(`${timestamp}.${JSON.stringify(validPayload)}`, secret);

    const allowedResponse = await server.inject({
      method: 'POST',
      url: '/api/integrations/inventory-sync',
      headers: {
        'x-omnistock-client': clientKey,
        'x-omnistock-timestamp': timestamp,
        'x-omnistock-signature': signature
      },
      payload: validPayload
    });

    expect(allowedResponse.statusCode).toBe(200);

    const replayResponse = await server.inject({
      method: 'POST',
      url: '/api/integrations/inventory-sync',
      headers: {
        'x-omnistock-client': clientKey,
        'x-omnistock-timestamp': timestamp,
        'x-omnistock-signature': signature
      },
      payload: validPayload
    });

    expect(replayResponse.statusCode).toBe(409);

    const rateLimitedClientKey = `integration-rate-${Date.now()}`;
    const rateLimitedSecret = Buffer.from(`secret-rate-${Date.now()}`);
    await server.db.query(
      `
        INSERT INTO integration_clients (name, client_key, hmac_secret, allowed_departments, scopes, rate_limit_per_minute, is_active)
        VALUES ($1, $2, $3, '["district-ops"]'::jsonb, '["inventory:write"]'::jsonb, 1, TRUE)
      `,
      [rateLimitedClientKey, rateLimitedClientKey, rateLimitedSecret]
    );

    const rateLimitedTimestamp = String(Date.now() + 1);
    const rateLimitedSignature = signPayload(`${rateLimitedTimestamp}.${JSON.stringify(validPayload)}`, rateLimitedSecret);
    const firstLimitedResponse = await server.inject({
      method: 'POST',
      url: '/api/integrations/inventory-sync',
      headers: {
        'x-omnistock-client': rateLimitedClientKey,
        'x-omnistock-timestamp': rateLimitedTimestamp,
        'x-omnistock-signature': rateLimitedSignature
      },
      payload: validPayload
    });
    expect(firstLimitedResponse.statusCode).toBe(200);

    const secondRateLimitedTimestamp = String(Date.now() + 2);
    const rateLimitedResponse = await server.inject({
      method: 'POST',
      url: '/api/integrations/inventory-sync',
      headers: {
        'x-omnistock-client': rateLimitedClientKey,
        // Share one canonical timestamp for header + signature to prevent flaky 401s.
        'x-omnistock-timestamp': secondRateLimitedTimestamp,
        'x-omnistock-signature': signPayload(`${secondRateLimitedTimestamp}.${JSON.stringify(validPayload)}`, rateLimitedSecret)
      },
      payload: validPayload
    });

    expect(rateLimitedResponse.statusCode).toBe(429);

    const staleTimestamp = String(Date.now() - 10 * 60 * 1000);
    const staleResponse = await server.inject({
      method: 'POST',
      url: '/api/integrations/inventory-sync',
      headers: {
        'x-omnistock-client': clientKey,
        'x-omnistock-timestamp': staleTimestamp,
        'x-omnistock-signature': signPayload(`${staleTimestamp}.${JSON.stringify(validPayload)}`, secret)
      },
      payload: validPayload
    });

    expect(staleResponse.statusCode).toBe(401);

    const otherClientKey = `integration-dept-${Date.now()}`;
    const otherSecret = Buffer.from(`secret-dept-${Date.now()}`);
    await server.db.query(
      `
        INSERT INTO integration_clients (name, client_key, hmac_secret, allowed_departments, scopes, rate_limit_per_minute, is_active)
        VALUES ($1, $2, $3, '["district-ops"]'::jsonb, '["inventory:write"]'::jsonb, 5, TRUE)
      `,
      [otherClientKey, otherClientKey, otherSecret]
    );

    const deniedPayload = {
      departmentCode: 'south-middle',
      records: [{ departmentCode: 'south-middle', sku: 'SKU-1001', quantity: 1 }]
    };
    const deniedTimestamp = String(Date.now() + 2);
    const deniedResponse = await server.inject({
      method: 'POST',
      url: '/api/integrations/inventory-sync',
      headers: {
        'x-omnistock-client': otherClientKey,
        'x-omnistock-timestamp': deniedTimestamp,
        'x-omnistock-signature': signPayload(`${deniedTimestamp}.${JSON.stringify(deniedPayload)}`, otherSecret)
      },
      payload: deniedPayload
    });

    expect(deniedResponse.statusCode).toBe(403);

    await server.db.query(`DELETE FROM integration_clients WHERE id = $1`, [clientResult.rows[0].id]);
    await server.db.query(`DELETE FROM integration_clients WHERE client_key = $1`, [otherClientKey]);
    await server.db.query(`DELETE FROM integration_clients WHERE client_key = $1`, [rateLimitedClientKey]);
  });

  it('stores integration secrets encrypted at rest, keeps HMAC verification working, and does not leak secrets in listings', async () => {
    const server = harness.server;
    const { token } = await loginAsAdmin(server);
    const clientKey = `enc-client-${Date.now()}`;
    const secret = `super-secret-${Date.now()}`;

    const createResponse = await server.inject({
      method: 'POST',
      url: '/api/integration-clients',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        name: `Encrypted Client ${Date.now()}`,
        clientKey,
        hmacSecret: secret,
        allowedDepartments: ['district-ops'],
        scopes: ['inventory:write'],
        rateLimitPerMinute: 5
      }
    });

    expect(createResponse.statusCode).toBe(201);
    const created = createResponse.json() as { id: string };

    const rawResult = await server.db.query<{ raw_secret: string }>(
      `SELECT encode(hmac_secret, 'escape') AS raw_secret FROM integration_clients WHERE id = $1`,
      [created.id]
    );

    expect(rawResult.rows[0].raw_secret).not.toContain(secret);

    const decryptedResult = await server.db.query<{ matches: boolean }>(
      `
        SELECT pgp_sym_decrypt_bytea(hmac_secret, $2::text) = $1::bytea AS matches
        FROM integration_clients
        WHERE id = $3
      `,
      [Buffer.from(secret, 'utf8'), process.env.ENCRYPTION_KEY ?? 'replace-with-local-key', created.id]
    );

    expect(decryptedResult.rows[0].matches).toBe(true);

    const payload = {
      departmentCode: 'district-ops',
      records: [{ departmentCode: 'district-ops', sku: 'SKU-1001', quantity: 1 }]
    };
    const timestamp = String(Date.now());
    const signature = signPayload(`${timestamp}.${JSON.stringify(payload)}`, Buffer.from(secret, 'utf8'));

    const syncResponse = await server.inject({
      method: 'POST',
      url: '/api/integrations/inventory-sync',
      headers: {
        'x-omnistock-client': clientKey,
        'x-omnistock-timestamp': timestamp,
        'x-omnistock-signature': signature
      },
      payload
    });

    expect(syncResponse.statusCode).toBe(200);

    const listResponse = await server.inject({
      method: 'GET',
      url: '/api/integration-clients',
      headers: { authorization: `Bearer ${token}` }
    });

    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.body).not.toContain(secret);
    expect(listResponse.body).not.toContain('hmac_secret');

    await server.db.query(`DELETE FROM integration_clients WHERE id = $1`, [created.id]);
  });

  it('rejects unsafe webhook targets and accepts internal webhook targets for integration clients', async () => {
    const server = harness.server;
    const { token } = await loginAsAdmin(server);
    const unsafeClientKey = `unsafe-webhook-${Date.now()}`;
    const safeClientKey = `safe-webhook-${Date.now()}`;

    const unsafeResponse = await server.inject({
      method: 'POST',
      url: '/api/integration-clients',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        name: `Unsafe Webhook ${Date.now()}`,
        clientKey: unsafeClientKey,
        hmacSecret: 'unsafe-secret-value',
        allowedDepartments: ['district-ops'],
        scopes: ['inventory:write'],
        webhookUrl: 'https://example.com/webhook'
      }
    });

    expect(unsafeResponse.statusCode).toBe(422);
    expect(unsafeResponse.body).toContain('internal network host');

    const safeResponse = await server.inject({
      method: 'POST',
      url: '/api/integration-clients',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        name: `Safe Webhook ${Date.now()}`,
        clientKey: safeClientKey,
        hmacSecret: 'safe-secret-value',
        allowedDepartments: ['district-ops'],
        scopes: ['inventory:write'],
        webhookUrl: 'http://127.0.0.1:8080/webhook'
      }
    });

    expect(safeResponse.statusCode).toBe(201);

    const storedResult = await server.db.query<{ webhook_url: string | null }>(
      `SELECT webhook_url FROM integration_clients WHERE client_key = $1`,
      [safeClientKey]
    );

    expect(storedResult.rows[0]?.webhook_url).toBe('http://127.0.0.1:8080/webhook');

    await server.db.query(`DELETE FROM integration_clients WHERE client_key = $1`, [safeClientKey]);
  });

  it('stores user contact fields encrypted at rest and does not expose them in admin listings', async () => {
    const server = harness.server;
    const { token } = await loginAsAdmin(server);
    const username = `sensitive-${Date.now()}`;
    const phoneNumber = '+1-555-010-3344';
    const personalEmail = `sensitive-${Date.now()}@district.local`;

    const createUserResponse = await server.inject({
      method: 'POST',
      url: '/api/users',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        username,
        displayName: 'Sensitive Contact User',
        password: 'SensitiveUser!123',
        roleCodes: ['warehouse_clerk'],
        phoneNumber,
        personalEmail
      }
    });

    expect(createUserResponse.statusCode).toBe(201);
    const createdUser = createUserResponse.json() as { id: string };

    const rawContactResult = await server.db.query<{
      phone_raw: string | null;
      email_raw: string | null;
      phone_plain: string | null;
      email_plain: string | null;
    }>(
      `
        SELECT
          encode(phone_number, 'escape') AS phone_raw,
          encode(personal_email, 'escape') AS email_raw,
          pgp_sym_decrypt(phone_number, $2::text) AS phone_plain,
          pgp_sym_decrypt(personal_email, $2::text) AS email_plain
        FROM users
        WHERE id = $1
      `,
      [createdUser.id, process.env.ENCRYPTION_KEY ?? 'replace-with-local-key']
    );

    expect(rawContactResult.rows[0].phone_raw).not.toContain(phoneNumber);
    expect(rawContactResult.rows[0].email_raw).not.toContain(personalEmail);
    expect(rawContactResult.rows[0].phone_plain).toBe(phoneNumber);
    expect(rawContactResult.rows[0].email_plain).toBe(personalEmail);

    const listUsersResponse = await server.inject({
      method: 'GET',
      url: '/api/users',
      headers: { authorization: `Bearer ${token}` }
    });

    expect(listUsersResponse.statusCode).toBe(200);
    expect(listUsersResponse.body).not.toContain(phoneNumber);
    expect(listUsersResponse.body).not.toContain(personalEmail);
    expect(listUsersResponse.body).not.toContain('phone_number');
    expect(listUsersResponse.body).not.toContain('personal_email');

    await server.db.query(`DELETE FROM attribute_rules WHERE user_id = $1`, [createdUser.id]);
    await server.db.query(`DELETE FROM user_roles WHERE user_id = $1`, [createdUser.id]);
    await server.db.query(`DELETE FROM users WHERE id = $1`, [createdUser.id]);
  });

  it('persists successful webhook deliveries for configured integration clients', async () => {
    const server = harness.server;
    const clientKey = `webhook-success-${Date.now()}`;
    const secret = Buffer.from(`secret-${Date.now()}`);
    const receivedRequests: Array<{ headers: Record<string, string | string[] | undefined>; body: string }> = [];

    const webhookServer = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      req.on('end', () => {
        receivedRequests.push({
          headers: req.headers,
          body: Buffer.concat(chunks).toString('utf8')
        });
        res.statusCode = 204;
        res.end();
      });
    });

    await new Promise<void>((resolve) => webhookServer.listen(0, '127.0.0.1', () => resolve()));
    const address = webhookServer.address();
    if (!address || typeof address === 'string') {
      throw new Error('Expected webhook server to bind to an ephemeral port');
    }

    const webhookUrl = `http://127.0.0.1:${address.port}/hook`;
    const clientResult = await server.db.query<{ id: string }>(
      `
        INSERT INTO integration_clients (name, client_key, hmac_secret, allowed_departments, scopes, rate_limit_per_minute, webhook_url, is_active)
        VALUES ($1, $2, $3, '["district-ops"]'::jsonb, '["inventory:write"]'::jsonb, 5, $4, TRUE)
        RETURNING id
      `,
      [clientKey, clientKey, secret, webhookUrl]
    );

    const payload = {
      departmentCode: 'district-ops',
      records: [{ departmentCode: 'district-ops', sku: 'SKU-1001', quantity: 1 }]
    };
    const timestamp = String(Date.now());
    const signature = signPayload(`${timestamp}.${JSON.stringify(payload)}`, secret);

    const response = await server.inject({
      method: 'POST',
      url: '/api/integrations/inventory-sync',
      headers: {
        'x-omnistock-client': clientKey,
        'x-omnistock-timestamp': timestamp,
        'x-omnistock-signature': signature
      },
      payload
    });

    expect(response.statusCode).toBe(200);
    expect(receivedRequests).toHaveLength(1);

    const deliveryResult = await server.db.query<{ delivery_status: string; attempt_count: number; response_code: number | null }>(
      `
        SELECT delivery_status, attempt_count, response_code
        FROM webhook_deliveries
        WHERE integration_client_id = $1
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [clientResult.rows[0].id]
    );

    expect(deliveryResult.rows[0].delivery_status).toBe('delivered');
    expect(Number(deliveryResult.rows[0].attempt_count)).toBe(1);
    expect(deliveryResult.rows[0].response_code).toBe(204);
    expect(String(receivedRequests[0].headers['x-omnistock-event'])).toBe('inventory.sync.accepted');

    await new Promise<void>((resolve, reject) => webhookServer.close((error) => error ? reject(error) : resolve()));
    await server.db.query(`DELETE FROM webhook_deliveries WHERE integration_client_id = $1`, [clientResult.rows[0].id]);
    await server.db.query(`DELETE FROM integration_request_replays WHERE integration_client_id = $1`, [clientResult.rows[0].id]);
    await server.db.query(`DELETE FROM integration_clients WHERE id = $1`, [clientResult.rows[0].id]);
  });

  it('persists failed webhook deliveries after retry and backoff exhaustion', async () => {
    const server = harness.server;
    const clientKey = `webhook-fail-${Date.now()}`;
    const secret = Buffer.from(`secret-${Date.now()}`);
    const clientResult = await server.db.query<{ id: string }>(
      `
        INSERT INTO integration_clients (name, client_key, hmac_secret, allowed_departments, scopes, rate_limit_per_minute, webhook_url, is_active)
        VALUES ($1, $2, $3, '["district-ops"]'::jsonb, '["inventory:write"]'::jsonb, 5, $4, TRUE)
        RETURNING id
      `,
      [clientKey, clientKey, secret, 'http://127.0.0.1:9/unreachable']
    );

    const service = new WebhookDeliveryService(server, [1, 1], 200);
    const delivery = await service.deliverForClient(
      {
        id: clientResult.rows[0].id,
        client_key: clientKey,
        hmac_secret: secret,
        webhook_url: 'http://127.0.0.1:9/unreachable'
      },
      'inventory.sync.accepted',
      { records: [{ sku: 'SKU-1001', quantity: 1 }] }
    );

    expect(delivery?.status).toBe('failed');

    const deliveryResult = await server.db.query<{ delivery_status: string; attempt_count: number; response_code: number | null }>(
      `
        SELECT delivery_status, attempt_count, response_code
        FROM webhook_deliveries
        WHERE integration_client_id = $1
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [clientResult.rows[0].id]
    );

    expect(deliveryResult.rows[0].delivery_status).toBe('failed');
    expect(Number(deliveryResult.rows[0].attempt_count)).toBe(3);
    expect(deliveryResult.rows[0].response_code).toBeNull();

    await server.db.query(`DELETE FROM webhook_deliveries WHERE integration_client_id = $1`, [clientResult.rows[0].id]);
    await server.db.query(`DELETE FROM integration_clients WHERE id = $1`, [clientResult.rows[0].id]);
  });

  it('runs nightly metrics and archives completed documents older than 365 days', async () => {
    const server = harness.server;
    const scheduler = new SchedulerService(server);
    const { token } = await loginAsAdmin(server);
    const adminResult = await server.db.query<{ id: string }>(
      `SELECT id FROM users WHERE username = $1`,
      [process.env.DEFAULT_ADMIN_USERNAME ?? 'admin']
    );
    const adminId = adminResult.rows[0].id;
    const seedResult = await server.db.query<{
      warehouse_id: string;
      item_id: string;
      bin_id: string;
      lot_id: string;
    }>(
      `
        SELECT w.id AS warehouse_id, i.id AS item_id, b.id AS bin_id, l.id AS lot_id
        FROM items i
        JOIN lots l ON l.item_id = i.id
        JOIN warehouses w ON w.id = l.warehouse_id
        JOIN zones z ON z.warehouse_id = w.id
        JOIN bins b ON b.zone_id = z.id
        WHERE b.is_active = TRUE
          AND b.temperature_band = i.temperature_band
        ORDER BY i.created_at ASC
        LIMIT 1
      `
    );

    const seed = seedResult.rows[0];
    const referenceDate = new Date(2026, 2, 31, 2, 0, 0, 0);
    const periodStart = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate() - 1, 0, 0, 0, 0);
    const periodEnd = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate(), 0, 0, 0, 0);
    const receivingDocNumber = `RCV-JOB-${Date.now()}`;
    const archivedDocNumber = `ARC-JOB-${Date.now()}`;

    const receivingDocResult = await server.db.query<{ id: string }>(
      `
        INSERT INTO documents (warehouse_id, document_number, type, status, created_by, completed_at, payload, created_at, updated_at)
        VALUES ($1, $2, 'receiving', 'completed', $3, $4, '{}'::jsonb, $5, $5)
        RETURNING id
      `,
      [
        seed.warehouse_id,
        receivingDocNumber,
        adminId,
        new Date(periodStart.getTime() + 2 * 60 * 60 * 1000).toISOString(),
        new Date(periodStart.getTime() + 60 * 60 * 1000).toISOString()
      ]
    );
    const receivingDocId = receivingDocResult.rows[0].id;

    await server.db.query(
      `
        INSERT INTO inventory_transactions (warehouse_id, item_id, lot_id, target_bin_id, document_id, transaction_type, quantity, created_by, created_at)
        VALUES ($1, $2, $3, $4, $5, 'receive', 4, $6, $7)
      `,
      [
        seed.warehouse_id,
        seed.item_id,
        seed.lot_id,
        seed.bin_id,
        receivingDocId,
        adminId,
        new Date(periodStart.getTime() + (3 * 60 * 60 + 30 * 60) * 1000).toISOString()
      ]
    );

    await server.db.query(
      `
        INSERT INTO inventory_transactions (warehouse_id, item_id, lot_id, source_bin_id, document_id, transaction_type, quantity, created_by, created_at)
        VALUES ($1, $2, $3, $4, $5, 'pick', 1, $6, $7)
      `,
      [
        seed.warehouse_id,
        seed.item_id,
        seed.lot_id,
        seed.bin_id,
        receivingDocId,
        adminId,
        new Date(periodStart.getTime() + 5 * 60 * 60 * 1000).toISOString()
      ]
    );

    await server.db.query(
      `
        INSERT INTO abuse_reports (reporter_id, target_type, target_id, reason, reporter_status, moderation_status, resolved_at, created_at)
        VALUES ($1, 'review', $2, 'Scheduler SLA test', 'resolved', 'closed', $3, $4)
      `,
      [
        adminId,
        seed.item_id,
        new Date(periodStart.getTime() + 9 * 60 * 60 * 1000).toISOString(),
        new Date(periodStart.getTime() + 8 * 60 * 60 * 1000).toISOString()
      ]
    );

    const oldCompletedAt = new Date(referenceDate.getTime() - 500 * 24 * 60 * 60 * 1000);
    const archivedDocResult = await server.db.query<{ id: string }>(
      `
        INSERT INTO documents (warehouse_id, document_number, type, status, created_by, completed_at, payload, created_at, updated_at)
        VALUES ($1, $2, 'shipping', 'completed', $3, $4, '{}'::jsonb, $4, $4)
        RETURNING id
      `,
      [seed.warehouse_id, archivedDocNumber, adminId, oldCompletedAt.toISOString()]
    );
    const archivedDocId = archivedDocResult.rows[0].id;

    const result = await scheduler.runNightlyJobs(referenceDate);
    expect(result.metricsSummary).toMatchObject({ insertedMetricRows: expect.any(Number) });
    expect(result.archivalSummary).toMatchObject({ archivedCount: expect.any(Number) });

    const metricResult = await server.db.query<{ metric_type: string; metric_value: string }>(
      `
        SELECT metric_type, metric_value::text
        FROM operational_metrics
        WHERE period_start = $1
          AND period_end = $2
          AND metric_type IN ('put_away_time', 'pick_accuracy', 'review_resolution_sla')
      `,
      [periodStart.toISOString(), periodEnd.toISOString()]
    );

    expect(metricResult.rows.some((row) => row.metric_type === 'put_away_time' && Number(row.metric_value) > 0)).toBe(true);
    expect(metricResult.rows.some((row) => row.metric_type === 'pick_accuracy' && Number(row.metric_value) === 100)).toBe(true);
    expect(metricResult.rows.some((row) => row.metric_type === 'review_resolution_sla' && Number(row.metric_value) === 100)).toBe(true);

    const archiveResult = await server.db.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM archived_documents WHERE source_document_id = $1`,
      [archivedDocId]
    );
    expect(Number(archiveResult.rows[0].count)).toBe(1);

    const archivedStatus = await server.db.query<{ status: string }>(
      `SELECT status::text FROM documents WHERE id = $1`,
      [archivedDocId]
    );
    expect(archivedStatus.rows[0].status).toBe('archived');

    await server.db.query(`DELETE FROM operational_metrics WHERE period_start = $1 AND period_end = $2`, [periodStart.toISOString(), periodEnd.toISOString()]);
    await server.db.query(`DELETE FROM archived_documents WHERE source_document_id = $1`, [archivedDocId]);
    await server.db.query(`DELETE FROM document_workflows WHERE document_id IN ($1, $2)`, [receivingDocId, archivedDocId]);
    await server.db.query(`DELETE FROM inventory_transactions WHERE document_id = $1`, [receivingDocId]);
    await server.db.query(`DELETE FROM documents WHERE id IN ($1, $2)`, [receivingDocId, archivedDocId]);
    await server.db.query(`DELETE FROM abuse_reports WHERE reason = 'Scheduler SLA test' AND reporter_id = $1`, [adminId]);
    await server.db.query(`DELETE FROM batch_jobs WHERE job_type = 'scheduler_nightly'`);
  });
});
