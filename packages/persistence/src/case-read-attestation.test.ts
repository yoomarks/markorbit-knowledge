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

const matterId = "formal-matter_read_attestation";
const workspaceId = "workspace:read-attestation";
const snapshotSha = "a".repeat(64);

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, child]) => child !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function exact(sourceRef: string, value: unknown): ExactCaseSourcePayloadV1 {
  const bytes = Buffer.from(JSON.stringify(value), "utf8");
  return {
    sourceRef,
    mediaType: "application/json",
    sha256: sha256(bytes),
    sizeBytes: bytes.byteLength,
    dataBase64: bytes.toString("base64"),
  };
}

function candidate(): CaseCandidateV1 {
  return {
    protocolVersion: CASE_CANDIDATE_PROTOCOL_VERSION,
    objectType: CASE_CANDIDATE_OBJECT_TYPE,
    candidateId: "case-candidate_read_attestation",
    sourceSystem: CASE_CANDIDATE_SOURCE_SYSTEM,
    sourceMatterId: matterId,
    sourceMatterVersion: 1,
    sourceSnapshotSha256: snapshotSha,
    sourceRetrievalRef: "markreg:authorized-ref:read-attestation",
    promotedBy: "operator:test",
    promotedAt: "2026-08-31T01:00:00.000Z",
    accessScope: { sourceWorkspaceId: workspaceId, classification: "CONFIDENTIAL" },
    idempotencyKey: "case-read-attestation-001",
  };
}

function collection(): CaseEvidenceCollectionV1 {
  return {
    protocolVersion: CASE_EVIDENCE_COLLECTION_PROTOCOL_VERSION,
    objectType: CASE_EVIDENCE_COLLECTION_OBJECT_TYPE,
    collectionId: "case-evidence_read_attestation",
    candidateId: candidate().candidateId,
    sourceSystem: CASE_EVIDENCE_SOURCE_SYSTEM,
    sourceMatter: {
      sourceMatterId: matterId,
      sourceMatterVersion: 1,
      sourceSnapshotSha256: snapshotSha,
      sourceRetrievalRef: candidate().sourceRetrievalRef,
      sourceWorkspaceId: workspaceId,
    },
    formalMatter: exact(`markreg:/v1/formal-matters/${matterId}`, {
      formalMatterId: matterId,
      workspaceId,
      version: 1,
      snapshotSha256: snapshotSha,
    }),
    documentPackages: [],
    omissions: [
      { surface: "LIFECYCLE_PROVENANCE", reason: "NOT_AVAILABLE" },
      { surface: "DOCUMENT_PACKAGES", reason: "NOT_AVAILABLE" },
    ],
    collectedAt: "2026-08-31T01:05:00.000Z",
    provenance: {
      sourceFamily: "CASE",
      originalSystem: "MARKREG",
      originalSystemAuthoritative: true,
      knowledgeSnapshotIsSystemOfRecord: false,
    },
  };
}

function evidenceIdentity(value: CaseEvidenceCollectionV1): string {
  return sha256(
    canonical({
      candidateId: value.candidateId,
      sourceSystem: value.sourceSystem,
      sourceMatter: value.sourceMatter,
      formalMatter: {
        sourceRef: value.formalMatter.sourceRef,
        sha256: value.formalMatter.sha256,
        sizeBytes: value.formalMatter.sizeBytes,
      },
      lifecycleProvenance: value.lifecycleProvenance
        ? {
            sourceRef: value.lifecycleProvenance.sourceRef,
            sha256: value.lifecycleProvenance.sha256,
            sizeBytes: value.lifecycleProvenance.sizeBytes,
          }
        : undefined,
      documentPackages: value.documentPackages.map((item) => ({
        documentPackageId: item.documentPackageId,
        sourceFormalMatterVersion: item.sourceFormalMatterVersion,
        sourceFormalMatterHash: item.sourceFormalMatterHash,
        sourceRef: item.payload.sourceRef,
        sha256: item.payload.sha256,
        sizeBytes: item.payload.sizeBytes,
      })),
      omissions: [...value.omissions].sort((left, right) =>
        left.surface.localeCompare(right.surface),
      ),
      provenance: value.provenance,
    }),
  );
}

function dossier(formalRef: CaseDossierEvidenceRefV1): CaseDossierV1 {
  return {
    protocolVersion: CASE_DOSSIER_PROTOCOL_VERSION,
    objectType: CASE_DOSSIER_OBJECT_TYPE,
    dossierId: "case-dossier_read_attestation",
    version: 1,
    candidateId: candidate().candidateId,
    evidenceCollectionId: collection().collectionId,
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
    assembledAt: "2026-08-31T01:06:00.000Z",
    updatedAt: "2026-08-31T01:06:00.000Z",
  };
}

function fixture() {
  const database = new DatabaseSync(":memory:");
  const intake = new SqliteCaseCandidateIntakeRepository(database);
  intake.acceptCandidate(candidate(), "2026-08-31T01:01:00.000Z");
  const evidence = new SqliteCaseEvidenceCollectionRepository(database);
  const savedCollection = evidence.saveCollection(collection()).collection;
  intake.recordCollectionComplete(
    candidate().candidateId,
    savedCollection.collectionId,
    savedCollection.collectedAt,
  );
  const formalRef: CaseDossierEvidenceRefV1 = {
    collectionId: savedCollection.collectionId,
    surface: "FORMAL_MATTER",
    sourceRef: savedCollection.formalMatter.sourceRef,
    sha256: savedCollection.formalMatter.sha256,
  };
  const dossiers = new SqliteCaseDossierRepository(database);
  dossiers.saveDossier(dossier(formalRef));
  return { database, evidence, dossiers };
}

function expectConflict(action: () => unknown, code: string): void {
  expect(action).toThrowError(RegistryConflictError);
  try {
    action();
  } catch (error) {
    expect((error as RegistryConflictError).code).toBe(code);
  }
}

describe("Case persistence read attestation", () => {
  it("fails closed when stored Case evidence JSON no longer matches its durable document hash", () => {
    const f = fixture();
    const changed = { ...collection(), collectedAt: "2026-08-31T01:07:00.000Z" };
    f.database
      .prepare(`UPDATE case_evidence_collections SET document_json = ? WHERE collection_id = ?`)
      .run(JSON.stringify(changed), collection().collectionId);

    expectConflict(
      () => f.evidence.getCollection(collection().collectionId),
      "CASE_EVIDENCE_COLLECTION_STORAGE_HASH_MISMATCH",
    );
  });

  it("fails closed when stored Case evidence identity drifts even with a matching document hash", () => {
    const f = fixture();
    const changed: CaseEvidenceCollectionV1 = {
      ...collection(),
      formalMatter: { ...collection().formalMatter, sourceRef: "markreg:/v1/formal-matters/drift" },
    };
    const json = JSON.stringify(changed);
    f.database
      .prepare(
        `UPDATE case_evidence_collections
            SET document_json = ?, document_sha256 = ?
          WHERE collection_id = ?`,
      )
      .run(json, sha256(json), collection().collectionId);

    expectConflict(
      () => f.evidence.getCollection(collection().collectionId),
      "CASE_EVIDENCE_COLLECTION_STORAGE_IDENTITY_MISMATCH",
    );
  });

  it("revalidates stored Case evidence against durable Candidate lineage", () => {
    const f = fixture();
    const changed: CaseEvidenceCollectionV1 = {
      ...collection(),
      sourceMatter: { ...collection().sourceMatter, sourceWorkspaceId: "workspace:drift" },
    };
    const json = JSON.stringify(changed);
    f.database
      .prepare(
        `UPDATE case_evidence_collections
            SET document_json = ?, document_sha256 = ?, evidence_identity_sha256 = ?
          WHERE collection_id = ?`,
      )
      .run(json, sha256(json), evidenceIdentity(changed), collection().collectionId);

    expectConflict(
      () => f.evidence.getCollection(collection().collectionId),
      "CASE_EVIDENCE_SOURCE_IDENTITY_MISMATCH",
    );
  });

  it("fails closed when stored Case Dossier JSON no longer matches its durable hash", () => {
    const f = fixture();
    const current = f.dossiers.getDossier("case-dossier_read_attestation", 1)!;
    const changed: CaseDossierV1 = {
      ...current,
      narrative: [{ ...current.narrative[0]!, text: "Tampered narrative" }],
    };
    f.database
      .prepare(`UPDATE case_dossiers SET document_json = ? WHERE dossier_id = ? AND version = 1`)
      .run(JSON.stringify(changed), current.dossierId);

    expectConflict(
      () => f.dossiers.getDossier(current.dossierId, 1),
      "CASE_DOSSIER_STORAGE_HASH_MISMATCH",
    );
  });

  it("revalidates every stored Dossier evidence reference against the immutable collection", () => {
    const f = fixture();
    const current = f.dossiers.getDossier("case-dossier_read_attestation", 1)!;
    const changed: CaseDossierV1 = {
      ...current,
      narrative: [
        {
          ...current.narrative[0]!,
          evidence: [
            {
              ...current.narrative[0]!.evidence[0]!,
              sourceRef: "markreg:/invented/source",
            },
          ],
        },
      ],
    };
    const json = JSON.stringify(changed);
    f.database
      .prepare(
        `UPDATE case_dossiers
            SET document_json = ?, document_sha256 = ?
          WHERE dossier_id = ? AND version = 1`,
      )
      .run(json, sha256(canonical(changed)), current.dossierId);

    expectConflict(
      () => f.dossiers.getDossier(current.dossierId, 1),
      "CASE_DOSSIER_EVIDENCE_REF_MISMATCH",
    );
  });

  it("revalidates stored Dossier source identity against the durable Candidate", () => {
    const f = fixture();
    const current = f.dossiers.getDossier("case-dossier_read_attestation", 1)!;
    const changed: CaseDossierV1 = {
      ...current,
      sourceMatter: { ...current.sourceMatter, sourceWorkspaceId: "workspace:drift" },
    };
    const json = JSON.stringify(changed);
    f.database
      .prepare(
        `UPDATE case_dossiers
            SET document_json = ?, document_sha256 = ?
          WHERE dossier_id = ? AND version = 1`,
      )
      .run(json, sha256(canonical(changed)), current.dossierId);

    expectConflict(
      () => f.dossiers.getDossier(current.dossierId, 1),
      "CASE_DOSSIER_SOURCE_LINEAGE_MISMATCH",
    );
  });
});
