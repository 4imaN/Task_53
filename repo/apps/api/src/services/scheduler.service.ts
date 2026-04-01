import type { FastifyInstance } from 'fastify';

type JobSummary = Record<string, unknown>;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const startOfLocalDay = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate());

const previousDayWindow = (referenceDate: Date) => {
  const periodEnd = startOfLocalDay(referenceDate);
  const periodStart = new Date(periodEnd.getTime() - MS_PER_DAY);
  return { periodStart, periodEnd };
};

const nextTwoAm = (from = new Date()) => {
  const next = new Date(from);
  next.setHours(2, 0, 0, 0);
  if (next.getTime() <= from.getTime()) {
    next.setDate(next.getDate() + 1);
  }
  return next;
};

export class SchedulerService {
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly fastify: FastifyInstance) {}

  start() {
    if (this.timer || process.env.DISABLE_SCHEDULER === '1') {
      return;
    }

    this.scheduleNextRun();
  }

  stop() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  async runNightlyJobs(referenceDate = new Date()) {
    const { periodStart, periodEnd } = previousDayWindow(referenceDate);
    const metricsSummary = await this.runTrackedJob('scheduler_nightly', 'operational_metrics', async () => {
      return this.computeOperationalMetrics(periodStart, periodEnd);
    });
    const archivalSummary = await this.runTrackedJob('scheduler_nightly', 'document_archival', async () => {
      return this.archiveCompletedDocuments(periodEnd);
    });

    return {
      periodStart,
      periodEnd,
      metricsSummary,
      archivalSummary
    };
  }

  private scheduleNextRun() {
    const now = new Date();
    const nextRun = nextTwoAm(now);
    const delay = Math.max(nextRun.getTime() - now.getTime(), 1000);

    this.timer = setTimeout(async () => {
      try {
        await this.runNightlyJobs(new Date());
      } catch (error) {
        this.fastify.log.error(error, 'Nightly scheduler job failed');
      } finally {
        this.scheduleNextRun();
      }
    }, delay);
  }

  private async runTrackedJob(jobType: string, entityType: string, handler: () => Promise<JobSummary>) {
    const createResult = await this.fastify.db.query<{ id: string }>(
      `
        INSERT INTO batch_jobs (job_type, entity_type, status, summary)
        VALUES ($1, $2, 'running', '{}'::jsonb)
        RETURNING id
      `,
      [jobType, entityType]
    );

    const jobId = createResult.rows[0].id;

    try {
      const summary = await handler();
      await this.fastify.db.query(
        `
          UPDATE batch_jobs
          SET status = 'completed',
              summary = $2::jsonb
          WHERE id = $1
        `,
        [jobId, JSON.stringify(summary)]
      );

      await this.fastify.writeAudit({
        userId: null,
        actionType: `${entityType}_job_completed`,
        resourceType: 'batch_job',
        resourceId: jobId,
        details: summary,
        ipAddress: 'scheduler'
      });

      return { jobId, ...summary };
    } catch (error) {
      const handled = error as Error;
      await this.fastify.db.query(
        `
          UPDATE batch_jobs
          SET status = 'failed',
              summary = $2::jsonb
          WHERE id = $1
        `,
        [jobId, JSON.stringify({ error: handled.message })]
      );

      await this.fastify.writeAudit({
        userId: null,
        actionType: `${entityType}_job_failed`,
        resourceType: 'batch_job',
        resourceId: jobId,
        details: { error: handled.message },
        ipAddress: 'scheduler'
      });

      throw error;
    }
  }

  private async computeOperationalMetrics(periodStart: Date, periodEnd: Date) {
    const client = await this.fastify.db.connect();

    try {
      await client.query('BEGIN');
      await client.query('LOCK TABLE warehouses IN SHARE MODE');

      await client.query(
        `
          DELETE FROM operational_metrics
          WHERE period_start = $1
            AND period_end = $2
            AND metric_type IN ('put_away_time', 'pick_accuracy', 'review_resolution_sla')
        `,
        [periodStart.toISOString(), periodEnd.toISOString()]
      );

      const warehouseResult = await client.query<{ id: string }>(
        `
          SELECT id
          FROM warehouses
          WHERE deleted_at IS NULL
          ORDER BY created_at ASC
          FOR KEY SHARE
        `
      );

      let insertedRows = 0;

      for (const warehouse of warehouseResult.rows) {
        const putAwayResult = await client.query<{ metric_value: string | null }>(
          `
            SELECT AVG(EXTRACT(EPOCH FROM (it.created_at - d.created_at)))::numeric(14, 4) AS metric_value
            FROM inventory_transactions it
            JOIN documents d ON d.id = it.document_id
            WHERE it.warehouse_id = $1
              AND it.transaction_type = 'receive'
              AND d.type = 'receiving'
              AND it.created_at >= $2
              AND it.created_at < $3
          `,
          [warehouse.id, periodStart.toISOString(), periodEnd.toISOString()]
        );

        const pickAccuracyResult = await client.query<{ total_picks: string; corrected_picks: string }>(
          `
            SELECT
              COUNT(*) FILTER (WHERE pick.transaction_type = 'pick')::text AS total_picks,
              COUNT(correction.id)::text AS corrected_picks
            FROM inventory_transactions pick
            LEFT JOIN inventory_transactions correction ON correction.correction_of_id = pick.id
            WHERE pick.warehouse_id = $1
              AND pick.transaction_type = 'pick'
              AND pick.created_at >= $2
              AND pick.created_at < $3
          `,
          [warehouse.id, periodStart.toISOString(), periodEnd.toISOString()]
        );

        const totalPicks = Number(pickAccuracyResult.rows[0]?.total_picks ?? 0);
        const correctedPicks = Number(pickAccuracyResult.rows[0]?.corrected_picks ?? 0);
        const pickAccuracy = totalPicks > 0
          ? (((totalPicks - correctedPicks) / totalPicks) * 100).toFixed(4)
          : '0';

        const metricRows = [
          {
            warehouseId: warehouse.id,
            metricType: 'put_away_time',
            metricValue: putAwayResult.rows[0]?.metric_value ? Number(putAwayResult.rows[0].metric_value) : 0
          },
          {
            warehouseId: warehouse.id,
            metricType: 'pick_accuracy',
            metricValue: Number(pickAccuracy)
          }
        ];

        for (const metric of metricRows) {
          const insertResult = await client.query(
            `
              INSERT INTO operational_metrics (warehouse_id, metric_type, period_start, period_end, metric_value)
              SELECT w.id, $2, $3, $4, $5
              FROM warehouses w
              WHERE w.id = $1
                AND w.deleted_at IS NULL
            `,
            [metric.warehouseId, metric.metricType, periodStart.toISOString(), periodEnd.toISOString(), metric.metricValue]
          );

          insertedRows += insertResult.rowCount ?? 0;
        }
      }

      const reviewSlaResult = await client.query<{ metric_value: string }>(
        `
          SELECT
            CASE
              WHEN COUNT(*) FILTER (WHERE resolved_at IS NOT NULL) = 0 THEN 0
              ELSE (
                COUNT(*) FILTER (
                  WHERE resolved_at IS NOT NULL
                    AND resolved_at <= created_at + INTERVAL '48 hours'
                )::numeric
                / COUNT(*) FILTER (WHERE resolved_at IS NOT NULL)::numeric
              ) * 100
            END::numeric(14, 4) AS metric_value
          FROM abuse_reports
          WHERE created_at >= $1
            AND created_at < $2
        `,
        [periodStart.toISOString(), periodEnd.toISOString()]
      );

      await client.query(
        `
          INSERT INTO operational_metrics (warehouse_id, metric_type, period_start, period_end, metric_value)
          VALUES (NULL, 'review_resolution_sla', $1, $2, $3)
        `,
        [periodStart.toISOString(), periodEnd.toISOString(), Number(reviewSlaResult.rows[0]?.metric_value ?? 0)]
      );
      insertedRows += 1;

      await client.query('COMMIT');

      return {
        insertedMetricRows: insertedRows,
        periodStart: periodStart.toISOString(),
        periodEnd: periodEnd.toISOString()
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private async archiveCompletedDocuments(periodEnd: Date) {
    const cutoff = new Date(periodEnd.getTime() - 365 * MS_PER_DAY);
    const client = await this.fastify.db.connect();

    try {
      await client.query('BEGIN');

      const archiveCandidates = await client.query<{
        id: string;
        warehouse_id: string;
        type: string;
        document_number: string;
        payload: Record<string, unknown>;
        completed_at: string;
      }>(
        `
          SELECT d.id, d.warehouse_id, d.type::text, d.document_number, d.payload, d.completed_at
          FROM documents d
          WHERE d.status = 'completed'
            AND d.completed_at IS NOT NULL
            AND d.completed_at < $1
            AND NOT EXISTS (
              SELECT 1
              FROM archived_documents archive
              WHERE archive.source_document_id = d.id
            )
        `,
        [cutoff.toISOString()]
      );

      let archivedCount = 0;

      for (const document of archiveCandidates.rows) {
        const workflowResult = await client.query(
          `
            SELECT from_status, to_status, notes, created_at
            FROM document_workflows
            WHERE document_id = $1
            ORDER BY created_at ASC
          `,
          [document.id]
        );

        await client.query(
          `
            INSERT INTO archived_documents (source_document_id, warehouse_id, type, archived_payload)
            VALUES ($1, $2, $3::document_type, $4::jsonb)
          `,
          [
            document.id,
            document.warehouse_id,
            document.type,
            JSON.stringify({
              document: {
                id: document.id,
                warehouseId: document.warehouse_id,
                documentNumber: document.document_number,
                payload: document.payload,
                completedAt: document.completed_at
              },
              workflow: workflowResult.rows
            })
          ]
        );

        await client.query(
          `
            UPDATE documents
            SET status = 'archived',
                updated_at = NOW()
            WHERE id = $1
          `,
          [document.id]
        );

        await client.query(
          `
            INSERT INTO document_workflows (document_id, from_status, to_status, changed_by, notes)
            VALUES ($1, 'completed', 'archived', NULL, 'Archived by nightly scheduler')
          `,
          [document.id]
        );

        archivedCount += 1;
      }

      await client.query('COMMIT');

      return {
        archivedCount,
        cutoff: cutoff.toISOString()
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
