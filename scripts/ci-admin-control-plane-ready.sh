#!/usr/bin/env bash
set -euo pipefail

: "${RUNNER_TEMP:?RUNNER_TEMP is required}"
: "${GITHUB_ENV:?GITHUB_ENV is required}"
: "${GITHUB_WORKSPACE:?GITHUB_WORKSPACE is required}"
: "${MARKORBIT_CONTROL_PLANE_URL:?MARKORBIT_CONTROL_PLANE_URL is required}"
: "${MARKORBIT_CI_ADMIN_SESSION_TOKEN:?MARKORBIT_CI_ADMIN_SESSION_TOKEN is required}"

session_json="$RUNNER_TEMP/admin-session.json"
for attempt in $(seq 1 60); do
  if curl --silent --show-error --fail \
    -H "Cookie: mo_session=${MARKORBIT_CI_ADMIN_SESSION_TOKEN}" \
    "${MARKORBIT_CONTROL_PLANE_URL%/}/api/admin-session" > "$session_json"; then
    node <<'NODE'
const fs = require('node:fs');
const path = process.env.RUNNER_TEMP + '/admin-session.json';
const session = JSON.parse(fs.readFileSync(path, 'utf8'));
if (session?.authenticated !== true || !session.csrfToken) {
  throw new Error('Admin session readiness response is invalid');
}
fs.appendFileSync(process.env.GITHUB_ENV, `MARKORBIT_CI_ADMIN_CSRF_TOKEN=${session.csrfToken}\n`);
NODE

    fetch_hook="--import=${GITHUB_WORKSPACE}/scripts/admin-browser-calibration-fetch.mjs"
    if [[ " ${NODE_OPTIONS:-} " != *" ${fetch_hook} "* ]]; then
      printf 'NODE_OPTIONS=%s%s\n' "${NODE_OPTIONS:+${NODE_OPTIONS} }" "$fetch_hook" >> "$GITHUB_ENV"
    fi
    exit 0
  fi
  sleep 2
done

[[ -f "$RUNNER_TEMP/admin.log" ]] && cat "$RUNNER_TEMP/admin.log"
[[ -f "$RUNNER_TEMP/admin-auth-stub.log" ]] && cat "$RUNNER_TEMP/admin-auth-stub.log"
exit 1
