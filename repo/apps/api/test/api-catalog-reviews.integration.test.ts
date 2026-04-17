import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createIntegrationHarness, loginAsAdmin, loginAsUser, runIntegration } from './helpers/integration.js';

const describeIfIntegration = runIntegration ? describe : describe.skip;

describeIfIntegration('catalog reviews API integration', () => {
  const harness = createIntegrationHarness();

  const createFixtureItem = async (server: ReturnType<typeof createIntegrationHarness>['server']) => {
    const departmentResult = await server.db.query<{ id: string }>(
      `SELECT id FROM departments ORDER BY created_at ASC LIMIT 1`
    );
    const suffix = randomUUID().replace(/-/g, '').slice(0, 10);
    const itemResult = await server.db.query<{ id: string }>(
      `
        INSERT INTO items (department_id, sku, name, description, unit_of_measure, temperature_band, weight_lbs, length_in, width_in, height_in)
        VALUES ($1, $2, $3, 'Review integration fixture', 'ea', 'ambient', 1, 10, 10, 10)
        RETURNING id
      `,
      [departmentResult.rows[0].id, `REV-SKU-${suffix}`, `Review Item ${suffix}`]
    );
    return itemResult.rows[0].id;
  };

  it('POST /api/catalog/items/:itemId/reviews creates a review, persists it, updates item rating, and writes audit', async () => {
    const server = harness.server;
    const { token } = await loginAsAdmin(server);
    const itemId = await createFixtureItem(server);
    let reviewId: string | null = null;

    try {
      const response = await server.inject({
        method: 'POST',
        url: `/api/catalog/items/${itemId}/reviews`,
        headers: { authorization: `Bearer ${token}` },
        payload: { rating: 4, body: 'Solid warehouse item with reliable packaging' }
      });

      expect(response.statusCode).toBe(201);
      const body = response.json() as { reviewId: string };
      expect(body).toMatchObject({ reviewId: expect.any(String) });
      reviewId = body.reviewId;

      const reviewRow = await server.db.query<{ id: string; rating: number; body: string }>(
        `SELECT id, rating, body FROM reviews WHERE id = $1`,
        [reviewId]
      );
      expect(reviewRow.rowCount).toBe(1);
      expect(Number(reviewRow.rows[0].rating)).toBe(4);
      expect(reviewRow.rows[0].body).toBe('Solid warehouse item with reliable packaging');

      const itemRow = await server.db.query<{ average_rating: string; rating_count: string }>(
        `SELECT average_rating::text, rating_count::text FROM items WHERE id = $1`,
        [itemId]
      );
      expect(Number(itemRow.rows[0].average_rating)).toBeGreaterThan(0);
      expect(Number(itemRow.rows[0].rating_count)).toBeGreaterThanOrEqual(1);

      const auditRow = await server.db.query<{ action_type: string; resource_id: string }>(
        `SELECT action_type, resource_id FROM audit_log WHERE action_type = 'review_upsert' AND resource_id = $1 ORDER BY timestamp DESC LIMIT 1`,
        [itemId]
      );
      expect(auditRow.rowCount).toBe(1);
    } finally {
      if (reviewId) {
        await server.db.query(`DELETE FROM reviews WHERE id = $1`, [reviewId]);
      }
      await server.db.query(`DELETE FROM items WHERE id = $1`, [itemId]);
    }
  });

  it('POST /api/catalog/items/:itemId/reviews upserts an existing review instead of duplicating', async () => {
    const server = harness.server;
    const { token } = await loginAsAdmin(server);
    const itemId = await createFixtureItem(server);
    let reviewId: string | null = null;

    try {
      const firstResponse = await server.inject({
        method: 'POST',
        url: `/api/catalog/items/${itemId}/reviews`,
        headers: { authorization: `Bearer ${token}` },
        payload: { rating: 3, body: 'Initial review text' }
      });
      expect(firstResponse.statusCode).toBe(201);
      reviewId = (firstResponse.json() as { reviewId: string }).reviewId;

      const secondResponse = await server.inject({
        method: 'POST',
        url: `/api/catalog/items/${itemId}/reviews`,
        headers: { authorization: `Bearer ${token}` },
        payload: { rating: 5, body: 'Updated review after re-evaluation' }
      });
      expect(secondResponse.statusCode).toBe(201);
      const secondReviewId = (secondResponse.json() as { reviewId: string }).reviewId;
      expect(secondReviewId).toBe(reviewId);

      const reviewRow = await server.db.query<{ rating: number; body: string; edited_at: string | null }>(
        `SELECT rating, body, edited_at FROM reviews WHERE id = $1`,
        [reviewId]
      );
      expect(Number(reviewRow.rows[0].rating)).toBe(5);
      expect(reviewRow.rows[0].body).toBe('Updated review after re-evaluation');
      expect(reviewRow.rows[0].edited_at).not.toBeNull();

      const countResult = await server.db.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM reviews WHERE item_id = $1`,
        [itemId]
      );
      expect(Number(countResult.rows[0].count)).toBe(1);
    } finally {
      if (reviewId) {
        await server.db.query(`DELETE FROM reviews WHERE id = $1`, [reviewId]);
      }
      await server.db.query(`DELETE FROM items WHERE id = $1`, [itemId]);
    }
  });

  it('POST /api/catalog/items/:itemId/reviews returns 401 without auth', async () => {
    const server = harness.server;
    const response = await server.inject({
      method: 'POST',
      url: `/api/catalog/items/${randomUUID()}/reviews`,
      payload: { rating: 5, body: 'Unauthenticated review' }
    });
    expect(response.statusCode).toBe(401);
  });

  it('POST /api/catalog/items/:itemId/reviews returns 404 for nonexistent item', async () => {
    const server = harness.server;
    const { token } = await loginAsAdmin(server);
    const response = await server.inject({
      method: 'POST',
      url: `/api/catalog/items/${randomUUID()}/reviews`,
      headers: { authorization: `Bearer ${token}` },
      payload: { rating: 5, body: 'Review for missing item' }
    });
    expect(response.statusCode).toBe(404);
  });
});
