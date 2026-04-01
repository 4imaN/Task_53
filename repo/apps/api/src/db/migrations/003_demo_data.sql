WITH warehouse AS (
  SELECT id FROM warehouses WHERE code = 'WH-01'
), item AS (
  SELECT id FROM items WHERE sku = 'SKU-1001'
), bin AS (
  SELECT b.id
  FROM bins b
  JOIN zones z ON z.id = b.zone_id
  WHERE b.code = 'RECV-A1' AND z.code = 'RECV'
)
INSERT INTO lots (item_id, warehouse_id, lot_code, quantity_on_hand, received_at)
SELECT item.id, warehouse.id, 'LOT-1902', 128, NOW() - INTERVAL '2 days'
FROM item, warehouse
ON CONFLICT (item_id, warehouse_id, lot_code) DO NOTHING;

WITH lot AS (
  SELECT id FROM lots WHERE lot_code = 'LOT-1902'
), bin AS (
  SELECT b.id
  FROM bins b
  JOIN zones z ON z.id = b.zone_id
  WHERE b.code = 'RECV-A1' AND z.code = 'RECV'
)
INSERT INTO inventory_positions (lot_id, bin_id, quantity)
SELECT lot.id, bin.id, 128
FROM lot, bin
ON CONFLICT (lot_id, bin_id) DO NOTHING;

WITH warehouse AS (
  SELECT id FROM warehouses WHERE code = 'WH-01'
)
INSERT INTO documents (warehouse_id, document_number, type, status, payload, created_at, updated_at)
SELECT warehouse.id, 'RCV-2026-0001', 'receiving', 'in_progress', '{"source":"demo-seed"}'::jsonb, NOW() - INTERVAL '1 day', NOW() - INTERVAL '2 hours'
FROM warehouse
ON CONFLICT (document_number) DO NOTHING;

WITH warehouse AS (
  SELECT id FROM warehouses WHERE code = 'WH-01'
)
INSERT INTO operational_metrics (warehouse_id, metric_type, period_start, period_end, metric_value)
SELECT warehouse.id, metric.metric_type, NOW() - INTERVAL '1 day', NOW(), metric.metric_value
FROM warehouse,
LATERAL (
  VALUES
    ('put_away_time', 43.2::numeric),
    ('pick_accuracy', 99.2::numeric),
    ('review_resolution_sla', 94.0::numeric)
) AS metric(metric_type, metric_value)
WHERE NOT EXISTS (
  SELECT 1 FROM operational_metrics existing WHERE existing.metric_type = metric.metric_type AND existing.warehouse_id = warehouse.id
);
