#!/usr/bin/env bash
set -euo pipefail

: "${MARKORBIT_CONTROL_PLANE_URL:?MARKORBIT_CONTROL_PLANE_URL is required}"
: "${MARKORBIT_CI_ADMIN_SESSION_TOKEN:?MARKORBIT_CI_ADMIN_SESSION_TOKEN is required}"
: "${MARKORBIT_CI_ADMIN_WORKSPACE_ID:?MARKORBIT_CI_ADMIN_WORKSPACE_ID is required}"

expected_origin="${MARKORBIT_CONTROL_PLANE_URL%/}"
for argument in "$@"; do
  case "$argument" in
    "$expected_origin"|"$expected_origin"/*)
      ;;
    http://*|https://*)
      echo "ci-admin-api-curl refuses non-control-plane URL: $argument" >&2
      exit 64
      ;;
  esac
done

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

exec curl "${headers[@]}" "$@"
