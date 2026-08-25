import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  CASE_CANDIDATE_OBJECT_TYPE,
  CASE_CANDIDATE_PROTOCOL_VERSION,
  CASE_CANDIDATE_SOURCE_SYSTEM,
  CASE_EVIDENCE_COLLECTION_OBJECT_TYPE,
  CASE_EVIDENCE_COLLECTION_PROTOCOL_VERSION,
  CASE_EVIDENCE_SOURCE_SYSTEM,
  isCaseDossierV1,
  type CaseCandidateV1,
  type CaseEvidenceCollectionV1,
  type ExactCaseSourcePayloadV1,
} from "@markorbit/contracts";
import { CaseDossierAssemblyError, assembleCaseDossierV1 } from "./case-dossier-assembler";

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

function candidate(overrides: Partial<CaseCandidateV1> = {}): CaseCandidateV1 {
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
    ...overrides,
  };
}

function formalMatter() {
  return {
    formalMatter: {
      schemaVersion: 1,
      formalMatterId: matterId,
      workspaceId,
      kind: "TRADEMARK_REGISTRATION",
      status: "OPEN",
      version: 1,
      sourceSnapshot: {
        schemaVersion: 1,
        quote: { id: "quote_01", version: "1", currency: "USD", totalMinor: 29900 },
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
    consequences: {
      orderCreated: false,
      paymentCreated: false,
      professionalAppointed: false,
      filingCreated: false,
    },
  };
}

function lifecycle() {
  return {
    currentView: {
      schemaVersion: 1,
      lifecycleViewId: "lifecycle-view_01",
      workspaceId,
      formalMatter: { id: matterId, version: 1 },
      version: 1,
      state: "CUSTOMER_ACTION_NEEDED",
      customerSafeLabel: "Response required",
      customerSafeSummary: "A response step is recorded.",
      updatedAt: "2026-08-25T04:10:00.000Z",
      officialStatusVerified: false,
    },
    events: [
      {
        schemaVersion: 1,
        lifecycleEventId: "lifecycle-event_02",
        workspaceId,
        formalMatter: { id: matterId, version: 1 },
        version: 2,
        state: "CUSTOMER_ACTION_NEEDED",
        eventCode: "RESPONSE_REQUIRED",
        customerSafeLabel: "Response required",
        customerSafeSummary: "A response step is recorded.",
        occurredAt: "2026-08-25T04:10:00.000Z",
        projectedAt: "2026-08-25T04:10:01.000Z",
        officialStatusVerified: false,
      },
      {
        schemaVersion: 1,
        lifecycleEventId: "lifecycle-event_01",
        workspaceId,
        formalMatter: { id: matterId, version: 1 },
        version: 1,
        state: "REVIEWED_PROVIDER_EVIDENCE",
        eventCode: "EVIDENCE_REVIEWED",
        customerSafeLabel: "Evidence reviewed",
        customerSafeSummary: "Provider evidence was reviewed for internal use.",
        occurredAt: "2026-08-25T04:05:00.000Z",
        projectedAt: "2026-08-25T04:05:01.000Z",
        officialStatusVerified: false,
      },
    ],
    recommendedAction: {
      recommendedActionId: "recommended-action_01",
      title: "Do the preferred thing",
      recommendation: "This text must never enter the dossier",
      successProbability: 0.99,
      executionAuthorized: false,
    },
  };
}

function documentPackage() {
  return {
    documentPackageId: "document-package_01",
    workspaceId,
    formalMatterId: matterId,
    sourceFormalMatterVersion: 1,
    sourceFormalMatterHash: snapshotSha,
    status: "DRAFT",
    version: 1,
    documentItems: [
      {
        documentItemId: "document-item_01",
        documentType: "POWER_OF_ATTORNEY",
        displayName: "Signed POA",
        evidenceFingerprint: "c".repeat(64),
        verificationStatus: "VERIFIED",
        documentReference: {
          fileName: "poa.pdf",
          checksum: "c".repeat(64),
          storageReference: "markreg-storage://document/01",
        },
      },
      { unrecognizedShape: true },
    ],
  };
}

function collection(overrides: Partial<CaseEvidenceCollectionV1> = {}): CaseEvidenceCollectionV1 {
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
    formalMatter: exact(`markreg:/v1/formal-matters/${matterId}`, formalMatter()),
    lifecycleProvenance: exact(
      `markreg:/v1/operations/formal-matters/${matterId}/lifecycle-provenance`,
      lifecycle(),
    ),
    documentPackages: [
      {
        documentPackageId: "document-package_01",
        sourceFormalMatterVersion: 1,
        sourceFormalMatterHash: snapshotSha,
        payload: exact("markreg:/v1/document-packages/document-package_01", documentPackage()),
      },
    ],
    omissions: [],
    collectedAt: "2026-08-25T04:20:00.000Z",
    provenance: {
      sourceFamily: "CASE",
      originalSystem: "MARKREG",
      originalSystemAuthoritative: true,
      knowledgeSnapshotIsSystemOfRecord: false,
    },
    ...overrides,
  };
}

describe("assembleCaseDossierV1", () => {
  it("assembles only evidence-backed objective facts from frozen MarkReg snapshots", () => {
    const dossier = assembleCaseDossierV1(candidate(), collection());

    expect(isCaseDossierV1(dossier)).toBe(true);
    expect(dossier.state).toBe("ASSEMBLED");
    expect(dossier.identity.jurisdiction?.value).toBe("US");
    expect(dossier.identity.markReference?.value).toBe("EXAMPLE");
    expect(dossier.identity.parties).toEqual([
      expect.objectContaining({ role: "APPLICANT", displayName: "Example Applicant LLC" }),
    ]);
    expect(dossier.timeline.map((event) => event.eventId)).toEqual([
      "formal-matter-created",
      "lifecycle-event_01",
      "lifecycle-event_02",
    ]);
    expect(dossier.documents).toEqual([
      expect.objectContaining({
        documentPackageId: "document-package_01",
        documentItemId: "document-item_01",
        documentType: "POWER_OF_ATTORNEY",
        checksum: "c".repeat(64),
        storageReference: "markreg-storage://document/01",
      }),
    ]);
    expect(dossier.money).toEqual([]);
    expect(dossier.outcome).toBeUndefined();
    expect(dossier.completeness.feeData).toBe("MISSING");
    expect(dossier.completeness.outcome).toBe("MISSING");
    expect(dossier.durations[0]?.milliseconds).toBe(600_000);
  });

  it("is byte-stable and identity-stable for the same immutable evidence", () => {
    const first = assembleCaseDossierV1(candidate(), collection());
    const second = assembleCaseDossierV1(candidate(), collection());
    expect(second.dossierId).toBe(first.dossierId);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  it("never imports MarkReg recommendedAction or Brain semantics into the dossier", () => {
    const dossier = assembleCaseDossierV1(candidate(), collection());
    const serialized = JSON.stringify(dossier);
    expect(serialized).not.toContain("recommendedAction");
    expect(serialized).not.toContain("preferred thing");
    expect(serialized).not.toContain("successProbability");
    expect(serialized).not.toContain("0.99");
  });

  it("does not promote OPEN or an internal lifecycle state into an observed outcome", () => {
    const dossier = assembleCaseDossierV1(candidate(), collection());
    expect(dossier.identity.startingProceduralState?.value).toBe("OPEN");
    expect(dossier.timeline.at(-1)?.resultingStatus?.value).toBe("CUSTOMER_ACTION_NEEDED");
    expect(dossier.outcome).toBeUndefined();
  });

  it("represents unavailable optional sources without fabricating facts", () => {
    const value = collection({
      lifecycleProvenance: undefined,
      documentPackages: [],
      omissions: [
        { surface: "LIFECYCLE_PROVENANCE", reason: "NOT_AUTHORIZED" },
        { surface: "DOCUMENT_PACKAGES", reason: "NOT_AVAILABLE" },
      ],
    });
    const dossier = assembleCaseDossierV1(candidate(), value);
    expect(dossier.timeline.map((event) => event.eventId)).toEqual(["formal-matter-created"]);
    expect(dossier.documents).toEqual([]);
    expect(dossier.completeness.timeline).toBe("SOURCE_UNAVAILABLE");
    expect(dossier.completeness.materialDocuments).toBe("SOURCE_UNAVAILABLE");
    expect(dossier.completeness.communications).toBe("SOURCE_UNAVAILABLE");
  });

  it("fails closed if exact payload bytes do not match their recorded identity", () => {
    const value = collection();
    value.formalMatter = {
      ...value.formalMatter,
      dataBase64: Buffer.from("{}").toString("base64"),
    };
    expect(() => assembleCaseDossierV1(candidate(), value)).toThrowError(CaseDossierAssemblyError);
    try {
      assembleCaseDossierV1(candidate(), value);
    } catch (error) {
      expect((error as CaseDossierAssemblyError).code).toBe(
        "CASE_DOSSIER_EVIDENCE_IDENTITY_MISMATCH",
      );
    }
  });

  it("fails closed on Candidate-to-collection source lineage drift", () => {
    expect(() =>
      assembleCaseDossierV1(candidate({ sourceSnapshotSha256: "b".repeat(64) }), collection()),
    ).toThrowError(CaseDossierAssemblyError);
  });

  it("ignores unknown Document Package item shapes instead of inventing document facts", () => {
    const dossier = assembleCaseDossierV1(candidate(), collection());
    expect(dossier.documents).toHaveLength(1);
    expect(dossier.documents[0]?.documentItemId).toBe("document-item_01");
  });
});
