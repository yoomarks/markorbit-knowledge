import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import {
  CASE_CANDIDATE_OBJECT_TYPE,
  CASE_CANDIDATE_PROTOCOL_VERSION,
  CASE_CANDIDATE_SOURCE_SYSTEM,
  CASE_EVIDENCE_COLLECTION_OBJECT_TYPE,
  CASE_EVIDENCE_COLLECTION_PROTOCOL_VERSION,
  CASE_EVIDENCE_SOURCE_SYSTEM,
  type CaseCandidateV1,
  type CaseEvidenceCollectionV1,
  type ExactCaseSourcePayloadV1,
} from "@markorbit/contracts";
import { SqliteCaseCandidateIntakeRepository } from "@markorbit/persistence/case-candidate-intake";
import { SqliteCaseEvidenceCollectionRepository } from "@markorbit/persistence/case-evidence-collections";
import {
  CaseDossierAssemblyService,
  CaseDossierAssemblyServiceError,
} from "./case-dossier-assembly-service";

const matterId = "formal-matter_12345678";
const workspaceId = "workspace:test";
const snapshotSha = "a".repeat(64);

function exact(sourceRef: string, value: unknown): ExactCaseSourcePayloadV1 {
  const bytes = Buffer.from(JSON.stringify(value), "utf8");
  return {
    sourceRef,
    mediaType: "application/json",
    sha256: createHash("sha256").update(bytes).digest("hex"),
    sizeBytes: bytes.byteLength,
    dataBase64: bytes.toString("base64"),
  };
}

function candidate(): CaseCandidateV1 {
  return {
    protocolVersion: CASE_CANDIDATE_PROTOCOL_VERSION,
    objectType: CASE_CANDIDATE_OBJECT_TYPE,
    candidateId: "case-candidate_01",
    sourceSystem: CASE_CANDIDATE_SOURCE_SYSTEM,
    sourceMatterId: matterId,
    sourceMatterVersion: 1,
    sourceSnapshotSha256: snapshotSha,
    sourceRetrievalRef: "markreg:authorized-ref:01",
    promotedBy: "operator:test",
    promotedAt: "2026-08-25T03:20:00.000Z",
    accessScope: { sourceWorkspaceId: workspaceId, classification: "CONFIDENTIAL" },
    idempotencyKey: "case-intake-001",
  };
}

function collection(): CaseEvidenceCollectionV1 {
  return {
    protocolVersion: CASE_EVIDENCE_COLLECTION_PROTOCOL_VERSION,
    objectType: CASE_EVIDENCE_COLLECTION_OBJECT_TYPE,
    collectionId: "case-evidence_01",
    candidateId: "case-candidate_01",
    sourceSystem: CASE_EVIDENCE_SOURCE_SYSTEM,
    sourceMatter: {
      sourceMatterId: matterId,
      sourceMatterVersion: 1,
      sourceSnapshotSha256: snapshotSha,
      sourceRetrievalRef: "markreg:authorized-ref:01",
      sourceWorkspaceId: workspaceId,
    },
    formalMatter: exact(`markreg:/v1/formal-matters/${matterId}`, {
      formalMatter: {
        schemaVersion: 1,
        formalMatterId: matterId,
        workspaceId,
        kind: "TRADEMARK_REGISTRATION",
        status: "OPEN",
        version: 1,
        sourceSnapshot: {
          schemaVersion: 1,
          preparation: {
            applicantName: "Example Applicant LLC",
            trademark: "EXAMPLE",
            targetJurisdiction: "US",
            classes: [9],
            documentReferences: [],
          },
        },
        snapshotSchemaVersion: 1,
        snapshotSha256: snapshotSha,
        createdByUserId: "user_01",
        createdAt: "2026-08-25T04:00:00.000Z",
        updatedAt: "2026-08-25T04:00:00.000Z",
      },
    }),
    documentPackages: [],
    omissions: [
      { surface: "LIFECYCLE_PROVENANCE", reason: "NOT_AVAILABLE" },
      { surface: "DOCUMENT_PACKAGES", reason: "NOT_AVAILABLE" },
    ],
    collectedAt: "2026-08-25T04:20:00.000Z",
    provenance: {
      sourceFamily: "CASE",
      originalSystem: "MARKREG",
      originalSystemAuthoritative: true,
      knowledgeSnapshotIsSystemOfRecord: false,
    },
  };
}

function setup(markCollected = true) {
  const database = new DatabaseSync(":memory:");
  const candidates = new SqliteCaseCandidateIntakeRepository(database);
  candidates.acceptCandidate(candidate(), "2026-08-25T03:21:00.000Z");
  const evidence = new SqliteCaseEvidenceCollectionRepository(database);
  const saved = evidence.saveCollection(collection()).collection;
  if (markCollected) {
    candidates.recordCollectionComplete(
      candidate().candidateId,
      saved.collectionId,
      saved.collectedAt,
    );
  }
  return { database, candidates, evidence, saved };
}

describe("CaseDossierAssemblyService", () => {
  it("composes durable Candidate -> immutable evidence -> Dossier without MarkReg I/O", () => {
    const f = setup();
    const service = new CaseDossierAssemblyService(f.database);
    const first = service.assembleCandidate("case-candidate_01");

    expect(first.state).toBe("ASSEMBLED");
    expect(first.evidenceCollectionId).toBe("case-evidence_01");
    expect(first.identity.jurisdiction?.value).toBe("US");
    expect(first.timeline.map((event) => event.eventId)).toEqual(["formal-matter-created"]);
    expect(first.completeness.timeline).toBe("SOURCE_UNAVAILABLE");

    const restarted = new CaseDossierAssemblyService(f.database);
    const replay = restarted.assembleCandidate("case-candidate_01");
    expect(replay).toEqual(first);
    expect(restarted.listDossiersForCandidate("case-candidate_01")).toEqual([first]);
  });

  it("fails closed before K-CASE-004 evidence collection is complete", () => {
    const f = setup(false);
    const service = new CaseDossierAssemblyService(f.database);
    expect(() => service.assembleCandidate("case-candidate_01")).toThrowError(
      CaseDossierAssemblyServiceError,
    );
    try {
      service.assembleCandidate("case-candidate_01");
    } catch (error) {
      expect((error as CaseDossierAssemblyServiceError).code).toBe("CASE_EVIDENCE_NOT_COLLECTED");
    }
  });

  it("fails closed when the completed intake points at missing immutable evidence", () => {
    const database = new DatabaseSync(":memory:");
    const candidates = new SqliteCaseCandidateIntakeRepository(database);
    candidates.acceptCandidate(candidate(), "2026-08-25T03:21:00.000Z");
    candidates.recordCollectionComplete(
      "case-candidate_01",
      "case-evidence_missing",
      "2026-08-25T04:20:00.000Z",
    );

    const service = new CaseDossierAssemblyService(database);
    expect(() => service.assembleCandidate("case-candidate_01")).toThrowError(
      CaseDossierAssemblyServiceError,
    );
    try {
      service.assembleCandidate("case-candidate_01");
    } catch (error) {
      expect((error as CaseDossierAssemblyServiceError).code).toBe(
        "CASE_EVIDENCE_COLLECTION_MISSING",
      );
    }
  });
});
