import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function appSource(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

const sharedMutationHeaderClients = [
  "components/conversion-runs/conversion-dispatch.tsx",
  "components/conversion-runs/conversion-run-detail.tsx",
  "components/discovery/discovery-workspace.tsx",
  "components/foundational/foundational-compatibility-reprobe-workbench.tsx",
  "components/foundational/foundational-conversion-recovery-workbench.tsx",
  "components/foundational/foundational-operator-workbench.tsx",
  "components/foundational/foundational-retrieval-quality-remediation-workbench.tsx",
  "components/foundational/foundational-verified-canonical-reindex-workbench.tsx",
  "components/overview/overview-workbench.tsx",
  "components/plans/plan-editor.tsx",
  "components/plans/plan-runs-panel.tsx",
  "components/ready-packages/package-business-workbench.tsx",
  "components/ready-packages/ready-package-delivery-workbench.tsx",
  "components/runs/run-detail.tsx",
  "components/artifacts/manual-upload-control.tsx",
  "components/sources/radar-collection-authorization.tsx",
  "components/sources/radar-review-evidence.tsx",
  "components/sources/representative-activation-wave.tsx",
  "components/sources/source-assessment-panel.tsx",
  "components/sources/source-country-analysis.tsx",
  "components/sources/source-country-coverage.tsx",
  "components/sources/source-detail-workbench.tsx",
  "components/sources/source-editor.tsx",
  "components/sources/source-graph-panel.tsx",
  "components/sources/source-intelligence-manual-sla.tsx",
  "components/sources/source-intelligence-policy-scopes.tsx",
  "components/sources/source-intelligence-review-ownership.tsx",
  "components/sources/source-intelligence-review-queue.tsx",
  "components/sources/source-intelligence-workbench.tsx",
  "components/sources/source-plans-panel.tsx",
  "components/sources/source-related-recommendations.tsx",
  "components/vault/canonical-downstream-promotion-control.tsx",
  "components/vault/ready-package-v2-control.tsx",
  "components/vault/ready-package-v2-delivery-control.tsx",
  "components/vault/vault-binding-control.tsx",
  "components/vault/vault-export-control.tsx",
  "components/vault/vault-import-execution-control.tsx",
  "components/vault/vault-import-intent-control.tsx",
  "components/vault/vault-inspection-control.tsx",
  "components/vault/vault-origin-staging-verification-control.tsx",
  "components/workers/worker-editor.tsx",
  "components/workers/worker-list.tsx",
  "lib/admin-v2/discovery-intake-workbench.tsx",
  "lib/admin-v2/manual-upload-request.ts",
  "lib/admin-v2/source-smart-review-ui.tsx",
] as const;

test("Admin browser mutation clients use the canonical CSRF header helper", () => {
  for (const path of sharedMutationHeaderClients) {
    assert.match(
      appSource(path),
      /\b(?:adminBrowserMutationHeaders|adminBrowserWorkspaceMutationHeaders)\b/,
      `${path} must use a canonical Admin browser mutation header helper`,
    );
  }
});

test("Expert browser mutations carry the session CSRF token", () => {
  const source = appSource("components/experts/expert-qa-workbench.tsx");
  assert.match(source, /"x-markorbit-csrf-token"\s*:\s*csrfToken/);
  assert.match(source, /method:\s*"POST"/);
  assert.match(source, /method:\s*"PATCH"/);
});

test("Admin browser mutation helper carries the canonical Core workspace context", () => {
  const source = appSource("lib/admin-browser-api-client.ts");
  assert.match(source, /browserWorkspaceIdFromLocation/);
  assert.match(
    source,
    /headers\.set\(ADMIN_WORKSPACE_HEADER, normalizedWorkspaceId\(workspaceId\)\)/,
  );
});

test("Sources and Discovery browser reads carry explicit Core workspace context", () => {
  assert.match(appSource("components/sources/source-list.tsx"), /workspaceId,/);
  assert.match(
    appSource("components/sources/radar-review-evidence.tsx"),
    /workspaceId,\s*candidateLimit/,
  );
  assert.match(
    appSource("components/sources/radar-collection-authorization.tsx"),
    /workspaceId,\s*candidateLimit/,
  );
  assert.match(appSource("lib/admin-v2/source-smart-review-ui.tsx"), /workspaceId,/);
});

test("Workspace-scoped browser APIs never silently default to Global Public Knowledge", () => {
  for (const path of [
    "app/api/capabilities/page-value/route.ts",
    "app/api/discovery/route.ts",
    "app/api/discovery/batch/route.ts",
    "app/api/discovery/collection-authorization/route.ts",
    "app/api/discovery/reviews/route.ts",
    "app/api/discovery/reviews/reopen/route.ts",
    "app/api/source-coverage/activation-wave/route.ts",
  ]) {
    assert.doesNotMatch(appSource(path), /DEFAULT_WORKSPACE\.id/);
  }
});
