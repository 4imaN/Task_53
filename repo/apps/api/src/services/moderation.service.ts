import type { FastifyInstance } from 'fastify';
import { withTransaction } from '../utils/db.js';
import { AccessControlService } from './access-control.service.js';
import type { AuthenticatedUser } from '../types/fastify.js';

type ModerationTargetType = 'review' | 'qa_thread';
const ACTIVE_REPORT_PREDICATE = 'resolved_at IS NULL';

const moderationError = (statusCode: number, message: string) => Object.assign(new Error(message), { statusCode });

export class ModerationService {
  private readonly accessControl: AccessControlService;

  constructor(private readonly fastify: FastifyInstance) {
    this.accessControl = new AccessControlService(fastify);
  }

  async createReport(input: {
    user: AuthenticatedUser;
    reporterId: string;
    targetType: ModerationTargetType;
    targetId: string;
    reason: string;
  }) {
    await this.resolveAndAuthorizeTarget(input.user, input.targetType, input.targetId);

    return withTransaction(this.fastify.db, async (client) => {
      const insertResult = await client.query(
        `
          INSERT INTO abuse_reports (reporter_id, target_type, target_id, reason)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (reporter_id, target_type, target_id) WHERE resolved_at IS NULL
          DO NOTHING
          RETURNING *
        `,
        [input.reporterId, input.targetType, input.targetId, input.reason.trim()]
      );

      if (insertResult.rowCount) {
        await client.query(
          `
            INSERT INTO notifications (user_id, notification_type, title, body, reference_type, reference_id)
            VALUES ($1, 'abuse_report_status', 'Report submitted', 'Your report has been submitted for moderation review.', 'abuse_report', $2)
          `,
          [input.reporterId, insertResult.rows[0].id]
        );

        return {
          report: insertResult.rows[0],
          deduplicated: false
        };
      }

      const existingResult = await client.query(
        `
          SELECT *
          FROM abuse_reports
          WHERE reporter_id = $1
            AND target_type = $2
            AND target_id = $3
            AND ${ACTIVE_REPORT_PREDICATE}
          ORDER BY created_at ASC, id ASC
          LIMIT 1
        `,
        [input.reporterId, input.targetType, input.targetId]
      );

      if (!existingResult.rowCount) {
        throw moderationError(409, 'An active report already exists for this target');
      }

      return {
        report: existingResult.rows[0],
        deduplicated: true
      };
    });
  }

  async listQueue(user: AuthenticatedUser) {
    const { whereSql, values } = await this.buildDepartmentScopeClause(user, 'COALESCE(review_item.department_id, question_item.department_id)');
    const result = await this.fastify.db.query(
      `
        SELECT ar.*, u.display_name AS reporter_name
        FROM abuse_reports ar
        JOIN users u ON u.id = ar.reporter_id
        LEFT JOIN reviews r ON ar.target_type = 'review' AND r.id = ar.target_id
        LEFT JOIN items review_item ON review_item.id = r.item_id
        LEFT JOIN qa_threads qt ON ar.target_type = 'qa_thread' AND qt.id = ar.target_id
        LEFT JOIN items question_item ON question_item.id = qt.item_id
        WHERE ar.target_type IN ('review', 'qa_thread')
          AND ar.resolved_at IS NULL
          ${whereSql}
        ORDER BY ar.created_at DESC
      `,
      values
    );

    return result.rows;
  }

  async updateStatus(input: {
    actingUser: AuthenticatedUser;
    reportId: string;
    reporterStatus: 'submitted' | 'under_review' | 'resolved' | 'dismissed';
    moderationStatus: 'new' | 'assigned' | 'investigating' | 'action_taken' | 'no_action' | 'escalated' | 'closed';
    internalNotes?: string;
  }) {
    await this.getAccessibleReport(input.actingUser, input.reportId);
    const shouldSetResolvedAt = input.reporterStatus === 'resolved' || input.reporterStatus === 'dismissed';

    return withTransaction(this.fastify.db, async (client) => {
      const result = await client.query(
        `
          UPDATE abuse_reports
          SET reporter_status = $2::review_reporter_status,
              moderation_status = $3::moderation_status,
              internal_notes = COALESCE($4::text, internal_notes),
              resolved_at = CASE WHEN $5::boolean THEN NOW() ELSE NULL END
          WHERE id = $1
          RETURNING *
        `,
        [input.reportId, input.reporterStatus, input.moderationStatus, input.internalNotes ?? null, shouldSetResolvedAt]
      );

      if (!result.rowCount) {
        throw moderationError(404, 'Report not found');
      }

      const report = result.rows[0];
      await client.query(
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
    });
  }

  private async resolveAndAuthorizeTarget(user: AuthenticatedUser, targetType: ModerationTargetType, targetId: string) {
    const departmentId = await this.resolveTargetDepartmentId(targetType, targetId);
    if (this.accessControl.hasGlobalDepartmentAccess(user)) {
      return { departmentId };
    }

    const allowedDepartmentIds = await this.accessControl.getAllowedDepartmentIds(user);
    if (!allowedDepartmentIds?.includes(departmentId)) {
      throw moderationError(403, 'Target is outside your department scope');
    }

    return { departmentId };
  }

  private async resolveTargetDepartmentId(targetType: ModerationTargetType, targetId: string) {
    const targetQueries: Record<ModerationTargetType, { label: string; sql: string }> = {
      review: {
        label: 'Review',
        sql: `
          SELECT i.department_id::text AS department_id
          FROM reviews r
          JOIN items i ON i.id = r.item_id
          WHERE r.id = $1
            AND i.deleted_at IS NULL
        `
      },
      qa_thread: {
        label: 'Question',
        sql: `
          SELECT i.department_id::text AS department_id
          FROM qa_threads qt
          JOIN items i ON i.id = qt.item_id
          WHERE qt.id = $1
            AND i.deleted_at IS NULL
        `
      }
    };

    const targetQuery = targetQueries[targetType];
    const result = await this.fastify.db.query<{ department_id: string }>(targetQuery.sql, [targetId]);
    if (!result.rowCount) {
      throw moderationError(404, `${targetQuery.label} not found`);
    }

    return result.rows[0].department_id;
  }

  private async buildDepartmentScopeClause(user: AuthenticatedUser, columnRef: string) {
    if (this.accessControl.hasGlobalDepartmentAccess(user)) {
      return { whereSql: '', values: [] as unknown[] };
    }

    const allowedDepartmentIds = await this.accessControl.getAllowedDepartmentIds(user);
    if (!allowedDepartmentIds?.length) {
      return { whereSql: 'AND 1 = 0', values: [] as unknown[] };
    }

    return {
      whereSql: `AND ${columnRef} = ANY($1::uuid[])`,
      values: [allowedDepartmentIds] as unknown[]
    };
  }

  private async getAccessibleReport(user: AuthenticatedUser, reportId: string) {
    const { whereSql, values } = await this.buildDepartmentScopeClause(user, 'COALESCE(review_item.department_id, question_item.department_id)');
    const result = await this.fastify.db.query(
      `
        SELECT ar.id
        FROM abuse_reports ar
        LEFT JOIN reviews r ON ar.target_type = 'review' AND r.id = ar.target_id
        LEFT JOIN items review_item ON review_item.id = r.item_id
        LEFT JOIN qa_threads qt ON ar.target_type = 'qa_thread' AND qt.id = ar.target_id
        LEFT JOIN items question_item ON question_item.id = qt.item_id
        WHERE ar.id = $1
          AND ar.target_type IN ('review', 'qa_thread')
          ${whereSql.replace('$1', '$2')}
      `,
      [reportId, ...values]
    );

    if (!result.rowCount) {
      throw moderationError(404, 'Report not found');
    }
  }
}
