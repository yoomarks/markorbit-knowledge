#!/usr/bin/env bash
set -euo pipefail

: "${GITHUB_ENV:?GITHUB_ENV is required}"

auth_secret="$(openssl rand -hex 32)"
csrf_secret="$(openssl rand -hex 32)"
session_token="$(openssl rand -hex 24)"

for value in "$auth_secret" "$csrf_secret" "$session_token"; do
  echo "::add-mask::$value"
done

cat >> "$GITHUB_ENV" <<EOF
MARKORBIT_CORE_AUTH_URL=http://127.0.0.1:4109
MARKORBIT_CORE_INTERNAL_SECRET=$auth_secret
MO_INTERNAL_SERVICE_SECRET=$auth_secret
MARKORBIT_ADMIN_CSRF_SECRET=$csrf_secret
MARKORBIT_ADMIN_ORIGINS=http://127.0.0.1:3000
MARKORBIT_CALIBRATION_SESSION_TOKEN=$session_token
MARKORBIT_CI_ADMIN_SESSION_TOKEN=$session_token
MARKORBIT_CALIBRATION_SESSION_ID=ses_live_evidence_ci
MARKORBIT_CALIBRATION_USER_ID=usr_live_evidence_ci
MARKORBIT_CALIBRATION_WORKSPACE_ID=wsp_01ARZ3NDEKTSV4RRFFQ69G5FAV
MARKORBIT_CI_ADMIN_WORKSPACE_ID=wsp_01ARZ3NDEKTSV4RRFFQ69G5FAV
MARKORBIT_CALIBRATION_MEMBERSHIP_ID=mem_live_evidence_ci
EOF
