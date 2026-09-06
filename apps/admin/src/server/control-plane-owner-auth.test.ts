import { describe, expect, it } from "vitest";
import {
  authenticateControlPlaneOwnerReadRequest,
  ControlPlaneOwnerAccessError,
  CONTROL_PLANE_OWNER_INTERNAL_AUTHORIZATION_HEADER,
  CONTROL_PLANE_OWNER_PRINCIPAL_HEADER,
} from "./control-plane-owner-auth";

const SECRET = "knowledge-owner-secret";
const NOW = new Date("2026-09-06T13:00:00.000Z");
const WORKSPACE_A = "workspace-a";
const WORKSPACE_B = "workspace-b";

function principal(overrides: Record<string, unknown> = {}): string {
  return Buffer.from(
    JSON.stringify({
      schemaVersion: 1,
      principal: {
        kind: "CONTROL_PLANE_KNOWLEDGE_READ",
        caller: "MARKORBIT_GATEWAY",
        workspaceId: WORKSPACE_A,
        authority: "control-plane:knowledge:read",
        expiresAt: "2026-09-06T14:00:00.000Z",
        ...overrides,
      },
    }),
    "utf8",
  ).toString("base64url");
}
function request(
  encodedPrincipal: string | null = principal(),
  authorization: string | null = SECRET,
): Request {
  const headers = new Headers();
  if (authorization) headers.set(CONTROL_PLANE_OWNER_INTERNAL_AUTHORIZATION_HEADER, authorization);
  if (encodedPrincipal) headers.set(CONTROL_PLANE_OWNER_PRINCIPAL_HEADER, encodedPrincipal);
  return new Request(
    "http://knowledge.internal/api/internal/control-plane/evidence-supply-health",
    {
      headers,
    },
  );
}

function expectAccessError(run: () => unknown, code: string, httpStatus: number): void {
  try {
    run();
    throw new Error("Expected ControlPlaneOwnerAccessError");
  } catch (error) {
    expect(error).toBeInstanceOf(ControlPlaneOwnerAccessError);
    expect(error).toMatchObject({ code, httpStatus });
  }
}

describe("authenticateControlPlaneOwnerReadRequest", () => {
  it("accepts the exact trusted Knowledge read principal and workspace", () => {
    const result = authenticateControlPlaneOwnerReadRequest(request(), WORKSPACE_A, SECRET, NOW);
    expect(result).toEqual({
      kind: "CONTROL_PLANE_KNOWLEDGE_READ",
      caller: "MARKORBIT_GATEWAY",
      workspaceId: WORKSPACE_A,
      authority: "control-plane:knowledge:read",
      expiresAt: "2026-09-06T14:00:00.000Z",
    });
  });

  it("fails closed when internal authentication is unconfigured or invalid", () => {
    expectAccessError(
      () => authenticateControlPlaneOwnerReadRequest(request(), WORKSPACE_A, undefined, NOW),
      "CONTROL_PLANE_OWNER_AUTH_NOT_CONFIGURED",
      503,
    );
    expectAccessError(
      () =>
        authenticateControlPlaneOwnerReadRequest(
          request(undefined, "wrong"),
          WORKSPACE_A,
          SECRET,
          NOW,
        ),
      "INTERNAL_SERVICE_UNAUTHORIZED",
      401,
    );
    expectAccessError(
      () =>
        authenticateControlPlaneOwnerReadRequest(
          request(undefined, null),
          WORKSPACE_A,
          SECRET,
          NOW,
        ),
      "INTERNAL_SERVICE_UNAUTHORIZED",
      401,
    );
  });

  it("does not accept Admin cookies or the legacy Workspace principal as integration authority", () => {
    const legacyOnly = new Request(
      "http://knowledge.internal/api/internal/control-plane/evidence-supply-health",
      {
        headers: {
          [CONTROL_PLANE_OWNER_INTERNAL_AUTHORIZATION_HEADER]: SECRET,
          "x-markorbit-principal": principal({ kind: "WORKSPACE", authority: "matter:read" }),
          cookie: "admin-session=browser-token",
        },
      },
    );
    expectAccessError(
      () => authenticateControlPlaneOwnerReadRequest(legacyOnly, WORKSPACE_A, SECRET, NOW),
      "AUTHENTICATION_REQUIRED",
      401,
    );
  });

  it.each(["matter:read", "control-plane:data:read", "control-plane:cognitive:read"])(
    "rejects unrelated authority %s",
    (authority) => {
      expectAccessError(
        () =>
          authenticateControlPlaneOwnerReadRequest(
            request(principal({ authority })),
            WORKSPACE_A,
            SECRET,
            NOW,
          ),
        "PERMISSION_DENIED",
        403,
      );
    },
  );

  it("rejects cross-workspace and expired trusted assertions", () => {
    expectAccessError(
      () => authenticateControlPlaneOwnerReadRequest(request(), WORKSPACE_B, SECRET, NOW),
      "WORKSPACE_MISMATCH",
      403,
    );
    expectAccessError(
      () =>
        authenticateControlPlaneOwnerReadRequest(
          request(principal({ expiresAt: NOW.toISOString() })),
          WORKSPACE_A,
          SECRET,
          NOW,
        ),
      "SESSION_EXPIRED",
      401,
    );
  });
});
