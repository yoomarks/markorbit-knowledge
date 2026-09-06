import type { RetrievalChunk, RetrievalDocument } from "@markorbit/contracts";
import { RegistryConflictError } from "@markorbit/persistence";

export const USPTO_MARK_DRAWING_STRATEGY_CANONICAL_URI =
  "https://www.uspto.gov/trademarks/basics/mark-drawings-trademarks" as const;

export const USPTO_MARK_DRAWING_STRATEGY_SOURCE_V1 = Object.freeze({
  schemaVersion: "1.0" as const,
  sourceSetId: "uspto-mark-drawing-strategy-v1" as const,
  jurisdiction: "US" as const,
  authority: "USPTO" as const,
  authorityLevel: "PRIMARY_OFFICIAL" as const,
  canonicalUri: USPTO_MARK_DRAWING_STRATEGY_CANONICAL_URI,
  capturedAgainstKnowledgeMainSha: "8def6ede068dac486fdc69a8683b2b86c3ddf4b5",
  issueRef: "yoomarks/markorbit#903" as const,
  evidence: Object.freeze({
    workspaceId: "wsp_01ARZ3NDEKTSV4RRFFQ69G5FAV",
    sourceId: "src_01M1VK4XG63T35RWV5Z87JCBJ2",
    collectionRunId: "run_01M1VK4XGEPM2DBR1E47B9CS4R",
    rawArtifactId: "art_01M1VK55XXGXG9B2SYMZPJP4ND",
    rawArtifactVersion: 1,
    rawArtifactSha256: "f62b67acd4db4207b04be0242f0850993e693701124fbdc1676d02e1254ac089",
    rawArtifactSizeBytes: 65804,
    stagingDocumentId: "std_01M1VK58YKT74HVQFQHCVQ1G1T",
    readyPackageId: "rdp_01M1VK58YWPF8DVWSZKJNJ72N1",
    documentId: "art_01M1VK55XXGXG9B2SYMZPJP4ND",
    artifactVersion: 1,
    documentContentSha256: "2184c01582fe6edae7fbbcc7a3992af448cc15bb32f8ff00204b087803b7341b",
    indexedAt: "2026-09-06T14:50:02.597Z",
  }),
  chunks: Object.freeze([
    Object.freeze({
      role: "DECISION_FACTORS" as const,
      ordinal: 33,
      chunkId: "rch_b8ea9cbcb8f2f8c469cc48e23a241bbb",
      chunkContentSha256: "b8ea9cbcb8f2f8c469cc48e23a241bbb871f175c34c345dd3e75787476f61c55",
      headingPath: Object.freeze(["Drawing of your trademark"]),
    }),
    Object.freeze({
      role: "DRAWING_TYPE_DEFINITIONS" as const,
      ordinal: 34,
      chunkId: "rch_da637ddfbb5d3f17886518fe8aa68780",
      chunkContentSha256: "da637ddfbb5d3f17886518fe8aa687802d19c8247c9d9cc2551133a159748106",
      headingPath: Object.freeze(["Drawing of your trademark"]),
    }),
    Object.freeze({
      role: "PROTECTION_SCOPE_AND_SPECIAL_FORM_REQUIRED" as const,
      ordinal: 35,
      chunkId: "rch_8e1d4f6b51c7e404a8a6847f8b1e408e",
      chunkContentSha256: "8e1d4f6b51c7e404a8a6847f8b1e408ee594e3090d38dee6f530c2f315ffa0d9",
      headingPath: Object.freeze(["Drawing of your trademark"]),
    }),
  ]),
});

export interface UsptoMarkDrawingStrategyEvidenceReader {
  getDocument(
    workspaceId: string,
    documentId: string,
    artifactVersion?: number,
  ): RetrievalDocument | null;
  listChunks(stagingDocumentId: string, workspaceId: string): RetrievalChunk[];
  getRawArtifact(rawArtifactId: string): {
    artifact: { version: number; sizeBytes: number; binaryHash: { value: string } };
  } | null;
}
function mismatch(message: string): never {
  throw new RegistryConflictError("USPTO_MARK_DRAWING_STRATEGY_LINEAGE_MISMATCH", message);
}

export function attestUsptoMarkDrawingStrategySourceV1(
  reader: UsptoMarkDrawingStrategyEvidenceReader,
): {
  document: RetrievalDocument;
  chunks: readonly RetrievalChunk[];
} {
  const expected = USPTO_MARK_DRAWING_STRATEGY_SOURCE_V1;
  const artifact = reader.getRawArtifact(expected.evidence.rawArtifactId);
  if (!artifact) mismatch("The frozen RawArtifact is unavailable.");
  if (
    artifact.artifact.version !== expected.evidence.rawArtifactVersion ||
    artifact.artifact.sizeBytes !== expected.evidence.rawArtifactSizeBytes ||
    artifact.artifact.binaryHash.value !== expected.evidence.rawArtifactSha256
  ) {
    mismatch("The frozen RawArtifact identity or digest drifted.");
  }

  const document = reader.getDocument(
    expected.evidence.workspaceId,
    expected.evidence.documentId,
    expected.evidence.artifactVersion,
  );
  if (!document) mismatch("The frozen retrieval document is unavailable.");
  if (
    document.workspaceId !== expected.evidence.workspaceId ||
    document.sourceId !== expected.evidence.sourceId ||
    document.documentId !== expected.evidence.documentId ||
    document.rawArtifactId !== expected.evidence.rawArtifactId ||
    document.stagingDocumentId !== expected.evidence.stagingDocumentId ||
    document.readyPackageId !== expected.evidence.readyPackageId ||
    document.artifactVersion !== expected.evidence.artifactVersion ||
    document.canonicalUri !== expected.canonicalUri ||
    document.sourceUri !== expected.canonicalUri ||
    document.authorityLevel !== expected.authorityLevel ||
    !document.jurisdictions.includes(expected.jurisdiction) ||
    document.contentSha256 !== expected.evidence.documentContentSha256 ||
    document.indexedAt !== expected.evidence.indexedAt ||
    document.isCurrent !== true
  ) {
    mismatch("The frozen retrieval document identity, provenance, or currentness drifted.");
  }

  const actualChunks = reader.listChunks(document.stagingDocumentId, document.workspaceId);
  const selected = expected.chunks.map((chunk) => {
    const actual = actualChunks.find((candidate) => candidate.chunkId === chunk.chunkId);
    if (!actual) mismatch(`Required evidence chunk ${chunk.chunkId} is unavailable.`);
    if (
      actual.documentId !== document.documentId ||
      actual.stagingDocumentId !== document.stagingDocumentId ||
      actual.artifactVersion !== document.artifactVersion ||
      actual.ordinal !== chunk.ordinal ||
      actual.contentSha256 !== chunk.chunkContentSha256 ||
      JSON.stringify(actual.headingPath) !== JSON.stringify(chunk.headingPath)
    ) {
      mismatch(`Required evidence chunk ${chunk.chunkId} drifted.`);
    }
    return actual;
  });

  return { document, chunks: selected };
}
