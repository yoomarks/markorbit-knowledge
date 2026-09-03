import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const READ_ACCESS = "resolveAdminBrowserApiReadAccess";
const MUTATION_ACCESS = "resolveAdminBrowserApiMutationAccess";
const RESOURCE_WORKSPACE_ASSERTION = "assertAdminBrowserResourceWorkspace";

function routeSource(path: string): string {
  return readFileSync(new URL(`../app/api/${path}/route.ts`, import.meta.url), "utf8");
}

const workspaceScopedReadRoutes = [
  "artifacts",
  "artifacts/[id]",
  "artifacts/[id]/content",
  "artifacts/[id]/lineage",
  "artifacts/sessions/[id]",
  "connectors",
  "connectors/[connectorId]/[version]",
  "connectors/[connectorId]/versions",
  "connectors/compatible",
  "conversion-profiles",
  "conversion-profiles/[id]",
  "conversion-runs",
  "conversion-runs/[id]",
  "converters",
  "converters/[converterId]/[version]",
  "converters/[converterId]/versions",
  "discovery",
  "discovery/import-preview",
  "foundational/action-executions",
  "foundational/action-intents",
  "foundational/action-intents/[intentId]/execute",
  "foundational/collection-outcomes",
  "foundational/compatibility-reprobe-executions",
  "foundational/conversion-recovery",
  "foundational/remediation-queue",
  "foundational/retrieval-quality-remediation",
  "foundational/verified-canonical-reindex",
  "knowledge",
  "knowledge/[id]",
  "knowledge/[id]/graph",
  "knowledge/[id]/relationships",
  "operations/readiness",
  "raw-artifacts/eligible-for-conversion",
  "raw-artifacts/[id]/compatible-conversion-profiles",
  "ready-packages",
  "retrieval/relevance-audit",
  "source-supply-health",
  "sources",
  "sources/[id]",
  "sources/[id]/assessment",
  "sources/[id]/graph",
  "sources/[id]/plans",
  "sources/[id]/recommendations",
  "sources/[id]/runs",
] as const;

const workspaceScopedMutationRoutes = [
  "connectors",
  "connectors/[connectorId]/[version]/status",
  "conversion-profiles",
  "conversion-profiles/[id]",
  "conversion-profiles/[id]/status",
  "conversion-recovery/[id]/retry",
  "conversion-runs",
  "conversion-runs/[id]/cancel",
  "converters",
  "converters/[converterId]/[version]/status",
  "discovery",
  "discovery/batch",
  "discovery/candidates/[id]/authorize-collection",
  "discovery/candidates/[id]/review",
  "foundational/action-intents",
  "foundational/action-intents/[intentId]",
  "foundational/action-intents/[intentId]/execute",
  "foundational/retrieval-quality-remediation",
  "foundational/verified-canonical-reindex",
  "manual-uploads",
  "sources",
  "sources/[id]",
  "sources/[id]/archive",
  "sources/[id]/assessment",
  "sources/[id]/default-plan",
  "sources/[id]/discovery-expansion",
  "sources/[id]/graph",
  "sources/[id]/recommendations",
] as const;

const resourceWorkspaceRoutes = [
  "artifacts/[id]",
  "artifacts/[id]/content",
  "artifacts/[id]/lineage",
  "artifacts/sessions/[id]",
  "conversion-profiles/[id]",
  "conversion-profiles/[id]/status",
  "conversion-recovery/[id]/retry",
  "foundational/action-intents/[intentId]",
  "foundational/action-intents/[intentId]/execute",
  "raw-artifacts/[id]/compatible-conversion-profiles",
  "sources/[id]",
  "sources/[id]/archive",
  "sources/[id]/assessment",
  "sources/[id]/default-plan",
  "sources/[id]/discovery-expansion",
  "sources/[id]/graph",
  "sources/[id]/plans",
  "sources/[id]/recommendations",
  "sources/[id]/runs",
] as const;

const serverDerivedActorRoutes = ["conversion-runs", "conversion-runs/[id]/cancel"] as const;

const serverDerivedIdentityRoutes = [
  {
    route: "discovery/candidates/[id]/review",
    pattern: /reviewer:\s*principal\.userId/,
    forbidden: /reviewer:\s*(?:body\.|"admin-console")/,
  },
  {
    route: "discovery/candidates/[id]/authorize-collection",
    pattern: /requestedBy:\s*principal\.userId/,
    forbidden: /requestedBy:\s*(?:body\.|"admin-console")/,
  },
  {
    route: "foundational/action-intents",
    pattern: /requestedByActorId:\s*principal\.userId/,
    forbidden: /requestedByActorId:\s*(?:payload\.|body\.)/,
  },
  {
    route: "foundational/action-intents/[intentId]",
    pattern: /(?:approve|cancel)FoundationalActionIntent\([^)]*principal\.userId\)/s,
    forbidden: /actorId\s*=\s*typeof\s+payload\.actorId/,
  },
  {
    route: "foundational/action-intents/[intentId]/execute",
    pattern: /executedByActorId:\s*principal\.userId/,
    forbidden: /executedByActorId:\s*(?:payload\.|body\.)/,
  },
  {
    route: "conversion-recovery/[id]/retry",
    pattern: /actorId:\s*principal\.userId/,
    forbidden: /actorId:\s*(?:payload\.|body\.)/,
  },
  {
    route: "foundational/retrieval-quality-remediation",
    pattern: /actorId:\s*principal\.userId/,
    forbidden: /actorId:\s*(?:payload\.|body\.)/,
  },
] as const;

test("Admin browser workspace-scoped read routes use canonical read access", () => {
  for (const route of workspaceScopedReadRoutes) {
    assert.match(
      routeSource(route),
      new RegExp(`\\b${READ_ACCESS}\\b`),
      `${route} must resolve canonical Admin browser read access`,
    );
  }
});

test("Admin browser mutation routes use canonical mutation access", () => {
  for (const route of workspaceScopedMutationRoutes) {
    assert.match(
      routeSource(route),
      new RegExp(`\\b${MUTATION_ACCESS}\\b`),
      `${route} must resolve canonical Admin browser mutation access`,
    );
  }
});

test("Workspace resource routes bind canonical principals to durable resource workspace", () => {
  for (const route of resourceWorkspaceRoutes) {
    assert.match(
      routeSource(route),
      new RegExp(`\\b${RESOURCE_WORKSPACE_ASSERTION}\\b`),
      `${route} must assert the durable resource workspace`,
    );
  }
});

test("Browser mutations with durable actor fields derive actor identity from principal", () => {
  for (const route of serverDerivedActorRoutes) {
    const source = routeSource(route);
    assert.match(source, /actor:\s*\{\s*type:\s*"ADMIN",\s*id:\s*principal\.userId\s*\}/s);
    assert.doesNotMatch(source, /local-admin/);
  }
});

test("Browser mutation identity fields are server-derived", () => {
  for (const { route, pattern, forbidden } of serverDerivedIdentityRoutes) {
    const source = routeSource(route);
    assert.match(source, pattern, `${route} must derive mutation identity from principal.userId`);
    assert.doesNotMatch(source, forbidden, `${route} must not trust browser-supplied identity`);
  }
});
