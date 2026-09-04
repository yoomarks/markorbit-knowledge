#!/usr/bin/env bash
set -euo pipefail

: "${RUNNER_TEMP:?RUNNER_TEMP is required}"
: "${GITHUB_ENV:?GITHUB_ENV is required}"
: "${MARKORBIT_CORE_AUTH_URL:?MARKORBIT_CORE_AUTH_URL is required}"
: "${MARKORBIT_CORE_INTERNAL_SECRET:?MARKORBIT_CORE_INTERNAL_SECRET is required}"
: "${MARKORBIT_CI_ADMIN_SESSION_TOKEN:?MARKORBIT_CI_ADMIN_SESSION_TOKEN is required}"
: "${MARKORBIT_CI_ADMIN_WORKSPACE_ID:?MARKORBIT_CI_ADMIN_WORKSPACE_ID is required}"

node scripts/admin-browser-calibration-core-auth-stub.mjs > "$RUNNER_TEMP/admin-auth-stub.log" 2>&1 &
echo "AUTH_STUB_PID=$!" >> "$GITHUB_ENV"

for attempt in $(seq 1 30); do
  if curl --silent --show-error --fail "${MARKORBIT_CORE_AUTH_URL%/}/health" >/dev/null; then
    exit 0
  fi
  sleep 1
done

cat "$RUNNER_TEMP/admin-auth-stub.log"
exit 1
