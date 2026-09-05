import assert from "node:assert/strict";
import test from "node:test";
import { RegistryValidationError } from "@markorbit/persistence";
import { CaseProducerAccessError } from "./case-producer-auth";
import {
  requiredKnowledgeWorkspaceId,
  resolveKnowledgeWorkspaceReadAccess,
} from "./knowledge-workspace-access";

const INTERNAL_SECRET = "i".repeat(32);
const WORKSPACE_A = "wsp_01ARZ3NDEKTSV4RRFFQ69G5FAV";
const WORKSPACE_B = "wsp_01ARZ3NDEKTSV4RRFFQ69G5FB0";

function principal(workspaceId: string) {
  return {
    kind: "WORKSPACE",
    sessionId: "ses_admin_1",
    userId: "usr_admin_1",
    workspaceId,
    membershipId: "mem_admin_1",
    role: "WORKSPACE_ADMIN",
    permissions: ["matter:read"],
    sessionExpiresAt: "2030-01-01T00:00:00.000Z",
  };
}

function fetchPrincipal(workspaceId: string): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(principal(workspaceId)), {
      status: 200,
      headers: { "content-type": "application/json" },
    })) as typeof fetch;
}

function request(workspaceId?: string) {
  const url = new URL("https://knowledge.example/api/knowledge/document-1");
  if (workspaceId) url.searchParams.set("workspaceId", workspaceId);
  return new Request(url, { headers: { cookie: "mo_session=session-token" } });
}

const baseOptions = {
  coreAuthUrl: "https://core.example",
  internalSecret: INTERNAL_SECRET,
  now: new Date("2026-09-05T00:00:00.000Z"),
};

test("Knowledge API requires an explicit workspace assertion", () => {
  assert.throws(
    () => requiredKnowledgeWorkspaceId(request()),
    (error: unknown) =>
      error instanceof RegistryValidationError && error.message.includes("workspaceId"),
  );
});

test("Knowledge API resolves an explicitly authorized workspace", async () => {
  const access = await resolveKnowledgeWorkspaceReadAccess(request(WORKSPACE_A), {
    ...baseOptions,
    fetchImpl: fetchPrincipal(WORKSPACE_A),
  });
  assert.equal(access.workspaceId, WORKSPACE_A);
});

test("changing client workspace routing cannot authorize a cross-workspace Knowledge id", async () => {
  await assert.rejects(
    resolveKnowledgeWorkspaceReadAccess(request(WORKSPACE_B), {
      ...baseOptions,
      fetchImpl: fetchPrincipal(WORKSPACE_A),
    }),
    (error: unknown) =>
      error instanceof CaseProducerAccessError &&
      error.code === "WORKSPACE_MISMATCH" &&
      error.httpStatus === 403,
  );
});
