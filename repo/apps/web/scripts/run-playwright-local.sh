#!/bin/sh
set -eu

BASE_URL="${PLAYWRIGHT_BASE_URL:-http://127.0.0.1:4200}"
ACTOR="${OMNISTOCK_E2E_ACTOR:-}"

if ! curl -sf "$BASE_URL" >/dev/null 2>&1; then
  echo "Local frontend is not reachable at $BASE_URL"
  echo "Start it first with: cd apps/web && npm start"
  exit 1
fi

if ! curl -sf "$BASE_URL/api/health" >/dev/null 2>&1; then
  echo "Local API is not reachable through $BASE_URL/api/health"
  echo "Start it first with: cd apps/api && npm run dev"
  exit 1
fi

case "$ACTOR" in
  administrator|manager|moderator|catalog-editor|warehouse-clerk) ;;
  *)
    echo "Set OMNISTOCK_E2E_ACTOR to one of: administrator, manager, moderator, catalog-editor, warehouse-clerk"
    exit 1
    ;;
esac

if [ -z "${OMNISTOCK_E2E_USERNAME:-}" ] || [ -z "${OMNISTOCK_E2E_PASSWORD:-}" ]; then
  echo "Set OMNISTOCK_E2E_USERNAME and OMNISTOCK_E2E_PASSWORD before running this smoke."
  exit 1
fi

if ! curl -sf "$BASE_URL/login/$ACTOR" >/dev/null 2>&1; then
  echo "The actor login route is not reachable at $BASE_URL/login/$ACTOR"
  echo "Verify the Angular dev server is serving the current build and route config."
  exit 1
fi

echo "Running real local smoke against $BASE_URL with actor $ACTOR"
PLAYWRIGHT_SKIP_WEBSERVER=1 PLAYWRIGHT_BASE_URL="$BASE_URL" ./node_modules/.bin/playwright test playwright/ui-local-smoke.spec.ts --project=desktop-chromium
