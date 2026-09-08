import { describe, expect, it } from "vitest";
import { authenticateControlPlanePlatformOwnerReadRequest } from "./control-plane-platform-owner-auth";
import {
  ControlPlaneOwnerAccessError,
  CONTROL_PLANE_OWNER_INTERNAL_AUTHORIZATION_HEADER,
  CONTROL_PLANE_OWNER_PRINCIPAL_HEADER,
} from "./control-plane-owner-auth";

const SECRET = "knowledge-owner-secret";
const NOW = new Date("2026-09-08T10:00:00.000Z");

function principal(overrides: Record<string, unknown> = {}): string {
  return Buffer.from(
    JSON.stringify({
      schemaVersion: 1,
      principal: {
        kind: "CONTROL_PLANE_KNOWLEDGE_PLATFORM_READ",
        caller: "MARKORBIT_GATEWAY",
        authority: "control-plane:knowledge:read",
        expiresAt: "2026-09-08T11:00:00.000Z",
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
    "http://knowledge.internal/api/internal/control-plane/platform-administration",
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

describe("authenticateControlPlanePlatformOwnerReadRequest", () => {
  it("accepts only the exact platform Knowledge read principal", () => {
    expect(authenticateControlPlanePlatformOwnerReadRequest(request(), SECRET, NOW)).toEqual({
      kind: "CONTROL_PLANE_KNOWLEDGE_PLATFORM_READ",
      caller: "MARKORBIT_GATEWAY",
      authority: "control-plane:knowledge:read",
      expiresAt: "2026-09-08T11:00:00.000Z",
    });
  });
  it("rejects Workspace-scoped or unrelated authority assertions", () => {
    expectAccessError(
      () =>
        authenticateControlPlanePlatformOwnerReadRequest(
          request(principal({ workspaceId: "workspace-a" })),
          SECRET,
          NOW,
        ),
      "AUTHENTICATION_REQUIRED",
      401,
    );
    expectAccessError(
      () =>
        authenticateControlPlanePlatformOwnerReadRequest(
          request(principal({ authority: "control-plane:data:read" })),
          SECRET,
          NOW,
        ),
      "PERMISSION_DENIED",
      403,
    );
  });

  it("fails closed on invalid service identity or expired principal", () => {
    expectAccessError(
      () =>
        authenticateControlPlanePlatformOwnerReadRequest(request(undefined, "wrong"), SECRET, NOW),
      "INTERNAL_SERVICE_UNAUTHORIZED",
      401,
    );
    expectAccessError(
      () =>
        authenticateControlPlanePlatformOwnerReadRequest(
          request(principal({ expiresAt: NOW.toISOString() })),
          SECRET,
          NOW,
        ),
      "SESSION_EXPIRED",
      401,
    );
  });
});
