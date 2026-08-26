import { describe, expect, it } from "vitest";
import {
  ADMIN_CSRF_HEADER,
  ADMIN_WORKSPACE_HEADER,
  resolveAdminBrowserSession,
  resolveAdminBrowserWorkspacePrincipal,
  validateAdminBrowserMutation,
  type AdminBrowserSessionOptions,
} from "./admin-browser-session";
import { CaseProducerAccessError } from "./case-producer-auth";

const SECRET = "0123456789abcdef0123456789abcdef";
const CSRF_SECRET = "abcdef0123456789abcdef0123456789";
const WORKSPACE_A = "11111111-1111-4111-8111-111111111111";
const WORKSPACE_B = "22222222-2222-4222-8222-222222222222";
const EXPIRES = "2099-08-27T00:00:00.000Z";

function options(overrides: Partial<AdminBrowserSessionOptions> = {}): AdminBrowserSessionOptions {
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    const headers = new Headers(init?.headers);
    expect(headers.get("x-markorbit-internal-authorization")).toBe(SECRET);
    expect(headers.get("x-markorbit-principal")).toBeNull();

    if (url.endsWith("/internal/auth/sessions/resolve")) {
      expect(JSON.parse(String(init?.body))).toEqual({ token: "raw-browser-session" });
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
              workspaceId: WORKSPACE_A,
              name: "Workspace A",
              slug: "workspace-a",
              status: "ACTIVE",
              version: 1,
              createdAt: "2026-08-26T00:00:00.000Z",
              updatedAt: "2026-08-26T00:00:00.000Z",
            },
            membership: {
              membershipId: "membership-001",
              workspaceId: WORKSPACE_A,
              userId: "user-001",
              role: "REVIEWER",
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
      const body = JSON.parse(String(init?.body)) as { token: string; workspaceId: string };
      return Response.json({
        kind: "WORKSPACE",
        sessionId: "session-001",
        userId: "user-001",
        workspaceId: body.workspaceId,
        membershipId: "membership-001",
        role: "REVIEWER",
        permissions: ["workspace:read", "matter:read", "review:read", "review:perform"],
        sessionExpiresAt: EXPIRES,
      });
    }
    return Response.json({ code: "NOT_FOUND" }, { status: 404 });
  };
  return {
    coreAuthUrl: "http://core.test:4101",
    internalSecret: SECRET,
    csrfSecret: CSRF_SECRET,
    allowedOrigins: ["http://knowledge.test"],
    fetchImpl,
    now: new Date("2026-08-26T00:00:00.000Z"),
    ...overrides,
  };
}

function browserRequest(workspaceId = WORKSPACE_A, extra: HeadersInit = {}) {
  return new Request("http://knowledge.test/api/expert-tasks", {
    method: "POST",
    headers: {
      cookie: "mo_session=raw-browser-session",
      [ADMIN_WORKSPACE_HEADER]: workspaceId,
      ...Object.fromEntries(new Headers(extra)),
    },
  });
}

describe("Admin browser session bridge", () => {
  it("fails closed without the Core browser session cookie", async () => {
    await expect(
      resolveAdminBrowserWorkspacePrincipal(
        new Request("http://knowledge.test/api/expert-tasks", {
          headers: { [ADMIN_WORKSPACE_HEADER]: WORKSPACE_A },
        }),
        options(),
      ),
    ).rejects.toMatchObject({ code: "AUTHENTICATION_REQUIRED", httpStatus: 401 });
  });

  it("resolves session and workspace options without returning the raw token or internal secret", async () => {
    const session = await resolveAdminBrowserSession(browserRequest(), options());
    expect(session).toMatchObject({
      authenticated: true,
      userId: "user-001",
      sessionId: "session-001",
      workspaces: [{ workspaceId: WORKSPACE_A, name: "Workspace A", role: "REVIEWER" }],
    });
    expect(session.csrfToken).toMatch(/^[A-Za-z0-9_-]+$/u);
    expect(JSON.stringify(session)).not.toContain("raw-browser-session");
    expect(JSON.stringify(session)).not.toContain(SECRET);
  });

  it("derives the Workspace Principal from Core and does not accept browser principal authority", async () => {
    const principal = await resolveAdminBrowserWorkspacePrincipal(
      browserRequest(WORKSPACE_A, {
        "x-markorbit-principal": "forged-browser-principal",
      }),
      options(),
    );
    expect(principal.workspaceId).toBe(WORKSPACE_A);
    expect(principal.userId).toBe("user-001");
    expect(principal.role).toBe("REVIEWER");
  });

  it("rejects a Core principal that does not match the requested workspace", async () => {
    const mismatchOptions = options({
      fetchImpl: async () =>
        Response.json({
          kind: "WORKSPACE",
          sessionId: "session-001",
          userId: "user-001",
          workspaceId: WORKSPACE_B,
          membershipId: "membership-001",
          role: "REVIEWER",
          permissions: ["matter:read"],
          sessionExpiresAt: EXPIRES,
        }),
    });
    await expect(
      resolveAdminBrowserWorkspacePrincipal(browserRequest(WORKSPACE_A), mismatchOptions),
    ).rejects.toMatchObject({ code: "WORKSPACE_MISMATCH", httpStatus: 403 });
  });

  it("requires exact origin and a session-bound CSRF token for mutations", async () => {
    const session = await resolveAdminBrowserSession(browserRequest(), options());
    const mutation = browserRequest(WORKSPACE_A, {
      origin: "http://knowledge.test",
      [ADMIN_CSRF_HEADER]: session.csrfToken,
    });
    const principal = await resolveAdminBrowserWorkspacePrincipal(mutation, options());
    expect(() => validateAdminBrowserMutation(mutation, principal, options())).not.toThrow();

    expect(() =>
      validateAdminBrowserMutation(
        browserRequest(WORKSPACE_A, {
          origin: "http://evil.test",
          [ADMIN_CSRF_HEADER]: session.csrfToken,
        }),
        principal,
        options(),
      ),
    ).toThrowError(CaseProducerAccessError);
    expect(() =>
      validateAdminBrowserMutation(
        browserRequest(WORKSPACE_A, {
          origin: "http://knowledge.test",
          [ADMIN_CSRF_HEADER]: "wrong",
        }),
        principal,
        options(),
      ),
    ).toThrowError(/CSRF token is invalid/u);
  });
});
