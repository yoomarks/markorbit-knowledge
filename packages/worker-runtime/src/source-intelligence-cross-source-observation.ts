import {
  SOURCE_INTELLIGENCE_CROSS_SOURCE_OBSERVATION_PROTOCOL_VERSION,
  type SourceIntelligenceCrossSourceObservationInputV2,
  type SourceIntelligenceCrossSourceObservationSummaryV2,
  type SourceIntelligenceObservationFlagV2,
  type SourceIntelligenceObservationPointV2,
} from "@markorbit/contracts";

const MATURITY_RANK = {
  UNOBSERVED: 0,
  CAPTURED: 1,
  TRACEABLE: 2,
  CURRENT_TRACEABLE: 3,
} as const;

export const D2_8_ACQUISITION_COST_INCREASE_THRESHOLD = 20;

function latestPoints(history: SourceIntelligenceCrossSourceObservationInputV2): {
  current: SourceIntelligenceObservationPointV2 | undefined;
  previous: SourceIntelligenceObservationPointV2 | undefined;
} {
  const current = history.observations.at(-1);
  const previous = history.observations.length > 1 ? history.observations.at(-2) : undefined;
  return { current, previous };
}

function highValueUnobserved(
  sourceId: string,
  current: SourceIntelligenceObservationPointV2,
): SourceIntelligenceObservationFlagV2 | null {
  const highValue = current.sourceValue.band === "VERY_HIGH" || current.sourceValue.band === "HIGH";
  if (!highValue || current.evidenceMaturity.stage !== "UNOBSERVED") return null;
  return {
    sourceId,
    kind: "HIGH_VALUE_UNOBSERVED",
    severity: "ATTENTION",
    observedAt: current.assessedAt,
    reasonCodes: [
      "SOURCE_VALUE_HIGH_OR_VERY_HIGH",
      "EVIDENCE_MATURITY_UNOBSERVED",
      "COVERAGE_GAP_REQUIRES_OPERATOR_INTERPRETATION",
    ],
    current,
  };
}

function maturityRegression(
  sourceId: string,
  previous: SourceIntelligenceObservationPointV2,
  current: SourceIntelligenceObservationPointV2,
): SourceIntelligenceObservationFlagV2 | null {
  if (MATURITY_RANK[current.evidenceMaturity.stage] >= MATURITY_RANK[previous.evidenceMaturity.stage]) {
    return null;
  }
  return {
    sourceId,
    kind: "EVIDENCE_MATURITY_REGRESSION",
    severity: "ATTENTION",
    observedAt: current.assessedAt,
    reasonCodes: [
      "LATEST_DISTINCT_EVIDENCE_STATE_HAS_LOWER_MATURITY_STAGE",
      "REGRESSION_IS_OBSERVATIONAL_NOT_LEGAL_TRUTH",
    ],
    current,
    previous,
  };
}

function sourceValueBandChanged(
  sourceId: string,
  previous: SourceIntelligenceObservationPointV2,
  current: SourceIntelligenceObservationPointV2,
): SourceIntelligenceObservationFlagV2 | null {
  if (current.sourceValue.band === previous.sourceValue.band) return null;
  return {
    sourceId,
    kind: "SOURCE_VALUE_BAND_CHANGED",
    severity: "INFO",
    observedAt: current.assessedAt,
    reasonCodes: [
      "SOURCE_VALUE_BAND_TRANSITION_OBSERVED",
      "SOURCE_VALUE_CHANGE_DOES_NOT_INFER_AUTHORITY_OR_TRUTH",
    ],
    current,
    previous,
  };
}

function acquisitionCostIncreased(
  sourceId: string,
  previous: SourceIntelligenceObservationPointV2,
  current: SourceIntelligenceObservationPointV2,
): SourceIntelligenceObservationFlagV2 | null {
  const from = previous.observedAcquisitionCost.score;
  const to = current.observedAcquisitionCost.score;
  if (from === null || to === null || to - from < D2_8_ACQUISITION_COST_INCREASE_THRESHOLD) {
    return null;
  }
  return {
    sourceId,
    kind: "ACQUISITION_COST_INCREASED",
    severity: "INFO",
    observedAt: current.assessedAt,
    reasonCodes: [
      "OBSERVED_ACQUISITION_COST_PROXY_INCREASE_GE_20",
      "COST_SIGNAL_IS_HEURISTIC_NOT_BILLING_DATA",
    ],
    current,
    previous,
  };
}

function compareFlags(
  left: SourceIntelligenceObservationFlagV2,
  right: SourceIntelligenceObservationFlagV2,
): number {
  if (left.severity !== right.severity) return left.severity === "ATTENTION" ? -1 : 1;
  const timeDelta = Date.parse(right.observedAt) - Date.parse(left.observedAt);
  if (timeDelta !== 0) return timeDelta;
  const sourceDelta = left.sourceId.localeCompare(right.sourceId);
  return sourceDelta !== 0 ? sourceDelta : left.kind.localeCompare(right.kind);
}

export function buildSourceIntelligenceCrossSourceObservationSummaryV2(
  histories: SourceIntelligenceCrossSourceObservationInputV2[],
): SourceIntelligenceCrossSourceObservationSummaryV2 {
  const flags: SourceIntelligenceObservationFlagV2[] = [];
  let assessedSourceCount = 0;
  let summarizedThrough: string | null = null;

  for (const history of histories) {
    const { current, previous } = latestPoints(history);
    if (!current) continue;
    assessedSourceCount += 1;
    if (summarizedThrough === null || Date.parse(current.assessedAt) > Date.parse(summarizedThrough)) {
      summarizedThrough = current.assessedAt;
    }

    const coverageFlag = highValueUnobserved(history.sourceId, current);
    if (coverageFlag) flags.push(coverageFlag);
    if (!previous) continue;

    const regressionFlag = maturityRegression(history.sourceId, previous, current);
    if (regressionFlag) flags.push(regressionFlag);
    const valueFlag = sourceValueBandChanged(history.sourceId, previous, current);
    if (valueFlag) flags.push(valueFlag);
    const costFlag = acquisitionCostIncreased(history.sourceId, previous, current);
    if (costFlag) flags.push(costFlag);
  }

  flags.sort(compareFlags);
  const flaggedSourceCount = new Set(flags.map((flag) => flag.sourceId)).size;

  return {
    protocolVersion: SOURCE_INTELLIGENCE_CROSS_SOURCE_OBSERVATION_PROTOCOL_VERSION,
    objectType: "SOURCE_INTELLIGENCE_CROSS_SOURCE_OBSERVATION_SUMMARY",
    summarizedThrough,
    sourceCount: histories.length,
    assessedSourceCount,
    flaggedSourceCount,
    counts: {
      highValueUnobserved: flags.filter((flag) => flag.kind === "HIGH_VALUE_UNOBSERVED").length,
      evidenceMaturityRegressions: flags.filter(
        (flag) => flag.kind === "EVIDENCE_MATURITY_REGRESSION",
      ).length,
      sourceValueBandChanges: flags.filter((flag) => flag.kind === "SOURCE_VALUE_BAND_CHANGED")
        .length,
      acquisitionCostIncreases: flags.filter((flag) => flag.kind === "ACQUISITION_COST_INCREASED")
        .length,
    },
    flags,
    semantics: {
      input: "DISTINCT_EVIDENCE_STATE_HISTORIES",
      comparisonScope: "LATEST_DISTINCT_STATE_PER_SOURCE",
      observationFlagsAreDeterministicRules: true,
      observationFlagsAreNotTruthOrQualityJudgments: true,
      sourceValueAndEvidenceMaturityIndependent: true,
      acquisitionCostSeparate: true,
    },
    scheduling: {
      policyStatus: "NOT_AUTHORIZED_UNCALIBRATED",
    },
    boundaries: {
      legalTruthVerified: false,
      authorityInferred: false,
      professionalQualityVerified: false,
      crossSourceIdentityResolved: false,
      autoScheduleApplied: false,
      grantsCollectionAuthority: false,
      grantsMgsnQualification: false,
    },
  };
}
