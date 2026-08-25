import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import {
  CASE_CANDIDATE_OBJECT_TYPE,
  CASE_CANDIDATE_PROTOCOL_VERSION,
  CASE_CANDIDATE_SOURCE_SYSTEM,
  type CaseCandidateV1,
} from "@markorbit/contracts";
import { SqliteCaseCandidateIntakeRepository } from "@markorbit/persistence/case-candidate-intake";
import { SqliteCaseEvidenceCollectionRepository } from "@markorbit/persistence/case-evidence-collections";
import type {
  MarkRegCaseSourceTransport,
  MarkRegCaseSourceTransportRequest,
} from "@markorbit/worker-runtime/markreg-case-evidence-collector";
import {
  CaseEvidenceCollectionService,
  CaseEvidenceCollectionServiceError,
} from "./case-evidence-collection-service";

const workspaceId = "workspace:test";
const matterId = "formal-matter_12345678";
const matterHash = "a".repeat(64);

function candidate(): CaseCandidateV1 {
  return {
    protocolVersion: CASE_CANDIDATE_PROTOCOL_VERSION,
    objectType: CASE_CANDIDATE_OBJECT_TYPE,
    candidateId: "case-candidate_01",
    sourceSystem: CASE_CANDIDATE_SOURCE_SYSTEM,
    sourceMatterId: matterId,
    sourceMatterVersion: 1,
    sourceSnapshotSha256: matterHash,
    sourceRetrievalRef: "markreg:authorized-ref:01",
    promotedBy: "operator:test",
    promotedAt: "2026-08-25T04:20:00.000Z",
    accessScope: { sourceWorkspaceId: workspaceId, classification: "CONFIDENTIAL" },
    idempotencyKey: "case-intake-001",
  };
}

function json(value: unknown, status = 200): { status: number; body: Uint8Array } {
  return { status, body: Buffer.from(JSON.stringify(value), "utf8") };
}

function successfulRoutes() {
  return {
    [`/v1/formal-matters/${matterId}`]: json({
      formalMatter: {
        formalMatterId: matterId,
        workspaceId,
        version: 1,
        snapshotSha256: matterHash,
        sourceSnapshot: { matterDraft: { jurisdiction: "US" } },
      },
      consequences: {
        orderCreated: false,
        paymentCreated: false,
        professionalAppointed: false,
        filingCreated: false,
      },
    }),
    [`/v1/operations/formal-matters/${matterId}/lifecycle-provenance`]: json({
      currentView: {
        lifecycleViewId: "lifecycle-view_01",
        workspaceId,
        formalMatter: { id: matterId, version: 1 },
        version: 1,
        officialStatusVerified: false,
      },
      events: [],
    }),
    "/v1/document-packages": json({
      documentPackages: [
        {
          documentPackageId: "document-package_01",
          workspaceId,
          formalMatterId: matterId,
          sourceFormalMatterVersion: 1,
          sourceFormalMatterHash: matterHash,
        },
      ],
    }),
    "/v1/document-packages/document-package_01": json({
      documentPackageId: "document-package_01",
      workspaceId,
      formalMatterId: matterId,
      sourceFormalMatterVersion: 1,
      sourceFormalMatterHash: matterHash,
      documentItems: [
        {
          documentItemId: "document-item_01",
          evidenceFingerprint: "c".repeat(64),
          documentReference: {
            checksum: "c".repeat(64),
            storageReference: "markreg-storage://document/01",
          },
        },
      ],
    }),
  };
}

function transportFrom(
  routes: Readonly<Record<string, { status: number; body: Uint8Array }>>,
  requests: MarkRegCaseSourceTransportRequest[],
): MarkRegCaseSourceTransport {
  return async (request) => {
    requests.push(request);
    const path = new URL(request.url).pathname;
    const response = routes[path];
    if (!response) throw new Error(`Unexpected request ${path}`);
    return response;
  };
}

function serviceFixture(
  database: DatabaseSync,
  routes: Readonly<Record<string, { status: number; body: Uint8Array }>>,
) {
  const requests: MarkRegCaseSourceTransportRequest[] = [];
  const service = new CaseEvidenceCollectionService({
    database,
    resolver: {
      resolve: async () => ({
        baseUrl: "https://markreg.test",
        workspaceId,
        internalAuthorization: "internal-secret-value",
        internalPrincipal: "encoded-workspace-principal",
      }),
    },
    transport: transportFrom(routes, requests),
    now: () => new Date("2026-08-25T04:30:00.000Z"),
  });
  return { service, requests };
}

describe("CaseEvidenceCollectionService", () => {
  it("runs durable Candidate -> authenticated MarkReg collection -> immutable evidence -> COLLECTED", async () => {
    const database = new DatabaseSync(":memory:");
    const candidates = new SqliteCaseCandidateIntakeRepository(database);
    candidates.acceptCandidate(candidate(), "2026-08-25T04:21:00.000Z");
    const fixture = serviceFixture(database, successfulRoutes());

    const collected = await fixture.service.collectCandidate("case-candidate_01");
    expect(collected.documentPackages).toHaveLength(1);
    expect(collected.documentPackages[0]?.documentPackageId).toBe("document-package_01");
    expect(collected.provenance.knowledgeSnapshotIsSystemOfRecord).toBe(false);

    const restartedCandidates = new SqliteCaseCandidateIntakeRepository(database);
    expect(restartedCandidates.getIntake("case-candidate_01")).toMatchObject({
      collectionState: "COLLECTED",
      collectionRef: collected.collectionId,
      collectedAt: collected.collectedAt,
    });
    const restartedEvidence = new SqliteCaseEvidenceCollectionRepository(database);
    expect(restartedEvidence.getCollection(collected.collectionId)).toEqual(collected);
    expect(restartedEvidence.listCollectionsForCandidate("case-candidate_01")).toEqual([collected]);

    const requestCount = fixture.requests.length;
    const replay = await fixture.service.collectCandidate("case-candidate_01");
    expect(replay).toEqual(collected);
    expect(fixture.requests).toHaveLength(requestCount);
  });

  it("persists WAITING_SOURCE on retryable MarkReg failure without fabricating evidence", async () => {
    const database = new DatabaseSync(":memory:");
    const candidates = new SqliteCaseCandidateIntakeRepository(database);
    candidates.acceptCandidate(candidate(), "2026-08-25T04:21:00.000Z");
    const fixture = serviceFixture(database, {
      [`/v1/formal-matters/${matterId}`]: json({ error: "temporary" }, 503),
    });

    await expect(fixture.service.collectCandidate("case-candidate_01")).rejects.toMatchObject({
      code: "MARKREG_TEMPORARY_FAILURE",
      retryable: true,
    });
    expect(candidates.getIntake("case-candidate_01")).toMatchObject({
      collectionState: "WAITING_SOURCE",
      sourceUnavailable: { code: "MARKREG_TEMPORARY_FAILURE", retryable: true },
    });
    expect(new SqliteCaseEvidenceCollectionRepository(database).listCollectionsForCandidate(
      "case-candidate_01",
    )).toEqual([]);
    expect(candidates.getCandidate("case-candidate_01")).toEqual(candidate());
  });

  it("fails before resolver/transport for a non-durable Candidate", async () => {
    const database = new DatabaseSync(":memory:");
    let resolved = false;
    const service = new CaseEvidenceCollectionService({
      database,
      resolver: {
        resolve: async () => {
          resolved = true;
          throw new Error("must not be called");
        },
      },
      transport: async () => {
        throw new Error("must not be called");
      },
    });

    await expect(service.collectCandidate("case-candidate_missing")).rejects.toBeInstanceOf(
      CaseEvidenceCollectionServiceError,
    );
    expect(resolved).toBe(false);
  });
});
