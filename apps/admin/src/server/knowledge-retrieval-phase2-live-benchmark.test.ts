import { describe, expect, it } from "vitest";
import type {
  RetrievalChunk,
  RetrievalDocument,
  RetrievalSearchRequest,
  RetrievalSearchResult,
} from "@markorbit/contracts";
import {
  RegistryConflictError,
} from "@markorbit/persistence";
import type { RetrievalIndexRepository } from "@markorbit/persistence/retrieval-index";
import { KNOWLEDGE_RETRIEVAL_PHASE2_CORPUS_V1 } from "./knowledge-retrieval-phase2-corpus";
import {
  attestKnowledgeRetrievalPhase2LiveCorpus,
  buildKnowledgeRetrievalPhase2FrozenFixture,
  createRetrievalIndexLexicalReader,
  runKnowledgeRetrievalPhase2LiveBenchmark,
} from "./knowledge-retrieval-phase2-live-benchmark";

const workspaceId = "workspace-phase2-live-benchmark";
const liveEvidence = KNOWLEDGE_RETRIEVAL_PHASE2_CORPUS_V1.evidence.filter(
  (evidence) => evidence.evidenceKind === "LIVE_ACCEPTED",
);

function documentFor(index: number): RetrievalDocument {
  const evidence = liveEvidence[index];
  if (!evidence?.documentId || !evidence.documentContentSha256 || !evidence.chunks?.length) {
    throw new Error("Phase 2 live corpus fixture is incomplete");
  }
  return {
    protocolVersion: "1.0",
    objectType: "RETRIEVAL_DOCUMENT",
    documentId: evidence.documentId,
    workspaceId,
    sourceId: `source-phase2-${index + 1}`,
    stagingDocumentId: `staging-phase2-${index + 1}`,
    readyPackageId: `ready-phase2-${index + 1}`,
    rawArtifactId: evidence.documentId,
    logicalDocumentId: evidence.documentId,
    artifactVersion: 1,
    title: `USPTO Phase 2 Evidence ${index + 1}`,
    targetPath: `US/USPTO/phase2-${index + 1}.md`,
    canonicalUri: evidence.canonicalUri ?? null,
    sourceUri: evidence.canonicalUri ?? "https://www.uspto.gov/",
    sourceName: "USPTO",
    sourceCategory: "OFFICIAL_GUIDANCE",
    authorityLevel: "PRIMARY_OFFICIAL",
    jurisdictions: ["US"],
    languages: ["en"],
    capturedAt: "2026-08-28T04:18:00.000Z",
    publishedAt: null,
    contentSha256: evidence.documentContentSha256,
    keywords: [],
    chunkCount: evidence.chunks.length,
    indexedAt: evidence.chunks[0].indexedAt,
    isCurrent: true,
  };
}

function chunksFor(index: number, document: RetrievalDocument): RetrievalChunk[] {
  const evidence = liveEvidence[index];
  if (!evidence?.chunks?.length) throw new Error("Phase 2 live chunks are missing");
  return evidence.chunks.map((chunk, chunkIndex) => ({
    protocolVersion: "1.0",
    objectType: "RETRIEVAL_CHUNK",
    chunkId: chunk.chunkId,
    documentId: document.documentId,
    stagingDocumentId: document.stagingDocumentId,
    artifactVersion: document.artifactVersion,
    ordinal: chunkIndex + 1,
    headingPath: ["USPTO evidence"],
    text: `Frozen accepted retrieval evidence ${index + 1}/${chunkIndex + 1}`,
    contentSha256: chunk.chunkContentSha256,
  }));
}

function matchingIndex(query: string): number {
  if (query.includes("7017")) return 0;
  if (query.includes("January 18 2025")) return 1;
  if (query.includes("Sections 1 and 44")) return 2;
  return -1;
}

function exactLiveRepository(): RetrievalIndexRepository {
  const documents = liveEvidence.map((_, index) => documentFor(index));
  const chunks = documents.map((document, index) => chunksFor(index, document));
  return {
    indexVerified: () => {
      throw new Error("not used by benchmark");
    },
    search: (request: RetrievalSearchRequest): RetrievalSearchResult => {
      const index = matchingIndex(request.query);
      const document = documents[index];
      const chunk = chunks[index]?.[0];
      return {
        protocolVersion: "1.0",
        objectType: "RETRIEVAL_SEARCH_RESULT",
        indexMode: "SQLITE_FTS5_BM25",
        query: request.query,
        items:
          document && chunk
            ? [
                {
                  document,
                  chunk,
                  score: 1,
                  snippet: chunk.text,
                },
              ]
            : [],
        total: document && chunk ? 1 : 0,
      };
    },
    getDocument: (_requestedWorkspaceId, documentId) =>
      documents.find((document) => document.documentId === documentId) ?? null,
    listChunks: (stagingDocumentId) => {
      const index = documents.findIndex(
        (document) => document.stagingDocumentId === stagingDocumentId,
      );
      return index < 0 ? [] : chunks[index];
    },
    documentResult: () => null,
  };
}

describe("Knowledge retrieval Phase 2 live benchmark", () => {
  it("freezes representative questions against the accepted live USPTO document/chunk identities", () => {
    const fixture = buildKnowledgeRetrievalPhase2FrozenFixture(workspaceId);

    expect(fixture.fixtureVersion).toBe(KNOWLEDGE_RETRIEVAL_PHASE2_CORPUS_V1.corpusVersion);
    expect(fixture.queries).toHaveLength(3);
    expect(fixture.queries.map((query) => query.evaluation.expectedSources[0].content.objectId)).toEqual(
      liveEvidence.map((evidence) => evidence.documentId),
    );
    expect(fixture.queries.map((query) => query.evaluation.expectedSources[0].chunks?.[0])).toEqual(
      liveEvidence.map((evidence) => ({
        chunkId: evidence.chunks?.[0].chunkId,
        contentSha256: evidence.chunks?.[0].chunkContentSha256,
      })),
    );
  });

  it("attests the exact frozen document and chunk lineage before running retrieval", () => {
    const repository = exactLiveRepository();
    const attested = attestKnowledgeRetrievalPhase2LiveCorpus({ workspaceId, repository });

    expect(attested.map((document) => document.documentId)).toEqual(
      liveEvidence.map((evidence) => evidence.documentId),
    );
  });

  it("fails closed before retrieval when the frozen document digest drifts", () => {
    const repository = exactLiveRepository();
    const originalGetDocument = repository.getDocument.bind(repository);
    repository.getDocument = (requestedWorkspaceId, documentId, artifactVersion) => {
      const document = originalGetDocument(requestedWorkspaceId, documentId, artifactVersion);
      return document && documentId === liveEvidence[0].documentId
        ? { ...document, contentSha256: "f".repeat(64) }
        : document;
    };

    expect(() => attestKnowledgeRetrievalPhase2LiveCorpus({ workspaceId, repository })).toThrow(
      RegistryConflictError,
    );
  });

  it("maps repository search results into composition lexical evidence with exact chunk lineage", async () => {
    const repository = exactLiveRepository();
    const reader = createRetrievalIndexLexicalReader(repository);
    const hits = await reader.search({
      workspaceId,
      queryText: "7017 base application per class",
      limit: 5,
    });

    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({
      content: {
        objectKind: "DOCUMENT",
        objectId: liveEvidence[0].documentId,
        workspaceId,
      },
      indexMode: "SQLITE_FTS5_BM25",
      chunkId: liveEvidence[0].chunks?.[0].chunkId,
      contentSha256: liveEvidence[0].chunks?.[0].chunkContentSha256,
      indexedAt: liveEvidence[0].chunks?.[0].indexedAt,
    });
  });

  it("runs the existing composition and evaluator against exact accepted corpus identities", async () => {
    const measured = await runKnowledgeRetrievalPhase2LiveBenchmark({
      workspaceId,
      repository: exactLiveRepository(),
    });

    expect(measured.aggregate).toMatchObject({
      queryCount: 3,
      expectedDocumentCount: 3,
      lexicalDocumentHitsAtK: 3,
      documentRecallAtK: 1,
      expectedChunkCount: 3,
      exactChunkHits: 3,
      exactChunkHitRate: 1,
      lexicalEvidenceCount: 3,
      lexicalProvenanceCompleteCount: 3,
      provenanceCompletenessRate: 1,
    });
    expect(measured.bySourceFamily?.[0]?.dimension).toBe("OFFICIAL_WEB");
    expect(measured.byQueryClass?.map((entry) => entry.dimension)).toEqual([
      "LEXICAL_APPLICABILITY_EVIDENCE",
      "LEXICAL_EXACT_IDENTIFIER",
      "LEXICAL_TEMPORAL_EVIDENCE",
    ]);
  });
});
