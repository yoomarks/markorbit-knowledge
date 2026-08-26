import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import type { CaseCandidateV1 } from "@markorbit/contracts";
import { SqliteCaseCandidateIntakeRepository } from "@markorbit/persistence/case-candidate-intake";
import type {
  MarkRegCaseSourceTransport,
  MarkRegCaseSourceTransportRequest,
} from "@markorbit/worker-runtime/markreg-case-evidence-collector";
import { CaseEvidenceCollectionService } from "./case-evidence-collection-service";
import {
  CASE_PRODUCER_INTERNAL_AUTHORIZATION_HEADER,
  CASE_PRODUCER_PRINCIPAL_HEADER,
} from "./case-producer-auth";
import { createRequestBoundMarkRegCaseSourceResolver } from "./markreg-case-source-resolver";

const workspaceId = "550e8400-e29b-41d4-a716-446655440001";
const matterId = "formal-matter_550e8400-e29b-41d4-a716-446655440000";
const snapshotSha = "a".repeat(64);
const secret = "request-bound-internal-secret";

function candidate(): CaseCandidateV1 {
  return {
    protocolVersion: "1.0",
    objectType: "CASE_CANDIDATE",
    candidateId: "case-candidate_request-bound-collection",
    sourceSystem: "MARKREG",
    sourceMatterId: matterId,
    sourceMatterVersion: 1,
    sourceSnapshotSha256: snapshotSha,
    sourceRetrievalRef: `/v1/formal-matters/${matterId}`,
    promotedBy: "user:operator:request-bound",
    promotedAt: "2026-08-25T15:50:00.000Z",
    accessScope: { sourceWorkspaceId: workspaceId, classification: "CONFIDENTIAL" },
    idempotencyKey: "promotion:request-bound:550e8400",
  };
}

function encodedPrincipal(): string {
  return Buffer.from(
    JSON.stringify({
      schemaVersion: 1,
      principal: {
        kind: "WORKSPACE",
        sessionId: "session_request_bound",
        userId: "user_request_bound",
        workspaceId,
        membershipId: "membership_request_bound",
        role: "MATTER_MANAGER",
        permissions: ["matter:read"],
        sessionExpiresAt: "9999-12-31T23:59:59.999Z",
      },
    }),
    "utf8",
  ).toString("base64url");
}

function json(value: unknown, status = 200): { status: number; body: Uint8Array } {
  return { status, body: Buffer.from(JSON.stringify(value), "utf8") };
}

describe("request-bound MarkReg evidence collection", () => {
  it("forwards authenticated workspace context and records optional permission omissions", async () => {
    const database = new DatabaseSync(":memory:");
    new SqliteCaseCandidateIntakeRepository(database).acceptCandidate(
      candidate(),
      "2026-08-25T15:51:00.000Z",
    );

    const principal = encodedPrincipal();
    const request = new Request("http://knowledge.local/api/internal/case-candidates/collect", {
      method: "POST",
      headers: {
        [CASE_PRODUCER_INTERNAL_AUTHORIZATION_HEADER]: secret,
        [CASE_PRODUCER_PRINCIPAL_HEADER]: principal,
      },
    });
    const requests: MarkRegCaseSourceTransportRequest[] = [];
    const routes: Record<string, { status: number; body: Uint8Array }> = {
      [`/v1/formal-matters/${matterId}`]: json({
        formalMatter: {
          formalMatterId: matterId,
          workspaceId,
          version: 1,
          snapshotSha256: snapshotSha,
          sourceSnapshot: { matterDraft: { jurisdiction: "US" } },
        },
        consequences: {
          orderCreated: false,
          paymentCreated: false,
          professionalAppointed: false,
          filingCreated: false,
        },
      }),
      [`/v1/operations/formal-matters/${matterId}/lifecycle-provenance`]: json(
        { error: "review permission required" },
        403,
      ),
      "/v1/document-packages": json({ error: "document permission required" }, 403),
    };
    const transport: MarkRegCaseSourceTransport = async (transportRequest) => {
      requests.push(transportRequest);
      const response = routes[new URL(transportRequest.url).pathname];
      if (!response) throw new Error(`Unexpected MarkReg route ${transportRequest.url}`);
      return response;
    };

    const service = new CaseEvidenceCollectionService({
      database,
      resolver: createRequestBoundMarkRegCaseSourceResolver(request, {
        baseUrl: "https://markreg.internal",
        internalServiceSecret: secret,
      }),
      transport,
      now: () => new Date("2026-08-25T15:52:00.000Z"),
    });
    const collection = await service.collectCandidate(candidate().candidateId);

    expect(collection.formalMatter.sourceRef).toBe(`markreg:/v1/formal-matters/${matterId}`);
    expect(collection.omissions).toEqual([
      { surface: "LIFECYCLE_PROVENANCE", reason: "NOT_AUTHORIZED" },
      { surface: "DOCUMENT_PACKAGES", reason: "NOT_AUTHORIZED" },
    ]);
    expect(requests).toHaveLength(3);
    for (const outgoing of requests) {
      expect(outgoing.headers).toMatchObject({
        "x-markorbit-internal-authorization": secret,
        "x-markorbit-principal": principal,
        "x-markorbit-workspace-id": workspaceId,
      });
    }

    expect(
      new SqliteCaseCandidateIntakeRepository(database).getIntake(candidate().candidateId),
    ).toMatchObject({
      collectionState: "COLLECTED",
      collectionRef: collection.collectionId,
    });
  });
});
