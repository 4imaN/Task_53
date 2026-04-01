ALTER TABLE users
ADD COLUMN IF NOT EXISTS authz_version INTEGER NOT NULL DEFAULT 1;

UPDATE users
SET authz_version = 1
WHERE authz_version IS NULL;
