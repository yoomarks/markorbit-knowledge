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
    expect(() =>
      authorizeKnowledgeRelationshipRequest(request("workspace-b"), "workspace-a", secret, now),
    ).toThrowError(
      expect.objectContaining<Partial<CaseProducerAccessError>>({
        code: "WORKSPACE_MISMATCH",
        httpStatus: 403,
      }),
    );
  });

  it("fails closed when matter:read permission is absent", () => {
    expect(() =>
      authorizeKnowledgeRelationshipRequest(
        request("workspace-a", ["workspace:read"]),
        "workspace-a",
        secret,
        now,
      ),
    ).toThrowError(
      expect.objectContaining<Partial<CaseProducerAccessError>>({
        code: "PERMISSION_DENIED",
        httpStatus: 403,
      }),
    );
  });

  it("fails closed when the internal service secret is invalid", () => {
    expect(() =>
      authorizeKnowledgeRelationshipRequest(request(), "workspace-a", "different-secret", now),
    ).toThrowError(
      expect.objectContaining<Partial<CaseProducerAccessError>>({
        code: "INTERNAL_SERVICE_UNAUTHORIZED",
        httpStatus: 401,
      }),
    );
  });
});
