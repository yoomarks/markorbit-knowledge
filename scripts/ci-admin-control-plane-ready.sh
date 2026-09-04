#!/usr/bin/env bash
set -euo pipefail

: "${RUNNER_TEMP:?RUNNER_TEMP is required}"
: "${GITHUB_ENV:?GITHUB_ENV is required}"
: "${GITHUB_PATH:?GITHUB_PATH is required}"
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

    # GitHub Actions blocks NODE_OPTIONS from being written through GITHUB_ENV.
    # Publish a node shim through GITHUB_PATH instead so only later workflow steps
    # preload authenticated Admin fetch support. The already-running Admin server
    # remains untouched, and the preload itself only decorates localhost /api/* calls.
    real_node="$(command -v node)"
    node_shim_dir="$RUNNER_TEMP/markorbit-ci-node/bin"
    node_shim="$node_shim_dir/node"
    fetch_hook="--import=${GITHUB_WORKSPACE}/scripts/admin-browser-calibration-fetch.mjs"
    mkdir -p "$node_shim_dir"
    cat > "$node_shim" <<EOF
#!/usr/bin/env bash
set -euo pipefail
node_options="\${NODE_OPTIONS:-}"
fetch_hook='${fetch_hook}'
if [[ " \${node_options} " != *" \${fetch_hook} "* ]]; then
  node_options="\${node_options:+\${node_options} }\${fetch_hook}"
fi
exec env NODE_OPTIONS="\${node_options}" '${real_node}' "\$@"
EOF
    chmod +x "$node_shim"
    printf '%s\n' "$node_shim_dir" >> "$GITHUB_PATH"
    exit 0
  fi
  sleep 2
done

[[ -f "$RUNNER_TEMP/admin.log" ]] && cat "$RUNNER_TEMP/admin.log"
[[ -f "$RUNNER_TEMP/admin-auth-stub.log" ]] && cat "$RUNNER_TEMP/admin-auth-stub.log"
exit 1
