import type { ContentObjectRefV1, RetrievalDocument } from "@markorbit/contracts";
import { RegistryConflictError, RegistryValidationError } from "@markorbit/persistence";
import type { RetrievalIndexRepository } from "@markorbit/persistence/retrieval-index";
import {
  composeKnowledgeRetrieval,
  type KnowledgeGraphRetrievalReader,
  type KnowledgeLexicalRetrievalReader,
} from "./knowledge-retrieval-composition";
import {
  runFrozenRetrievalEvaluation,
  type FrozenRetrievalFixtureEvaluationV1,
  type FrozenRetrievalFixtureV1,
  type FrozenRetrievalResultV1,
} from "./knowledge-retrieval-evaluation-runner";
import {
  KNOWLEDGE_RETRIEVAL_PHASE2_CORPUS_V1,
  type RetrievalCorpusEvidenceV1,
} from "./knowledge-retrieval-phase2-corpus";
import {
  runKnowledgeRetrievalRegression,
  type KnowledgeRetrievalRegressionResultV1,
} from "./knowledge-retrieval-regression";

const EMPTY_GRAPH_READER: KnowledgeGraphRetrievalReader = {
  listNeighbors: () => ({ items: [] }),
};

const FROZEN_QUERIES = [
  {
    queryId: "uspto-base-application-fee-7017",
    queryText: "7017 base application per class",
    evidenceRef: "official-web:uspto-fee-schedule:phase2-559",
    queryClass: "LEXICAL_EXACT_IDENTIFIER",
  },
  {
    queryId: "uspto-fee-effective-date-2025",
    queryText: "January 18 2025 base application per class",
    evidenceRef: "official-web:uspto-fee-temporal:phase2-559",
    queryClass: "LEXICAL_TEMPORAL_EVIDENCE",
  },
  {
    queryId: "uspto-sections-1-44-applicability",
    queryText: "Sections 1 and 44 base application fee per class",
    evidenceRef: "official-web:uspto-fee-applicability:phase2-559",
    queryClass: "LEXICAL_APPLICABILITY_EVIDENCE",
  },
] as const;

function normalizedWorkspaceId(workspaceId: string): string {
  const normalized = workspaceId.trim();
  if (!normalized) throw new RegistryValidationError("workspaceId is required");
  return normalized;
}

function liveEvidenceByRef(evidenceRef: string): RetrievalCorpusEvidenceV1 {
  const evidence: RetrievalCorpusEvidenceV1 | undefined =
    KNOWLEDGE_RETRIEVAL_PHASE2_CORPUS_V1.evidence.find(
      (entry) => entry.evidenceRef === evidenceRef,
    );
  if (!evidence || evidence.evidenceKind !== "LIVE_ACCEPTED") {
    throw new RegistryValidationError(`Frozen live retrieval evidence is missing: ${evidenceRef}`);
  }
  if (!evidence.documentId || !evidence.documentContentSha256 || !evidence.chunks?.length) {
    throw new RegistryValidationError(
      `Frozen live retrieval evidence is incomplete: ${evidenceRef}`,
    );
  }
  return evidence;
}

function liveCorpusEvidence(): RetrievalCorpusEvidenceV1[] {
  return KNOWLEDGE_RETRIEVAL_PHASE2_CORPUS_V1.evidence.filter(
    (evidence) => evidence.evidenceKind === "LIVE_ACCEPTED",
  );
}

function officialWebLiveDocumentIds(): Set<string> {
  return new Set(
    KNOWLEDGE_RETRIEVAL_PHASE2_CORPUS_V1.evidence
      .filter(
        (evidence) =>
          evidence.evidenceKind === "LIVE_ACCEPTED" &&
          evidence.sourceFamily === "OFFICIAL_WEB" &&
          Boolean(evidence.documentId),
      )
      .map((evidence) => evidence.documentId!),
  );
}

function contentRef(workspaceId: string, documentId: string): ContentObjectRefV1 {
  return {
    protocolVersion: "1.0",
    objectType: "CONTENT_OBJECT_REF",
    objectId: documentId,
    objectKind: "DOCUMENT",
    workspaceId,
  };
}

export function buildKnowledgeRetrievalPhase2FrozenFixture(
  workspaceId: string,
): FrozenRetrievalFixtureV1 {
  const normalizedWorkspace = normalizedWorkspaceId(workspaceId);
  return {
    schemaVersion: "1.0",
    fixtureId: `${KNOWLEDGE_RETRIEVAL_PHASE2_CORPUS_V1.corpusId}-live-benchmark`,
    fixtureVersion: KNOWLEDGE_RETRIEVAL_PHASE2_CORPUS_V1.corpusVersion,
    queries: FROZEN_QUERIES.map((query) => {
      const evidence = liveEvidenceByRef(query.evidenceRef);
      const firstChunk = evidence.chunks![0];
      return {
        queryId: query.queryId,
        workspaceId: normalizedWorkspace,
        queryText: query.queryText,
        sourceFamily: "OFFICIAL_WEB",
        queryClass: query.queryClass,
        evaluation: {
          k: 5,
          expectedSources: [
            {
              content: contentRef(normalizedWorkspace, evidence.documentId!),
              chunks: [
                {
                  chunkId: firstChunk.chunkId,
                  contentSha256: firstChunk.chunkContentSha256,
                },
              ],
            },
          ],
        },
      };
    }),
  };
}

function assertFrozenDocument(
  repository: RetrievalIndexRepository,
  workspaceId: string,
  evidence: RetrievalCorpusEvidenceV1,
): RetrievalDocument {
  if (!evidence.documentId || !evidence.documentContentSha256 || !evidence.chunks?.length) {
    throw new RegistryValidationError(
      `Frozen retrieval evidence is incomplete: ${evidence.evidenceRef}`,
    );
  }
  const document = repository.getDocument(workspaceId, evidence.documentId);
  if (!document) {
    throw new RegistryConflictError(
      "RETRIEVAL_PHASE2_CORPUS_DOCUMENT_MISSING",
      `Frozen retrieval document is not indexed: ${evidence.evidenceRef}`,
    );
  }
  if (document.contentSha256 !== evidence.documentContentSha256 || !document.isCurrent) {
    throw new RegistryConflictError(
      "RETRIEVAL_PHASE2_CORPUS_DOCUMENT_DRIFT",
      `Frozen retrieval document identity drifted: ${evidence.evidenceRef}`,
    );
  }

  const chunks = repository.listChunks(document.stagingDocumentId, workspaceId);
  const byId = new Map(chunks.map((chunk) => [chunk.chunkId, chunk] as const));
  for (const expected of evidence.chunks) {
    const actual = byId.get(expected.chunkId);
    if (
      !actual ||
      actual.documentId !== document.documentId ||
      actual.artifactVersion !== document.artifactVersion ||
      actual.contentSha256 !== expected.chunkContentSha256 ||
      document.indexedAt !== expected.indexedAt
    ) {
      throw new RegistryConflictError(
        "RETRIEVAL_PHASE2_CORPUS_CHUNK_DRIFT",
        `Frozen retrieval chunk lineage drifted: ${evidence.evidenceRef}/${expected.chunkId}`,
      );
    }
  }
  return document;
}

export function attestKnowledgeRetrievalPhase2LiveCorpus(input: {
  workspaceId: string;
  repository: RetrievalIndexRepository;
}): RetrievalDocument[] {
  const workspaceId = normalizedWorkspaceId(input.workspaceId);
  return liveCorpusEvidence().map((evidence) =>
    assertFrozenDocument(input.repository, workspaceId, evidence),
  );
}

export function createRetrievalIndexLexicalReader(
  repository: RetrievalIndexRepository,
): KnowledgeLexicalRetrievalReader {
  return {
    search: ({ workspaceId, queryText, limit }) => {
      const result = repository.search({ workspaceId, query: queryText, limit });
      return result.items.map((item) => ({
        content: contentRef(workspaceId, item.document.documentId),
        indexMode: result.indexMode,
        score: item.score,
        snippet: item.snippet,
        headingPath: [...item.chunk.headingPath],
        chunkId: item.chunk.chunkId,
        contentSha256: item.chunk.contentSha256,
        indexedAt: item.document.indexedAt,
      }));
    },
  };
}

async function executeKnowledgeRetrievalPhase2LiveCompositions(input: {
  workspaceId: string;
  repository: RetrievalIndexRepository;
  graph?: KnowledgeGraphRetrievalReader;
}): Promise<{
  workspaceId: string;
  attestedDocuments: RetrievalDocument[];
  fixture: FrozenRetrievalFixtureV1;
  results: FrozenRetrievalResultV1[];
}> {
  const workspaceId = normalizedWorkspaceId(input.workspaceId);
  const attestedDocuments = attestKnowledgeRetrievalPhase2LiveCorpus({
    workspaceId,
    repository: input.repository,
  });
  const fixture = buildKnowledgeRetrievalPhase2FrozenFixture(workspaceId);
  const lexical = createRetrievalIndexLexicalReader(input.repository);
  const graph = input.graph ?? EMPTY_GRAPH_READER;
  const results = await Promise.all(
    fixture.queries.map(async (query) => ({
      queryId: query.queryId,
      result: await composeKnowledgeRetrieval(
        {
          protocolVersion: "1.0",
          objectType: "KNOWLEDGE_RETRIEVAL_COMPOSITION_QUERY",
          workspaceId: query.workspaceId,
          queryText: query.queryText,
          lexicalLimit: Math.max(query.evaluation.k, 5),
          vectorMode: "DISABLED",
        },
        lexical,
        graph,
      ),
    })),
  );
  return { workspaceId, attestedDocuments, fixture, results };
}

export async function runKnowledgeRetrievalPhase2LiveBenchmark(input: {
  workspaceId: string;
  repository: RetrievalIndexRepository;
  graph?: KnowledgeGraphRetrievalReader;
}): Promise<FrozenRetrievalFixtureEvaluationV1> {
  const { fixture, results } = await executeKnowledgeRetrievalPhase2LiveCompositions(input);
  return runFrozenRetrievalEvaluation(fixture, results);
}

export async function runKnowledgeRetrievalPhase2LiveVariantBenchmark(input: {
  workspaceId: string;
  repository: RetrievalIndexRepository;
  graph?: KnowledgeGraphRetrievalReader;
}): Promise<KnowledgeRetrievalRegressionResultV1> {
  const { workspaceId, attestedDocuments, fixture, results } =
    await executeKnowledgeRetrievalPhase2LiveCompositions(input);
  const officialWebIds = officialWebLiveDocumentIds();
  const metadataFilterBaselineCandidates = attestedDocuments
    .filter((document) => officialWebIds.has(document.documentId))
    .map((document) => contentRef(workspaceId, document.documentId));

  if (metadataFilterBaselineCandidates.length === 0) {
    throw new RegistryConflictError(
      "RETRIEVAL_PHASE2_METADATA_BASELINE_EMPTY",
      "Frozen Phase 2 LIVE_ACCEPTED OFFICIAL_WEB metadata baseline is empty",
    );
  }

  const resultByQueryId = new Map(results.map((entry) => [entry.queryId, entry.result] as const));
  return runKnowledgeRetrievalRegression({
    schemaVersion: 1,
    fixtureId: `${fixture.fixtureId}-variant-comparison`,
    corpusVersion: fixture.fixtureVersion,
    cases: fixture.queries.map((query) => {
      const result = resultByQueryId.get(query.queryId);
      if (!result) {
        throw new RegistryConflictError(
          "RETRIEVAL_PHASE2_VARIANT_RESULT_MISSING",
          `Phase 2 retrieval composition result is missing: ${query.queryId}`,
        );
      }
      return {
        caseId: query.queryId,
        metadataFilterBaselineCandidates,
        result,
        evaluation: query.evaluation,
        thresholds: {
          minDocumentRecallAtK: 1,
          minExactChunkHitRate: 1,
          minProvenanceCompletenessRate: 1,
        },
      };
    }),
  });
}
