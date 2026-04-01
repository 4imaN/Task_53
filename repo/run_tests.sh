#!/bin/sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)

docker compose build omnistock-api omnistock-frontend
docker compose up -d omnistock-db omnistock-api omnistock-frontend
trap 'docker compose down' EXIT

docker compose run --rm omnistock-api sh -lc "wait-for-postgres.sh && npm run migrate && npm run bootstrap:admin && npm test && npm run test:integration"
