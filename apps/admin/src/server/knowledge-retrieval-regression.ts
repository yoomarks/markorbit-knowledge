import type {
  ContentObjectRefV1,
  KnowledgeRetrievalCompositionResultV1,
} from "@markorbit/contracts";
import { isContentObjectRefV1 } from "@markorbit/contracts";
import { RegistryValidationError } from "@markorbit/persistence";
import {
  evaluateKnowledgeRetrieval,
  type FrozenRetrievalEvaluationV1,
  type KnowledgeRetrievalEvaluationMetricsV1,
} from "./knowledge-retrieval-evaluation";

export type KnowledgeRetrievalRegressionThresholdsV1 = {
  minDocumentRecallAtK?: number;
  minExactChunkHitRate?: number;
  minProvenanceCompletenessRate?: number;
  minRelationshipExpansionContributionRate?: number;
  maxRelationshipExpansionNoiseRate?: number;
};

export type KnowledgeRetrievalRegressionCaseV1 = {
  caseId: string;
  metadataFilterBaselineCandidates: ContentObjectRefV1[];
  result: KnowledgeRetrievalCompositionResultV1;
  evaluation: FrozenRetrievalEvaluationV1;
  thresholds: KnowledgeRetrievalRegressionThresholdsV1;
};

export type KnowledgeRetrievalRegressionFixtureV1 = {
  schemaVersion: 1;
  fixtureId: string;
  corpusVersion: string;
  cases: KnowledgeRetrievalRegressionCaseV1[];
};

export type KnowledgeRetrievalVariantCoverageV1 = {
  candidateCount: number;
  expectedDocumentCoverageRate: number | null;
};

export type KnowledgeRetrievalVariantComparisonV1 = {
  metadataFilterBaseline: KnowledgeRetrievalVariantCoverageV1;
  lexicalOnly: KnowledgeRetrievalVariantCoverageV1 & {
    metrics: KnowledgeRetrievalEvaluationMetricsV1;
  };
  lexicalRelationship: KnowledgeRetrievalVariantCoverageV1 & {
    metrics: KnowledgeRetrievalEvaluationMetricsV1;
  };
  deltas: {
    lexicalVsMetadataFilterCoverageDelta: number | null;
    relationshipVsLexicalCoverageDelta: number | null;
  };
};

export type KnowledgeRetrievalRegressionCaseResultV1 = {
  caseId: string;
  queryText: string;
  passed: boolean;
  failures: string[];
  metrics: KnowledgeRetrievalEvaluationMetricsV1;
  variantComparison: KnowledgeRetrievalVariantComparisonV1;
};

export type KnowledgeRetrievalRegressionResultV1 = {
  schemaVersion: 1;
  fixtureId: string;
  corpusVersion: string;
  passed: boolean;
  cases: KnowledgeRetrievalRegressionCaseResultV1[];
};

type RateMetric =
  | "documentRecallAtK"
  | "exactChunkHitRate"
  | "provenanceCompletenessRate"
  | "relationshipExpansionContributionRate"
  | "relationshipExpansionNoiseRate";

type ThresholdDefinition = {
  threshold: keyof KnowledgeRetrievalRegressionThresholdsV1;
  metric: RateMetric;
  direction: "MIN" | "MAX";
};

const THRESHOLD_DEFINITIONS: readonly ThresholdDefinition[] = [
  {
    threshold: "minDocumentRecallAtK",
    metric: "documentRecallAtK",
    direction: "MIN",
  },
  {
    threshold: "minExactChunkHitRate",
    metric: "exactChunkHitRate",
    direction: "MIN",
  },
  {
    threshold: "minProvenanceCompletenessRate",
    metric: "provenanceCompletenessRate",
    direction: "MIN",
  },
  {
    threshold: "minRelationshipExpansionContributionRate",
    metric: "relationshipExpansionContributionRate",
    direction: "MIN",
  },
  {
    threshold: "maxRelationshipExpansionNoiseRate",
    metric: "relationshipExpansionNoiseRate",
    direction: "MAX",
  },
] as const;

function contentIdentity(content: ContentObjectRefV1): string {
  return [content.workspaceId, content.objectKind, content.objectId].join("\u001f");
}

function validateIdentifier(value: string, label: string): void {
  if (!value || value !== value.trim()) {
    throw new RegistryValidationError(`${label} must be a non-empty trimmed string`);
  }
}

function validateThresholds(thresholds: KnowledgeRetrievalRegressionThresholdsV1): void {
  for (const definition of THRESHOLD_DEFINITIONS) {
    const value = thresholds[definition.threshold];
    if (value === undefined) continue;
    if (!Number.isFinite(value) || value < 0 || value > 1) {
      throw new RegistryValidationError(
        `Retrieval regression threshold ${definition.threshold} must be between 0 and 1`,
      );
    }
  }
}

function validateBaselineCandidates(regressionCase: KnowledgeRetrievalRegressionCaseV1): void {
  if (!Array.isArray(regressionCase.metadataFilterBaselineCandidates)) {
    throw new RegistryValidationError(
      "Retrieval regression metadata/filter baseline candidates must be an array",
    );
  }

  const identities = new Set<string>();
  for (const candidate of regressionCase.metadataFilterBaselineCandidates) {
    if (!isContentObjectRefV1(candidate) || candidate.workspaceId !== regressionCase.result.workspaceId) {
      throw new RegistryValidationError(
        "Retrieval regression metadata/filter baseline candidate must be valid content in the result workspace",
      );
    }
    const identity = contentIdentity(candidate);
    if (identities.has(identity)) {
      throw new RegistryValidationError(
        "Retrieval regression metadata/filter baseline contains duplicate candidates",
      );
    }
    identities.add(identity);
  }
}

function validateFixture(fixture: KnowledgeRetrievalRegressionFixtureV1): void {
  if (fixture.schemaVersion !== 1) {
    throw new RegistryValidationError("Retrieval regression fixture schemaVersion must be 1");
  }
  validateIdentifier(fixture.fixtureId, "Retrieval regression fixtureId");
  validateIdentifier(fixture.corpusVersion, "Retrieval regression corpusVersion");
  if (!Array.isArray(fixture.cases) || fixture.cases.length === 0) {
    throw new RegistryValidationError("Retrieval regression fixture must contain cases");
  }

  const caseIds = new Set<string>();
  for (const regressionCase of fixture.cases) {
    validateIdentifier(regressionCase.caseId, "Retrieval regression caseId");
    if (caseIds.has(regressionCase.caseId)) {
      throw new RegistryValidationError("Retrieval regression fixture contains duplicate caseId");
    }
    caseIds.add(regressionCase.caseId);
    if (
      !regressionCase.result.queryText ||
      regressionCase.result.queryText !== regressionCase.result.queryText.trim()
    ) {
      throw new RegistryValidationError(
        "Retrieval regression result queryText must be a non-empty trimmed string",
      );
    }
    validateBaselineCandidates(regressionCase);
    validateThresholds(regressionCase.thresholds);
  }
}

function evaluateThresholds(
  metrics: KnowledgeRetrievalEvaluationMetricsV1,
  thresholds: KnowledgeRetrievalRegressionThresholdsV1,
): string[] {
  const failures: string[] = [];
  for (const definition of THRESHOLD_DEFINITIONS) {
    const threshold = thresholds[definition.threshold];
    if (threshold === undefined) continue;
    const metric = metrics[definition.metric];
    if (metric === null) {
      failures.push(`${definition.metric} is unavailable`);
      continue;
    }
    if (definition.direction === "MIN" && metric < threshold) {
      failures.push(`${definition.metric} ${metric} is below minimum ${threshold}`);
    }
    if (definition.direction === "MAX" && metric > threshold) {
      failures.push(`${definition.metric} ${metric} is above maximum ${threshold}`);
    }
  }
  return failures;
}

function expectedDocumentCoverageRate(
  candidates: readonly ContentObjectRefV1[],
  evaluation: FrozenRetrievalEvaluationV1,
): number | null {
  if (evaluation.expectedSources.length === 0) return null;
  const candidateIdentities = new Set(candidates.map(contentIdentity));
  const hits = evaluation.expectedSources.filter((source) =>
    candidateIdentities.has(contentIdentity(source.content)),
  ).length;
  return hits / evaluation.expectedSources.length;
}

function lexicalOnlyResult(
  result: KnowledgeRetrievalCompositionResultV1,
): KnowledgeRetrievalCompositionResultV1 {
  return {
    ...result,
    items: result.items
      .map((item) => ({
        ...item,
        evidence: item.evidence.filter((evidence) => evidence.channel === "LEXICAL"),
      }))
      .filter((item) => item.evidence.length > 0),
  };
}

function lexicalRelationshipCandidates(
  result: KnowledgeRetrievalCompositionResultV1,
): ContentObjectRefV1[] {
  return result.items
    .filter((item) =>
      item.evidence.some(
        (evidence) => evidence.channel === "LEXICAL" || evidence.channel === "GRAPH",
      ),
    )
    .map((item) => item.content);
}

function subtractRates(left: number | null, right: number | null): number | null {
  return left === null || right === null ? null : left - right;
}

function compareVariants(
  regressionCase: KnowledgeRetrievalRegressionCaseV1,
): KnowledgeRetrievalVariantComparisonV1 {
  const lexicalResult = lexicalOnlyResult(regressionCase.result);
  const lexicalMetrics = evaluateKnowledgeRetrieval(lexicalResult, regressionCase.evaluation);
  const lexicalRelationshipMetrics = evaluateKnowledgeRetrieval(
    regressionCase.result,
    regressionCase.evaluation,
  );

  const metadataCoverage = expectedDocumentCoverageRate(
    regressionCase.metadataFilterBaselineCandidates,
    regressionCase.evaluation,
  );
  const lexicalCandidates = lexicalResult.items.map((item) => item.content);
  const lexicalCoverage = expectedDocumentCoverageRate(lexicalCandidates, regressionCase.evaluation);
  const relationshipCandidates = lexicalRelationshipCandidates(regressionCase.result);
  const relationshipCoverage = expectedDocumentCoverageRate(
    relationshipCandidates,
    regressionCase.evaluation,
  );

  return {
    metadataFilterBaseline: {
      candidateCount: regressionCase.metadataFilterBaselineCandidates.length,
      expectedDocumentCoverageRate: metadataCoverage,
    },
    lexicalOnly: {
      candidateCount: lexicalCandidates.length,
      expectedDocumentCoverageRate: lexicalCoverage,
      metrics: lexicalMetrics,
    },
    lexicalRelationship: {
      candidateCount: relationshipCandidates.length,
      expectedDocumentCoverageRate: relationshipCoverage,
      metrics: lexicalRelationshipMetrics,
    },
    deltas: {
      lexicalVsMetadataFilterCoverageDelta: subtractRates(lexicalCoverage, metadataCoverage),
      relationshipVsLexicalCoverageDelta: subtractRates(relationshipCoverage, lexicalCoverage),
    },
  };
}

export function runKnowledgeRetrievalRegression(
  fixture: KnowledgeRetrievalRegressionFixtureV1,
): KnowledgeRetrievalRegressionResultV1 {
  validateFixture(fixture);

  const cases = fixture.cases.map((regressionCase) => {
    const metrics = evaluateKnowledgeRetrieval(regressionCase.result, regressionCase.evaluation);
    const failures = evaluateThresholds(metrics, regressionCase.thresholds);
    return {
      caseId: regressionCase.caseId,
      queryText: regressionCase.result.queryText,
      passed: failures.length === 0,
      failures,
      metrics,
      variantComparison: compareVariants(regressionCase),
    };
  });

  return {
    schemaVersion: 1,
    fixtureId: fixture.fixtureId,
    corpusVersion: fixture.corpusVersion,
    passed: cases.every((regressionCase) => regressionCase.passed),
    cases,
  };
}
