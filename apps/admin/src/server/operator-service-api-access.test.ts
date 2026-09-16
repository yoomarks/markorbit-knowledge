import assert from "node:assert/strict";
import test from "node:test";
import {
  assertOperatorServiceResourceWorkspace,
  resolveOperatorServiceMutationAccess,
  resolveOperatorServiceReadAccess,
  type OperatorServiceAccessOptions,
} from "./operator-service-api-access";
import { CaseProducerAccessError } from "./case-producer-auth";

const INTERNAL_SECRET = "operator-service-test-secret-32-bytes";
const CORE_A = "11111111-1111-4111-8111-111111111111";
const CORE_B = "22222222-2222-4222-8222-222222222222";
const KNOWLEDGE_A = "wsp_01ARZ3NDEKTSV4RRFFQ69G5FB1";
const KNOWLEDGE_B = "wsp_01ARZ3NDEKTSV4RRFFQ69G5FB0";

function principalHeader(workspaceId: string, role = "WORKSPACE_ADMIN"): string {
  return Buffer.from(
    JSON.stringify({
      schemaVersion: 1,
      principal: {
        kind: "WORKSPACE",
        sessionId: "ses_operator_1",
        userId: "usr_operator_1",
        workspaceId,
        membershipId: "mem_operator_1",
        role,
        permissions: ["matter:read"],
        sessionExpiresAt: "2099-01-01T00:00:00.000Z",
      },
    }),
    "utf8",
  ).toString("base64url");
}

function request(
  workspaceId = CORE_A,
  role = "WORKSPACE_ADMIN",
  secret = INTERNAL_SECRET,
): Request {
  return new Request("https://knowledge.example/api/operator", {
    headers: {
      "x-markorbit-internal-authorization": secret,
      "x-markorbit-principal": principalHeader(workspaceId, role),
    },
  });
}

function options(
  bindings: Record<string, string> = { [CORE_A]: KNOWLEDGE_A, [CORE_B]: KNOWLEDGE_B },
): OperatorServiceAccessOptions {
  return {
    internalServiceSecret: INTERNAL_SECRET,
    workspaceBindings: {
      getByCoreWorkspaceId(coreWorkspaceId) {
        const knowledgeWorkspaceId = bindings[coreWorkspaceId];
        return knowledgeWorkspaceId
          ? {
              coreWorkspaceId,
              knowledgeWorkspaceId,
              createdAt: "2026-09-01T00:00:00.000Z",
              updatedAt: "2026-09-01T00:00:00.000Z",
            }
          : null;
      },
      getByKnowledgeWorkspaceId(knowledgeWorkspaceId) {
        const entry = Object.entries(bindings).find(([, value]) => value === knowledgeWorkspaceId);
        return entry
          ? {
              coreWorkspaceId: entry[0],
              knowledgeWorkspaceId,
              createdAt: "2026-09-01T00:00:00.000Z",
              updatedAt: "2026-09-01T00:00:00.000Z",
            }
          : null;
      },
    },
    assertKnowledgeWorkspaceActive: () => undefined,
  };
}

test("operator-service read requires internal service authentication", () => {
  assert.throws(
    () =>
      resolveOperatorServiceReadAccess(
        request(CORE_A, "WORKSPACE_ADMIN", "wrong-secret"),
        CORE_A,
        options(),
      ),
    (error: unknown) =>
      error instanceof CaseProducerAccessError &&
      error.code === "INTERNAL_SERVICE_UNAUTHORIZED" &&
      error.httpStatus === 401,
  );
});
test("operator-service read resolves Core authority to Knowledge storage namespace", () => {
  const access = resolveOperatorServiceReadAccess(request(), CORE_A, options());
  assert.equal(access.principal.workspaceId, CORE_A);
  assert.equal(access.workspaceId, KNOWLEDGE_A);

  assert.throws(
    () => resolveOperatorServiceReadAccess(request(), KNOWLEDGE_B, options()),
    (error: unknown) =>
      error instanceof CaseProducerAccessError &&
      error.code === "WORKSPACE_MISMATCH" &&
      error.httpStatus === 403,
  );
});

test("operator-service mutation rejects READ_ONLY principals", () => {
  assert.throws(
    () => resolveOperatorServiceMutationAccess(request(CORE_A, "READ_ONLY"), CORE_A, options()),
    (error: unknown) =>
      error instanceof CaseProducerAccessError &&
      error.code === "PERMISSION_DENIED" &&
      error.httpStatus === 403,
  );
});
test("operator-service resource assertion rejects another Knowledge workspace", () => {
  const access = resolveOperatorServiceReadAccess(request(), CORE_A, options());
  assert.doesNotThrow(() => assertOperatorServiceResourceWorkspace(access, KNOWLEDGE_A));
  assert.throws(
    () => assertOperatorServiceResourceWorkspace(access, KNOWLEDGE_B),
    (error: unknown) =>
      error instanceof CaseProducerAccessError &&
      error.code === "WORKSPACE_MISMATCH" &&
      error.httpStatus === 403,
  );
});

test("operator-service never falls back to Global Knowledge when a Core binding is missing", () => {
  assert.throws(
    () => resolveOperatorServiceReadAccess(request(), CORE_A, options({})),
    (error: unknown) =>
      error instanceof Error &&
      "code" in error &&
      error.code === "KNOWLEDGE_WORKSPACE_BINDING_REQUIRED",
  );
});
test("operator-service rejects legacy Core bindings to Global Public Knowledge", () => {
  assert.throws(
    () =>
      resolveOperatorServiceReadAccess(
        request(),
        CORE_A,
        options({ [CORE_A]: "wsp_01ARZ3NDEKTSV4RRFFQ69G5FAV" }),
      ),
    (error: unknown) =>
      error instanceof Error &&
      "code" in error &&
      error.code === "GLOBAL_WORKSPACE_CORE_BINDING_FORBIDDEN",
  );
});
