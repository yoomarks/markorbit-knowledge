import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import {
  resolveAdminBrowserApiMutationAccess,
  resolveAdminBrowserApiReadAccess,
} from "./admin-browser-api-access";
import { CaseProducerAccessError } from "./case-producer-auth";

const INTERNAL_SECRET = "i".repeat(32);
const CSRF_SECRET = "c".repeat(32);
const ORIGIN = "https://knowledge.example";
const WORKSPACE_A = "wsp_01ARZ3NDEKTSV4RRFFQ69G5FAV";
const WORKSPACE_B = "wsp_01ARZ3NDEKTSV4RRFFQ69G5FB0";

function principal(workspaceId: string, role = "WORKSPACE_ADMIN") {
  return {
    kind: "WORKSPACE",
    sessionId: "ses_admin_1",
    userId: "usr_admin_1",
    workspaceId,
    membershipId: "mem_admin_1",
    role,
    permissions: ["matter:read"],
    sessionExpiresAt: "2030-01-01T00:00:00.000Z",
  };
}

function fetchPrincipal(value: ReturnType<typeof principal>): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(value), {
      status: 200,
      headers: { "content-type": "application/json" },
    })) as typeof fetch;
}

function csrf(sessionId = "ses_admin_1") {
  return createHmac("sha256", CSRF_SECRET)
    .update(`knowledge-admin-expert:${sessionId}`, "utf8")
    .digest("base64url");
}

function request(method = "GET", headers: Record<string, string> = {}) {
  return new Request(`${ORIGIN}/api/sources`, {
    method,
    headers: {
      cookie: "mo_session=session-token",
      ...headers,
    },
  });
}

const baseOptions = {
  coreAuthUrl: "https://core.example",
  internalSecret: INTERNAL_SECRET,
  csrfSecret: CSRF_SECRET,
  allowedOrigins: [ORIGIN],
  now: new Date("2026-09-03T00:00:00.000Z"),
};

test("read access treats query workspace as an assertion and returns the Core principal workspace", async () => {
  const access = await resolveAdminBrowserApiReadAccess(request(), WORKSPACE_A, {
    ...baseOptions,
    fetchImpl: fetchPrincipal(principal(WORKSPACE_A)),
  });
  assert.equal(access.workspaceId, WORKSPACE_A);
  assert.equal(access.principal.workspaceId, WORKSPACE_A);
});

test("read access fails closed when workspace header and assertion disagree", async () => {
  await assert.rejects(
    resolveAdminBrowserApiReadAccess(
      request("GET", { "x-markorbit-workspace-id": WORKSPACE_B }),
      WORKSPACE_A,
      { ...baseOptions, fetchImpl: fetchPrincipal(principal(WORKSPACE_B)) },
    ),
    (error: unknown) =>
      error instanceof CaseProducerAccessError &&
      error.code === "WORKSPACE_MISMATCH" &&
      error.httpStatus === 403,
  );
});

test("mutation requires trusted origin and CSRF, then accepts writable principal", async () => {
  const access = await resolveAdminBrowserApiMutationAccess(
    request("POST", {
      origin: ORIGIN,
      "x-markorbit-csrf-token": csrf(),
    }),
    WORKSPACE_A,
    { ...baseOptions, fetchImpl: fetchPrincipal(principal(WORKSPACE_A)) },
  );
  assert.equal(access.workspaceId, WORKSPACE_A);
});

test("mutation rejects READ_ONLY workspace membership", async () => {
  await assert.rejects(
    resolveAdminBrowserApiMutationAccess(
      request("PATCH", {
        origin: ORIGIN,
        "x-markorbit-csrf-token": csrf(),
      }),
      WORKSPACE_A,
      { ...baseOptions, fetchImpl: fetchPrincipal(principal(WORKSPACE_A, "READ_ONLY")) },
    ),
    (error: unknown) =>
      error instanceof CaseProducerAccessError &&
      error.code === "PERMISSION_DENIED" &&
      error.httpStatus === 403,
  );
});

test("mutation rejects missing CSRF token", async () => {
  await assert.rejects(
    resolveAdminBrowserApiMutationAccess(request("POST", { origin: ORIGIN }), WORKSPACE_A, {
      ...baseOptions,
      fetchImpl: fetchPrincipal(principal(WORKSPACE_A)),
    }),
    (error: unknown) =>
      error instanceof CaseProducerAccessError &&
      error.code === "INVALID_CSRF_TOKEN" &&
      error.httpStatus === 403,
  );
});
