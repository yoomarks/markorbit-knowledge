#!/usr/bin/env bash
set -euo pipefail

: "${MARKORBIT_CONTROL_PLANE_URL:?MARKORBIT_CONTROL_PLANE_URL is required}"
: "${MARKORBIT_CI_ADMIN_SESSION_TOKEN:?MARKORBIT_CI_ADMIN_SESSION_TOKEN is required}"
: "${MARKORBIT_CI_ADMIN_WORKSPACE_ID:?MARKORBIT_CI_ADMIN_WORKSPACE_ID is required}"

expected_origin="${MARKORBIT_CONTROL_PLANE_URL%/}"
request_url=""
for argument in "$@"; do
  case "$argument" in
    "$expected_origin"|"$expected_origin"/*)
      request_url="$argument"
      ;;
    http://*|https://*)
      echo "ci-admin-api-curl refuses non-control-plane URL: $argument" >&2
      exit 64
      ;;
  esac
done

if [[ -z "$request_url" ]]; then
  echo "ci-admin-api-curl requires an explicit control-plane URL" >&2
  exit 64
fi

request_path="${request_url#${expected_origin}}"
request_path="${request_path%%\?*}"
operator_service=0
case "$request_path" in
  /api/conversion-runtime/capabilities)
    operator_service=1
    ;;
  /api/raw-artifacts/*/source-graph|/api/runs/*/executions)
    operator_service=1
    ;;
esac

if [[ "$operator_service" == "1" ]]; then
  : "${MO_INTERNAL_SERVICE_SECRET:?MO_INTERNAL_SERVICE_SECRET is required for operator-service APIs}"
  : "${MARKORBIT_CALIBRATION_SESSION_ID:?MARKORBIT_CALIBRATION_SESSION_ID is required}"
  : "${MARKORBIT_CALIBRATION_USER_ID:?MARKORBIT_CALIBRATION_USER_ID is required}"
  : "${MARKORBIT_CALIBRATION_MEMBERSHIP_ID:?MARKORBIT_CALIBRATION_MEMBERSHIP_ID is required}"

  principal="$(node -e 'const p={schemaVersion:1,principal:{kind:"WORKSPACE",sessionId:process.env.MARKORBIT_CALIBRATION_SESSION_ID,userId:process.env.MARKORBIT_CALIBRATION_USER_ID,workspaceId:process.env.MARKORBIT_CI_ADMIN_WORKSPACE_ID,membershipId:process.env.MARKORBIT_CALIBRATION_MEMBERSHIP_ID,role:"WORKSPACE_ADMIN",permissions:["matter:read"],sessionExpiresAt:"2099-01-01T00:00:00.000Z"}};process.stdout.write(Buffer.from(JSON.stringify(p),"utf8").toString("base64url"));')"
  headers=(
    -H "x-markorbit-internal-authorization: ${MO_INTERNAL_SERVICE_SECRET}"
    -H "x-markorbit-principal: ${principal}"
  )
else
  headers=(
    -H "Cookie: mo_session=${MARKORBIT_CI_ADMIN_SESSION_TOKEN}"
    -H "x-markorbit-workspace-id: ${MARKORBIT_CI_ADMIN_WORKSPACE_ID}"
  )

  if [[ -n "${MARKORBIT_CI_ADMIN_CSRF_TOKEN:-}" ]]; then
    headers+=(
      -H "Origin: ${expected_origin}"
      -H "x-markorbit-csrf-token: ${MARKORBIT_CI_ADMIN_CSRF_TOKEN}"
    )
  fi
fi

exec curl "${headers[@]}" "$@"
