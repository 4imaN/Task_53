#!/bin/sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)

random_hex() {
  node -e "console.log(require('node:crypto').randomBytes($1).toString('hex'))"
}

random_password() {
  node -e "const { randomBytes } = require('node:crypto'); console.log('Omni-' + randomBytes(18).toString('base64url') + 'A1!')"
}

POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-$(random_hex 24)}"
JWT_SECRET="${JWT_SECRET:-$(random_hex 32)}"
ENCRYPTION_KEY="${ENCRYPTION_KEY:-$(random_hex 32)}"
DEFAULT_ADMIN_PASSWORD="${DEFAULT_ADMIN_PASSWORD:-$(random_password)}"
DATABASE_URL="${DATABASE_URL:-postgres://omnistock:${POSTGRES_PASSWORD}@omnistock-db:5432/omnistock}"
APP_ENV="${APP_ENV:-development}"
TRUST_PROXY="${TRUST_PROXY:-1}"
ALLOW_INSECURE_DEV_COOKIES="${ALLOW_INSECURE_DEV_COOKIES:-1}"

export POSTGRES_PASSWORD JWT_SECRET ENCRYPTION_KEY DEFAULT_ADMIN_PASSWORD DATABASE_URL APP_ENV TRUST_PROXY ALLOW_INSECURE_DEV_COOKIES

docker compose build omnistock-api omnistock-frontend
docker compose up -d omnistock-db omnistock-api omnistock-frontend
trap 'docker compose down' EXIT

docker compose run --rm omnistock-api sh -lc "wait-for-postgres.sh && npm run migrate && npm run bootstrap:admin && npm test && npm run test:integration"
