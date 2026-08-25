import { describe, expect, it } from "vitest";
import {
  CASE_LIVE_ACCEPTANCE_OBJECT_TYPE,
  CASE_LIVE_ACCEPTANCE_PROTOCOL_VERSION,
  isCaseLiveAcceptanceReceiptV1,
  type CaseLiveAcceptanceReceiptV1,
} from "./case-live-acceptance-v1";

const sha = "a".repeat(64);

function receipt(
  overrides: Partial<CaseLiveAcceptanceReceiptV1> = {},
): CaseLiveAcceptanceReceiptV1 {
  return {
    protocolVersion: CASE_LIVE_ACCEPTANCE_PROTOCOL_VERSION,
    objectType: CASE_LIVE_ACCEPTANCE_OBJECT_TYPE,
    runId: "case-live-run_01",
    runMode: "TEST",
    transportMode: "INJECTED_TEST",
    state: "STARTED",
    candidate: {
      candidateId: "case-candidate_01",
      sourceSystem: "MARKREG",
      sourceMatterId: "formal-matter_01",
      sourceMatterVersion: 1,
      sourceSnapshotSha256: sha,
      sourceWorkspaceId: "workspace:test",
      sourceAccessClassification: "CONFIDENTIAL",
    },
    privacyPlan: {
      reviewId: "case-privacy-review_01",
      reviewerRef: "user:privacy-reviewer:01",
    },
    eligibleForKCase008Review: false,
    publicationAuthorized: false,
    startedAt: "2026-08-25T09:30:00.000Z",
    updatedAt: "2026-08-25T09:30:00.000Z",
    ...overrides,
  };
}

describe("CaseLiveAcceptanceReceiptV1", () => {
  it("accepts a TEST run but never makes it K-CASE-008 review eligible", () => {
    const value = receipt({
      state: "FINALIZED",
      evidence: { collectionId: "case-evidence_01", documentSha256: sha },
      assembledDossier: { dossierId: "case-dossier_01", version: 1, documentSha256: sha },
      privacyReview: { reviewId: "case-privacy-review_01", state: "FINALIZED" },
      finalized: {
        derivativeId: "case-redacted_01",
        derivativeSha256: sha,
        dossierId: "case-dossier_01",
        dossierVersion: 2,
        dossierSha256: sha,
      },
      producerPromotionRef: "markreg:promotion:test",
      eligibleForKCase008Review: false,
      updatedAt: "2026-08-25T09:40:00.000Z",
    });
    expect(isCaseLiveAcceptanceReceiptV1(value)).toBe(true);
    expect(isCaseLiveAcceptanceReceiptV1({ ...value, eligibleForKCase008Review: true })).toBe(
      false,
    );
  });

  it("requires LIVE + default HTTP + producer promotion ref before review eligibility", () => {
    const value = receipt({
      runMode: "LIVE",
      transportMode: "DEFAULT_HTTP",
      state: "FINALIZED",
      producerPromotionRef: "markreg:promotion:opaque-01",
      evidence: { collectionId: "case-evidence_01", documentSha256: sha },
      assembledDossier: { dossierId: "case-dossier_01", version: 1, documentSha256: sha },
      privacyReview: { reviewId: "case-privacy-review_01", state: "FINALIZED" },
      finalized: {
        derivativeId: "case-redacted_01",
        derivativeSha256: sha,
        dossierId: "case-dossier_01",
        dossierVersion: 2,
        dossierSha256: sha,
      },
      eligibleForKCase008Review: true,
      updatedAt: "2026-08-25T09:40:00.000Z",
    });
    expect(isCaseLiveAcceptanceReceiptV1(value)).toBe(true);
    expect(isCaseLiveAcceptanceReceiptV1({ ...value, producerPromotionRef: undefined })).toBe(
      false,
    );
    expect(isCaseLiveAcceptanceReceiptV1({ ...value, transportMode: "INJECTED_TEST" })).toBe(false);
  });

  it("freezes privacy review identity into the acceptance lineage", () => {
    const value = receipt({
      state: "PRIVACY_REVIEW_REQUIRED",
      evidence: { collectionId: "case-evidence_01", documentSha256: sha },
      assembledDossier: { dossierId: "case-dossier_01", version: 1, documentSha256: sha },
      privacyReview: { reviewId: "case-privacy-review_01", state: "REVIEW_REQUIRED" },
      updatedAt: "2026-08-25T09:35:00.000Z",
    });
    expect(isCaseLiveAcceptanceReceiptV1(value)).toBe(true);
    expect(
      isCaseLiveAcceptanceReceiptV1({
        ...value,
        privacyReview: { reviewId: "case-privacy-review_other", state: "REVIEW_REQUIRED" },
      }),
    ).toBe(false);
  });

  it("represents privacy rejection as terminal failure and never as eligibility", () => {
    const rejected = receipt({
      state: "FAILED",
      evidence: { collectionId: "case-evidence_01", documentSha256: sha },
      assembledDossier: { dossierId: "case-dossier_01", version: 1, documentSha256: sha },
      privacyReview: { reviewId: "case-privacy-review_01", state: "REJECTED" },
      failure: {
        stage: "PRIVACY",
        code: "CASE_LIVE_ACCEPTANCE_PRIVACY_REJECTED",
        retryable: false,
      },
      updatedAt: "2026-08-25T09:40:00.000Z",
    });
    expect(isCaseLiveAcceptanceReceiptV1(rejected)).toBe(true);
    expect(
      isCaseLiveAcceptanceReceiptV1({
        ...rejected,
        state: "PRIVACY_REVIEW_REQUIRED",
        failure: undefined,
      }),
    ).toBe(false);
    expect(isCaseLiveAcceptanceReceiptV1({ ...rejected, eligibleForKCase008Review: true })).toBe(
      false,
    );
  });

  it("accepts retryable collection waiting state but rejects fake waiting states", () => {
    const waiting = receipt({
      state: "WAITING_SOURCE",
      failure: { stage: "COLLECTION", code: "MARKREG_TIMEOUT", retryable: true },
      updatedAt: "2026-08-25T09:31:00.000Z",
    });
    expect(isCaseLiveAcceptanceReceiptV1(waiting)).toBe(true);
    expect(
      isCaseLiveAcceptanceReceiptV1({
        ...waiting,
        failure: { stage: "ASSEMBLY", code: "X", retryable: true },
      }),
    ).toBe(false);
  });

  it("rejects publication authorization and Brain semantics", () => {
    expect(isCaseLiveAcceptanceReceiptV1({ ...receipt(), publicationAuthorized: true })).toBe(
      false,
    );
    expect(isCaseLiveAcceptanceReceiptV1({ ...receipt(), recommendation: "publish it" })).toBe(
      false,
    );
    expect(
      isCaseLiveAcceptanceReceiptV1({
        ...receipt(),
        candidate: { ...receipt().candidate, truthScore: 0.99 },
      }),
    ).toBe(false);
  });
});
