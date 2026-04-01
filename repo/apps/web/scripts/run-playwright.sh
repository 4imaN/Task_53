#!/bin/sh
unset npm_lifecycle_event
unset npm_lifecycle_script
unset npm_command

CI=1 NG_CLI_ANALYTICS=false ./node_modules/.bin/ng build

PORT=4173 node ./scripts/preview.mjs >/tmp/omnistock-web-preview.log 2>&1 &
PREVIEW_PID=$!

cleanup() {
  kill "$PREVIEW_PID" >/dev/null 2>&1 || true
}

trap cleanup EXIT INT TERM

ATTEMPTS=0
until curl -sf http://127.0.0.1:4173 >/dev/null 2>&1; do
  ATTEMPTS=$((ATTEMPTS + 1))
  if [ "$ATTEMPTS" -ge 40 ]; then
    echo "Preview server failed to start"
    cat /tmp/omnistock-web-preview.log || true
    exit 1
  fi
  sleep 0.25
done

PLAYWRIGHT_SKIP_WEBSERVER=1 PLAYWRIGHT_BASE_URL=http://127.0.0.1:4173 ./node_modules/.bin/playwright test
