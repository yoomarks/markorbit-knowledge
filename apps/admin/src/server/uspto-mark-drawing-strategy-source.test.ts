import { describe, expect, it } from "vitest";
import type { RetrievalChunk, RetrievalDocument } from "@markorbit/contracts";
import { RegistryConflictError } from "@markorbit/persistence";
import {
  USPTO_MARK_DRAWING_STRATEGY_SOURCE_V1,
  attestUsptoMarkDrawingStrategySourceV1,
  type UsptoMarkDrawingStrategyEvidenceReader,
} from "./uspto-mark-drawing-strategy-source";

const frozen = USPTO_MARK_DRAWING_STRATEGY_SOURCE_V1;

function document(): RetrievalDocument {
  return {
    protocolVersion: "1.0",
    objectType: "RETRIEVAL_DOCUMENT",
    documentId: frozen.evidence.documentId,
    workspaceId: frozen.evidence.workspaceId,
    sourceId: frozen.evidence.sourceId,
    stagingDocumentId: frozen.evidence.stagingDocumentId,
    readyPackageId: frozen.evidence.readyPackageId,
    rawArtifactId: frozen.evidence.rawArtifactId,
    logicalDocumentId: null,
    artifactVersion: frozen.evidence.artifactVersion,
    title: "USPTO Trademark Drawing Strategy - Primary Authority",
    targetPath: `sources/uspto/issue-903/${frozen.evidence.rawArtifactId}.md`,
    canonicalUri: frozen.canonicalUri,
    sourceUri: frozen.canonicalUri,
    sourceName: "USPTO Trademark Drawing Strategy - Primary Authority",
    sourceCategory: "OFFICIAL_AUTHORITY",
    authorityLevel: frozen.authorityLevel,
    jurisdictions: [frozen.jurisdiction],
    languages: ["en-US"],
    capturedAt: "2026-09-06T14:49:59.475Z",
    publishedAt: null,
    contentSha256: frozen.evidence.documentContentSha256,
    keywords: [],
    chunkCount: 60,
    indexedAt: frozen.evidence.indexedAt,
    isCurrent: true,
  };
}

function chunks(): RetrievalChunk[] {
  return frozen.chunks.map((chunk) => ({
    protocolVersion: "1.0",
    objectType: "RETRIEVAL_CHUNK",
    chunkId: chunk.chunkId,
    documentId: frozen.evidence.documentId,
    stagingDocumentId: frozen.evidence.stagingDocumentId,
    artifactVersion: frozen.evidence.artifactVersion,
    ordinal: chunk.ordinal,
    headingPath: [...chunk.headingPath],
    text: `Frozen ${chunk.role} evidence`,
    contentSha256: chunk.chunkContentSha256,
  }));
}

function reader(
  overrides: {
    document?: RetrievalDocument;
    chunks?: RetrievalChunk[];
    rawSha256?: string;
  } = {},
): UsptoMarkDrawingStrategyEvidenceReader {
  const selectedDocument = overrides.document ?? document();
  const selectedChunks = overrides.chunks ?? chunks();
  return {
    getDocument: () => selectedDocument,
    listChunks: () => selectedChunks,
    getRawArtifact: () => ({
      artifact: {
        version: frozen.evidence.rawArtifactVersion,
        sizeBytes: frozen.evidence.rawArtifactSizeBytes,
        binaryHash: { value: overrides.rawSha256 ?? frozen.evidence.rawArtifactSha256 },
      },
    }),
  };
}

describe("USPTO mark-drawing strategy source v1", () => {
  it("freezes the exact live primary-authority identities captured for #903", () => {
    expect(frozen.capturedAgainstKnowledgeMainSha).toMatch(/^[a-f0-9]{40}$/u);
    expect(frozen.evidence.rawArtifactId).toMatch(/^art_/u);
    expect(frozen.evidence.rawArtifactSha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(frozen.evidence.documentContentSha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(frozen.chunks.map((chunk) => chunk.role)).toEqual([
      "DECISION_FACTORS",
      "DRAWING_TYPE_DEFINITIONS",
      "PROTECTION_SCOPE_AND_SPECIAL_FORM_REQUIRED",
    ]);
    expect(frozen.chunks.map((chunk) => chunk.ordinal)).toEqual([33, 34, 35]);
    for (const chunk of frozen.chunks) {
      expect(chunk.chunkId).toMatch(/^rch_/u);
      expect(chunk.chunkContentSha256).toMatch(/^[a-f0-9]{64}$/u);
      expect(chunk.chunkContentSha256.startsWith(chunk.chunkId.slice(4))).toBe(true);
    }
  });
  it("attests exact RawArtifact, retrieval document, chunks, and currentness", () => {
    const attested = attestUsptoMarkDrawingStrategySourceV1(reader());
    expect(attested.document.documentId).toBe(frozen.evidence.documentId);
    expect(attested.document.isCurrent).toBe(true);
    expect(attested.chunks.map((chunk) => chunk.chunkId)).toEqual(
      frozen.chunks.map((chunk) => chunk.chunkId),
    );
  });

  it("fails closed when the retrieval document is stale", () => {
    expect(() =>
      attestUsptoMarkDrawingStrategySourceV1(
        reader({ document: { ...document(), isCurrent: false } }),
      ),
    ).toThrow(RegistryConflictError);
  });

  it("fails closed when RawArtifact evidence is tampered", () => {
    expect(() =>
      attestUsptoMarkDrawingStrategySourceV1(reader({ rawSha256: "f".repeat(64) })),
    ).toThrow(RegistryConflictError);
  });

  it("fails closed when a required chunk digest drifts", () => {
    const tampered = chunks();
    tampered[1] = { ...tampered[1]!, contentSha256: "f".repeat(64) };
    expect(() => attestUsptoMarkDrawingStrategySourceV1(reader({ chunks: tampered }))).toThrow(
      RegistryConflictError,
    );
  });
});
