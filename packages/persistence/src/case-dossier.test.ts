import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import {
  CASE_CANDIDATE_OBJECT_TYPE,
  CASE_CANDIDATE_PROTOCOL_VERSION,
  CASE_CANDIDATE_SOURCE_SYSTEM,
  CASE_DOSSIER_OBJECT_TYPE,
  CASE_DOSSIER_PROTOCOL_VERSION,
  CASE_EVIDENCE_COLLECTION_OBJECT_TYPE,
  CASE_EVIDENCE_COLLECTION_PROTOCOL_VERSION,
  CASE_EVIDENCE_SOURCE_SYSTEM,
  type CaseCandidateV1,
  type CaseDossierEvidenceRefV1,
  type CaseDossierV1,
  type CaseEvidenceCollectionV1,
  type ExactCaseSourcePayloadV1,
} from "@markorbit/contracts";
import { SqliteCaseCandidateIntakeRepository } from "./case-candidate-intake";
import { SqliteCaseDossierRepository } from "./case-dossier";
import { SqliteCaseEvidenceCollectionRepository } from "./case-evidence-collection";
import { RegistryConflictError } from "./index";

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
        formalMatterId: matterId,
        workspaceId,
        version: 1,
        snapshotSha256: snapshotSha,
      },
    }),
    documentPackages: [],
    omissions: [
      { surface: "LIFECYCLE_PROVENANCE", reason: "NOT_AVAILABLE" },
      { surface: "DOCUMENT_PACKAGES", reason: "NOT_AVAILABLE" },
    ],
    collectedAt: "2026-08-25T04:00:00.000Z",
    provenance: {
      sourceFamily: "CASE",
      originalSystem: "MARKREG",
      originalSystemAuthoritative: true,
      knowledgeSnapshotIsSystemOfRecord: false,
    },
  };
}

function dossier(
  formalRef: CaseDossierEvidenceRefV1,
  overrides: Partial<CaseDossierV1> = {},
): CaseDossierV1 {
  return {
    protocolVersion: CASE_DOSSIER_PROTOCOL_VERSION,
    objectType: CASE_DOSSIER_OBJECT_TYPE,
    dossierId: "case-dossier_01",
    version: 1,
    candidateId: "case-candidate_01",
    evidenceCollectionId: "case-evidence_01",
    sourceMatter: {
      sourceMatterId: matterId,
      sourceMatterVersion: 1,
      sourceSnapshotSha256: snapshotSha,
      sourceWorkspaceId: workspaceId,
    },
    state: "ASSEMBLED",
    accessClassification: "CONFIDENTIAL",
    identity: {
      matterType: { value: "TRADEMARK_REGISTRATION", evidence: [formalRef] },
      startingProceduralState: { value: "OPEN", evidence: [formalRef] },
      parties: [],
    },
    narrative: [
      {
        statementId: "formal-matter-recorded",
        text: "MarkReg recorded the Formal Matter.",
        evidence: [formalRef],
      },
    ],
    timeline: [],
    documents: [],
    money: [],
    durations: [],
    completeness: {
      matterMetadata: "PRESENT",
      startEndState: "MISSING",
      timeline: "SOURCE_UNAVAILABLE",
      communications: "SOURCE_UNAVAILABLE",
      materialDocuments: "SOURCE_UNAVAILABLE",
      feeData: "MISSING",
      outcome: "MISSING",
      privacyReview: "PENDING_REVIEW",
      sourceReferences: "PRESENT",
    },
    assembledAt: "2026-08-25T04:00:00.000Z",
    updatedAt: "2026-08-25T04:00:00.000Z",
    ...overrides,
  };
}

function fixture(markCollected = true) {
  const database = new DatabaseSync(":memory:");
  const intake = new SqliteCaseCandidateIntakeRepository(database);
  intake.acceptCandidate(candidate(), "2026-08-25T03:21:00.000Z");
  const evidence = new SqliteCaseEvidenceCollectionRepository(database);
  const savedCollection = evidence.saveCollection(collection()).collection;
  if (markCollected) {
    intake.recordCollectionComplete(
      candidate().candidateId,
      savedCollection.collectionId,
      savedCollection.collectedAt,
    );
  }
  const formalRef: CaseDossierEvidenceRefV1 = {
    collectionId: savedCollection.collectionId,
    surface: "FORMAL_MATTER",
    sourceRef: savedCollection.formalMatter.sourceRef,
    sha256: savedCollection.formalMatter.sha256,
  };
  return {
    database,
    intake,
    evidence,
    dossiers: new SqliteCaseDossierRepository(database),
    formalRef,
  };
}

describe("SqliteCaseDossierRepository", () => {
  it("persists an immutable evidence-backed dossier across repository restart", () => {
    const f = fixture();
    const saved = f.dossiers.saveDossier(dossier(f.formalRef));
    expect(saved.replayed).toBe(false);

    const restarted = new SqliteCaseDossierRepository(f.database);
    expect(restarted.getDossier("case-dossier_01", 1)).toEqual(saved.dossier);
    expect(restarted.listDossiersForCandidate("case-candidate_01")).toEqual([saved.dossier]);
  });

  it("deduplicates exact dossier replay", () => {
    const f = fixture();
    const first = f.dossiers.saveDossier(dossier(f.formalRef));
    const replay = f.dossiers.saveDossier(dossier(f.formalRef));
    expect(replay.replayed).toBe(true);
    expect(replay.dossier).toEqual(first.dossier);
  });

  it("fails closed when the same dossier version is reused for changed content", () => {
    const f = fixture();
    f.dossiers.saveDossier(dossier(f.formalRef));
    expect(() =>
      f.dossiers.saveDossier(
        dossier(f.formalRef, {
          narrative: [
            {
              statementId: "formal-matter-recorded",
              text: "Changed text",
              evidence: [f.formalRef],
            },
          ],
        }),
      ),
    ).toThrowError(RegistryConflictError);
  });

  it("rejects a syntactically valid evidence reference that is absent from the collection", () => {
    const f = fixture();
    const inventedRef: CaseDossierEvidenceRefV1 = {
      ...f.formalRef,
      sourceRef: "markreg:/invented/source",
    };
    expect(() => f.dossiers.saveDossier(dossier(inventedRef))).toThrowError(RegistryConflictError);
    try {
      f.dossiers.saveDossier(dossier(inventedRef));
    } catch (error) {
      expect((error as RegistryConflictError).code).toBe("CASE_DOSSIER_EVIDENCE_REF_MISMATCH");
    }
  });

  it("requires the Candidate intake to point at the same completed collection", () => {
    const f = fixture(false);
    expect(() => f.dossiers.saveDossier(dossier(f.formalRef))).toThrowError(RegistryConflictError);
    try {
      f.dossiers.saveDossier(dossier(f.formalRef));
    } catch (error) {
      expect((error as RegistryConflictError).code).toBe("CASE_DOSSIER_COLLECTION_NOT_ACCEPTED");
    }
  });

  it("rejects Candidate/access lineage drift", () => {
    const f = fixture();
    expect(() =>
      f.dossiers.saveDossier(dossier(f.formalRef, { accessClassification: "RESTRICTED" })),
    ).toThrowError(RegistryConflictError);
  });

  it("persists an explicit later version only when its superseded version exists", () => {
    const f = fixture();
    const first = f.dossiers.saveDossier(dossier(f.formalRef)).dossier;
    const second = dossier(f.formalRef, {
      version: 2,
      supersedesDossierVersion: 1,
      state: "REVIEW_REQUIRED",
      updatedAt: "2026-08-25T04:05:00.000Z",
    });
    expect(f.dossiers.saveDossier(second).replayed).toBe(false);
    expect(f.dossiers.getDossier(first.dossierId)?.version).toBe(2);
  });

  it("rejects a later version whose superseded version is missing", () => {
    const f = fixture();
    expect(() =>
      f.dossiers.saveDossier(
        dossier(f.formalRef, {
          version: 2,
          supersedesDossierVersion: 1,
          updatedAt: "2026-08-25T04:05:00.000Z",
        }),
      ),
    ).toThrowError(RegistryConflictError);
  });
});
