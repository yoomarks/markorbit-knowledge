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
  "conversion-runs",
  "conversion-runs/[id]",
  "knowledge",
  "knowledge/[id]",
  "knowledge/[id]/graph",
  "knowledge/[id]/relationships",
  "operations/readiness",
  "raw-artifacts/eligible-for-conversion",
  "raw-artifacts/[id]/compatible-conversion-profiles",
  "ready-packages",
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
  "conversion-runs",
  "conversion-runs/[id]/cancel",
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
