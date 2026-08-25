import { describe, expect, it } from "vitest";
import {
  CASE_DOSSIER_OBJECT_TYPE,
  CASE_DOSSIER_PROTOCOL_VERSION,
  isCaseDossierV1,
  type CaseDossierEvidenceRefV1,
  type CaseDossierV1,
} from "./case-dossier-v1";

const collectionId = "case-evidence_01";
const formalMatterRef: CaseDossierEvidenceRefV1 = {
  collectionId,
  surface: "FORMAL_MATTER",
  sourceRef: "markreg:/v1/formal-matters/formal-matter_x",
  sha256: "a".repeat(64),
};
const lifecycleRef: CaseDossierEvidenceRefV1 = {
  collectionId,
  surface: "LIFECYCLE_PROVENANCE",
  sourceRef: "markreg:/v1/operations/formal-matters/formal-matter_x/lifecycle-provenance",
  sha256: "b".repeat(64),
};
const packageRef: CaseDossierEvidenceRefV1 = {
  collectionId,
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
    evidenceCollectionId: collectionId,
    sourceMatter: {
      sourceMatterId: "formal-matter_x",
      sourceMatterVersion: 1,
      sourceSnapshotSha256: "d".repeat(64),
      sourceWorkspaceId: "workspace:test",
    },
    state: "ASSEMBLED",
    accessClassification: "CONFIDENTIAL",
    identity: {
      jurisdiction: { value: "US", evidence: [formalMatterRef] },
      matterType: { value: "TRADEMARK_REGISTRATION", evidence: [formalMatterRef] },
      startingProceduralState: { value: "OPEN", evidence: [formalMatterRef] },
      parties: [],
      casePeriod: {
        startedAt: { value: "2026-08-25T04:00:00.000Z", evidence: [formalMatterRef] },
        endedAt: { value: "2026-08-25T04:00:01.000Z", evidence: [lifecycleRef] },
      },
    },
    narrative: [
      {
        statementId: "statement_01",
        text: "The matter was recorded and a lifecycle event followed.",
        evidence: [formalMatterRef, lifecycleRef],
      },
    ],
    timeline: [
      {
        eventId: "event_01",
        occurredAt: { value: "2026-08-25T04:00:01.000Z", evidence: [lifecycleRef] },
        action: { value: "Lifecycle event recorded", evidence: [lifecycleRef] },
        resultingStatus: { value: "OPEN", evidence: [lifecycleRef] },
        inputEvidence: [formalMatterRef],
        outputEvidence: [lifecycleRef],
      },
    ],
    documents: [
      {
        documentId: "document_01",
        documentPackageId: "document-package_01",
        documentItemId: "document-item_01",
        documentType: "POWER_OF_ATTORNEY",
        checksum: "checksum-01",
        storageReference: "markreg-storage://document/01",
        evidence: [packageRef],
      },
    ],
    money: [
      {
        amount: "125.00",
        currency: "USD",
        category: "quoted-total",
        evidence: [formalMatterRef],
      },
    ],
    durations: [
      {
        durationId: "duration_01",
        label: "Observed elapsed time",
        milliseconds: 1000,
        calculationBasis: "DETERMINISTIC_TIMESTAMP_DIFFERENCE",
        startedAt: { value: "2026-08-25T04:00:00.000Z", evidence: [formalMatterRef] },
        endedAt: { value: "2026-08-25T04:00:01.000Z", evidence: [lifecycleRef] },
      },
    ],
    outcome: {
      code: "OBSERVED_OPEN_STATE",
      label: "Observed state remains open",
      occurredAt: { value: "2026-08-25T04:00:01.000Z", evidence: [lifecycleRef] },
      evidence: [lifecycleRef],
    },
    completeness: {
      matterMetadata: "PRESENT",
      startEndState: "PRESENT",
      timeline: "PRESENT",
      communications: "SOURCE_UNAVAILABLE",
      materialDocuments: "PRESENT",
      feeData: "PRESENT",
      outcome: "PRESENT",
      privacyReview: "PENDING_REVIEW",
      sourceReferences: "PRESENT",
    },
    assembledAt: "2026-08-25T04:10:00.000Z",
    updatedAt: "2026-08-25T04:10:00.000Z",
    ...overrides,
  };
}

describe("CaseDossierV1", () => {
  it("accepts an objective dossier whose populated facts are evidence-backed", () => {
    expect(isCaseDossierV1(dossier())).toBe(true);
  });

  it("permits unavailable source families without fabricating facts", () => {
    expect(
      isCaseDossierV1(
        dossier({
          money: [],
          outcome: undefined,
          completeness: {
            ...dossier().completeness,
            communications: "SOURCE_UNAVAILABLE",
            feeData: "SOURCE_UNAVAILABLE",
            outcome: "MISSING",
          },
        }),
      ),
    ).toBe(true);
  });

  it("rejects factual statements without evidence", () => {
    expect(
      isCaseDossierV1(
        dossier({
          narrative: [{ statementId: "statement_01", text: "Unsupported fact", evidence: [] }],
        }),
      ),
    ).toBe(false);
  });

  it("rejects evidence references from another collection", () => {
    expect(
      isCaseDossierV1(
        dossier({
          identity: {
            ...dossier().identity,
            jurisdiction: {
              value: "US",
              evidence: [{ ...formalMatterRef, collectionId: "case-evidence_other" }],
            },
          },
        }),
      ),
    ).toBe(false);
  });

  it("requires document facts to point at the matching Document Package evidence", () => {
    expect(
      isCaseDossierV1(
        dossier({
          documents: [
            {
              documentId: "document_01",
              documentPackageId: "document-package_02",
              evidence: [packageRef],
            },
          ],
        }),
      ),
    ).toBe(false);
  });

  it("validates deterministic elapsed duration instead of accepting a guessed duration", () => {
    expect(
      isCaseDossierV1(
        dossier({
          durations: [{ ...dossier().durations[0]!, milliseconds: 999 }],
        }),
      ),
    ).toBe(false);
  });

  it("rejects Brain semantics even when nested inside an otherwise plausible dossier", () => {
    const value = dossier() as CaseDossierV1 & { reviewMetadata?: unknown };
    (value as unknown as Record<string, unknown>).reviewMetadata = {
      recommendation: "Choose this strategy next time",
      successProbability: 0.9,
    };
    expect(isCaseDossierV1(value)).toBe(false);
  });

  it("does not recognize publication as a dossier state", () => {
    expect(isCaseDossierV1({ ...dossier(), state: "PUBLISHED" })).toBe(false);
  });

  it("requires superseded version lineage to point backward", () => {
    expect(isCaseDossierV1({ ...dossier(), version: 2, supersedesDossierVersion: 1 })).toBe(true);
    expect(isCaseDossierV1({ ...dossier(), version: 2, supersedesDossierVersion: 2 })).toBe(false);
  });
});
