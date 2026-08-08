import type {
  SourceIntelligenceObservationHistoryV2,
  SourceIntelligenceObservationPointV2,
} from "./source-intelligence-observation-v2";

export const SOURCE_INTELLIGENCE_CROSS_SOURCE_OBSERVATION_PROTOCOL_VERSION = "2.0" as const;

export type SourceIntelligenceObservationFlagKind =
  | "HIGH_VALUE_UNOBSERVED"
  | "EVIDENCE_MATURITY_REGRESSION"
  | "SOURCE_VALUE_BAND_CHANGED"
  | "ACQUISITION_COST_INCREASED";

export type SourceIntelligenceObservationFlagSeverity = "INFO" | "ATTENTION";

export type SourceIntelligenceObservationFlagV2 = {
  sourceId: string;
  kind: SourceIntelligenceObservationFlagKind;
  severity: SourceIntelligenceObservationFlagSeverity;
  observedAt: string;
  reasonCodes: string[];
  current: SourceIntelligenceObservationPointV2;
  previous?: SourceIntelligenceObservationPointV2;
};

export type SourceIntelligenceCrossSourceObservationSummaryV2 = {
  protocolVersion: typeof SOURCE_INTELLIGENCE_CROSS_SOURCE_OBSERVATION_PROTOCOL_VERSION;
  objectType: "SOURCE_INTELLIGENCE_CROSS_SOURCE_OBSERVATION_SUMMARY";
  summarizedThrough: string | null;
  sourceCount: number;
  assessedSourceCount: number;
  flaggedSourceCount: number;
  counts: {
    highValueUnobserved: number;
    evidenceMaturityRegressions: number;
    sourceValueBandChanges: number;
    acquisitionCostIncreases: number;
  };
  flags: SourceIntelligenceObservationFlagV2[];
  semantics: {
    input: "DISTINCT_EVIDENCE_STATE_HISTORIES";
    comparisonScope: "LATEST_DISTINCT_STATE_PER_SOURCE";
    observationFlagsAreDeterministicRules: true;
    observationFlagsAreNotTruthOrQualityJudgments: true;
    sourceValueAndEvidenceMaturityIndependent: true;
    acquisitionCostSeparate: true;
  };
  scheduling: {
    policyStatus: "NOT_AUTHORIZED_UNCALIBRATED";
  };
  boundaries: {
    legalTruthVerified: false;
    authorityInferred: false;
    professionalQualityVerified: false;
    crossSourceIdentityResolved: false;
    autoScheduleApplied: false;
    grantsCollectionAuthority: false;
    grantsMgsnQualification: false;
  };
};

export type SourceIntelligenceCrossSourceObservationInputV2 = Pick<
  SourceIntelligenceObservationHistoryV2,
  "sourceId" | "observations" | "transitions"
>;
