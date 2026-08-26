import { describe, expect, it } from "vitest";
import type { CaseCandidateV1 } from "@markorbit/contracts";
import { CaseEvidenceCollectionError } from "@markorbit/worker-runtime/markreg-case-evidence-collector";
import {
  CASE_PRODUCER_INTERNAL_AUTHORIZATION_HEADER,
  CASE_PRODUCER_PRINCIPAL_HEADER,
  CaseProducerAccessError,
} from "./case-producer-auth";
import { createRequestBoundMarkRegCaseSourceResolver } from "./markreg-case-source-resolver";

const workspaceId = "550e8400-e29b-41d4-a716-446655440001";
const secret = "test-internal-service-secret";

function candidate(overrides: Partial<CaseCandidateV1> = {}): CaseCandidateV1 {
  return {
    protocolVersion: "1.0",
    objectType: "CASE_CANDIDATE",
    candidateId: "case-candidate_request-resolver",
    sourceSystem: "MARKREG",
    sourceMatterId: "formal-matter_550e8400-e29b-41d4-a716-446655440000",
    sourceMatterVersion: 1,
    sourceSnapshotSha256: "a".repeat(64),
    sourceRetrievalRef: "/v1/formal-matters/formal-matter_550e8400-e29b-41d4-a716-446655440000",
    promotedBy: "user:operator:request-resolver",
    promotedAt: "2026-08-25T15:45:00.000Z",
    accessScope: {
      sourceWorkspaceId: workspaceId,
      classification: "CONFIDENTIAL",
    },
    idempotencyKey: "promotion:request-resolver:550e8400",
    ...overrides,
  };
}

function encodedPrincipal(overrides: Record<string, unknown> = {}): string {
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
        permissions: ["matter:read"],
        sessionExpiresAt: "9999-12-31T23:59:59.999Z",
        ...overrides,
      },
    }),
    "utf8",
  ).toString("base64url");
}

function request(principal = encodedPrincipal(), authorization = secret): Request {
  return new Request("http://knowledge.local/api/internal/case-candidates/candidate/collect", {
    method: "POST",
    headers: {
      [CASE_PRODUCER_INTERNAL_AUTHORIZATION_HEADER]: authorization,
      [CASE_PRODUCER_PRINCIPAL_HEADER]: principal,
    },
  });
}

describe("request-bound MarkReg Case source resolver", () => {
  it("forwards only the authenticated service credential and Workspace Principal", async () => {
    const principal = encodedPrincipal();
    const resolver = createRequestBoundMarkRegCaseSourceResolver(request(principal), {
      baseUrl: "https://markreg.internal/",
      internalServiceSecret: secret,
    });

    await expect(resolver.resolve(candidate())).resolves.toEqual({
      baseUrl: "https://markreg.internal",
      workspaceId,
      internalAuthorization: secret,
      internalPrincipal: principal,
    });
  });

  it("does not require optional evidence permissions before MarkReg evaluates each surface", async () => {
    const resolver = createRequestBoundMarkRegCaseSourceResolver(request(), {
      baseUrl: "http://127.0.0.1:4105",
      internalServiceSecret: secret,
    });

    const access = await resolver.resolve(candidate());
    expect(access.workspaceId).toBe(workspaceId);
  });

  it("fails closed when MARKREG_URL is missing or invalid", async () => {
    const missing = createRequestBoundMarkRegCaseSourceResolver(request(), {
      baseUrl: "",
      internalServiceSecret: secret,
    });
    await expect(missing.resolve(candidate())).rejects.toMatchObject({
      code: "MARKREG_SOURCE_ACCESS_INVALID",
      retryable: false,
    });

    const invalid = createRequestBoundMarkRegCaseSourceResolver(request(), {
      baseUrl: "https://user:password@markreg.internal?token=secret",
      internalServiceSecret: secret,
    });
    await expect(invalid.resolve(candidate())).rejects.toBeInstanceOf(CaseEvidenceCollectionError);
  });

  it("rejects a Candidate from a different workspace before returning MarkReg access", async () => {
    const resolver = createRequestBoundMarkRegCaseSourceResolver(request(), {
      baseUrl: "https://markreg.internal",
      internalServiceSecret: secret,
    });

    await expect(
      resolver.resolve(
        candidate({
          accessScope: {
            sourceWorkspaceId: "550e8400-e29b-41d4-a716-446655440099",
            classification: "CONFIDENTIAL",
          },
        }),
      ),
    ).rejects.toBeInstanceOf(CaseProducerAccessError);
  });

  it("never substitutes a configured credential for a caller that failed internal auth", async () => {
    const resolver = createRequestBoundMarkRegCaseSourceResolver(
      request(encodedPrincipal(), "wrong"),
      {
        baseUrl: "https://markreg.internal",
        internalServiceSecret: secret,
      },
    );

    await expect(resolver.resolve(candidate())).rejects.toMatchObject({
      code: "INTERNAL_SERVICE_UNAUTHORIZED",
      httpStatus: 401,
    });
  });
});
