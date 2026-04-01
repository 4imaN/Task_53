DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_name = 'integration_request_replays'
  ) THEN
    CREATE TABLE integration_request_replays (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      integration_client_id UUID NOT NULL REFERENCES integration_clients(id) ON DELETE CASCADE,
      replay_key TEXT NOT NULL,
      request_timestamp TIMESTAMPTZ NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (integration_client_id, replay_key)
    );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_integration_request_replays_expires_at
  ON integration_request_replays(expires_at);

DELETE FROM inventory_positions WHERE quantity <= 0;
UPDATE lots SET quantity_on_hand = 0 WHERE quantity_on_hand < 0;
DELETE FROM inventory_transactions WHERE quantity <= 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'inventory_positions_quantity_positive'
  ) THEN
    ALTER TABLE inventory_positions
      ADD CONSTRAINT inventory_positions_quantity_positive CHECK (quantity > 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'inventory_transactions_quantity_positive'
  ) THEN
    ALTER TABLE inventory_transactions
      ADD CONSTRAINT inventory_transactions_quantity_positive CHECK (quantity > 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'lots_quantity_on_hand_nonnegative'
  ) THEN
    ALTER TABLE lots
      ADD CONSTRAINT lots_quantity_on_hand_nonnegative CHECK (quantity_on_hand >= 0);
  END IF;
END $$;
