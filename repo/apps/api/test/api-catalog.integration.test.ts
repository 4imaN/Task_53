import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createIntegrationHarness, loginAsAdmin, loginAsUser, runIntegration } from './helpers/integration.js';

const describeIfIntegration = runIntegration ? describe : describe.skip;

const createFixtureItem = async (
  server: ReturnType<typeof createIntegrationHarness>['server'],
  input: { departmentCode?: 'district-ops' | 'north-high' | 'south-middle' } = {}
) => {
  const suffix = randomUUID().replace(/-/g, '').slice(0, 12);
  const departmentResult = await server.db.query<{ id: string }>(
    `SELECT id FROM departments WHERE code = $1`,
    [input.departmentCode ?? 'district-ops']
  );
  const itemResult = await server.db.query<{ id: string }>(
    `
      INSERT INTO items (department_id, sku, name, description, unit_of_measure, temperature_band, weight_lbs, length_in, width_in, height_in)
      VALUES ($1, $2, $3, $4, 'ea', 'ambient', 0, 0, 0, 0)
      RETURNING id
    `,
    [
      departmentResult.rows[0].id,
      `IT-CAT-${suffix}`,
      `Catalog Fixture ${suffix}`,
      `Catalog fixture item ${suffix}`
    ]
  );

  return itemResult.rows[0].id;
};

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

describeIfIntegration('catalog API integration', () => {
  const harness = createIntegrationHarness();

  it('favorites an item, creates a Q&A thread, answers it, reports it, and exposes the updated detail view', async () => {
    const server = harness.server;
    const { token } = await loginAsAdmin(server);
    const userResult = await server.db.query<{ id: string }>(
      `SELECT id FROM users WHERE username = $1`,
      [process.env.DEFAULT_ADMIN_USERNAME ?? 'admin']
    );
    const userId = userResult.rows[0].id;
    const itemId = await createFixtureItem(server);
    const questionText = `Integration catalog question ${Date.now()}?`;
    let reportId: string | null = null;
    let questionId: string | null = null;

    try {
      const favoriteResponse = await server.inject({
        method: 'POST',
        url: `/api/catalog/items/${itemId}/favorite`,
        headers: {
          authorization: `Bearer ${token}`
        },
        payload: {
          favorite: true
        }
      });

      expect(favoriteResponse.statusCode).toBe(200);

      const questionResponse = await server.inject({
        method: 'POST',
        url: `/api/catalog/items/${itemId}/questions`,
        headers: {
          authorization: `Bearer ${token}`
        },
        payload: {
          question: questionText
        }
      });

      expect(questionResponse.statusCode).toBe(201);
      const question = questionResponse.json() as { questionId: string };
      questionId = question.questionId;

      const answerResponse = await server.inject({
        method: 'POST',
        url: `/api/catalog/questions/${question.questionId}/answers`,
        headers: {
          authorization: `Bearer ${token}`
        },
        payload: {
          body: 'Integration catalog answer'
        }
      });

      expect(answerResponse.statusCode).toBe(201);

      const reportResponse = await server.inject({
        method: 'POST',
        url: '/api/moderation/reports',
        headers: {
          authorization: `Bearer ${token}`
        },
        payload: {
          targetType: 'qa_thread',
          targetId: question.questionId,
          reason: 'Integration moderation report'
        }
      });

      expect(reportResponse.statusCode).toBe(200);
      const report = reportResponse.json() as { id: string };
      reportId = report.id;

      const statusResponse = await server.inject({
        method: 'POST',
        url: `/api/moderation/reports/${report.id}/status`,
        headers: {
          authorization: `Bearer ${token}`
        },
        payload: {
          reporterStatus: 'resolved',
          moderationStatus: 'closed',
          internalNotes: 'Integration moderation status update'
        }
      });

      expect(statusResponse.statusCode).toBe(200);
      const updatedReport = statusResponse.json() as {
        reporter_status: string;
        moderation_status: string;
        resolved_at: string | null;
      };
      expect(updatedReport.reporter_status).toBe('resolved');
      expect(updatedReport.moderation_status).toBe('closed');
      expect(updatedReport.resolved_at).toBeTruthy();

      const detailResponse = await server.inject({
        method: 'GET',
        url: `/api/catalog/items/${itemId}`,
        headers: {
          authorization: `Bearer ${token}`
        }
      });

      expect(detailResponse.statusCode).toBe(200);
      const detail = detailResponse.json() as {
        item: { is_favorited: boolean };
        questions: Array<{ id: string; answers: Array<{ body: string }> }>;
        favorites: Array<{ id: string }>;
        history: Array<{ item_id: string }>;
      };

      expect(detail.item.is_favorited).toBe(true);
      expect(detail.questions.some((entry) => entry.id === question.questionId)).toBe(true);
      expect(detail.favorites.some((entry) => entry.id === itemId)).toBe(true);
      expect(detail.history.some((entry) => entry.item_id === itemId)).toBe(true);
    } finally {
      if (reportId) {
        await server.db.query(`DELETE FROM abuse_reports WHERE id = $1`, [reportId]);
        await server.db.query(`DELETE FROM notifications WHERE user_id = $1 AND reference_id = $2`, [userId, reportId]);
      }
      if (questionId) {
        await server.db.query(`DELETE FROM qa_threads WHERE id = $1`, [questionId]);
      }
      await server.db.query(`DELETE FROM items WHERE id = $1`, [itemId]);
    }
  });

  it('allows catalog managers to update item details, forbids non-managers, audit-logs image exports, and blocks tampered images', async () => {
    const server = harness.server;
    const { token: adminToken } = await loginAsAdmin(server);
    const { token: managerToken } = await loginAsUser(server, 'manager.demo', 'ManagerDemo!123');
    const itemId = await createFixtureItem(server);
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'omnistock-review-image-'));
    const filePath = path.join(tmpDir, 'export-image.txt');
    const imageContent = 'catalog image export test';
    await writeFile(filePath, imageContent);

    let reviewId: string | null = null;
    let imageId: string | null = null;

    try {
      const updateDenied = await server.inject({
        method: 'PATCH',
        url: `/api/catalog/items/${itemId}`,
        headers: {
          authorization: `Bearer ${managerToken}`
        },
        payload: {
          name: 'Manager Should Not Update'
        }
      });
      expect(updateDenied.statusCode).toBe(403);

      const updateAllowed = await server.inject({
        method: 'PATCH',
        url: `/api/catalog/items/${itemId}`,
        headers: {
          authorization: `Bearer ${adminToken}`
        },
        payload: {
          name: 'Updated Catalog Item',
          description: 'Updated through integration coverage',
          unitOfMeasure: 'case',
          temperatureBand: 'ambient',
          weightLbs: 2,
          lengthIn: 12,
          widthIn: 10,
          heightIn: 8
        }
      });
      expect(updateAllowed.statusCode).toBe(200);
      expect(updateAllowed.body).toContain('Updated Catalog Item');

      const reviewResult = await server.db.query<{ id: string }>(
        `
          INSERT INTO reviews (item_id, user_id, rating, body)
          SELECT $1, id, 5, 'Image export review'
          FROM users
          WHERE username = $2
          RETURNING id
        `,
        [itemId, process.env.DEFAULT_ADMIN_USERNAME ?? 'admin']
      );
      reviewId = reviewResult.rows[0].id;

      const imageResult = await server.db.query<{ id: string }>(
        `
          INSERT INTO review_images (review_id, file_path, checksum_sha256, mime_type, file_size_bytes)
          VALUES ($1, $2, $3, 'text/plain', $4)
          RETURNING id
        `,
        [reviewId, filePath, sha256(imageContent), Buffer.byteLength(imageContent)]
      );
      imageId = imageResult.rows[0].id;

      const exportResponse = await server.inject({
        method: 'GET',
        url: `/api/catalog/review-images/${imageId}/content?download=true`,
        headers: {
          authorization: `Bearer ${adminToken}`
        }
      });

      expect(exportResponse.statusCode).toBe(200);
      expect(exportResponse.headers['content-disposition']).toContain('attachment');

      const auditResult = await server.db.query<{ action_type: string; resource_id: string; details: { download: boolean } }>(
        `
          SELECT action_type, resource_id::text, details
          FROM audit_log
          WHERE action_type = 'image_export'
            AND resource_id = $1
          ORDER BY timestamp DESC
          LIMIT 1
        `,
        [imageId]
      );

      expect(auditResult.rowCount).toBe(1);
      expect(auditResult.rows[0].action_type).toBe('image_export');
      expect(auditResult.rows[0].resource_id).toBe(imageId);
      expect((auditResult.rows[0].details as { download: boolean }).download).toBe(true);

      await writeFile(filePath, 'tampered export payload');

      const integrityResponse = await server.inject({
        method: 'GET',
        url: `/api/catalog/review-images/${imageId}/content?download=true`,
        headers: {
          authorization: `Bearer ${adminToken}`
        }
      });

      expect(integrityResponse.statusCode).toBe(409);
      expect(integrityResponse.json()).toEqual({ message: 'File integrity check failed' });

      const mismatchAudit = await server.db.query<{ action_type: string; resource_id: string }>(
        `
          SELECT action_type, resource_id::text
          FROM audit_log
          WHERE action_type = 'review_image_checksum_mismatch'
            AND resource_id = $1
          ORDER BY timestamp DESC
          LIMIT 1
        `,
        [imageId]
      );

      expect(mismatchAudit.rowCount).toBe(1);
      expect(mismatchAudit.rows[0].action_type).toBe('review_image_checksum_mismatch');
      expect(mismatchAudit.rows[0].resource_id).toBe(imageId);
    } finally {
      if (imageId) {
        await server.db.query(`DELETE FROM review_images WHERE id = $1`, [imageId]);
      }
      if (reviewId) {
        await server.db.query(`DELETE FROM reviews WHERE id = $1`, [reviewId]);
      }
      await server.db.query(`DELETE FROM items WHERE id = $1`, [itemId]);
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('returns deterministic 404s for well-formed nonexistent catalog item and question identifiers', async () => {
    const server = harness.server;
    const { token } = await loginAsAdmin(server);
    const missingItemId = randomUUID();
    const missingQuestionId = randomUUID();

    const [detailResponse, favoriteResponse, reviewResponse, questionResponse, answerResponse] = await Promise.all([
      server.inject({
        method: 'GET',
        url: `/api/catalog/items/${missingItemId}`,
        headers: {
          authorization: `Bearer ${token}`
        }
      }),
      server.inject({
        method: 'POST',
        url: `/api/catalog/items/${missingItemId}/favorite`,
        headers: {
          authorization: `Bearer ${token}`
        },
        payload: {
          favorite: true
        }
      }),
      server.inject({
        method: 'POST',
        url: `/api/catalog/items/${missingItemId}/reviews`,
        headers: {
          authorization: `Bearer ${token}`
        },
        payload: {
          rating: 5,
          body: 'Missing item review'
        }
      }),
      server.inject({
        method: 'POST',
        url: `/api/catalog/items/${missingItemId}/questions`,
        headers: {
          authorization: `Bearer ${token}`
        },
        payload: {
          question: 'Missing item question?'
        }
      }),
      server.inject({
        method: 'POST',
        url: `/api/catalog/questions/${missingQuestionId}/answers`,
        headers: {
          authorization: `Bearer ${token}`
        },
        payload: {
          body: 'Missing question answer'
        }
      })
    ]);

    for (const response of [detailResponse, favoriteResponse, reviewResponse, questionResponse]) {
      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({
        statusCode: 404,
        message: 'Item not found'
      });
      expect(response.body).not.toContain('"item":null');
    }

    expect(answerResponse.statusCode).toBe(404);
    expect(answerResponse.json()).toMatchObject({
      statusCode: 404,
      message: 'Question not found'
    });
    expect(answerResponse.body).not.toContain('violates foreign key');
    expect(answerResponse.body).not.toContain('Internal server error');
  });

  it('applies the same department scoping to detail favorites and history as the dedicated endpoints', async () => {
    const server = harness.server;
    const userResult = await server.db.query<{ id: string }>(
      `SELECT id FROM users WHERE username = 'catalog.demo'`
    );
    const southDepartmentResult = await server.db.query<{ id: string }>(
      `SELECT id FROM departments WHERE code = 'south-middle'`
    );
    const userId = userResult.rows[0].id;
    const southDepartmentId = southDepartmentResult.rows[0].id;
    const districtItemId = await createFixtureItem(server, { departmentCode: 'district-ops' });
    const southItemId = await createFixtureItem(server, { departmentCode: 'south-middle' });

    try {
      await server.db.query(
        `
          INSERT INTO attribute_rules (user_id, resource_type, resource_id, rule_type, metadata)
          VALUES ($1, 'department', $2, 'access', '{}'::jsonb)
          ON CONFLICT DO NOTHING
        `,
        [userId, southDepartmentId]
      );
      const { token } = await loginAsUser(server, 'catalog.demo', 'CatalogDemo!123');

      for (const itemId of [districtItemId, southItemId]) {
        const favoriteResponse = await server.inject({
          method: 'POST',
          url: `/api/catalog/items/${itemId}/favorite`,
          headers: { authorization: `Bearer ${token}` },
          payload: { favorite: true }
        });
        expect(favoriteResponse.statusCode).toBe(200);

        const detailResponse = await server.inject({
          method: 'GET',
          url: `/api/catalog/items/${itemId}`,
          headers: { authorization: `Bearer ${token}` }
        });
        expect(detailResponse.statusCode).toBe(200);
      }

      await server.db.query(
        `
          DELETE FROM attribute_rules
          WHERE user_id = $1
            AND resource_type = 'department'
            AND resource_id = $2
            AND rule_type = 'access'
        `,
        [userId, southDepartmentId]
      );
      const { token: narrowedToken } = await loginAsUser(server, 'catalog.demo', 'CatalogDemo!123');

      const [favoritesResponse, historyResponse, detailResponse] = await Promise.all([
        server.inject({
          method: 'GET',
          url: '/api/catalog/favorites',
          headers: { authorization: `Bearer ${narrowedToken}` }
        }),
        server.inject({
          method: 'GET',
          url: '/api/catalog/history',
          headers: { authorization: `Bearer ${narrowedToken}` }
        }),
        server.inject({
          method: 'GET',
          url: `/api/catalog/items/${districtItemId}`,
          headers: { authorization: `Bearer ${narrowedToken}` }
        })
      ]);

      expect(favoritesResponse.statusCode).toBe(200);
      expect(historyResponse.statusCode).toBe(200);
      expect(detailResponse.statusCode).toBe(200);

      const favorites = favoritesResponse.json() as Array<{ id: string }>;
      const history = historyResponse.json() as Array<{ item_id: string }>;
      const detail = detailResponse.json() as {
        favorites: Array<{ id: string }>;
        history: Array<{ item_id: string }>;
      };

      const favoriteIds = new Set(favorites.map((entry) => entry.id));
      const historyIds = new Set(history.map((entry) => entry.item_id));
      const detailFavoriteIds = new Set(detail.favorites.map((entry) => entry.id));
      const detailHistoryIds = new Set(detail.history.map((entry) => entry.item_id));

      expect(favoriteIds.has(districtItemId)).toBe(true);
      expect(favoriteIds.has(southItemId)).toBe(false);
      expect(historyIds.has(districtItemId)).toBe(true);
      expect(historyIds.has(southItemId)).toBe(false);
      expect(detailFavoriteIds.has(districtItemId)).toBe(true);
      expect(detailFavoriteIds.has(southItemId)).toBe(false);
      expect(detailHistoryIds.has(districtItemId)).toBe(true);
      expect(detailHistoryIds.has(southItemId)).toBe(false);
      expect(detailFavoriteIds.has(districtItemId)).toBe(favoriteIds.has(districtItemId));
      expect(detailHistoryIds.has(districtItemId)).toBe(historyIds.has(districtItemId));
    } finally {
      await server.db.query(
        `DELETE FROM favorites WHERE user_id = $1 AND item_id = ANY($2::uuid[])`,
        [userId, [districtItemId, southItemId]]
      );
      await server.db.query(
        `DELETE FROM browsing_history WHERE user_id = $1 AND item_id = ANY($2::uuid[])`,
        [userId, [districtItemId, southItemId]]
      );
      await server.db.query(
        `
          DELETE FROM attribute_rules
          WHERE user_id = $1
            AND resource_type = 'department'
            AND resource_id = $2
            AND rule_type = 'access'
        `,
        [userId, southDepartmentId]
      );
      await server.db.query(`DELETE FROM items WHERE id = ANY($1::uuid[])`, [[districtItemId, southItemId]]);
    }
  });
});
