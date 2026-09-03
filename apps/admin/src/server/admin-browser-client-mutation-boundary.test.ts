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
  "components/runs/run-detail.tsx",
  "components/sources/manual-upload-control.tsx",
  "components/sources/radar-collection-authorization.tsx",
  "components/sources/radar-review-evidence.tsx",
  "components/sources/representative-activation-wave.tsx",
  "components/sources/source-assessment-panel.tsx",
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
      /\badminBrowserMutationHeaders\b/,
      `${path} must use adminBrowserMutationHeaders for browser mutations`,
    );
  }
});

test("Expert browser mutations carry the session CSRF token", () => {
  const source = appSource("components/experts/expert-qa-workbench.tsx");
  assert.match(source, /"x-markorbit-csrf-token"\s*:\s*csrfToken/);
  assert.match(source, /method:\s*"POST"/);
  assert.match(source, /method:\s*"PATCH"/);
});
