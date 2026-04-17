import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createIntegrationHarness, loginAsAdmin, runIntegration } from './helpers/integration.js';

const describeIfIntegration = runIntegration ? describe : describe.skip;

describeIfIntegration('inbox API integration', () => {
  const harness = createIntegrationHarness();

  it('GET /api/inbox lists notifications for the authenticated user', async () => {
    const server = harness.server;
    const { token } = await loginAsAdmin(server);

    const adminResult = await server.db.query<{ id: string }>(
      `SELECT id FROM users WHERE username = $1`,
      [process.env.DEFAULT_ADMIN_USERNAME ?? 'admin']
    );
    const adminId = adminResult.rows[0].id;
    const referenceId = randomUUID();
    let notificationId: string | null = null;

    try {
      const insertResult = await server.db.query<{ id: string }>(
        `
          INSERT INTO notifications (user_id, notification_type, title, body, reference_type, reference_id)
          VALUES ($1, 'abuse_report_status', 'Test notification', 'Test body', 'abuse_report', $2)
          RETURNING id
        `,
        [adminId, referenceId]
      );
      notificationId = insertResult.rows[0].id;

      const response = await server.inject({
        method: 'GET',
        url: '/api/inbox',
        headers: { authorization: `Bearer ${token}` }
      });

      expect(response.statusCode).toBe(200);
      const notifications = response.json() as Array<{
        id: string;
        title: string;
        body: string;
        created_at: string;
        read_at: string | null;
      }>;
      expect(Array.isArray(notifications)).toBe(true);

      const found = notifications.find((n) => n.id === notificationId);
      expect(found).toBeDefined();
      expect(found!.title).toBe('Test notification');
      expect(found!.body).toBe('Test body');
      expect(found!.read_at).toBeNull();
    } finally {
      if (notificationId) {
        await server.db.query(`DELETE FROM notifications WHERE id = $1`, [notificationId]);
      }
    }
  });

  it('POST /api/inbox/:notificationId/read marks a notification as read', async () => {
    const server = harness.server;
    const { token } = await loginAsAdmin(server);

    const adminResult = await server.db.query<{ id: string }>(
      `SELECT id FROM users WHERE username = $1`,
      [process.env.DEFAULT_ADMIN_USERNAME ?? 'admin']
    );
    const adminId = adminResult.rows[0].id;
    const referenceId = randomUUID();
    let notificationId: string | null = null;

    try {
      const insertResult = await server.db.query<{ id: string }>(
        `
          INSERT INTO notifications (user_id, notification_type, title, body, reference_type, reference_id)
          VALUES ($1, 'abuse_report_status', 'Read test', 'Read body', 'abuse_report', $2)
          RETURNING id
        `,
        [adminId, referenceId]
      );
      notificationId = insertResult.rows[0].id;

      const readResponse = await server.inject({
        method: 'POST',
        url: `/api/inbox/${notificationId}/read`,
        headers: { authorization: `Bearer ${token}` }
      });

      expect(readResponse.statusCode).toBe(200);
      expect(readResponse.json()).toEqual({ success: true });

      const checkResult = await server.db.query<{ read_at: string | null }>(
        `SELECT read_at FROM notifications WHERE id = $1`,
        [notificationId]
      );
      expect(checkResult.rows[0].read_at).not.toBeNull();
    } finally {
      if (notificationId) {
        await server.db.query(`DELETE FROM notifications WHERE id = $1`, [notificationId]);
      }
    }
  });

  it('POST /api/inbox/read-all marks all notifications as read', async () => {
    const server = harness.server;
    const { token } = await loginAsAdmin(server);

    const adminResult = await server.db.query<{ id: string }>(
      `SELECT id FROM users WHERE username = $1`,
      [process.env.DEFAULT_ADMIN_USERNAME ?? 'admin']
    );
    const adminId = adminResult.rows[0].id;
    const refIdA = randomUUID();
    const refIdB = randomUUID();
    let notificationIdA: string | null = null;
    let notificationIdB: string | null = null;

    try {
      const insertA = await server.db.query<{ id: string }>(
        `
          INSERT INTO notifications (user_id, notification_type, title, body, reference_type, reference_id)
          VALUES ($1, 'abuse_report_status', 'Read all A', 'Body A', 'abuse_report', $2)
          RETURNING id
        `,
        [adminId, refIdA]
      );
      notificationIdA = insertA.rows[0].id;

      const insertB = await server.db.query<{ id: string }>(
        `
          INSERT INTO notifications (user_id, notification_type, title, body, reference_type, reference_id)
          VALUES ($1, 'abuse_report_status', 'Read all B', 'Body B', 'abuse_report', $2)
          RETURNING id
        `,
        [adminId, refIdB]
      );
      notificationIdB = insertB.rows[0].id;

      const readAllResponse = await server.inject({
        method: 'POST',
        url: '/api/inbox/read-all',
        headers: { authorization: `Bearer ${token}` }
      });

      expect(readAllResponse.statusCode).toBe(200);
      expect(readAllResponse.json()).toEqual({ success: true });

      const checkA = await server.db.query<{ read_at: string | null }>(
        `SELECT read_at FROM notifications WHERE id = $1`,
        [notificationIdA]
      );
      const checkB = await server.db.query<{ read_at: string | null }>(
        `SELECT read_at FROM notifications WHERE id = $1`,
        [notificationIdB]
      );
      expect(checkA.rows[0].read_at).not.toBeNull();
      expect(checkB.rows[0].read_at).not.toBeNull();
    } finally {
      if (notificationIdA) {
        await server.db.query(`DELETE FROM notifications WHERE id = $1`, [notificationIdA]);
      }
      if (notificationIdB) {
        await server.db.query(`DELETE FROM notifications WHERE id = $1`, [notificationIdB]);
      }
    }
  });

  it('GET /api/inbox returns 401 when called without a token', async () => {
    const server = harness.server;

    const response = await server.inject({
      method: 'GET',
      url: '/api/inbox'
    });
    expect(response.statusCode).toBe(401);
  });
});
