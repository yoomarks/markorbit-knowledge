import { describe, expect, it } from "vitest";
import {
  CASE_EVIDENCE_COLLECTION_OBJECT_TYPE,
  CASE_EVIDENCE_COLLECTION_PROTOCOL_VERSION,
  CASE_EVIDENCE_SOURCE_SYSTEM,
  isCaseEvidenceCollectionV1,
  type CaseEvidenceCollectionV1,
  type ExactCaseSourcePayloadV1,
} from "./case-evidence-collection-v1";

function exact(
  sourceRef = "markreg:/v1/formal-matters/formal-matter_x",
): ExactCaseSourcePayloadV1 {
  return {
    sourceRef,
    mediaType: "application/json",
    sha256: "a".repeat(64),
    sizeBytes: 2,
    dataBase64: "e30=",
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
      sourceMatterId: "formal-matter_x",
      sourceMatterVersion: 1,
      sourceSnapshotSha256: "a".repeat(64),
      sourceRetrievalRef: "markreg:authorized-ref:01",
      sourceWorkspaceId: "workspace:test",
    },
    formalMatter: exact(),
    documentPackages: [],
    omissions: [
      { surface: "LIFECYCLE_PROVENANCE", reason: "NOT_AVAILABLE" },
      { surface: "DOCUMENT_PACKAGES", reason: "NOT_AUTHORIZED" },
    ],
    collectedAt: "2026-08-25T04:30:00.000Z",
    provenance: {
      sourceFamily: "CASE",
      originalSystem: "MARKREG",
      originalSystemAuthoritative: true,
      knowledgeSnapshotIsSystemOfRecord: false,
    },
    ...overrides,
  };
}

describe("CaseEvidenceCollectionV1", () => {
  it("accepts the producer-compatible minimum Formal Matter suffix", () => {
    expect(isCaseEvidenceCollectionV1(collection())).toBe(true);
  });

  it("rejects duplicate optional-surface omissions", () => {
    expect(
      isCaseEvidenceCollectionV1(
        collection({
          omissions: [
            { surface: "DOCUMENT_PACKAGES", reason: "NOT_AVAILABLE" },
            { surface: "DOCUMENT_PACKAGES", reason: "NOT_AUTHORIZED" },
          ],
        }),
      ),
    ).toBe(false);
  });

  it("cannot claim the Knowledge snapshot is the system of record", () => {
    expect(
      isCaseEvidenceCollectionV1({
        ...collection(),
        provenance: {
          sourceFamily: "CASE",
          originalSystem: "MARKREG",
          originalSystemAuthoritative: true,
          knowledgeSnapshotIsSystemOfRecord: true,
        },
      }),
    ).toBe(false);
  });
});
