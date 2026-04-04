#!/bin/sh
set -eu

EMPTY_ENV_FILE="$(mktemp /tmp/omnistock-compose-env.XXXXXX)"
cleanup() {
  docker compose --env-file "${EMPTY_ENV_FILE}" down
  rm -f "${EMPTY_ENV_FILE}"
}
trap cleanup EXIT

docker compose --env-file "${EMPTY_ENV_FILE}" build omnistock-api omnistock-frontend
docker compose --env-file "${EMPTY_ENV_FILE}" up -d omnistock-db omnistock-api omnistock-frontend

docker compose --env-file "${EMPTY_ENV_FILE}" run --rm omnistock-api sh -lc "POSTGRES_PASSWORD=\$(tr -d '\r\n' </run/omnistock-secrets/postgres_password); JWT_SECRET=\$(tr -d '\r\n' </run/omnistock-secrets/jwt_secret); ENCRYPTION_KEY=\$(tr -d '\r\n' </run/omnistock-secrets/encryption_key); DEFAULT_ADMIN_PASSWORD=\$(tr -d '\r\n' </run/omnistock-secrets/default_admin_password); export POSTGRES_PASSWORD JWT_SECRET ENCRYPTION_KEY DEFAULT_ADMIN_PASSWORD DATABASE_URL=postgres://omnistock:\${POSTGRES_PASSWORD}@omnistock-db:5432/omnistock; wait-for-postgres.sh && npm run migrate && npm run bootstrap:admin && npm test && npm run test:integration"
