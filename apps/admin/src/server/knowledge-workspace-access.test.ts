import assert from "node:assert/strict";
import test from "node:test";
import { RegistryValidationError } from "@markorbit/persistence";
import { CaseProducerAccessError } from "./case-producer-auth";
import {
  requiredKnowledgeWorkspaceId,
  resolveKnowledgeWorkspaceReadAccess,
} from "./knowledge-workspace-access";

const INTERNAL_SECRET = "i".repeat(32);
const CORE_A = "11111111-1111-4111-8111-111111111111";
const CORE_B = "22222222-2222-4222-8222-222222222222";
const KNOWLEDGE_A = "wsp_01ARZ3NDEKTSV4RRFFQ69G5FB6";

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

function request(workspaceId?: string, headerWorkspaceId?: string) {
  const url = new URL("https://knowledge.example/api/knowledge/document-1");
  if (workspaceId) url.searchParams.set("workspaceId", workspaceId);
  const headers: Record<string, string> = { cookie: "mo_session=session-token" };
  if (headerWorkspaceId) headers["x-markorbit-workspace-id"] = headerWorkspaceId;
  return new Request(url, { headers });
}

const baseOptions = {
  coreAuthUrl: "https://core.example",
  internalSecret: INTERNAL_SECRET,
  now: new Date("2026-09-05T00:00:00.000Z"),
  workspaceBindings: {
    getByCoreWorkspaceId(coreWorkspaceId: string) {
      return coreWorkspaceId === CORE_A
        ? {
            coreWorkspaceId: CORE_A,
            knowledgeWorkspaceId: KNOWLEDGE_A,
            createdAt: "2026-09-01T00:00:00.000Z",
            updatedAt: "2026-09-01T00:00:00.000Z",
          }
        : null;
    },
    getByKnowledgeWorkspaceId(knowledgeWorkspaceId: string) {
      return knowledgeWorkspaceId === KNOWLEDGE_A
        ? {
            coreWorkspaceId: CORE_A,
            knowledgeWorkspaceId: KNOWLEDGE_A,
            createdAt: "2026-09-01T00:00:00.000Z",
            updatedAt: "2026-09-01T00:00:00.000Z",
          }
        : null;
    },
  },
  assertKnowledgeWorkspaceActive: () => undefined,
};
test("Knowledge API requires an explicit Core workspace assertion", () => {
  assert.throws(
    () => requiredKnowledgeWorkspaceId(request()),
    (error: unknown) =>
      error instanceof RegistryValidationError && error.message.includes("workspaceId"),
  );
});

test("Knowledge API resolves Core authority to the bound Knowledge workspace", async () => {
  const access = await resolveKnowledgeWorkspaceReadAccess(request(CORE_A), {
    ...baseOptions,
    fetchImpl: fetchPrincipal(CORE_A),
  });
  assert.equal(access.coreWorkspaceId, CORE_A);
  assert.equal(access.workspaceId, KNOWLEDGE_A);
});

test("Knowledge API accepts an internal Knowledge assertion only with the matching Core header", async () => {
  const access = await resolveKnowledgeWorkspaceReadAccess(request(KNOWLEDGE_A, CORE_A), {
    ...baseOptions,
    fetchImpl: fetchPrincipal(CORE_A),
  });
  assert.equal(access.workspaceId, KNOWLEDGE_A);
});

test("changing client Core workspace routing cannot authorize another Workspace", async () => {
  await assert.rejects(
    resolveKnowledgeWorkspaceReadAccess(request(CORE_B, CORE_A), {
      ...baseOptions,
      fetchImpl: fetchPrincipal(CORE_A),
    }),
    (error: unknown) =>
      error instanceof CaseProducerAccessError &&
      error.code === "WORKSPACE_MISMATCH" &&
      error.httpStatus === 403,
  );
});
