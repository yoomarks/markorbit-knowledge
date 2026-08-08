import type { AuthorityLevel, SourceCategory } from "./schema-v1";
import type { SourceStatus } from "./vocabularies";

export const SOURCE_INTELLIGENCE_PROTOCOL_VERSION = "1.0" as const;
export const SOURCE_INTELLIGENCE_TIERS = ["A", "B", "C", "D"] as const;
export const SOURCE_INTELLIGENCE_CONFIDENCE = ["LOW", "MEDIUM", "HIGH"] as const;
export const SOURCE_INTELLIGENCE_DIMENSIONS = [
  "RELEVANCE",
  "AUTHORITY_SIGNAL",
  "FRESHNESS",
  "EVIDENCEABILITY",
  "NOVELTY",
  "ACQUISITION_COST",
] as const;

export type SourceIntelligenceTier = (typeof SOURCE_INTELLIGENCE_TIERS)[number];
export type SourceIntelligenceConfidence = (typeof SOURCE_INTELLIGENCE_CONFIDENCE)[number];
export type SourceIntelligenceDimensionName = (typeof SOURCE_INTELLIGENCE_DIMENSIONS)[number];

export type SourceIntelligenceDimension = {
  score: number | null;
  confidence: SourceIntelligenceConfidence;
  reasonCodes: string[];
};

export type SourceIntelligenceInputSnapshot = {
  sourceCategory: SourceCategory;
  sourceStatus: SourceStatus;
  explicitAuthorityLevel: AuthorityLevel;
  graphNodeCount: number;
  contentNodeCount: number;
  relevantContentNodeCount: number;
  retainedNodeCount: number;
  rawProvenanceNodeCount: number;
  rawArtifactCount: number;
  distinctArtifactHashCount: number;
  rawArtifactBytes: number;
  latestCapturedAt?: string;
  previousAssessmentId?: string;
  previousGraphNodeCount?: number;
  previousDistinctArtifactHashCount?: number;
};

export type SourceIntelligenceRescanRecommendation =
  | { mode: "DAYS"; intervalDays: number; reasonCodes: string[] }
  | { mode: "MANUAL"; reasonCodes: string[] };

export type SourceIntelligenceAssessment = {
  protocolVersion: typeof SOURCE_INTELLIGENCE_PROTOCOL_VERSION;
  objectType: "SOURCE_INTELLIGENCE_ASSESSMENT";
  id: string;
  workspaceId: string;
  sourceId: string;
  profileId?: string;
  assessedAt: string;
  evaluator: { name: string; version: string };
  inputFingerprint: string;
  input: SourceIntelligenceInputSnapshot;
  dimensions: Record<SourceIntelligenceDimensionName, SourceIntelligenceDimension>;
  priorityScore: number;
  operationalTier: SourceIntelligenceTier;
  recommendedRescan: SourceIntelligenceRescanRecommendation;
  reasonCodes: string[];
  boundaries: {
    legalTruthVerified: false;
    authorityInferred: false;
    autoScheduleApplied: false;
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

function isDimension(value: unknown): value is SourceIntelligenceDimension {
  return (
    isRecord(value) &&
    isScore(value.score) &&
    typeof value.confidence === "string" &&
    SOURCE_INTELLIGENCE_CONFIDENCE.includes(value.confidence as SourceIntelligenceConfidence) &&
    Array.isArray(value.reasonCodes) &&
    value.reasonCodes.every((item) => typeof item === "string")
  );
}

export function isSourceIntelligenceAssessment(
  value: unknown,
): value is SourceIntelligenceAssessment {
  if (
    !isRecord(value) ||
    !isRecord(value.evaluator) ||
    !isRecord(value.input) ||
    !isRecord(value.dimensions) ||
    !isRecord(value.boundaries)
  )
    return false;
  if (
    value.protocolVersion !== SOURCE_INTELLIGENCE_PROTOCOL_VERSION ||
    value.objectType !== "SOURCE_INTELLIGENCE_ASSESSMENT"
  )
    return false;
  if (typeof value.id !== "string" || !/^sia_[a-f0-9]{24}$/.test(value.id)) return false;
  if (typeof value.workspaceId !== "string" || typeof value.sourceId !== "string") return false;
  if (value.profileId !== undefined && typeof value.profileId !== "string") return false;
  if (typeof value.assessedAt !== "string" || !Number.isFinite(Date.parse(value.assessedAt)))
    return false;
  if (typeof value.evaluator.name !== "string" || typeof value.evaluator.version !== "string")
    return false;
  if (typeof value.inputFingerprint !== "string" || !/^[a-f0-9]{64}$/.test(value.inputFingerprint))
    return false;
  if (
    typeof value.priorityScore !== "number" ||
    value.priorityScore < 0 ||
    value.priorityScore > 100
  )
    return false;
  if (
    typeof value.operationalTier !== "string" ||
    !SOURCE_INTELLIGENCE_TIERS.includes(value.operationalTier as SourceIntelligenceTier)
  )
    return false;
  for (const dimension of SOURCE_INTELLIGENCE_DIMENSIONS) {
    if (!isDimension(value.dimensions[dimension])) return false;
  }
  if (
    !Array.isArray(value.reasonCodes) ||
    !value.reasonCodes.every((item) => typeof item === "string")
  )
    return false;
  if (
    value.boundaries.legalTruthVerified !== false ||
    value.boundaries.authorityInferred !== false ||
    value.boundaries.autoScheduleApplied !== false
  )
    return false;
  const rescan = value.recommendedRescan;
  if (!isRecord(rescan) || !Array.isArray(rescan.reasonCodes)) return false;
  if (rescan.mode === "MANUAL") return true;
  return (
    rescan.mode === "DAYS" &&
    typeof rescan.intervalDays === "number" &&
    Number.isInteger(rescan.intervalDays) &&
    rescan.intervalDays > 0
  );
}
