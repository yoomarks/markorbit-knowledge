import { describe, expect, it } from "vitest";
import {
  CASE_DOSSIER_OBJECT_TYPE,
  CASE_DOSSIER_PRIVACY_PROTOCOL_VERSION,
  CASE_DOSSIER_PRIVACY_REVIEW_OBJECT_TYPE,
  CASE_DOSSIER_PROTOCOL_VERSION,
  type CaseDossierEvidenceRefV1,
  type CaseDossierPrivacyReviewV1,
  type CaseDossierV1,
} from "@markorbit/contracts";
import { CaseDossierRedactionError, redactCaseDossierV1 } from "./case-dossier-redactor";

const formalRef: CaseDossierEvidenceRefV1 = {
  collectionId: "case-evidence_01",
  surface: "FORMAL_MATTER",
  sourceRef: "markreg:/v1/formal-matters/formal-matter_01",
  sha256: "a".repeat(64),
};
const lifecycleRef: CaseDossierEvidenceRefV1 = {
  collectionId: "case-evidence_01",
  surface: "LIFECYCLE_PROVENANCE",
  sourceRef: "markreg:/v1/operations/formal-matters/formal-matter_01/lifecycle-provenance",
  sha256: "b".repeat(64),
};
const documentRef: CaseDossierEvidenceRefV1 = {
  collectionId: "case-evidence_01",
  surface: "DOCUMENT_PACKAGE",
  sourceRef: "markreg:/v1/document-packages/document-package_01",
  sha256: "c".repeat(64),
  documentPackageId: "document-package_01",
};

function dossier(overrides: Partial<CaseDossierV1> = {}): CaseDossierV1 {
  return {
    protocolVersion: CASE_DOSSIER_PROTOCOL_VERSION,
    objectType: CASE_DOSSIER_OBJECT_TYPE,
    dossierId: "case-dossier_01",
    version: 1,
    candidateId: "case-candidate_01",
    evidenceCollectionId: "case-evidence_01",
    sourceMatter: {
      sourceMatterId: "formal-matter_01",
      sourceMatterVersion: 1,
      sourceSnapshotSha256: "d".repeat(64),
      sourceWorkspaceId: "workspace:test",
    },
    state: "ASSEMBLED",
    accessClassification: "CONFIDENTIAL",
    identity: {
      jurisdiction: { value: "US", evidence: [formalRef] },
      matterType: { value: "TRADEMARK_REGISTRATION", evidence: [formalRef] },
      parties: [
        { role: "APPLICANT", displayName: "Client Name", evidence: [formalRef] },
        { role: "REPRESENTATIVE", displayName: "Representative Name", evidence: [formalRef] },
      ],
    },
    narrative: [
      {
        statementId: "statement_01",
        text: "Client Name instructed the matter.",
        evidence: [formalRef],
      },
    ],
    timeline: [
      {
        eventId: "event_01",
        occurredAt: { value: "2026-08-25T04:00:00.000Z", evidence: [lifecycleRef] },
        action: { value: "Client Name confirmed filing", evidence: [lifecycleRef] },
        inputEvidence: [formalRef],
        outputEvidence: [lifecycleRef],
      },
    ],
    documents: [
      {
        documentId: "document_01",
        documentPackageId: "document-package_01",
        documentType: "POWER_OF_ATTORNEY",
        displayName: "Client Name POA.pdf",
        checksum: "secret-checksum",
        storageReference: "markreg-storage://secret/path",
        evidence: [documentRef],
      },
    ],
    money: [
      {
        amount: "500.00",
        currency: "USD",
        category: "official-fee",
        evidence: [formalRef],
      },
    ],
    durations: [
      {
        durationId: "duration_01",
        label: "Observed elapsed time",
        milliseconds: 1000,
        calculationBasis: "DETERMINISTIC_TIMESTAMP_DIFFERENCE",
        startedAt: { value: "2026-08-25T03:59:59.000Z", evidence: [formalRef] },
        endedAt: { value: "2026-08-25T04:00:00.000Z", evidence: [lifecycleRef] },
      },
    ],
    completeness: {
      matterMetadata: "PRESENT",
      startEndState: "MISSING",
      timeline: "PRESENT",
      communications: "SOURCE_UNAVAILABLE",
      materialDocuments: "PRESENT",
      feeData: "PRESENT",
      outcome: "MISSING",
      privacyReview: "PENDING_REVIEW",
      sourceReferences: "PRESENT",
    },
    assembledAt: "2026-08-25T04:10:00.000Z",
    updatedAt: "2026-08-25T04:10:00.000Z",
    ...overrides,
  };
}

function review(overrides: Partial<CaseDossierPrivacyReviewV1> = {}): CaseDossierPrivacyReviewV1 {
  return {
    protocolVersion: CASE_DOSSIER_PRIVACY_PROTOCOL_VERSION,
    objectType: CASE_DOSSIER_PRIVACY_REVIEW_OBJECT_TYPE,
    reviewId: "case-privacy-review_01",
    dossierId: "case-dossier_01",
    dossierVersion: 1,
    state: "FINALIZED",
    sourceAccessClassification: "CONFIDENTIAL",
    audienceAccessClassification: "CONFIDENTIAL",
    reviewerRef: "user:reviewer:01",
    openedAt: "2026-08-25T06:40:00.000Z",
    decidedAt: "2026-08-25T06:45:00.000Z",
    findings: [
      {
        findingId: "finding_01",
        category: "PERSONAL_DATA",
        target: { section: "PARTY", field: "displayName", itemIndex: 0 },
        action: "MASK_VALUE",
        reason: "Mask client identity",
      },
      {
        findingId: "finding_02",
        category: "FINANCIAL_DATA",
        target: { section: "MONEY", field: "amount", itemIndex: 0 },
        action: "OMIT_ITEM",
        reason: "Remove financial amount from audience derivative",
      },
      {
        findingId: "finding_03",
        category: "PERSONAL_DATA",
        target: { section: "DOCUMENT", field: "displayName", itemId: "document_01" },
        action: "MASK_VALUE",
        reason: "Mask client name in document display label",
      },
    ],
    derivativeId: "case-redacted_01",
    publicationAuthorized: false,
    ...overrides,
  };
}

describe("redactCaseDossierV1", () => {
  it("projects a deterministic audience derivative without source evidence locators", () => {
    const source = dossier();
    const result = redactCaseDossierV1(source, review());
    const replay = redactCaseDossierV1(source, review());

    expect(result).toEqual(replay);
    expect(result.content.identity.parties[0]?.displayName).toBe("[REDACTED]");
    expect(result.content.identity.parties[1]?.displayName).toBe("Representative Name");
    expect(result.content.money).toEqual([]);
    expect(result.content.documents[0]?.displayName).toBe("[REDACTED]");
    expect(JSON.stringify(result)).not.toContain("markreg-storage://");
    expect(JSON.stringify(result)).not.toContain("secret-checksum");
    expect(JSON.stringify(result)).not.toContain("markreg:/v1/");
    expect(result.publicationAuthorized).toBe(false);
    expect(result.contentSha256).toHaveLength(64);
  });

  it("does not mutate the immutable internal Dossier", () => {
    const source = dossier();
    const before = JSON.stringify(source);
    redactCaseDossierV1(source, review());
    expect(JSON.stringify(source)).toBe(before);
  });

  it("fails closed if the privacy review does not match the source Dossier", () => {
    expect(() =>
      redactCaseDossierV1(dossier(), review({ dossierVersion: 2 })),
    ).toThrowError(CaseDossierRedactionError);
    try {
      redactCaseDossierV1(
        dossier(),
        review({ sourceAccessClassification: "RESTRICTED", audienceAccessClassification: "RESTRICTED" }),
      );
    } catch (error) {
      expect((error as CaseDossierRedactionError).code).toBe(
        "CASE_DOSSIER_PRIVACY_SOURCE_MISMATCH",
      );
    }
  });

  it("refuses to generate a derivative before the privacy review is FINALIZED", () => {
    expect(() =>
      redactCaseDossierV1(
        dossier(),
        review({ state: "NEEDS_REDACTION", derivativeId: undefined }),
      ),
    ).toThrowError(CaseDossierRedactionError);
  });

  it("rejects a privacy finding that targets a missing source value", () => {
    expect(() =>
      redactCaseDossierV1(
        dossier(),
        review({
          findings: [
            {
              findingId: "finding_missing",
              category: "PERSONAL_DATA",
              target: { section: "IDENTITY", field: "applicationNumber" },
              action: "MASK_VALUE",
              reason: "Mask application number",
            },
          ],
        }),
      ),
    ).toThrowError(CaseDossierRedactionError);
  });

  it("rejects multiple findings against the same target instead of relying on order", () => {
    const duplicateTarget = {
      section: "PARTY" as const,
      field: "displayName",
      itemIndex: 0,
    };
    expect(() =>
      redactCaseDossierV1(
        dossier(),
        review({
          findings: [
            {
              findingId: "finding_a",
              category: "PERSONAL_DATA",
              target: duplicateTarget,
              action: "MASK_VALUE",
              reason: "Mask identity",
            },
            {
              findingId: "finding_b",
              category: "PERSONAL_DATA",
              target: duplicateTarget,
              action: "OMIT_ITEM",
              reason: "Omit identity",
            },
          ],
        }),
      ),
    ).toThrowError(CaseDossierRedactionError);
  });
});
