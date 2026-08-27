import { describe, expect, it } from "vitest";
import { CaseProducerAccessError } from "./case-producer-auth";
import { authorizeKnowledgeRelationshipRequest } from "./knowledge-relationship-auth";

const secret = "internal-secret";
const now = new Date("2026-08-27T00:00:00.000Z");

function principal(workspaceId = "workspace-a", permissions = ["matter:read"]): string {
  return Buffer.from(
    JSON.stringify({
      schemaVersion: 1,
      principal: {
        kind: "WORKSPACE",
        sessionId: "session-1",
        userId: "user-1",
        workspaceId,
        membershipId: "membership-1",
        role: "READ_ONLY",
        permissions,
        sessionExpiresAt: "2026-08-27T01:00:00.000Z",
      },
    }),
    "utf8",
  ).toString("base64url");
}

function request(workspaceId = "workspace-a", permissions = ["matter:read"]): Request {
  return new Request("https://knowledge.example/internal", {
    headers: {
      "x-markorbit-internal-authorization": secret,
      "x-markorbit-principal": principal(workspaceId, permissions),
    },
  });
}

function expectAccessError(action: () => void, code: string, httpStatus: number): void {
  try {
    action();
    throw new Error("Expected access to be denied");
  } catch (error) {
    expect(error).toBeInstanceOf(CaseProducerAccessError);
    expect(error).toMatchObject({ code, httpStatus });
  }
}

describe("KG-009 relationship authorization", () => {
  it("accepts an authenticated matter reader in the requested workspace", () => {
    const authorized = authorizeKnowledgeRelationshipRequest(
      request(),
      "workspace-a",
      secret,
      now,
    );
    expect(authorized.workspaceId).toBe("workspace-a");
  });

  it("fails closed on workspace mismatch", () => {
    expectAccessError(
      () => authorizeKnowledgeRelationshipRequest(request("workspace-b"), "workspace-a", secret, now),
      "WORKSPACE_MISMATCH",
      403,
    );
  });

  it("fails closed when matter:read permission is absent", () => {
    expectAccessError(
      () =>
        authorizeKnowledgeRelationshipRequest(
          request("workspace-a", ["workspace:read"]),
          "workspace-a",
          secret,
          now,
        ),
      "PERMISSION_DENIED",
      403,
    );
  });

  it("fails closed when the internal service secret is invalid", () => {
    expectAccessError(
      () =>
        authorizeKnowledgeRelationshipRequest(request(), "workspace-a", "different-secret", now),
      "INTERNAL_SERVICE_UNAUTHORIZED",
      401,
    );
  });
});
