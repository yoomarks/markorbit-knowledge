import type { SourceIntelligenceConfidence } from "./source-intelligence-v1";
import type { EvidenceMaturityStage, SourceValuePriorityBand } from "./source-intelligence-v2";

export const SOURCE_INTELLIGENCE_OBSERVATION_HISTORY_PROTOCOL_VERSION = "2.0" as const;

export type SourceIntelligenceObservationPointV2 = {
  assessmentId: string;
  legacyAssessmentId: string;
  assessedAt: string;
  inputFingerprint: string;
  evaluatorVersion: string;
  sourceValue: {
    score: number;
    band: SourceValuePriorityBand;
  };
  evidenceMaturity: {
    score: number | null;
    stage: EvidenceMaturityStage;
  };
  observedAcquisitionCost: {
    score: number | null;
    confidence: SourceIntelligenceConfidence;
  };
};

export type SourceIntelligenceObservationTransitionV2 = {
  fromAssessmentId: string;
  toAssessmentId: string;
  fromAssessedAt: string;
  toAssessedAt: string;
  sourceValue: {
    fromScore: number;
    toScore: number;
    scoreDelta: number;
    fromBand: SourceValuePriorityBand;
    toBand: SourceValuePriorityBand;
    changed: boolean;
  };
  evidenceMaturity: {
    fromScore: number | null;
    toScore: number | null;
    scoreDelta: number | null;
    fromStage: EvidenceMaturityStage;
    toStage: EvidenceMaturityStage;
    changed: boolean;
  };
  observedAcquisitionCost: {
    fromScore: number | null;
    toScore: number | null;
    scoreDelta: number | null;
    changed: boolean;
  };
};

export type SourceIntelligenceObservationHistoryV2 = {
  protocolVersion: typeof SOURCE_INTELLIGENCE_OBSERVATION_HISTORY_PROTOCOL_VERSION;
  objectType: "SOURCE_INTELLIGENCE_OBSERVATION_HISTORY";
  sourceId: string;
  observations: SourceIntelligenceObservationPointV2[];
  transitions: SourceIntelligenceObservationTransitionV2[];
  semantics: {
    ordering: "OLDEST_TO_NEWEST";
    observationUnit: "DISTINCT_EVIDENCE_STATE";
    sameFingerprintReassessmentsCollapsed: true;
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
    identityVerified: false;
    autoScheduleApplied: false;
    grantsCollectionAuthority: false;
    grantsMgsnQualification: false;
  };
};
