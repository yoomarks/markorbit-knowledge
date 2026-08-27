import type {
  ContentObjectRefV1,
  KnowledgeLexicalEvidenceV1,
  KnowledgeRetrievalCompositionResultV1,
} from "@markorbit/contracts";
import { isContentObjectRefV1 } from "@markorbit/contracts";
import { RegistryValidationError } from "@markorbit/persistence";

const SHA256_HEX = /^[a-f0-9]{64}$/;

export type FrozenExpectedChunkV1 = {
  chunkId: string;
  contentSha256: string;
};

export type FrozenExpectedRetrievalSourceV1 = {
  content: ContentObjectRefV1;
  chunks?: FrozenExpectedChunkV1[];
};

export type FrozenRetrievalEvaluationV1 = {
  k: number;
  expectedSources: FrozenExpectedRetrievalSourceV1[];
};

export type KnowledgeRetrievalEvaluationMetricsV1 = {
  expectedDocumentCount: number;
  lexicalDocumentHitsAtK: number;
  documentRecallAtK: number | null;
  expectedChunkCount: number;
  exactChunkHits: number;
  exactChunkHitRate: number | null;
  lexicalEvidenceCount: number;
  lexicalProvenanceCompleteCount: number;
  provenanceCompletenessRate: number | null;
  graphExpandedOnlyCount: number;
  graphExpandedIrrelevantCount: number;
  relationshipExpansionNoiseRate: number | null;
};

function contentIdentity(content: ContentObjectRefV1): string {
  return [content.workspaceId, content.objectKind, content.objectId].join("\u001f");
}

function validateEvaluation(
  result: KnowledgeRetrievalCompositionResultV1,
  evaluation: FrozenRetrievalEvaluationV1,
): void {
  if (!Number.isInteger(evaluation.k) || evaluation.k <= 0) {
    throw new RegistryValidationError("Retrieval evaluation k must be a positive integer");
  }
  if (!Array.isArray(evaluation.expectedSources)) {
    throw new RegistryValidationError("Retrieval evaluation expectedSources must be an array");
  }

  const identities = new Set<string>();
  for (const source of evaluation.expectedSources) {
    if (
      !isContentObjectRefV1(source.content) ||
      source.content.workspaceId !== result.workspaceId
    ) {
      throw new RegistryValidationError(
        "Retrieval evaluation expected source must be valid content in the result workspace",
      );
    }
    const identity = contentIdentity(source.content);
    if (identities.has(identity)) {
      throw new RegistryValidationError("Retrieval evaluation contains duplicate expected sources");
    }
    identities.add(identity);

    const chunkIds = new Set<string>();
    for (const chunk of source.chunks ?? []) {
      if (
        !chunk.chunkId ||
        chunk.chunkId !== chunk.chunkId.trim() ||
        !SHA256_HEX.test(chunk.contentSha256)
      ) {
        throw new RegistryValidationError(
          "Retrieval evaluation contains invalid expected chunk lineage",
        );
      }
      if (chunkIds.has(chunk.chunkId)) {
        throw new RegistryValidationError(
          "Retrieval evaluation contains duplicate expected chunks",
        );
      }
      chunkIds.add(chunk.chunkId);
    }
  }
}

function hasCompleteLineage(evidence: KnowledgeLexicalEvidenceV1): boolean {
  return Boolean(
    evidence.chunkId &&
    evidence.contentSha256 &&
    SHA256_HEX.test(evidence.contentSha256) &&
    evidence.indexedAt &&
    !Number.isNaN(Date.parse(evidence.indexedAt)),
  );
}

export function evaluateKnowledgeRetrieval(
  result: KnowledgeRetrievalCompositionResultV1,
  evaluation: FrozenRetrievalEvaluationV1,
): KnowledgeRetrievalEvaluationMetricsV1 {
  validateEvaluation(result, evaluation);

  const expectedByIdentity = new Map(
    evaluation.expectedSources.map((source) => [contentIdentity(source.content), source] as const),
  );

  const lexicalAtK = new Set<string>();
  const exactChunkMatches = new Set<string>();
  let lexicalEvidenceCount = 0;
  let lexicalProvenanceCompleteCount = 0;
  let graphExpandedOnlyCount = 0;
  let graphExpandedIrrelevantCount = 0;

  for (const item of result.items) {
    const identity = contentIdentity(item.content);
    const lexical = item.evidence.filter(
      (evidence): evidence is KnowledgeLexicalEvidenceV1 => evidence.channel === "LEXICAL",
    );
    const graph = item.evidence.filter((evidence) => evidence.channel === "GRAPH");

    for (const evidence of lexical) {
      lexicalEvidenceCount += 1;
      if (hasCompleteLineage(evidence)) lexicalProvenanceCompleteCount += 1;
      if (evidence.position <= evaluation.k) lexicalAtK.add(identity);

      const expected = expectedByIdentity.get(identity);
      if (!expected || !evidence.chunkId || !evidence.contentSha256) continue;
      for (const chunk of expected.chunks ?? []) {
        if (chunk.chunkId === evidence.chunkId && chunk.contentSha256 === evidence.contentSha256) {
          exactChunkMatches.add(`${identity}\u001f${chunk.chunkId}\u001f${chunk.contentSha256}`);
        }
      }
    }

    if (lexical.length === 0 && graph.length > 0) {
      graphExpandedOnlyCount += 1;
      if (!expectedByIdentity.has(identity)) graphExpandedIrrelevantCount += 1;
    }
  }

  const lexicalDocumentHitsAtK = [...expectedByIdentity.keys()].filter((identity) =>
    lexicalAtK.has(identity),
  ).length;
  const expectedChunkCount = evaluation.expectedSources.reduce(
    (total, source) => total + (source.chunks?.length ?? 0),
    0,
  );

  return {
    expectedDocumentCount: expectedByIdentity.size,
    lexicalDocumentHitsAtK,
    documentRecallAtK:
      expectedByIdentity.size === 0 ? null : lexicalDocumentHitsAtK / expectedByIdentity.size,
    expectedChunkCount,
    exactChunkHits: exactChunkMatches.size,
    exactChunkHitRate:
      expectedChunkCount === 0 ? null : exactChunkMatches.size / expectedChunkCount,
    lexicalEvidenceCount,
    lexicalProvenanceCompleteCount,
    provenanceCompletenessRate:
      lexicalEvidenceCount === 0 ? null : lexicalProvenanceCompleteCount / lexicalEvidenceCount,
    graphExpandedOnlyCount,
    graphExpandedIrrelevantCount,
    relationshipExpansionNoiseRate:
      graphExpandedOnlyCount === 0 ? null : graphExpandedIrrelevantCount / graphExpandedOnlyCount,
  };
}
