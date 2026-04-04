CREATE TABLE IF NOT EXISTS integration_rate_limit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_client_id UUID NOT NULL REFERENCES integration_clients(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_integration_rate_limit_events_client_created_at
  ON integration_rate_limit_events(integration_client_id, created_at DESC);
