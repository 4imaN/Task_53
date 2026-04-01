import type { FastifyInstance } from 'fastify';
import { ModerationService } from '../services/moderation.service.js';

export const registerModerationRoutes = async (fastify: FastifyInstance) => {
  const moderationService = new ModerationService(fastify);

  fastify.post('/moderation/reports', { preHandler: fastify.authenticate }, async (request) => {
    const body = request.body as { targetType: string; targetId: string; reason: string };
    const report = await moderationService.createReport({
      reporterId: request.authUser!.id,
      targetType: body.targetType,
      targetId: body.targetId,
      reason: body.reason
    });

    request.auditContext = {
      actionType: 'abuse_report_submit',
      resourceType: body.targetType,
      resourceId: body.targetId,
      details: { reportId: report.id }
    };

    return report;
  });

  fastify.get('/moderation/queue', {
    preHandler: [fastify.authenticate, fastify.requirePermission('content.moderate')]
  }, async () => moderationService.listQueue());

  fastify.post('/moderation/reports/:reportId/status', {
    preHandler: [fastify.authenticate, fastify.requirePermission('content.moderate')]
  }, async (request) => {
    const params = request.params as { reportId: string };
    const body = request.body as {
      reporterStatus: 'submitted' | 'under_review' | 'resolved' | 'dismissed';
      moderationStatus: 'new' | 'assigned' | 'investigating' | 'action_taken' | 'no_action' | 'escalated' | 'closed';
      internalNotes?: string;
    };
    const report = await moderationService.updateStatus({ reportId: params.reportId, ...body });

    request.auditContext = {
      actionType: 'moderation_status_update',
      resourceType: 'abuse_report',
      resourceId: params.reportId,
      details: body
    };

    return report;
  });

  fastify.get('/inbox', { preHandler: fastify.authenticate }, async (request) => {
    const result = await fastify.db.query(
      `
        SELECT id, notification_type, title, body, reference_type, reference_id, read_at, created_at
        FROM notifications
        WHERE user_id = $1
        ORDER BY created_at DESC
      `,
      [request.authUser!.id]
    );

    return result.rows;
  });

  fastify.post('/inbox/:notificationId/read', { preHandler: fastify.authenticate }, async (request, reply) => {
    const { notificationId } = request.params as { notificationId: string };
    const result = await fastify.db.query(
      `
        UPDATE notifications
        SET read_at = COALESCE(read_at, NOW())
        WHERE id = $1 AND user_id = $2
        RETURNING id
      `,
      [notificationId, request.authUser!.id]
    );

    if (!result.rowCount) {
      return reply.code(404).send({ message: 'Notification not found' });
    }

    return { success: true };
  });

  fastify.post('/inbox/read-all', { preHandler: fastify.authenticate }, async (request) => {
    await fastify.db.query(
      `
        UPDATE notifications
        SET read_at = COALESCE(read_at, NOW())
        WHERE user_id = $1
      `,
      [request.authUser!.id]
    );

    return { success: true };
  });
};
