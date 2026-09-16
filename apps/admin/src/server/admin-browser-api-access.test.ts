import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { DEFAULT_WORKSPACE, RegistryConflictError } from "@markorbit/persistence";
import {
  assertAdminBrowserResourceWorkspace,
  resolveAdminBrowserApiMutationAccess,
  resolveAdminBrowserApiReadAccess,
  type AdminBrowserApiAccessOptions,
} from "./admin-browser-api-access";
import { CaseProducerAccessError } from "./case-producer-auth";

const INTERNAL_SECRET = "i".repeat(32);
const CSRF_SECRET = "c".repeat(32);
const ORIGIN = "https://knowledge.example";
const CORE_A = "11111111-1111-4111-8111-111111111111";
const CORE_B = "22222222-2222-4222-8222-222222222222";
const KNOWLEDGE_A = "wsp_01ARZ3NDEKTSV4RRFFQ69G5FB1";
const KNOWLEDGE_B = "wsp_01ARZ3NDEKTSV4RRFFQ69G5FB0";

function principal(workspaceId: string, role = "WORKSPACE_ADMIN") {
  return {
    kind: "WORKSPACE" as const,
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

function workspaceOptions(
  bindings: Record<string, string> = { [CORE_A]: KNOWLEDGE_A, [CORE_B]: KNOWLEDGE_B },
  assertActive: (workspaceId: string) => void = () => undefined,
): Pick<AdminBrowserApiAccessOptions, "workspaceBindings" | "assertKnowledgeWorkspaceActive"> {
  return {
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
    assertKnowledgeWorkspaceActive: assertActive,
  };
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

test("read access translates Core workspace authority into Knowledge storage namespace", async () => {
  const access = await resolveAdminBrowserApiReadAccess(request(), CORE_A, {
    ...baseOptions,
    ...workspaceOptions(),
    fetchImpl: fetchPrincipal(principal(CORE_A)),
  });
  assert.equal(access.coreWorkspaceId, CORE_A);
  assert.equal(access.workspaceId, KNOWLEDGE_A);
  assert.equal(access.principal.workspaceId, CORE_A);
});
test("read access accepts a Knowledge workspace assertion only after Core binding translation", async () => {
  const access = await resolveAdminBrowserApiReadAccess(request(), KNOWLEDGE_A, {
    ...baseOptions,
    ...workspaceOptions(),
    fetchImpl: fetchPrincipal(principal(CORE_A)),
  });
  assert.equal(access.workspaceId, KNOWLEDGE_A);
});

test("read access allows explicit Global Public Knowledge with Core workspace context", async () => {
  const access = await resolveAdminBrowserApiReadAccess(
    request("GET", { "x-markorbit-workspace-id": CORE_A }),
    DEFAULT_WORKSPACE.id,
    {
      ...baseOptions,
      ...workspaceOptions(),
      fetchImpl: fetchPrincipal(principal(CORE_A)),
    },
  );
  assert.equal(access.coreWorkspaceId, CORE_A);
  assert.equal(access.workspaceId, DEFAULT_WORKSPACE.id);
});

test("read access fails closed when Core workspace header and Core assertion disagree", async () => {
  await assert.rejects(
    resolveAdminBrowserApiReadAccess(
      request("GET", { "x-markorbit-workspace-id": CORE_B }),
      CORE_A,
      { ...baseOptions, ...workspaceOptions(), fetchImpl: fetchPrincipal(principal(CORE_B)) },
    ),
    (error: unknown) =>
      error instanceof CaseProducerAccessError &&
      error.code === "WORKSPACE_MISMATCH" &&
      error.httpStatus === 403,
  );
});

test("explicit Global Public Knowledge still requires Core workspace context", async () => {
  await assert.rejects(
    resolveAdminBrowserApiReadAccess(request(), DEFAULT_WORKSPACE.id, {
      ...baseOptions,
      ...workspaceOptions(),
      fetchImpl: fetchPrincipal(principal(CORE_A)),
    }),
    (error) =>
      error instanceof CaseProducerAccessError &&
      error.code === "WORKSPACE_CONTEXT_REQUIRED" &&
      error.httpStatus === 403,
  );
});

test("read access fails closed when a Core workspace has no Knowledge binding", async () => {
  await assert.rejects(
    resolveAdminBrowserApiReadAccess(request(), CORE_A, {
      ...baseOptions,
      ...workspaceOptions({}),
      fetchImpl: fetchPrincipal(principal(CORE_A)),
    }),
    (error: unknown) =>
      error instanceof RegistryConflictError &&
      error.code === "KNOWLEDGE_WORKSPACE_BINDING_REQUIRED",
  );
});

test("read access applies the Knowledge-local availability gate after binding resolution", async () => {
  await assert.rejects(
    resolveAdminBrowserApiReadAccess(request(), CORE_A, {
      ...baseOptions,
      ...workspaceOptions(undefined, () => {
        throw new RegistryConflictError("WORKSPACE_NOT_ACTIVE", "Knowledge workspace is suspended");
      }),
      fetchImpl: fetchPrincipal(principal(CORE_A)),
    }),
    (error: unknown) =>
      error instanceof RegistryConflictError && error.code === "WORKSPACE_NOT_ACTIVE",
  );
});

test("mutation requires trusted origin and CSRF, then returns the Knowledge workspace", async () => {
  const access = await resolveAdminBrowserApiMutationAccess(
    request("POST", {
      origin: ORIGIN,
      "x-markorbit-csrf-token": csrf(),
    }),
    CORE_A,
    {
      ...baseOptions,
      ...workspaceOptions(),
      fetchImpl: fetchPrincipal(principal(CORE_A)),
    },
  );
  assert.equal(access.workspaceId, KNOWLEDGE_A);
});
test("mutation rejects READ_ONLY Core workspace membership", async () => {
  await assert.rejects(
    resolveAdminBrowserApiMutationAccess(
      request("PATCH", {
        origin: ORIGIN,
        "x-markorbit-csrf-token": csrf(),
      }),
      CORE_A,
      {
        ...baseOptions,
        ...workspaceOptions(),
        fetchImpl: fetchPrincipal(principal(CORE_A, "READ_ONLY")),
      },
    ),
    (error: unknown) =>
      error instanceof CaseProducerAccessError &&
      error.code === "PERMISSION_DENIED" &&
      error.httpStatus === 403,
  );
});

test("resource workspace assertions compare against the translated Knowledge namespace", () => {
  const options = { ...baseOptions, ...workspaceOptions() };
  assert.doesNotThrow(() =>
    assertAdminBrowserResourceWorkspace(principal(CORE_A), KNOWLEDGE_A, options),
  );
  assert.doesNotThrow(() =>
    assertAdminBrowserResourceWorkspace(principal(CORE_A), DEFAULT_WORKSPACE.id, options),
  );
  assert.throws(
    () => assertAdminBrowserResourceWorkspace(principal(CORE_A), KNOWLEDGE_B, options),
    (error: unknown) =>
      error instanceof CaseProducerAccessError && error.code === "WORKSPACE_MISMATCH",
  );
});
