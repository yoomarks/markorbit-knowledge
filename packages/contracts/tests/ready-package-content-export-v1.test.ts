import { describe, expect, it } from "vitest";
import {
  READY_PACKAGE_CONTENT_EXPORT_VERSION,
  isReadyPackageContentExportV1,
  serializeReadyPackageContentExportV1,
  type ReadyPackageContentExportV1,
} from "../src/ready-package-content-export-v1";

const fixture = (): ReadyPackageContentExportV1 => ({
  contractVersion: READY_PACKAGE_CONTENT_EXPORT_VERSION,
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
});

describe("ReadyPackage Content Export V1", () => {
  it("accepts the frozen V1 envelope and serializes it deterministically", () => {
    const value = fixture();
    expect(isReadyPackageContentExportV1(value)).toBe(true);
    const first = serializeReadyPackageContentExportV1(value);
    const reordered = {
      stagingDocument: { ...value.stagingDocument },
      rawArtifact: { ...value.rawArtifact },
      provenance: { ...value.provenance, converter: { ...value.provenance.converter } },
      readyPackageDigest: value.readyPackageDigest,
      knowledgeWorkspaceId: value.knowledgeWorkspaceId,
      readyPackageId: value.readyPackageId,
      objectType: value.objectType,
      contractVersion: value.contractVersion,
    } as ReadyPackageContentExportV1;
    expect(serializeReadyPackageContentExportV1(reordered)).toBe(first);
  });

  it("rejects mutable delivery state and unexpected fields", () => {
    expect(isReadyPackageContentExportV1({ ...fixture(), status: "HANDED_OFF" })).toBe(false);
  });

  it("rejects content whose declared integrity envelope is malformed", () => {
    expect(
      isReadyPackageContentExportV1({
        ...fixture(),
        stagingDocument: { ...fixture().stagingDocument, sha256: "not-a-digest" },
      }),
    ).toBe(false);
    expect(
      isReadyPackageContentExportV1({
        ...fixture(),
        provenance: { ...fixture().provenance, legalTruthVerified: true },
      }),
    ).toBe(false);
  });
});
