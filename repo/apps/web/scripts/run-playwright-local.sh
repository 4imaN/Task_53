#!/bin/sh
set -eu

BASE_URL="${PLAYWRIGHT_BASE_URL:-http://127.0.0.1:4200}"
ACTOR="${OMNISTOCK_E2E_ACTOR:-administrator}"

if ! curl -sf "$BASE_URL" >/dev/null 2>&1; then
  echo "Local frontend is not reachable at $BASE_URL"
  echo "Start it first with: cd apps/web && npm start"
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

LOGIN_RESPONSE="$(curl -sf -X POST "$BASE_URL/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"username\":\"$OMNISTOCK_E2E_USERNAME\",\"password\":\"$OMNISTOCK_E2E_PASSWORD\"}")"
TOKEN="$(printf '%s' "$LOGIN_RESPONSE" | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')"

if [ -z "$TOKEN" ]; then
  echo "Local API login failed or did not return a token."
  echo "Start it first with: cd apps/api && npm run dev"
  exit 1
fi

if ! curl -sf -H "Authorization: Bearer $TOKEN" "$BASE_URL/api/health" >/dev/null 2>&1; then
  echo "Local API authenticated health check failed through $BASE_URL/api/health"
  echo "Verify the local API is running and the supplied smoke credentials are valid."
  exit 1
fi

if ! curl -sf "$BASE_URL/login/$ACTOR" >/dev/null 2>&1; then
  echo "The actor login route is not reachable at $BASE_URL/login/$ACTOR"
  echo "Verify the Angular dev server is serving the current build and route config."
  exit 1
fi

echo "Running real local smoke against $BASE_URL with actor $ACTOR"
PLAYWRIGHT_SKIP_WEBSERVER=1 PLAYWRIGHT_BASE_URL="$BASE_URL" ./node_modules/.bin/playwright test playwright/ui-local-smoke.spec.ts --project=desktop-chromium
