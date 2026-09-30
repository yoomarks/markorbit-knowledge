import { describe, expect, it } from "vitest";
import { openRegistryDatabase } from "@markorbit/persistence";
import { SqliteCoreWorkspaceBindingRepository } from "@markorbit/persistence/core-workspace-bindings";
import { SqliteWorkspaceRepository } from "@markorbit/persistence/workspaces";
import {
  ADMIN_CSRF_HEADER,
  ADMIN_SESSION_COOKIE_NAME,
  ADMIN_WORKSPACE_HEADER,
  resolveAdminBrowserSession,
  type AdminBrowserSessionOptions,
} from "./admin-browser-session";
import { CaseProducerAccessError } from "./case-producer-auth";
import { provisionAdminBrowserKnowledgeWorkspace } from "./admin-browser-workspace-provisioning";

const SECRET = "0123456789abcdef0123456789abcdef";
const CSRF_SECRET = "abcdef0123456789abcdef0123456789";
const CORE_WORKSPACE = "11111111-1111-4111-8111-111111111111";
const ORIGIN = "http://knowledge.test";
const EXPIRES = "2099-08-27T00:00:00.000Z";

function authOptions(role: "REVIEWER" | "READ_ONLY" = "REVIEWER"): AdminBrowserSessionOptions {
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    if (url.endsWith("/internal/auth/sessions/resolve")) {
      return Response.json({
        kind: "AUTHENTICATED_USER",
        sessionId: "session-001",
        userId: "user-001",
        sessionExpiresAt: EXPIRES,
      });
    }
    if (url.includes("/internal/onboarding/users/user-001/workspaces")) {
      return Response.json({
        workspaces: [
          {
            workspace: {
              workspaceId: CORE_WORKSPACE,
              name: "Workspace A",
              slug: "workspace-a",
              status: "ACTIVE",
              version: 1,
              createdAt: "2026-08-26T00:00:00.000Z",
              updatedAt: "2026-08-26T00:00:00.000Z",
            },
            membership: {
              membershipId: "membership-001",
              workspaceId: CORE_WORKSPACE,
              userId: "user-001",
              role,
              status: "ACTIVE",
              version: 1,
              createdAt: "2026-08-26T00:00:00.000Z",
              updatedAt: "2026-08-26T00:00:00.000Z",
            },
          },
        ],
      });
    }
    if (url.endsWith("/internal/auth/workspace-principals/resolve")) {
      const body = JSON.parse(String(init?.body)) as { workspaceId: string };
      return Response.json({
        kind: "WORKSPACE",
        sessionId: "session-001",
        userId: "user-001",
        workspaceId: body.workspaceId,
        membershipId: "membership-001",
        role,
        permissions:
          role === "READ_ONLY"
            ? ["workspace:read", "matter:read"]
            : ["workspace:read", "matter:read", "review:read", "review:perform"],
        sessionExpiresAt: EXPIRES,
      });
    }
    return Response.json({ code: "NOT_FOUND" }, { status: 404 });
  };
  return {
    coreAuthUrl: "http://core.test:4101",
    internalSecret: SECRET,
    csrfSecret: CSRF_SECRET,
    allowedOrigins: [ORIGIN],
    fetchImpl,
    now: new Date("2026-08-26T00:00:00.000Z"),
  };
}

function sessionRequest() {
  return new Request(ORIGIN + "/api/admin-session", {
    headers: { cookie: `${ADMIN_SESSION_COOKIE_NAME}=raw-browser-session` },
  });
}
async function mutationRequest(options: AdminBrowserSessionOptions, includeCsrf = true) {
  const session = await resolveAdminBrowserSession(sessionRequest(), options);
  const headers = new Headers({
    cookie: `${ADMIN_SESSION_COOKIE_NAME}=raw-browser-session`,
    origin: ORIGIN,
    [ADMIN_WORKSPACE_HEADER]: CORE_WORKSPACE,
  });
  if (includeCsrf) headers.set(ADMIN_CSRF_HEADER, session.csrfToken);
  return new Request(ORIGIN + "/api/admin-session/knowledge-workspace", {
    method: "POST",
    headers,
  });
}

describe("Admin browser Knowledge workspace provisioning", () => {
  it("creates one private binding and is idempotent for the authenticated Core workspace", async () => {
    const database = openRegistryDatabase(":memory:");
    try {
      const options = { ...authOptions(), database };
      const first = await provisionAdminBrowserKnowledgeWorkspace(
        await mutationRequest(options),
        options,
      );
      const second = await provisionAdminBrowserKnowledgeWorkspace(
        await mutationRequest(options),
        options,
      );

      expect(first.created).toBe(true);
      expect(second.created).toBe(false);
      expect(second.workspace.id).toBe(first.workspace.id);
      expect(first.workspace.dataDomain).toBe("WORKSPACE_PRIVATE");
      expect(first.workspace.status).toBe("ACTIVE");
      expect(
        new SqliteCoreWorkspaceBindingRepository(database).getByCoreWorkspaceId(CORE_WORKSPACE)
          ?.knowledgeWorkspaceId,
      ).toBe(first.workspace.id);
      expect(
        new SqliteWorkspaceRepository(database).list({ dataDomain: "WORKSPACE_PRIVATE" }),
      ).toHaveLength(1);
    } finally {
      database.close();
    }
  });

  it("rejects a missing CSRF token without creating private workspace state", async () => {
    const database = openRegistryDatabase(":memory:");
    try {
      const options = { ...authOptions(), database };
      await expect(
        provisionAdminBrowserKnowledgeWorkspace(await mutationRequest(options, false), options),
      ).rejects.toMatchObject({ code: "INVALID_CSRF_TOKEN", httpStatus: 403 });
      expect(
        new SqliteWorkspaceRepository(database).list({ dataDomain: "WORKSPACE_PRIVATE" }),
      ).toHaveLength(0);
    } finally {
      database.close();
    }
  });
  it("does not let a READ_ONLY Core membership provision Knowledge state", async () => {
    const database = openRegistryDatabase(":memory:");
    try {
      const options = { ...authOptions("READ_ONLY"), database };
      await expect(
        provisionAdminBrowserKnowledgeWorkspace(await mutationRequest(options), options),
      ).rejects.toSatisfy(
        (error: unknown) =>
          error instanceof CaseProducerAccessError &&
          error.code === "PERMISSION_DENIED" &&
          error.httpStatus === 403,
      );
      expect(
        new SqliteWorkspaceRepository(database).list({ dataDomain: "WORKSPACE_PRIVATE" }),
      ).toHaveLength(0);
    } finally {
      database.close();
    }
  });
});
