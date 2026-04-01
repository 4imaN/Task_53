ALTER TABLE batch_jobs
ADD COLUMN IF NOT EXISTS department_ids UUID[] NOT NULL DEFAULT '{}'::uuid[];

WITH derived AS (
  SELECT
    b.id,
    COALESCE(array_agg(DISTINCT d.id) FILTER (WHERE d.id IS NOT NULL), '{}'::uuid[]) AS resolved_department_ids
  FROM batch_jobs b
  LEFT JOIN batch_job_results r ON r.batch_job_id = b.id
  LEFT JOIN departments d ON LOWER(d.code) = LOWER(COALESCE(r.payload->>'department_code', ''))
  GROUP BY b.id
)
UPDATE batch_jobs b
SET department_ids = derived.resolved_department_ids
FROM derived
WHERE b.id = derived.id
  AND b.department_ids = '{}'::uuid[];

CREATE INDEX IF NOT EXISTS idx_batch_jobs_department_ids ON batch_jobs USING GIN (department_ids);
