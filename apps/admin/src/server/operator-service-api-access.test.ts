import assert from "node:assert/strict";
import test from "node:test";
import {
  assertOperatorServiceResourceWorkspace,
  resolveOperatorServiceMutationAccess,
  resolveOperatorServiceReadAccess,
} from "./operator-service-api-access";
import { CaseProducerAccessError } from "./case-producer-auth";

const INTERNAL_SECRET = "operator-service-test-secret-32-bytes";
const WORKSPACE_A = "wsp_01ARZ3NDEKTSV4RRFFQ69G5FAV";
const WORKSPACE_B = "wsp_01ARZ3NDEKTSV4RRFFQ69G5FB0";

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
  workspaceId = WORKSPACE_A,
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

const previousInternalSecret = process.env.MO_INTERNAL_SERVICE_SECRET;
process.env.MO_INTERNAL_SERVICE_SECRET = INTERNAL_SECRET;
test.after(() => {
  if (previousInternalSecret === undefined) delete process.env.MO_INTERNAL_SERVICE_SECRET;
  else process.env.MO_INTERNAL_SERVICE_SECRET = previousInternalSecret;
});

test("operator-service read requires internal service authentication", () => {
  assert.throws(
    () => resolveOperatorServiceReadAccess(request(WORKSPACE_A, "WORKSPACE_ADMIN", "wrong-secret")),
    (error: unknown) =>
      error instanceof CaseProducerAccessError &&
      error.code === "INTERNAL_SERVICE_UNAUTHORIZED" &&
      error.httpStatus === 401,
  );
});

test("operator-service read treats caller workspace as a fail-closed assertion", () => {
  const principal = resolveOperatorServiceReadAccess(request(), WORKSPACE_A);
  assert.equal(principal.workspaceId, WORKSPACE_A);

  assert.throws(
    () => resolveOperatorServiceReadAccess(request(), WORKSPACE_B),
    (error: unknown) =>
      error instanceof CaseProducerAccessError &&
      error.code === "WORKSPACE_MISMATCH" &&
      error.httpStatus === 403,
  );
});

test("operator-service mutation rejects READ_ONLY principals", () => {
  assert.throws(
    () => resolveOperatorServiceMutationAccess(request(WORKSPACE_A, "READ_ONLY"), WORKSPACE_A),
    (error: unknown) =>
      error instanceof CaseProducerAccessError &&
      error.code === "PERMISSION_DENIED" &&
      error.httpStatus === 403,
  );
});

test("operator-service resource assertion rejects cross-workspace durable resources", () => {
  const principal = resolveOperatorServiceReadAccess(request(), WORKSPACE_A);
  assert.throws(
    () => assertOperatorServiceResourceWorkspace(principal, WORKSPACE_B),
    (error: unknown) =>
      error instanceof CaseProducerAccessError &&
      error.code === "WORKSPACE_MISMATCH" &&
      error.httpStatus === 403,
  );
});
