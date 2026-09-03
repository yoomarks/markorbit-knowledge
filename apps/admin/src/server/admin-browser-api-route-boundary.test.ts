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
  "knowledge",
  "knowledge/[id]",
  "knowledge/[id]/graph",
  "knowledge/[id]/relationships",
  "operations/readiness",
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
  "sources",
  "sources/[id]",
  "sources/[id]/archive",
  "sources/[id]/assessment",
  "sources/[id]/default-plan",
  "sources/[id]/discovery-expansion",
  "sources/[id]/graph",
  "sources/[id]/recommendations",
] as const;

const sourceResourceRoutes = [
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

test("Source resource routes bind canonical principals to the resource workspace", () => {
  for (const route of sourceResourceRoutes) {
    assert.match(
      routeSource(route),
      new RegExp(`\\b${RESOURCE_WORKSPACE_ASSERTION}\\b`),
      `${route} must assert the source resource workspace`,
    );
  }
});
