#!/bin/sh
unset npm_lifecycle_event
unset npm_lifecycle_script
unset npm_command

node --test --experimental-strip-types ./test/unit/**/*.test.ts
./scripts/run-playwright.sh
