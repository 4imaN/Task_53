UPDATE items
SET temperature_band = CASE
  WHEN LOWER(BTRIM(temperature_band)) = 'cold' THEN 'chilled'
  ELSE LOWER(BTRIM(temperature_band))
END
WHERE temperature_band IS NOT NULL
  AND temperature_band <> CASE
    WHEN LOWER(BTRIM(temperature_band)) = 'cold' THEN 'chilled'
    ELSE LOWER(BTRIM(temperature_band))
  END;

UPDATE bins
SET temperature_band = CASE
  WHEN LOWER(BTRIM(temperature_band)) = 'cold' THEN 'chilled'
  ELSE LOWER(BTRIM(temperature_band))
END
WHERE temperature_band IS NOT NULL
  AND temperature_band <> CASE
    WHEN LOWER(BTRIM(temperature_band)) = 'cold' THEN 'chilled'
    ELSE LOWER(BTRIM(temperature_band))
  END;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM items
    WHERE temperature_band NOT IN ('ambient', 'chilled', 'frozen')
  ) THEN
    RAISE EXCEPTION 'items.temperature_band contains unsupported values outside ambient/chilled/frozen';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM bins
    WHERE temperature_band NOT IN ('ambient', 'chilled', 'frozen')
  ) THEN
    RAISE EXCEPTION 'bins.temperature_band contains unsupported values outside ambient/chilled/frozen';
  END IF;
END $$;

ALTER TABLE items DROP CONSTRAINT IF EXISTS items_temperature_band_valid;
ALTER TABLE bins DROP CONSTRAINT IF EXISTS bins_temperature_band_valid;

ALTER TABLE items
  ADD CONSTRAINT items_temperature_band_valid
  CHECK (temperature_band IN ('ambient', 'chilled', 'frozen'));

ALTER TABLE bins
  ADD CONSTRAINT bins_temperature_band_valid
  CHECK (temperature_band IN ('ambient', 'chilled', 'frozen'));
