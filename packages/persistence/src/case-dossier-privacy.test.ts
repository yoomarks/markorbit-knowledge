import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import {
  CASE_CANDIDATE_OBJECT_TYPE,
  CASE_CANDIDATE_PROTOCOL_VERSION,
  CASE_CANDIDATE_SOURCE_SYSTEM,
  CASE_DOSSIER_OBJECT_TYPE,
  CASE_DOSSIER_PRIVACY_PROTOCOL_VERSION,
  CASE_DOSSIER_PRIVACY_REVIEW_OBJECT_TYPE,
  CASE_DOSSIER_PROTOCOL_VERSION,
  CASE_DOSSIER_REDACTED_DERIVATIVE_OBJECT_TYPE,
  CASE_EVIDENCE_COLLECTION_OBJECT_TYPE,
  CASE_EVIDENCE_COLLECTION_PROTOCOL_VERSION,
  CASE_EVIDENCE_SOURCE_SYSTEM,
  type CaseCandidateV1,
  type CaseDossierEvidenceRefV1,
  type CaseDossierPrivacyReviewV1,
  type CaseDossierRedactedDerivativeV1,
  type CaseDossierV1,
  type CaseEvidenceCollectionV1,
  type ExactCaseSourcePayloadV1,
} from "@markorbit/contracts";
import { SqliteCaseCandidateIntakeRepository } from "./case-candidate-intake";
import { SqliteCaseDossierRepository } from "./case-dossier";
import { SqliteCaseDossierPrivacyRepository } from "./case-dossier-privacy";
import { SqliteCaseEvidenceCollectionRepository } from "./case-evidence-collection";
import { RegistryConflictError, RegistryValidationError } from "./index";

const matterId = "formal-matter_12345678";
const workspaceId = "workspace:test";
const snapshotSha = "a".repeat(64);

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function hash(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

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

function dossier(formalRef: CaseDossierEvidenceRefV1): CaseDossierV1 {
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
      parties: [{ role: "APPLICANT", displayName: "Client Name", evidence: [formalRef] }],
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
  };
}

function review(overrides: Partial<CaseDossierPrivacyReviewV1> = {}): CaseDossierPrivacyReviewV1 {
  return {
    protocolVersion: CASE_DOSSIER_PRIVACY_PROTOCOL_VERSION,
    objectType: CASE_DOSSIER_PRIVACY_REVIEW_OBJECT_TYPE,
    reviewId: "case-privacy-review_01",
    dossierId: "case-dossier_01",
    dossierVersion: 1,
    state: "REVIEW_REQUIRED",
    sourceAccessClassification: "CONFIDENTIAL",
    audienceAccessClassification: "CONFIDENTIAL",
    reviewerRef: "user:reviewer:01",
    openedAt: "2026-08-25T06:40:00.000Z",
    findings: [],
    publicationAuthorized: false,
    ...overrides,
  };
}

function finalizedReview(): CaseDossierPrivacyReviewV1 {
  return review({
    state: "FINALIZED",
    decidedAt: "2026-08-25T06:45:00.000Z",
    findings: [
      {
        findingId: "finding_01",
        category: "PERSONAL_DATA",
        target: { section: "PARTY", field: "displayName", itemIndex: 0 },
        action: "MASK_VALUE",
        reason: "Mask client identity",
      },
    ],
    derivativeId: "case-redacted_01",
  });
}

function derivative(
  overrides: Partial<CaseDossierRedactedDerivativeV1> = {},
): CaseDossierRedactedDerivativeV1 {
  const content = {
    identity: {
      matterType: "TRADEMARK_REGISTRATION",
      parties: [{ role: "APPLICANT", displayName: "[REDACTED]" }],
    },
    narrative: [
      { statementId: "formal-matter-recorded", text: "MarkReg recorded the Formal Matter." },
    ],
    timeline: [],
    documents: [],
    money: [],
    durations: [],
  };
  return {
    protocolVersion: CASE_DOSSIER_PRIVACY_PROTOCOL_VERSION,
    objectType: CASE_DOSSIER_REDACTED_DERIVATIVE_OBJECT_TYPE,
    derivativeId: "case-redacted_01",
    version: 1,
    sourceDossierId: "case-dossier_01",
    sourceDossierVersion: 1,
    reviewId: "case-privacy-review_01",
    accessClassification: "CONFIDENTIAL",
    generatedAt: "2026-08-25T06:45:00.000Z",
    contentSha256: hash(canonical(content)),
    redactions: [
      {
        findingId: "finding_01",
        target: { section: "PARTY", field: "displayName", itemIndex: 0 },
        action: "MASK_VALUE",
      },
    ],
    content,
    publicationAuthorized: false,
    ...overrides,
  };
}

function fixture() {
  const database = new DatabaseSync(":memory:");
  const intake = new SqliteCaseCandidateIntakeRepository(database);
  intake.acceptCandidate(candidate(), "2026-08-25T03:21:00.000Z");
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
  return { database, privacy: new SqliteCaseDossierPrivacyRepository(database) };
}

describe("SqliteCaseDossierPrivacyRepository", () => {
  it("persists an append-only review event history across repository restart", () => {
    const f = fixture();
    const opened = f.privacy.openReview(review());
    expect(opened.replayed).toBe(false);
    expect(opened.revision).toBe(1);

    const needsRedaction = review({
      state: "NEEDS_REDACTION",
      decidedAt: "2026-08-25T06:42:00.000Z",
      findings: [
        {
          findingId: "finding_01",
          category: "PERSONAL_DATA",
          target: { section: "PARTY", field: "displayName", itemIndex: 0 },
          action: "MASK_VALUE",
          reason: "Mask client identity",
        },
      ],
    });
    expect(f.privacy.recordDecision(needsRedaction).revision).toBe(2);
    expect(f.privacy.recordDecision(finalizedReview()).revision).toBe(3);

    const restarted = new SqliteCaseDossierPrivacyRepository(f.database);
    expect(restarted.getReview("case-privacy-review_01")?.review.state).toBe("FINALIZED");
    expect(
      restarted.listReviewEvents("case-privacy-review_01").map((event) => event.eventType),
    ).toEqual(["OPENED", "NEEDS_REDACTION", "FINALIZED"]);
  });

  it("deduplicates opening the same review lineage after it has advanced", () => {
    const f = fixture();
    f.privacy.openReview(review());
    f.privacy.recordDecision(finalizedReview());
    const replay = f.privacy.openReview(review());
    expect(replay.replayed).toBe(true);
    expect(replay.review.state).toBe("FINALIZED");
    expect(replay.revision).toBe(2);
  });

  it("fails closed on source access mismatch and invalid terminal transitions", () => {
    const f = fixture();
    expect(() =>
      f.privacy.openReview(
        review({
          sourceAccessClassification: "RESTRICTED",
          audienceAccessClassification: "RESTRICTED",
        }),
      ),
    ).toThrowError(RegistryConflictError);

    f.privacy.openReview(review());
    f.privacy.recordDecision(finalizedReview());
    expect(() =>
      f.privacy.recordDecision(
        review({ state: "REJECTED", decidedAt: "2026-08-25T06:46:00.000Z" }),
      ),
    ).toThrowError(RegistryConflictError);
  });

  it("stores an immutable derivative only after the matching review is FINALIZED", () => {
    const f = fixture();
    f.privacy.openReview(review());
    expect(() => f.privacy.saveDerivative(derivative())).toThrowError(RegistryConflictError);

    f.privacy.recordDecision(finalizedReview());
    const saved = f.privacy.saveDerivative(derivative());
    expect(saved.replayed).toBe(false);

    const restarted = new SqliteCaseDossierPrivacyRepository(f.database);
    expect(restarted.getDerivative("case-redacted_01")).toEqual(saved.derivative);
    expect(restarted.saveDerivative(derivative()).replayed).toBe(true);
  });

  it("recomputes audience content SHA and rejects derivative lineage drift", () => {
    const f = fixture();
    f.privacy.openReview(review());
    f.privacy.recordDecision(finalizedReview());

    expect(() =>
      f.privacy.saveDerivative(derivative({ contentSha256: "f".repeat(64) })),
    ).toThrowError(RegistryValidationError);
    expect(() =>
      f.privacy.saveDerivative(derivative({ accessClassification: "RESTRICTED" })),
    ).toThrowError(RegistryConflictError);
  });
});
