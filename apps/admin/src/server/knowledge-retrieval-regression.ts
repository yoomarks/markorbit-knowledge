import type { KnowledgeRetrievalCompositionResultV1 } from "@markorbit/contracts";
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

export type KnowledgeRetrievalRegressionCaseResultV1 = {
  caseId: string;
  queryText: string;
  passed: boolean;
  failures: string[];
  metrics: KnowledgeRetrievalEvaluationMetricsV1;
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
