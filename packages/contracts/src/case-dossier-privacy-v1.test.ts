import { describe, expect, it } from "vitest";
import {
  CASE_DOSSIER_PRIVACY_PROTOCOL_VERSION,
  CASE_DOSSIER_PRIVACY_REVIEW_OBJECT_TYPE,
  CASE_DOSSIER_REDACTED_DERIVATIVE_OBJECT_TYPE,
  isCaseDossierAccessBroadened,
  isCaseDossierPrivacyReviewV1,
  isCaseDossierRedactedDerivativeV1,
  type CaseDossierPrivacyReviewV1,
  type CaseDossierRedactedDerivativeV1,
} from "./case-dossier-privacy-v1";

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

function derivative(
  overrides: Partial<CaseDossierRedactedDerivativeV1> = {},
): CaseDossierRedactedDerivativeV1 {
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
    contentSha256: "a".repeat(64),
    redactions: [
      {
        findingId: "finding_01",
        target: { section: "PARTY", field: "displayName", itemIndex: 0 },
        action: "MASK_VALUE",
      },
    ],
    content: {
      identity: {
        jurisdiction: "US",
        matterType: "TRADEMARK_REGISTRATION",
        parties: [{ role: "APPLICANT", displayName: "[REDACTED]" }],
      },
      narrative: [{ statementId: "statement_01", text: "Matter recorded." }],
      timeline: [
        {
          eventId: "event_01",
          occurredAt: "2026-08-25T04:00:00.000Z",
          action: "Formal Matter created",
        },
      ],
      documents: [{ documentId: "document_01", documentType: "POWER_OF_ATTORNEY" }],
      money: [],
      durations: [{ durationId: "duration_01", label: "Observed elapsed time", milliseconds: 1000 }],
    },
    publicationAuthorized: false,
    ...overrides,
  };
}

describe("Case Dossier privacy contracts", () => {
  it("accepts an unresolved review without granting publication authority", () => {
    expect(isCaseDossierPrivacyReviewV1(review())).toBe(true);
  });

  it("requires a finding before NEEDS_REDACTION", () => {
    expect(
      isCaseDossierPrivacyReviewV1(
        review({ state: "NEEDS_REDACTION", decidedAt: "2026-08-25T06:42:00.000Z" }),
      ),
    ).toBe(false);
    expect(
      isCaseDossierPrivacyReviewV1(
        review({
          state: "NEEDS_REDACTION",
          decidedAt: "2026-08-25T06:42:00.000Z",
          findings: [
            {
              findingId: "finding_01",
              category: "PERSONAL_DATA",
              target: { section: "PARTY", field: "displayName", itemIndex: 0 },
              action: "MASK_VALUE",
              reason: "Remove client identity from the broader audience view",
            },
          ],
        }),
      ),
    ).toBe(true);
  });

  it("requires a derivative identity before a review can be FINALIZED", () => {
    expect(
      isCaseDossierPrivacyReviewV1(
        review({ state: "FINALIZED", decidedAt: "2026-08-25T06:43:00.000Z" }),
      ),
    ).toBe(false);
    expect(
      isCaseDossierPrivacyReviewV1(
        review({
          state: "FINALIZED",
          decidedAt: "2026-08-25T06:43:00.000Z",
          derivativeId: "case-redacted_01",
        }),
      ),
    ).toBe(true);
  });

  it("requires explicit approval when the audience classification is broader", () => {
    expect(isCaseDossierAccessBroadened("RESTRICTED", "INTERNAL")).toBe(true);
    expect(
      isCaseDossierPrivacyReviewV1(
        review({
          sourceAccessClassification: "RESTRICTED",
          audienceAccessClassification: "INTERNAL",
        }),
      ),
    ).toBe(false);
    expect(
      isCaseDossierPrivacyReviewV1(
        review({
          sourceAccessClassification: "RESTRICTED",
          audienceAccessClassification: "INTERNAL",
          audienceExpansionApproval: {
            approvedBy: "user:privacy-owner:01",
            approvedAt: "2026-08-25T06:41:00.000Z",
            justification: "Approved internal derivative after explicit redaction review",
          },
        }),
      ),
    ).toBe(true);
  });

  it("rejects arbitrary targets and duplicate finding identities", () => {
    const finding = {
      findingId: "finding_01",
      category: "PERSONAL_DATA" as const,
      target: { section: "PARTY" as const, field: "displayName", itemIndex: 0 },
      action: "MASK_VALUE" as const,
      reason: "Remove client identity",
    };
    expect(
      isCaseDossierPrivacyReviewV1(
        review({
          state: "NEEDS_REDACTION",
          decidedAt: "2026-08-25T06:42:00.000Z",
          findings: [finding, finding],
        }),
      ),
    ).toBe(false);
    expect(
      isCaseDossierPrivacyReviewV1(
        review({
          state: "NEEDS_REDACTION",
          decidedAt: "2026-08-25T06:42:00.000Z",
          findings: [
            {
              ...finding,
              target: { section: "PARTY", field: "email", itemIndex: 0 } as never,
            },
          ],
        }),
      ),
    ).toBe(false);
  });

  it("never recognizes publication authorization or Brain semantics", () => {
    expect(
      isCaseDossierPrivacyReviewV1({ ...review(), publicationAuthorized: true }),
    ).toBe(false);
    expect(
      isCaseDossierPrivacyReviewV1({ ...review(), recommendation: "publish this case" }),
    ).toBe(false);
  });

  it("accepts a redacted audience derivative that exposes no source evidence locator", () => {
    expect(isCaseDossierRedactedDerivativeV1(derivative())).toBe(true);
  });

  it("rejects source evidence locators and Brain semantics inside audience content", () => {
    const withSourceRef = derivative();
    (withSourceRef.content as unknown as Record<string, unknown>).sourceRef =
      "markreg:/v1/formal-matters/formal-matter_01";
    expect(isCaseDossierRedactedDerivativeV1(withSourceRef)).toBe(false);

    const withRecommendation = derivative();
    (withRecommendation.content as unknown as Record<string, unknown>).recommendation =
      "Use this approach next time";
    expect(isCaseDossierRedactedDerivativeV1(withRecommendation)).toBe(false);
  });
});
