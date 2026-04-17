import { rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createIntegrationHarness, loginAsAdmin, runIntegration } from './helpers/integration.js';

const describeIfIntegration = runIntegration ? describe : describe.skip;

// Minimal 1x1 PNG – valid PNG magic bytes and IHDR chunk
const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

/**
 * Creates an item and a review authored by admin, returning both IDs.
 * Caller is responsible for cleanup.
 */
const createAdminReview = async (
  server: ReturnType<typeof createIntegrationHarness>['server']
) => {
  const departmentResult = await server.db.query<{ id: string }>(
    `SELECT id FROM departments ORDER BY created_at ASC LIMIT 1`
  );
  const departmentId = departmentResult.rows[0].id;

  const suffix = randomUUID().replace(/-/g, '').slice(0, 12);
  const itemResult = await server.db.query<{ id: string }>(
    `
      INSERT INTO items (department_id, sku, name, description, unit_of_measure, temperature_band, weight_lbs, length_in, width_in, height_in)
      VALUES ($1, $2, $3, $4, 'ea', 'ambient', 0, 0, 0, 0)
      RETURNING id
    `,
    [
      departmentId,
      `IT-UPLOAD-${suffix}`,
      `Upload Test Item ${suffix}`,
      `Upload test fixture ${suffix}`
    ]
  );
  const itemId = itemResult.rows[0].id;

  const adminUserResult = await server.db.query<{ id: string }>(
    `SELECT id FROM users WHERE username = $1`,
    [process.env.DEFAULT_ADMIN_USERNAME ?? 'admin']
  );
  const adminUserId = adminUserResult.rows[0].id;

  const reviewResult = await server.db.query<{ id: string }>(
    `
      INSERT INTO reviews (item_id, user_id, rating, body)
      VALUES ($1, $2, 4, 'Upload integration test review')
      RETURNING id
    `,
    [itemId, adminUserId]
  );
  const reviewId = reviewResult.rows[0].id;

  return { itemId, reviewId, adminUserId };
};

describeIfIntegration('catalog upload and followup API integration', () => {
  const harness = createIntegrationHarness();

  // -------------------------------------------------------------------------
  // POST /api/catalog/reviews/:reviewId/followups
  // -------------------------------------------------------------------------

  it('creates a followup on an existing review and persists it in the DB', async () => {
    const server = harness.server;
    const { token } = await loginAsAdmin(server);
    const { itemId, reviewId } = await createAdminReview(server);

    try {
      const response = await server.inject({
        method: 'POST',
        url: `/api/catalog/reviews/${reviewId}/followups`,
        headers: { authorization: `Bearer ${token}` },
        payload: { body: 'Test followup text' }
      });

      expect(response.statusCode).toBe(201);
      expect(response.json()).toMatchObject({ success: true });

      const dbResult = await server.db.query<{ id: string; body: string }>(
        `SELECT id, body FROM review_followups WHERE parent_review_id = $1`,
        [reviewId]
      );
      expect(dbResult.rowCount).toBeGreaterThan(0);
      expect(dbResult.rows.some((row) => row.body === 'Test followup text')).toBe(true);
    } finally {
      await server.db.query(`DELETE FROM review_followups WHERE parent_review_id = $1`, [reviewId]);
      await server.db.query(`DELETE FROM reviews WHERE id = $1`, [reviewId]);
      await server.db.query(`DELETE FROM items WHERE id = $1`, [itemId]);
    }
  });

  it('returns 401 for unauthenticated followup POST', async () => {
    const server = harness.server;
    const missingReviewId = randomUUID();

    const response = await server.inject({
      method: 'POST',
      url: `/api/catalog/reviews/${missingReviewId}/followups`,
      payload: { body: 'No auth followup' }
    });

    expect(response.statusCode).toBe(401);
  });

  it('returns 404 when posting a followup to a nonexistent review', async () => {
    const server = harness.server;
    const { token } = await loginAsAdmin(server);
    const missingReviewId = randomUUID();

    const response = await server.inject({
      method: 'POST',
      url: `/api/catalog/reviews/${missingReviewId}/followups`,
      headers: { authorization: `Bearer ${token}` },
      payload: { body: 'Nonexistent review followup' }
    });

    expect(response.statusCode).toBe(404);
  });

  // -------------------------------------------------------------------------
  // POST /api/catalog/reviews/:reviewId/images
  // -------------------------------------------------------------------------

  it('uploads a valid PNG image to a review and persists the record in the DB', async () => {
    const server = harness.server;
    const { token } = await loginAsAdmin(server);
    const { itemId, reviewId } = await createAdminReview(server);
    let imageId: string | null = null;
    let filePath: string | null = null;

    try {
      const boundary = `----FormBoundary${randomUUID().replace(/-/g, '')}`;

      // Build a raw multipart body using binary-safe Buffer construction
      const preamble = [
        `--${boundary}`,
        'Content-Disposition: form-data; name="file"; filename="test.png"',
        'Content-Type: image/png',
        '',
        ''
      ].join('\r\n');

      const epilogue = `\r\n--${boundary}--\r\n`;

      const payload = Buffer.concat([
        Buffer.from(preamble, 'binary'),
        PNG_1x1,
        Buffer.from(epilogue, 'binary')
      ]);

      const response = await server.inject({
        method: 'POST',
        url: `/api/catalog/reviews/${reviewId}/images`,
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': `multipart/form-data; boundary=${boundary}`
        },
        payload
      });

      expect(response.statusCode).toBe(201);
      const body = response.json() as { imageId: string };
      expect(body).toHaveProperty('imageId');
      imageId = body.imageId;

      const dbResult = await server.db.query<{ id: string; file_path: string; mime_type: string }>(
        `SELECT id, file_path, mime_type FROM review_images WHERE id = $1`,
        [imageId]
      );
      expect(dbResult.rowCount).toBe(1);
      expect(dbResult.rows[0].mime_type).toBe('image/png');
      filePath = dbResult.rows[0].file_path;
    } finally {
      if (imageId) {
        await server.db.query(`DELETE FROM review_images WHERE id = $1`, [imageId]);
      }
      if (filePath) {
        await rm(filePath, { force: true });
      }
      await server.db.query(`DELETE FROM reviews WHERE id = $1`, [reviewId]);
      await server.db.query(`DELETE FROM items WHERE id = $1`, [itemId]);
    }
  });

  it('returns 401 for unauthenticated image upload', async () => {
    const server = harness.server;
    const missingReviewId = randomUUID();
    const boundary = `----FormBoundary${randomUUID().replace(/-/g, '')}`;

    const preamble = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="file"; filename="test.png"',
      'Content-Type: image/png',
      '',
      ''
    ].join('\r\n');
    const epilogue = `\r\n--${boundary}--\r\n`;
    const payload = Buffer.concat([
      Buffer.from(preamble, 'binary'),
      PNG_1x1,
      Buffer.from(epilogue, 'binary')
    ]);

    const response = await server.inject({
      method: 'POST',
      url: `/api/catalog/reviews/${missingReviewId}/images`,
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload
    });

    expect(response.statusCode).toBe(401);
  });

  it('returns 400 when no file is included in the image upload', async () => {
    const server = harness.server;
    const { token } = await loginAsAdmin(server);
    const { itemId, reviewId } = await createAdminReview(server);

    try {
      const boundary = `----FormBoundaryEmpty${randomUUID().replace(/-/g, '')}`;
      const payload = Buffer.from(`--${boundary}--\r\n`, 'binary');

      const response = await server.inject({
        method: 'POST',
        url: `/api/catalog/reviews/${reviewId}/images`,
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': `multipart/form-data; boundary=${boundary}`
        },
        payload
      });

      expect(response.statusCode).toBe(400);
    } finally {
      await server.db.query(`DELETE FROM reviews WHERE id = $1`, [reviewId]);
      await server.db.query(`DELETE FROM items WHERE id = $1`, [itemId]);
    }
  });

  it('returns 404 when uploading an image to a nonexistent review', async () => {
    const server = harness.server;
    const { token } = await loginAsAdmin(server);
    const missingReviewId = randomUUID();
    const boundary = `----FormBoundary${randomUUID().replace(/-/g, '')}`;

    const preamble = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="file"; filename="test.png"',
      'Content-Type: image/png',
      '',
      ''
    ].join('\r\n');
    const epilogue = `\r\n--${boundary}--\r\n`;
    const payload = Buffer.concat([
      Buffer.from(preamble, 'binary'),
      PNG_1x1,
      Buffer.from(epilogue, 'binary')
    ]);

    const response = await server.inject({
      method: 'POST',
      url: `/api/catalog/reviews/${missingReviewId}/images`,
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': `multipart/form-data; boundary=${boundary}`
      },
      payload
    });

    expect(response.statusCode).toBe(404);
  });
});
