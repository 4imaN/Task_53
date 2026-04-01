WITH district AS (
  SELECT id FROM departments WHERE code = 'district-ops'
)
INSERT INTO warehouses (department_id, code, name, address)
SELECT district.id, 'WH-02', 'East District Overflow Warehouse', '2400 Logistics Avenue'
FROM district
ON CONFLICT (code) DO NOTHING;

WITH warehouse AS (
  SELECT id FROM warehouses WHERE code = 'WH-02'
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
  SELECT z.id
  FROM zones z
  JOIN warehouses w ON w.id = z.warehouse_id
  WHERE w.code = 'WH-02' AND z.code = 'RECV'
), zone_cold AS (
  SELECT z.id
  FROM zones z
  JOIN warehouses w ON w.id = z.warehouse_id
  WHERE w.code = 'WH-02' AND z.code = 'COLD'
), zone_pick AS (
  SELECT z.id
  FROM zones z
  JOIN warehouses w ON w.id = z.warehouse_id
  WHERE w.code = 'WH-02' AND z.code = 'PICK'
)
INSERT INTO bins (zone_id, code, temperature_band, max_load_lbs, max_length_in, max_width_in, max_height_in)
SELECT data.zone_id, data.code, data.temperature_band, data.max_load_lbs, data.max_length_in, data.max_width_in, data.max_height_in
FROM (
  SELECT (SELECT id FROM zone_recv) AS zone_id, 'RECV-B1' AS code, 'ambient' AS temperature_band, 2400::numeric AS max_load_lbs, 72::numeric AS max_length_in, 48::numeric AS max_width_in, 84::numeric AS max_height_in
  UNION ALL
  SELECT (SELECT id FROM zone_cold), 'COLD-02', 'cold', 1000, 60, 42, 84
  UNION ALL
  SELECT (SELECT id FROM zone_pick), 'PICK-02', 'ambient', 700, 40, 30, 30
) AS data
WHERE data.zone_id IS NOT NULL
ON CONFLICT (zone_id, code) DO NOTHING;
