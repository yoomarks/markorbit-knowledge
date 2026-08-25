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
  type CaseDossierPrivacyFindingV1,
  type CaseDossierV1,
  type CaseEvidenceCollectionV1,
  type ExactCaseSourcePayloadV1,
} from "@markorbit/contracts";
import { SqliteCaseCandidateIntakeRepository } from "@markorbit/persistence/case-candidate-intake";
import { SqliteCaseDossierRepository } from "@markorbit/persistence/case-dossiers";
import { SqliteCaseEvidenceCollectionRepository } from "@markorbit/persistence/case-evidence-collections";
import { CaseDossierPrivacyService } from "./case-dossier-privacy-service";

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
        text: "Client Name matter was recorded.",
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
  return { database, dossiers, service: new CaseDossierPrivacyService(database) };
}

const finding: CaseDossierPrivacyFindingV1 = {
  findingId: "finding_01",
  category: "PERSONAL_DATA",
  target: { section: "PARTY", field: "displayName", itemIndex: 0 },
  action: "MASK_VALUE",
  reason: "Mask client identity in the audience derivative",
};

describe("CaseDossierPrivacyService", () => {
  it("runs review -> redaction -> finalized internal Dossier without rewriting the source version", () => {
    const f = fixture();
    f.service.openReview({
      dossierId: "case-dossier_01",
      dossierVersion: 1,
      reviewId: "case-privacy-review_01",
      audienceAccessClassification: "CONFIDENTIAL",
      reviewerRef: "user:reviewer:01",
      openedAt: "2026-08-25T06:40:00.000Z",
    });
    f.service.markNeedsRedaction("case-privacy-review_01", [finding], "2026-08-25T06:42:00.000Z");

    const result = f.service.finalizeReview("case-privacy-review_01", {
      derivativeId: "case-redacted_01",
      findings: [finding],
      decidedAt: "2026-08-25T06:45:00.000Z",
    });

    expect(result.review.state).toBe("FINALIZED");
    expect(result.derivative.content.identity.parties[0]?.displayName).toBe("[REDACTED]");
    expect(result.derivative.publicationAuthorized).toBe(false);
    expect(result.finalizedDossier.version).toBe(2);
    expect(result.finalizedDossier.state).toBe("FINALIZED");
    expect(result.finalizedDossier.completeness.privacyReview).toBe("PRESENT");
    expect(result.finalizedDossier.supersedesDossierVersion).toBe(1);

    expect(f.dossiers.getDossier("case-dossier_01", 1)?.state).toBe("ASSEMBLED");
    expect(f.dossiers.getDossier("case-dossier_01", 1)?.completeness.privacyReview).toBe(
      "PENDING_REVIEW",
    );
    expect(
      f.service.getReviewEvents("case-privacy-review_01").map((event) => event.eventType),
    ).toEqual(["OPENED", "NEEDS_REDACTION", "FINALIZED"]);
  });

  it("replays the same finalization without creating another Dossier version or derivative", () => {
    const f = fixture();
    f.service.openReview({
      dossierId: "case-dossier_01",
      dossierVersion: 1,
      reviewId: "case-privacy-review_01",
      audienceAccessClassification: "CONFIDENTIAL",
      reviewerRef: "user:reviewer:01",
      openedAt: "2026-08-25T06:40:00.000Z",
    });
    const input = {
      derivativeId: "case-redacted_01",
      findings: [finding],
      decidedAt: "2026-08-25T06:45:00.000Z",
    };
    const first = f.service.finalizeReview("case-privacy-review_01", input);
    const replay = f.service.finalizeReview("case-privacy-review_01", input);

    expect(replay).toEqual(first);
    expect(f.dossiers.getDossier("case-dossier_01")?.version).toBe(2);
    expect(f.service.getReviewEvents("case-privacy-review_01")).toHaveLength(2);
  });

  it("requires explicit approval before broadening the audience classification", () => {
    const f = fixture();
    expect(() =>
      f.service.openReview({
        dossierId: "case-dossier_01",
        dossierVersion: 1,
        reviewId: "case-privacy-review_01",
        audienceAccessClassification: "INTERNAL",
        reviewerRef: "user:reviewer:01",
        openedAt: "2026-08-25T06:40:00.000Z",
      }),
    ).toThrow();

    expect(
      f.service.openReview({
        dossierId: "case-dossier_01",
        dossierVersion: 1,
        reviewId: "case-privacy-review_02",
        audienceAccessClassification: "INTERNAL",
        reviewerRef: "user:reviewer:01",
        openedAt: "2026-08-25T06:40:00.000Z",
        audienceExpansionApproval: {
          approvedBy: "user:privacy-owner:01",
          approvedAt: "2026-08-25T06:39:00.000Z",
          justification: "Approved internal audience after explicit privacy review",
        },
      }).audienceAccessClassification,
    ).toBe("INTERNAL");
  });

  it("can reject a review without producing a derivative or FINALIZED Dossier", () => {
    const f = fixture();
    f.service.openReview({
      dossierId: "case-dossier_01",
      dossierVersion: 1,
      reviewId: "case-privacy-review_01",
      audienceAccessClassification: "CONFIDENTIAL",
      reviewerRef: "user:reviewer:01",
      openedAt: "2026-08-25T06:40:00.000Z",
    });
    const rejected = f.service.rejectReview(
      "case-privacy-review_01",
      [finding],
      "2026-08-25T06:44:00.000Z",
    );
    expect(rejected.state).toBe("REJECTED");
    expect(f.service.getDerivative("case-redacted_01")).toBeNull();
    expect(f.dossiers.getDossier("case-dossier_01")?.version).toBe(1);
  });
});
