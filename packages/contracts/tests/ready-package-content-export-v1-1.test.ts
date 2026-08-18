import { describe, expect, it } from "vitest";
import {
  READY_PACKAGE_CONTENT_EXPORT_V1_1_VERSION,
  isReadyPackageContentExportV1_1,
  serializeReadyPackageContentExportV1_1,
  type ReadyPackageContentExportV1_1,
} from "../src/ready-package-content-export-v1-1";

const fixture = (): ReadyPackageContentExportV1_1 => ({
  contractVersion: READY_PACKAGE_CONTENT_EXPORT_V1_1_VERSION,
  objectType: "READY_PACKAGE_CONTENT_EXPORT",
  readyPackageId: "rdp_01ARZ3NDEKTSV4RRFFQ69G5FAV",
  knowledgeWorkspaceId: "wsp_01ARZ3NDEKTSV4RRFFQ69G5FAV",
  readyPackageDigest: "a".repeat(64),
  provenance: {
    sourceId: "src_01ARZ3NDEKTSV4RRFFQ69G5FAV",
    conversionRunId: "cvr_01ARZ3NDEKTSV4RRFFQ69G5FAV",
    verificationId: "svr_01ARZ3NDEKTSV4RRFFQ69G5FAV",
    verificationOutcome: "PASS_WITH_WARNINGS",
    capturedAt: "2026-08-11T01:00:00.000Z",
    converter: { converterId: "builtin-markdown-staging", version: "1.0.0" },
    legalTruthVerified: false,
  },
  rawArtifact: {
    artifactId: "art_01ARZ3NDEKTSV4RRFFQ69G5FAV",
    sha256: "b".repeat(64),
    sizeBytes: 42,
    mimeType: "application/pdf",
    originalName: "source.pdf",
  },
  stagingDocument: {
    documentId: "std_01ARZ3NDEKTSV4RRFFQ69G5FAV",
    sha256: "c".repeat(64),
    sizeBytes: 14,
    mediaType: "text/markdown",
    encoding: "utf-8",
    content: "# Frozen body\n",
  },
  sourceGovernance: {
    snapshotVersion: "1.0",
    kind: "GLOBAL_REFERENCE",
    sourceId: "src_01ARZ3NDEKTSV4RRFFQ69G5FAV",
    referenceProtocolVersion: "1.0",
    sourceRole: "TM_PRACTICE_GUIDE",
    authorityTier: "B_PLUS",
    intendedUses: ["TRADEMARK_PROFILE", "CHANGE_SIGNAL"],
    factEligibility: "SECONDARY",
    verification: {
      policy: "REQUIRED",
      verifyAgainstSourceIds: ["official-source"],
      verifyAgainstJurisdictionOfficialSource: true,
    },
    contentReusePolicy: "FACT_EXTRACTION_WITH_PROVENANCE",
  },
});

describe("ReadyPackage Content Export V1.1", () => {
  it("accepts and deterministically serializes a Global Reference governance snapshot", () => {
    const value = fixture();
    expect(isReadyPackageContentExportV1_1(value)).toBe(true);
    expect(serializeReadyPackageContentExportV1_1(structuredClone(value))).toBe(
      serializeReadyPackageContentExportV1_1(value),
    );
  });

  it("rejects governance whose Source id differs from provenance", () => {
    expect(
      isReadyPackageContentExportV1_1({
        ...fixture(),
        sourceGovernance: {
          ...fixture().sourceGovernance,
          sourceId: "src_01H00000000000000000000000",
        },
      }),
    ).toBe(false);
  });

  it("rejects an invalid fact eligibility or content reuse policy", () => {
    const value = fixture() as unknown as Record<string, unknown>;
    const governance = structuredClone(value.sourceGovernance) as Record<string, unknown>;
    governance.factEligibility = "TRUST_ME";
    expect(isReadyPackageContentExportV1_1({ ...value, sourceGovernance: governance })).toBe(false);

    const second = fixture() as unknown as Record<string, unknown>;
    const secondGovernance = structuredClone(second.sourceGovernance) as Record<string, unknown>;
    secondGovernance.contentReusePolicy = "FULL_REPUBLICATION";
    expect(
      isReadyPackageContentExportV1_1({ ...second, sourceGovernance: secondGovernance }),
    ).toBe(false);
  });

  it("accepts the minimal standard Source snapshot but never legalTruthVerified=true", () => {
    const value: ReadyPackageContentExportV1_1 = {
      ...fixture(),
      sourceGovernance: {
        snapshotVersion: "1.0",
        kind: "STANDARD_SOURCE",
        sourceId: fixture().provenance.sourceId,
      },
    };
    expect(isReadyPackageContentExportV1_1(value)).toBe(true);
    expect(
      isReadyPackageContentExportV1_1({
        ...value,
        provenance: { ...value.provenance, legalTruthVerified: true },
      }),
    ).toBe(false);
  });
});
