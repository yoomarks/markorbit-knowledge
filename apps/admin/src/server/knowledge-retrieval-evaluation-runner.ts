import type { KnowledgeRetrievalCompositionResultV1 } from "@markorbit/contracts";
import { RegistryValidationError } from "@markorbit/persistence";
import {
  evaluateKnowledgeRetrieval,
  type FrozenRetrievalEvaluationV1,
  type KnowledgeRetrievalEvaluationMetricsV1,
} from "./knowledge-retrieval-evaluation";

export type FrozenRetrievalQueryV1 = {
  queryId: string;
  workspaceId: string;
  queryText: string;
  evaluation: FrozenRetrievalEvaluationV1;
};

export type FrozenRetrievalFixtureV1 = {
  schemaVersion: "1.0";
  fixtureId: string;
  fixtureVersion: string;
  queries: FrozenRetrievalQueryV1[];
};

export type FrozenRetrievalResultV1 = {
  queryId: string;
  result: KnowledgeRetrievalCompositionResultV1;
};

export type FrozenRetrievalQueryEvaluationV1 = {
  queryId: string;
  metrics: KnowledgeRetrievalEvaluationMetricsV1;
};

export type FrozenRetrievalAggregateMetricsV1 = {
  queryCount: number;
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

export type FrozenRetrievalFixtureEvaluationV1 = {
  schemaVersion: "1.0";
  fixtureId: string;
  fixtureVersion: string;
  queries: FrozenRetrievalQueryEvaluationV1[];
  aggregate: FrozenRetrievalAggregateMetricsV1;
};

function requireIdentifier(value: string, label: string): void {
  if (!value || value !== value.trim()) {
    throw new RegistryValidationError(`${label} must be a non-empty trimmed string`);
  }
}

function validateFixture(fixture: FrozenRetrievalFixtureV1): void {
  if (fixture.schemaVersion !== "1.0") {
    throw new RegistryValidationError("Retrieval fixture schemaVersion must be 1.0");
  }
  requireIdentifier(fixture.fixtureId, "Retrieval fixture id");
  requireIdentifier(fixture.fixtureVersion, "Retrieval fixture version");
  if (!Array.isArray(fixture.queries) || fixture.queries.length === 0) {
    throw new RegistryValidationError("Retrieval fixture must contain at least one query");
  }

  const queryIds = new Set<string>();
  for (const query of fixture.queries) {
    requireIdentifier(query.queryId, "Retrieval fixture query id");
    requireIdentifier(query.workspaceId, "Retrieval fixture workspace id");
    requireIdentifier(query.queryText, "Retrieval fixture query text");
    if (queryIds.has(query.queryId)) {
      throw new RegistryValidationError("Retrieval fixture contains duplicate query ids");
    }
    queryIds.add(query.queryId);
  }
}

function aggregateMetrics(
  queries: FrozenRetrievalQueryEvaluationV1[],
): FrozenRetrievalAggregateMetricsV1 {
  const totals = queries.reduce(
    (aggregate, query) => {
      const metrics = query.metrics;
      aggregate.expectedDocumentCount += metrics.expectedDocumentCount;
      aggregate.lexicalDocumentHitsAtK += metrics.lexicalDocumentHitsAtK;
      aggregate.expectedChunkCount += metrics.expectedChunkCount;
      aggregate.exactChunkHits += metrics.exactChunkHits;
      aggregate.lexicalEvidenceCount += metrics.lexicalEvidenceCount;
      aggregate.lexicalProvenanceCompleteCount += metrics.lexicalProvenanceCompleteCount;
      aggregate.graphExpandedOnlyCount += metrics.graphExpandedOnlyCount;
      aggregate.graphExpandedIrrelevantCount += metrics.graphExpandedIrrelevantCount;
      return aggregate;
    },
    {
      expectedDocumentCount: 0,
      lexicalDocumentHitsAtK: 0,
      expectedChunkCount: 0,
      exactChunkHits: 0,
      lexicalEvidenceCount: 0,
      lexicalProvenanceCompleteCount: 0,
      graphExpandedOnlyCount: 0,
      graphExpandedIrrelevantCount: 0,
    },
  );

  return {
    queryCount: queries.length,
    ...totals,
    documentRecallAtK:
      totals.expectedDocumentCount === 0
        ? null
        : totals.lexicalDocumentHitsAtK / totals.expectedDocumentCount,
    exactChunkHitRate:
      totals.expectedChunkCount === 0 ? null : totals.exactChunkHits / totals.expectedChunkCount,
    provenanceCompletenessRate:
      totals.lexicalEvidenceCount === 0
        ? null
        : totals.lexicalProvenanceCompleteCount / totals.lexicalEvidenceCount,
    relationshipExpansionNoiseRate:
      totals.graphExpandedOnlyCount === 0
        ? null
        : totals.graphExpandedIrrelevantCount / totals.graphExpandedOnlyCount,
  };
}

export function runFrozenRetrievalEvaluation(
  fixture: FrozenRetrievalFixtureV1,
  results: FrozenRetrievalResultV1[],
): FrozenRetrievalFixtureEvaluationV1 {
  validateFixture(fixture);
  if (!Array.isArray(results)) {
    throw new RegistryValidationError("Retrieval evaluation results must be an array");
  }

  const resultsByQueryId = new Map<string, KnowledgeRetrievalCompositionResultV1>();
  for (const entry of results) {
    requireIdentifier(entry.queryId, "Retrieval result query id");
    if (resultsByQueryId.has(entry.queryId)) {
      throw new RegistryValidationError("Retrieval evaluation contains duplicate query results");
    }
    resultsByQueryId.set(entry.queryId, entry.result);
  }

  const fixtureQueryIds = new Set(fixture.queries.map((query) => query.queryId));
  for (const queryId of resultsByQueryId.keys()) {
    if (!fixtureQueryIds.has(queryId)) {
      throw new RegistryValidationError("Retrieval evaluation contains an unknown query result");
    }
  }

  const queries = fixture.queries.map((query) => {
    const result = resultsByQueryId.get(query.queryId);
    if (!result) {
      throw new RegistryValidationError("Retrieval evaluation is missing a frozen query result");
    }
    if (result.workspaceId !== query.workspaceId || result.queryText !== query.queryText) {
      throw new RegistryValidationError(
        "Retrieval result identity does not match the frozen query fixture",
      );
    }

    return {
      queryId: query.queryId,
      metrics: evaluateKnowledgeRetrieval(result, query.evaluation),
    };
  });

  return {
    schemaVersion: "1.0",
    fixtureId: fixture.fixtureId,
    fixtureVersion: fixture.fixtureVersion,
    queries,
    aggregate: aggregateMetrics(queries),
  };
}
