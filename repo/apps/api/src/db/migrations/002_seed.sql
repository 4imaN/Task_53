INSERT INTO roles (code, name)
VALUES
  ('administrator', 'Administrator'),
  ('manager', 'Manager'),
  ('moderator', 'Moderator'),
  ('catalog_editor', 'Catalog Editor'),
  ('warehouse_clerk', 'Warehouse Clerk')
ON CONFLICT (code) DO NOTHING;

INSERT INTO permissions (code, description)
VALUES
  ('users.manage', 'Create, update, unlock, and deactivate users'),
  ('roles.manage', 'Manage roles and permission assignments'),
  ('warehouses.read', 'Read warehouse hierarchy and details'),
  ('warehouses.manage', 'Create and update warehouse, zone, and bin records'),
  ('bins.toggle', 'Enable or disable bins'),
  ('inventory.receive', 'Receive inventory'),
  ('inventory.move', 'Move inventory between bins'),
  ('inventory.pick', 'Pick inventory for outbound flows'),
  ('documents.approve', 'Approve warehouse documents'),
  ('catalog.manage', 'Maintain item details, answers, and catalog media'),
  ('content.moderate', 'Moderate reports and user-generated content'),
  ('metrics.read', 'Read throughput and compliance metrics'),
  ('search.read', 'Use the global search workspace'),
  ('saved_views.manage', 'Create and update search saved views'),
  ('exports.manage', 'Run CSV/XLSX exports'),
  ('images.export', 'Export catalog images'),
  ('integrations.manage', 'Manage integration clients and webhook delivery'),
  ('audit.read', 'Read immutable audit log')
ON CONFLICT (code) DO NOTHING;

WITH mapping AS (
  SELECT r.code AS role_code, p.code AS permission_code
  FROM roles r
  JOIN permissions p ON (
    (r.code = 'administrator') OR
    (r.code = 'manager' AND p.code IN ('warehouses.read','warehouses.manage','bins.toggle','inventory.receive','inventory.move','inventory.pick','documents.approve','metrics.read','search.read','saved_views.manage','exports.manage','images.export','audit.read')) OR
    (r.code = 'moderator' AND p.code IN ('content.moderate','search.read')) OR
    (r.code = 'catalog_editor' AND p.code IN ('catalog.manage','search.read','saved_views.manage','exports.manage','images.export')) OR
    (r.code = 'warehouse_clerk' AND p.code IN ('warehouses.read','inventory.receive','inventory.move','inventory.pick','search.read','saved_views.manage'))
  )
)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM mapping m
JOIN roles r ON r.code = m.role_code
JOIN permissions p ON p.code = m.permission_code
ON CONFLICT DO NOTHING;

INSERT INTO departments (code, name)
VALUES
  ('district-ops', 'District Operations'),
  ('north-high', 'North High School'),
  ('south-middle', 'South Middle School')
ON CONFLICT (code) DO NOTHING;

WITH district AS (
  SELECT id FROM departments WHERE code = 'district-ops'
)
INSERT INTO warehouses (department_id, code, name, address)
SELECT district.id, 'WH-01', 'Central District Warehouse', '100 Service Road'
FROM district
ON CONFLICT (code) DO NOTHING;

WITH warehouse AS (
  SELECT id FROM warehouses WHERE code = 'WH-01'
)
INSERT INTO zones (warehouse_id, code, name)
SELECT warehouse.id, value.code, value.name
FROM warehouse,
LATERAL (
  VALUES
    ('RECV', 'Receiving'),
    ('COLD', 'Cold Storage'),
    ('PICK', 'Pick Face')
) AS value(code, name)
ON CONFLICT (warehouse_id, code) DO NOTHING;

WITH zone_recv AS (
  SELECT z.id FROM zones z WHERE z.code = 'RECV'
), zone_cold AS (
  SELECT z.id FROM zones z WHERE z.code = 'COLD'
), zone_pick AS (
  SELECT z.id FROM zones z WHERE z.code = 'PICK'
)
INSERT INTO bins (zone_id, code, temperature_band, max_load_lbs, max_length_in, max_width_in, max_height_in)
SELECT data.zone_id, data.code, data.temperature_band, data.max_load_lbs, data.max_length_in, data.max_width_in, data.max_height_in
FROM (
  SELECT (SELECT id FROM zone_recv) AS zone_id, 'RECV-A1' AS code, 'ambient' AS temperature_band, 2000::numeric AS max_load_lbs, 60::numeric AS max_length_in, 48::numeric AS max_width_in, 72::numeric AS max_height_in
  UNION ALL
  SELECT (SELECT id FROM zone_cold), 'COLD-01', 'cold', 800, 48, 40, 72
  UNION ALL
  SELECT (SELECT id FROM zone_pick), 'PICK-01', 'ambient', 500, 36, 24, 24
) AS data
WHERE data.zone_id IS NOT NULL
ON CONFLICT (zone_id, code) DO NOTHING;

WITH dept AS (
  SELECT id FROM departments WHERE code = 'district-ops'
)
INSERT INTO items (department_id, sku, name, description, unit_of_measure, weight_lbs, length_in, width_in, height_in, temperature_band, cost_amount, supplier_name)
SELECT dept.id, value.sku, value.name, value.description, value.unit_of_measure, value.weight_lbs, value.length_in, value.width_in, value.height_in, value.temperature_band, value.cost_amount, value.supplier_name
FROM dept,
LATERAL (
  VALUES
    ('SKU-1001', 'Classroom Paper Towels', 'Bulk paper towels for district facilities', 'case', 22.5, 24, 18, 16, 'ambient', 34.25, 'Facility Supply Co'),
    ('SKU-1002', 'Science Lab Gloves', 'Disposable gloves for chemistry labs', 'box', 4.2, 12, 10, 8, 'ambient', 12.10, 'SafeLab Partners'),
    ('SKU-2001', 'Nurse Ice Packs', 'Reusable cold packs for school nurse offices', 'case', 18.0, 20, 16, 14, 'cold', 49.95, 'HealthWorks')
) AS value(sku, name, description, unit_of_measure, weight_lbs, length_in, width_in, height_in, temperature_band, cost_amount, supplier_name)
ON CONFLICT (sku) DO NOTHING;

WITH item AS (
  SELECT id FROM items WHERE sku = 'SKU-1001'
)
INSERT INTO barcodes (item_id, barcode, symbology)
SELECT item.id, '123456789012', 'code128'
FROM item
ON CONFLICT (barcode) DO NOTHING;
