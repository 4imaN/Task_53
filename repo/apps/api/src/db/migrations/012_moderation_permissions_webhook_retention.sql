INSERT INTO permissions (code, description)
VALUES
  ('inventory.scan', 'Lookup inventory by barcode, lot, or SKU'),
  ('inventory.count', 'Create cycle count documents'),
  ('inventory.adjust', 'Create inventory adjustment documents')
ON CONFLICT (code) DO NOTHING;

WITH mapping AS (
  SELECT r.id AS role_id, p.id AS permission_id
  FROM roles r
  JOIN permissions p ON (
    (r.code = 'administrator' AND p.code IN ('inventory.scan', 'inventory.count', 'inventory.adjust')) OR
    (r.code = 'manager' AND p.code IN ('inventory.scan', 'inventory.count', 'inventory.adjust')) OR
    (r.code = 'warehouse_clerk' AND p.code IN ('inventory.scan', 'inventory.count', 'inventory.adjust'))
  )
)
INSERT INTO role_permissions (role_id, permission_id)
SELECT role_id, permission_id
FROM mapping
ON CONFLICT DO NOTHING;

DELETE FROM notifications
WHERE reference_type = 'abuse_report'
  AND reference_id IN (
    SELECT duplicate_id
    FROM (
      SELECT
        id AS duplicate_id,
        ROW_NUMBER() OVER (
          PARTITION BY reporter_id, target_type, target_id
          ORDER BY created_at ASC, id ASC
        ) AS duplicate_rank
      FROM abuse_reports
      WHERE resolved_at IS NULL
    ) ranked_reports
    WHERE duplicate_rank > 1
  );

DELETE FROM abuse_reports
WHERE id IN (
  SELECT duplicate_id
  FROM (
    SELECT
      id AS duplicate_id,
      ROW_NUMBER() OVER (
        PARTITION BY reporter_id, target_type, target_id
        ORDER BY created_at ASC, id ASC
      ) AS duplicate_rank
    FROM abuse_reports
    WHERE resolved_at IS NULL
  ) ranked_reports
  WHERE duplicate_rank > 1
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_abuse_reports_active_reporter_target
  ON abuse_reports (reporter_id, target_type, target_id)
  WHERE resolved_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_created_at
  ON webhook_deliveries (created_at);
