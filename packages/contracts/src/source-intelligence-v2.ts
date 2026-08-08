import type {
  SourceIntelligenceConfidence,
  SourceIntelligenceDimension,
  SourceIntelligenceDimensionName,
  SourceIntelligenceRescanRecommendation,
  SourceIntelligenceTier,
} from "./source-intelligence-v1";
import { SOURCE_INTELLIGENCE_CONFIDENCE } from "./source-intelligence-v1";

export const SOURCE_INTELLIGENCE_DUAL_AXIS_PROTOCOL_VERSION = "2.0" as const;
export const SOURCE_VALUE_PRIORITY_BANDS = ["VERY_HIGH", "HIGH", "MEDIUM", "LOW"] as const;
export const EVIDENCE_MATURITY_STAGES = [
  "UNOBSERVED",
  "CAPTURED",
  "TRACEABLE",
  "CURRENT_TRACEABLE",
] as const;

export const SOURCE_VALUE_SIGNAL_DIMENSIONS = [
  "RELEVANCE",
  "AUTHORITY_SIGNAL",
] as const satisfies readonly SourceIntelligenceDimensionName[];
export const EVIDENCE_MATURITY_SIGNAL_DIMENSIONS = [
  "FRESHNESS",
  "EVIDENCEABILITY",
  "NOVELTY",
] as const satisfies readonly SourceIntelligenceDimensionName[];

export type SourceValuePriorityBand = (typeof SOURCE_VALUE_PRIORITY_BANDS)[number];
export type EvidenceMaturityStage = (typeof EVIDENCE_MATURITY_STAGES)[number];

export type SourceValuePriorityAxis = {
  score: number;
  band: SourceValuePriorityBand;
  confidence: SourceIntelligenceConfidence;
  signals: {
    relevance: SourceIntelligenceDimension;
    authority: SourceIntelligenceDimension;
  };
  reasonCodes: string[];
};

export type EvidenceMaturityAxis = {
  score: number | null;
  stage: EvidenceMaturityStage;
  confidence: SourceIntelligenceConfidence;
  signals: {
    freshness: SourceIntelligenceDimension;
    evidenceability: SourceIntelligenceDimension;
    novelty: SourceIntelligenceDimension;
  };
  reasonCodes: string[];
};

export type SourceIntelligenceAssessmentV2 = {
  protocolVersion: typeof SOURCE_INTELLIGENCE_DUAL_AXIS_PROTOCOL_VERSION;
  objectType: "SOURCE_INTELLIGENCE_DUAL_AXIS_ASSESSMENT";
  id: string;
  workspaceId: string;
  sourceId: string;
  profileId?: string;
  assessedAt: string;
  evaluator: { name: string; version: string };
  inputFingerprint: string;
  sourceValuePriority: SourceValuePriorityAxis;
  evidenceMaturity: EvidenceMaturityAxis;
  decisionContext: {
    observedAcquisitionCost: SourceIntelligenceDimension;
  };
  compatibility: {
    projectionMode: "V1_READ_COMPATIBLE";
    legacyProtocolVersion: "1.0";
    legacyAssessmentId: string;
    legacyPriorityScore: number;
    legacyOperationalTier: SourceIntelligenceTier;
    legacyRecommendedRescan: SourceIntelligenceRescanRecommendation;
  };
  scheduling: {
    policyStatus: "NOT_AUTHORIZED_UNCALIBRATED";
  };
  reasonCodes: string[];
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isScore(value: unknown): value is number | null {
  return (
    value === null ||
    (typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100)
  );
}

function isReasonCodes(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isDimension(value: unknown): value is SourceIntelligenceDimension {
  return (
    isRecord(value) &&
    isScore(value.score) &&
    typeof value.confidence === "string" &&
    SOURCE_INTELLIGENCE_CONFIDENCE.includes(value.confidence as SourceIntelligenceConfidence) &&
    isReasonCodes(value.reasonCodes)
  );
}

export function isSourceIntelligenceAssessmentV2(
  value: unknown,
): value is SourceIntelligenceAssessmentV2 {
  if (
    !isRecord(value) ||
    !isRecord(value.evaluator) ||
    !isRecord(value.sourceValuePriority) ||
    !isRecord(value.evidenceMaturity) ||
    !isRecord(value.decisionContext) ||
    !isRecord(value.compatibility) ||
    !isRecord(value.scheduling) ||
    !isRecord(value.boundaries)
  ) {
    return false;
  }
  if (
    value.protocolVersion !== SOURCE_INTELLIGENCE_DUAL_AXIS_PROTOCOL_VERSION ||
    value.objectType !== "SOURCE_INTELLIGENCE_DUAL_AXIS_ASSESSMENT"
  ) {
    return false;
  }
  if (typeof value.id !== "string" || !/^si2_[a-f0-9]{24}$/.test(value.id)) return false;
  if (typeof value.workspaceId !== "string" || typeof value.sourceId !== "string") return false;
  if (value.profileId !== undefined && typeof value.profileId !== "string") return false;
  if (typeof value.assessedAt !== "string" || !Number.isFinite(Date.parse(value.assessedAt)))
    return false;
  if (typeof value.evaluator.name !== "string" || typeof value.evaluator.version !== "string")
    return false;
  if (typeof value.inputFingerprint !== "string" || !/^[a-f0-9]{64}$/.test(value.inputFingerprint))
    return false;

  const sourceValue = value.sourceValuePriority;
  if (!isScore(sourceValue.score) || sourceValue.score === null) return false;
  if (
    typeof sourceValue.band !== "string" ||
    !SOURCE_VALUE_PRIORITY_BANDS.includes(sourceValue.band as SourceValuePriorityBand) ||
    typeof sourceValue.confidence !== "string" ||
    !SOURCE_INTELLIGENCE_CONFIDENCE.includes(
      sourceValue.confidence as SourceIntelligenceConfidence,
    ) ||
    !isRecord(sourceValue.signals) ||
    !isDimension(sourceValue.signals.relevance) ||
    !isDimension(sourceValue.signals.authority) ||
    !isReasonCodes(sourceValue.reasonCodes)
  ) {
    return false;
  }

  const maturity = value.evidenceMaturity;
  if (!isScore(maturity.score)) return false;
  if (
    typeof maturity.stage !== "string" ||
    !EVIDENCE_MATURITY_STAGES.includes(maturity.stage as EvidenceMaturityStage) ||
    typeof maturity.confidence !== "string" ||
    !SOURCE_INTELLIGENCE_CONFIDENCE.includes(maturity.confidence as SourceIntelligenceConfidence) ||
    !isRecord(maturity.signals) ||
    !isDimension(maturity.signals.freshness) ||
    !isDimension(maturity.signals.evidenceability) ||
    !isDimension(maturity.signals.novelty) ||
    !isReasonCodes(maturity.reasonCodes)
  ) {
    return false;
  }
  if (maturity.stage === "UNOBSERVED" && maturity.score !== null) return false;
  if (maturity.stage !== "UNOBSERVED" && maturity.score === null) return false;

  if (!isDimension(value.decisionContext.observedAcquisitionCost)) return false;
  if (
    value.compatibility.projectionMode !== "V1_READ_COMPATIBLE" ||
    value.compatibility.legacyProtocolVersion !== "1.0" ||
    typeof value.compatibility.legacyAssessmentId !== "string" ||
    typeof value.compatibility.legacyPriorityScore !== "number" ||
    typeof value.compatibility.legacyOperationalTier !== "string" ||
    !["A", "B", "C", "D"].includes(value.compatibility.legacyOperationalTier) ||
    !isRecord(value.compatibility.legacyRecommendedRescan)
  ) {
    return false;
  }
  if (value.scheduling.policyStatus !== "NOT_AUTHORIZED_UNCALIBRATED") return false;
  if (!isReasonCodes(value.reasonCodes)) return false;
  return (
    value.boundaries.legalTruthVerified === false &&
    value.boundaries.authorityInferred === false &&
    value.boundaries.professionalQualityVerified === false &&
    value.boundaries.identityVerified === false &&
    value.boundaries.autoScheduleApplied === false &&
    value.boundaries.grantsCollectionAuthority === false &&
    value.boundaries.grantsMgsnQualification === false
  );
}
