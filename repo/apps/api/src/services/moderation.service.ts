import type { FastifyInstance } from 'fastify';

export class ModerationService {
  constructor(private readonly fastify: FastifyInstance) {}

  async createReport(input: { reporterId: string; targetType: string; targetId: string; reason: string }) {
    const result = await this.fastify.db.query(
      `
        INSERT INTO abuse_reports (reporter_id, target_type, target_id, reason)
        VALUES ($1, $2, $3, $4)
        RETURNING *
      `,
      [input.reporterId, input.targetType, input.targetId, input.reason]
    );

    await this.fastify.db.query(
      `
        INSERT INTO notifications (user_id, notification_type, title, body, reference_type, reference_id)
        VALUES ($1, 'abuse_report_status', 'Report submitted', 'Your report has been submitted for moderation review.', 'abuse_report', $2)
      `,
      [input.reporterId, result.rows[0].id]
    );

    return result.rows[0];
  }

  async listQueue() {
    const result = await this.fastify.db.query(
      `
        SELECT ar.*, u.display_name AS reporter_name
        FROM abuse_reports ar
        JOIN users u ON u.id = ar.reporter_id
        ORDER BY ar.created_at DESC
      `
    );

    return result.rows;
  }

  async updateStatus(input: {
    reportId: string;
    reporterStatus: 'submitted' | 'under_review' | 'resolved' | 'dismissed';
    moderationStatus: 'new' | 'assigned' | 'investigating' | 'action_taken' | 'no_action' | 'escalated' | 'closed';
    internalNotes?: string;
  }) {
    const shouldSetResolvedAt = input.reporterStatus === 'resolved' || input.reporterStatus === 'dismissed';

    const result = await this.fastify.db.query(
      `
        UPDATE abuse_reports
        SET reporter_status = $2::review_reporter_status,
            moderation_status = $3::moderation_status,
            internal_notes = COALESCE($4::text, internal_notes),
            resolved_at = CASE WHEN $5::boolean THEN NOW() ELSE resolved_at END
        WHERE id = $1
        RETURNING *
      `,
      [input.reportId, input.reporterStatus, input.moderationStatus, input.internalNotes ?? null, shouldSetResolvedAt]
    );

    if (!result.rowCount) {
      throw new Error('Report not found');
    }

    const report = result.rows[0];
    await this.fastify.db.query(
      `
        INSERT INTO notifications (user_id, notification_type, title, body, reference_type, reference_id)
        VALUES ($1, 'abuse_report_status', $2, $3, 'abuse_report', $4)
      `,
      [
        report.reporter_id,
        `Report ${input.reporterStatus}`,
        `Your report is now ${input.reporterStatus.replace('_', ' ')}.`,
        input.reportId
      ]
    );

    return report;
  }
}
