import { describe, expect, it } from "vitest";
import type { CaseCandidateV1 } from "@markorbit/contracts";
import {
  authorizeCaseProducerRequest,
  CASE_PRODUCER_INTERNAL_AUTHORIZATION_HEADER,
  CASE_PRODUCER_PRINCIPAL_HEADER,
  CaseProducerAccessError,
} from "../case-producer-auth";

const workspaceId = "550e8400-e29b-41d4-a716-446655440001";
const secret = "test-internal-service-secret";
const now = new Date("2026-08-26T14:00:00.000Z");

function candidate(overrides: Partial<CaseCandidateV1> = {}): CaseCandidateV1 {
  return {
    protocolVersion: "1.0",
    objectType: "CASE_CANDIDATE",
    candidateId: "case-candidate_producer-auth",
    sourceSystem: "MARKREG",
    sourceMatterId: "formal-matter_550e8400-e29b-41d4-a716-446655440000",
    sourceMatterVersion: 1,
    sourceSnapshotSha256: "a".repeat(64),
    sourceRetrievalRef: "/v1/formal-matters/formal-matter_550e8400-e29b-41d4-a716-446655440000",
    promotedBy: "user:operator:producer-auth",
    promotedAt: "2026-08-25T15:00:00.000Z",
    accessScope: {
      sourceWorkspaceId: workspaceId,
      classification: "CONFIDENTIAL",
    },
    idempotencyKey: "promotion:producer-auth:550e8400",
    ...overrides,
  };
}

function principal(overrides: Record<string, unknown> = {}): string {
  return Buffer.from(
    JSON.stringify({
      schemaVersion: 1,
      principal: {
        kind: "WORKSPACE",
        sessionId: "session_01",
        userId: "user_01",
        workspaceId,
        membershipId: "membership_01",
        role: "MATTER_MANAGER",
        permissions: ["workspace:read", "matter:read", "future:permission"],
        sessionExpiresAt: "2026-08-26T15:00:00.000Z",
        ...overrides,
      },
    }),
    "utf8",
  ).toString("base64url");
}

function request(options: { authorization?: string; encodedPrincipal?: string } = {}): Request {
  const headers = new Headers();
  if (options.authorization !== undefined) {
    headers.set(CASE_PRODUCER_INTERNAL_AUTHORIZATION_HEADER, options.authorization);
  }
  if (options.encodedPrincipal !== undefined) {
    headers.set(CASE_PRODUCER_PRINCIPAL_HEADER, options.encodedPrincipal);
  }
  return new Request("http://knowledge.local/api/internal/case-candidates", {
    method: "POST",
    headers,
  });
}

function expectAccessError(
  work: () => unknown,
  expected: { code: string; httpStatus: number },
): void {
  try {
    work();
    throw new Error("Expected CaseProducerAccessError");
  } catch (error) {
    expect(error).toBeInstanceOf(CaseProducerAccessError);
    expect((error as CaseProducerAccessError).code).toBe(expected.code);
    expect((error as CaseProducerAccessError).httpStatus).toBe(expected.httpStatus);
  }
}

function authorize(
  encodedPrincipal = principal(),
  authorization = secret,
  clock = now,
): ReturnType<typeof authorizeCaseProducerRequest> {
  return authorizeCaseProducerRequest(
    request({ authorization, encodedPrincipal }),
    candidate(),
    secret,
    clock,
  );
}

describe("Case producer internal authentication", () => {
  it("accepts the existing MarkReg Workspace Principal shape with matter:read", () => {
    const result = authorize();

    expect(result.workspaceId).toBe(workspaceId);
    expect(result.permissions).toContain("matter:read");
    expect(result.permissions).toContain("future:permission");
  });

  it("fails closed when the shared internal service secret is not configured", () => {
    expectAccessError(
      () =>
        authorizeCaseProducerRequest(
          request({ authorization: secret, encodedPrincipal: principal() }),
          candidate(),
          "",
          now,
        ),
      { code: "CASE_PRODUCER_AUTH_NOT_CONFIGURED", httpStatus: 503 },
    );
  });

  it("rejects a missing or incorrect internal service credential", () => {
    expectAccessError(
      () =>
        authorizeCaseProducerRequest(
          request({ encodedPrincipal: principal() }),
          candidate(),
          secret,
          now,
        ),
      { code: "INTERNAL_SERVICE_UNAUTHORIZED", httpStatus: 401 },
    );
    expectAccessError(() => authorize(principal(), "wrong"), {
      code: "INTERNAL_SERVICE_UNAUTHORIZED",
      httpStatus: 401,
    });
  });

  it("rejects malformed Workspace Principal envelopes", () => {
    expectAccessError(() => authorize("not-base64-json"), {
      code: "AUTHENTICATION_REQUIRED",
      httpStatus: 401,
    });
    expectAccessError(() => authorize(principal({ role: "UNKNOWN" })), {
      code: "AUTHENTICATION_REQUIRED",
      httpStatus: 401,
    });
  });

  it("rejects invalid, expired, and exactly-expired Workspace Principal sessions", () => {
    expectAccessError(() => authorize(principal({ sessionExpiresAt: "not-a-timestamp" })), {
      code: "AUTHENTICATION_REQUIRED",
      httpStatus: 401,
    });
    expectAccessError(
      () => authorize(principal({ sessionExpiresAt: "2026-08-26T13:59:59.999Z" })),
      { code: "SESSION_EXPIRED", httpStatus: 401 },
    );
    expectAccessError(() => authorize(principal({ sessionExpiresAt: now.toISOString() })), {
      code: "SESSION_EXPIRED",
      httpStatus: 401,
    });
  });

  it("requires the same matter:read permission used by MarkReg Formal Matter reads", () => {
    expectAccessError(() => authorize(principal({ permissions: ["workspace:read"] })), {
      code: "PERMISSION_DENIED",
      httpStatus: 403,
    });
  });

  it("rejects cross-workspace promotion even with valid service authentication", () => {
    expectAccessError(() => authorize(principal({ workspaceId: "workspace_other" })), {
      code: "WORKSPACE_MISMATCH",
      httpStatus: 403,
    });
  });
});
