import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createIntegrationHarness, loginAsAdmin, loginAsUser, runIntegration } from './helpers/integration.js';

const describeIfIntegration = runIntegration ? describe : describe.skip;

const createReviewTarget = async (
  server: ReturnType<typeof createIntegrationHarness>['server'],
  input: { departmentCode: 'district-ops' | 'south-middle'; suffix: string }
) => {
  const adminResult = await server.db.query<{ id: string }>(
    `SELECT id FROM users WHERE username = $1`,
    [process.env.DEFAULT_ADMIN_USERNAME ?? 'admin']
  );
  const adminId = adminResult.rows[0].id;

  const departmentResult = await server.db.query<{ id: string }>(
    `SELECT id FROM departments WHERE code = $1`,
    [input.departmentCode]
  );
  const departmentId = departmentResult.rows[0].id;

  const itemResult = await server.db.query<{ id: string }>(
    `
      INSERT INTO items (department_id, sku, name, description, unit_of_measure, temperature_band)
      VALUES ($1, $2, $3, 'Moderation scope fixture', 'each', 'ambient')
      RETURNING id
    `,
    [departmentId, `MOD-SCOPE-${input.departmentCode}-${input.suffix}`, `Moderation ${input.departmentCode} ${input.suffix}`]
  );
  const itemId = itemResult.rows[0].id;

  const reviewResult = await server.db.query<{ id: string }>(
    `
      INSERT INTO reviews (item_id, user_id, rating, body)
      VALUES ($1, $2, 4, $3)
      RETURNING id
    `,
    [itemId, adminId, `Moderation review ${input.suffix}`]
  );

  return { itemId, reviewId: reviewResult.rows[0].id, adminId };
};

describeIfIntegration('moderation API integration', () => {
  const harness = createIntegrationHarness();

  it('rejects invalid moderation payloads and nonexistent targets with deterministic 4xx responses', async () => {
    const server = harness.server;
    const { token } = await loginAsAdmin(server);

    const invalidTypeResponse = await server.inject({
      method: 'POST',
      url: '/api/moderation/reports',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        targetType: 'item',
        targetId: randomUUID(),
        reason: 'Invalid target type'
      }
    });
    expect(invalidTypeResponse.statusCode).toBe(422);

    const invalidIdResponse = await server.inject({
      method: 'POST',
      url: '/api/moderation/reports',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        targetType: 'review',
        targetId: 'not-a-uuid',
        reason: 'Malformed id'
      }
    });
    expect(invalidIdResponse.statusCode).toBe(422);

    const missingTargetResponse = await server.inject({
      method: 'POST',
      url: '/api/moderation/reports',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        targetType: 'review',
        targetId: randomUUID(),
        reason: 'Missing target'
      }
    });
    expect(missingTargetResponse.statusCode).toBe(404);
    expect(missingTargetResponse.json()).toMatchObject({
      message: 'Review not found'
    });
  });

  it('rejects out-of-scope report creation and filters the moderation queue to authorized departments', async () => {
    const server = harness.server;
    const suffix = randomUUID().slice(0, 8);
    const districtTarget = await createReviewTarget(server, { departmentCode: 'district-ops', suffix: `${suffix}-district` });
    const southTarget = await createReviewTarget(server, { departmentCode: 'south-middle', suffix: `${suffix}-south` });
    const { token: adminToken } = await loginAsAdmin(server);
    const { token: moderatorToken } = await loginAsUser(server, 'moderator.demo', 'ModeratorDemo!123');

    let districtReportId: string | null = null;
    let southReportId: string | null = null;

    try {
      const outOfScopeCreate = await server.inject({
        method: 'POST',
        url: '/api/moderation/reports',
        headers: { authorization: `Bearer ${moderatorToken}` },
        payload: {
          targetType: 'review',
          targetId: southTarget.reviewId,
          reason: 'Should be blocked outside department scope'
        }
      });

      expect(outOfScopeCreate.statusCode).toBe(403);
      expect(outOfScopeCreate.json()).toMatchObject({
        message: 'Target is outside your department scope'
      });

      const districtReportResponse = await server.inject({
        method: 'POST',
        url: '/api/moderation/reports',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          targetType: 'review',
          targetId: districtTarget.reviewId,
          reason: 'District moderation scope'
        }
      });
      expect(districtReportResponse.statusCode).toBe(200);
      districtReportId = (districtReportResponse.json() as { id: string }).id;

      const southReportResponse = await server.inject({
        method: 'POST',
        url: '/api/moderation/reports',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          targetType: 'review',
          targetId: southTarget.reviewId,
          reason: 'South moderation scope'
        }
      });
      expect(southReportResponse.statusCode).toBe(200);
      southReportId = (southReportResponse.json() as { id: string }).id;

      const moderatorQueueResponse = await server.inject({
        method: 'GET',
        url: '/api/moderation/queue',
        headers: { authorization: `Bearer ${moderatorToken}` }
      });
      expect(moderatorQueueResponse.statusCode).toBe(200);
      const moderatorQueue = moderatorQueueResponse.json() as Array<{ id: string; target_id: string }>;
      expect(moderatorQueue.some((entry) => entry.id === districtReportId)).toBe(true);
      expect(moderatorQueue.some((entry) => entry.id === southReportId)).toBe(false);

      const adminQueueResponse = await server.inject({
        method: 'GET',
        url: '/api/moderation/queue',
        headers: { authorization: `Bearer ${adminToken}` }
      });
      expect(adminQueueResponse.statusCode).toBe(200);
      const adminQueue = adminQueueResponse.json() as Array<{ id: string }>;
      expect(adminQueue.some((entry) => entry.id === districtReportId)).toBe(true);
      expect(adminQueue.some((entry) => entry.id === southReportId)).toBe(true);
    } finally {
      await server.db.query(
        `DELETE FROM notifications WHERE reference_id = ANY($1::uuid[])`,
        [[districtReportId, southReportId].filter(Boolean)]
      );
      await server.db.query(
        `DELETE FROM abuse_reports WHERE id = ANY($1::uuid[])`,
        [[districtReportId, southReportId].filter(Boolean)]
      );
      await server.db.query(`DELETE FROM reviews WHERE id = ANY($1::uuid[])`, [[districtTarget.reviewId, southTarget.reviewId]]);
      await server.db.query(`DELETE FROM items WHERE id = ANY($1::uuid[])`, [[districtTarget.itemId, southTarget.itemId]]);
    }
  });

  it('deduplicates repeated active reports and allows re-reporting after resolution', async () => {
    const server = harness.server;
    const { token } = await loginAsAdmin(server);
    const adminResult = await server.db.query<{ id: string }>(
      `SELECT id FROM users WHERE username = $1`,
      [process.env.DEFAULT_ADMIN_USERNAME ?? 'admin']
    );
    const adminId = adminResult.rows[0].id;
    const target = await createReviewTarget(server, {
      departmentCode: 'district-ops',
      suffix: `dedupe-${Date.now().toString().slice(-6)}`
    });
    let firstReportId: string | null = null;
    let reopenedReportId: string | null = null;

    try {
      const firstResponse = await server.inject({
        method: 'POST',
        url: '/api/moderation/reports',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          targetType: 'review',
          targetId: target.reviewId,
          reason: 'Duplicate moderation coverage'
        }
      });
      expect(firstResponse.statusCode).toBe(200);
      firstReportId = (firstResponse.json() as { id: string }).id;

      const duplicateResponse = await server.inject({
        method: 'POST',
        url: '/api/moderation/reports',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          targetType: 'review',
          targetId: target.reviewId,
          reason: 'Duplicate moderation coverage'
        }
      });
      expect(duplicateResponse.statusCode).toBe(200);
      expect((duplicateResponse.json() as { id: string }).id).toBe(firstReportId);

      const activeReportCount = await server.db.query<{ count: string }>(
        `
          SELECT COUNT(*)::text AS count
          FROM abuse_reports
          WHERE reporter_id = $1
            AND target_type = 'review'
            AND target_id = $2
            AND resolved_at IS NULL
        `,
        [adminId, target.reviewId]
      );
      expect(Number(activeReportCount.rows[0].count)).toBe(1);

      const notificationCount = await server.db.query<{ count: string }>(
        `
          SELECT COUNT(*)::text AS count
          FROM notifications
          WHERE user_id = $1
            AND reference_type = 'abuse_report'
            AND reference_id = $2
        `,
        [adminId, firstReportId]
      );
      expect(Number(notificationCount.rows[0].count)).toBe(1);

      const resolveResponse = await server.inject({
        method: 'POST',
        url: `/api/moderation/reports/${firstReportId}/status`,
        headers: { authorization: `Bearer ${token}` },
        payload: {
          reporterStatus: 'resolved',
          moderationStatus: 'closed',
          internalNotes: 'Closed for re-report coverage'
        }
      });
      expect(resolveResponse.statusCode).toBe(200);

      const queueResponse = await server.inject({
        method: 'GET',
        url: '/api/moderation/queue',
        headers: { authorization: `Bearer ${token}` }
      });
      expect(queueResponse.statusCode).toBe(200);
      expect((queueResponse.json() as Array<{ id: string }>).some((entry) => entry.id === firstReportId)).toBe(false);

      const reopenedResponse = await server.inject({
        method: 'POST',
        url: '/api/moderation/reports',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          targetType: 'review',
          targetId: target.reviewId,
          reason: 'Duplicate moderation coverage'
        }
      });
      expect(reopenedResponse.statusCode).toBe(200);
      reopenedReportId = (reopenedResponse.json() as { id: string }).id;
      expect(reopenedReportId).not.toBe(firstReportId);

      const totalReports = await server.db.query<{ total_count: string; active_count: string }>(
        `
          SELECT
            COUNT(*)::text AS total_count,
            COUNT(*) FILTER (WHERE resolved_at IS NULL)::text AS active_count
          FROM abuse_reports
          WHERE reporter_id = $1
            AND target_type = 'review'
            AND target_id = $2
        `,
        [adminId, target.reviewId]
      );
      expect(Number(totalReports.rows[0].total_count)).toBe(2);
      expect(Number(totalReports.rows[0].active_count)).toBe(1);
    } finally {
      await server.db.query(
        `DELETE FROM notifications WHERE reference_id = ANY($1::uuid[])`,
        [[firstReportId, reopenedReportId].filter(Boolean)]
      );
      await server.db.query(
        `DELETE FROM abuse_reports WHERE id = ANY($1::uuid[])`,
        [[firstReportId, reopenedReportId].filter(Boolean)]
      );
      await server.db.query(`DELETE FROM reviews WHERE id = $1`, [target.reviewId]);
      await server.db.query(`DELETE FROM items WHERE id = $1`, [target.itemId]);
    }
  });

  it('remains race-safe when duplicate reports are submitted at nearly the same time', async () => {
    const server = harness.server;
    const { token } = await loginAsAdmin(server);
    const adminResult = await server.db.query<{ id: string }>(
      `SELECT id FROM users WHERE username = $1`,
      [process.env.DEFAULT_ADMIN_USERNAME ?? 'admin']
    );
    const adminId = adminResult.rows[0].id;
    const target = await createReviewTarget(server, {
      departmentCode: 'district-ops',
      suffix: `race-${Date.now().toString().slice(-6)}`
    });
    let reportId: string | null = null;

    try {
      const [firstResponse, secondResponse] = await Promise.all([
        server.inject({
          method: 'POST',
          url: '/api/moderation/reports',
          headers: { authorization: `Bearer ${token}` },
          payload: {
            targetType: 'review',
            targetId: target.reviewId,
            reason: 'Concurrent moderation coverage'
          }
        }),
        server.inject({
          method: 'POST',
          url: '/api/moderation/reports',
          headers: { authorization: `Bearer ${token}` },
          payload: {
            targetType: 'review',
            targetId: target.reviewId,
            reason: 'Concurrent moderation coverage'
          }
        })
      ]);

      expect(firstResponse.statusCode).toBe(200);
      expect(secondResponse.statusCode).toBe(200);
      reportId = (firstResponse.json() as { id: string }).id;
      expect((secondResponse.json() as { id: string }).id).toBe(reportId);

      const reportCount = await server.db.query<{ count: string }>(
        `
          SELECT COUNT(*)::text AS count
          FROM abuse_reports
          WHERE reporter_id = $1
            AND target_type = 'review'
            AND target_id = $2
            AND resolved_at IS NULL
        `,
        [adminId, target.reviewId]
      );
      expect(Number(reportCount.rows[0].count)).toBe(1);
    } finally {
      await server.db.query(`DELETE FROM notifications WHERE reference_id = $1`, [reportId]);
      await server.db.query(`DELETE FROM abuse_reports WHERE id = $1`, [reportId]);
      await server.db.query(`DELETE FROM reviews WHERE id = $1`, [target.reviewId]);
      await server.db.query(`DELETE FROM items WHERE id = $1`, [target.itemId]);
    }
  });
});
