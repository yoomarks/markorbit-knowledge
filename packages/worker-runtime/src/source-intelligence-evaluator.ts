import { createHash } from "node:crypto";
import type {
  AuthorityLevel,
  EvidenceMaturityStage,
  SourceCategory,
  SourceIntelligenceAssessment,
  SourceIntelligenceAssessmentV2,
  SourceIntelligenceConfidence,
  SourceIntelligenceDimension,
  SourceIntelligenceInputSnapshot,
  SourceIntelligenceTier,
  SourceValuePriorityBand,
} from "@markorbit/contracts";
import {
  SOURCE_INTELLIGENCE_DUAL_AXIS_PROTOCOL_VERSION,
  SOURCE_INTELLIGENCE_PROTOCOL_VERSION,
} from "@markorbit/contracts";

export const SOURCE_INTELLIGENCE_EVALUATOR = {
  name: "markorbit-source-intelligence",
  version: "1.0.0",
} as const;

export const SOURCE_INTELLIGENCE_DUAL_AXIS_EVALUATOR = {
  name: "markorbit-source-intelligence-dual-axis",
  version: "2.0.0",
} as const;

export type SourceIntelligenceEvaluationInput = {
  workspaceId: string;
  sourceId: string;
  profileId?: string;
  assessedAt: string;
  snapshot: SourceIntelligenceInputSnapshot;
};

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function dimension(
  score: number | null,
  confidence: "LOW" | "MEDIUM" | "HIGH",
  ...reasonCodes: string[]
): SourceIntelligenceDimension {
  return { score: score === null ? null : clamp(score), confidence, reasonCodes };
}

function categoryBaseline(category: SourceCategory): number {
  switch (category) {
    case "OFFICIAL_AUTHORITY":
      return 85;
    case "OFFICIAL_GUIDANCE":
      return 80;
    case "LAW_FIRM":
      return 70;
    case "RESEARCH":
      return 65;
    case "INTERNAL":
      return 60;
    case "NEWS":
    case "TECHNICAL":
      return 55;
    case "USER_PROVIDED":
      return 50;
    case "OTHER":
      return 45;
  }
}

function authorityScore(level: AuthorityLevel): SourceIntelligenceDimension {
  switch (level) {
    case "PRIMARY_OFFICIAL":
      return dimension(100, "HIGH", "EXPLICIT_AUTHORITY_PRIMARY_OFFICIAL");
    case "SECONDARY_OFFICIAL":
      return dimension(85, "HIGH", "EXPLICIT_AUTHORITY_SECONDARY_OFFICIAL");
    case "PROFESSIONAL":
      return dimension(70, "HIGH", "EXPLICIT_AUTHORITY_PROFESSIONAL");
    case "INTERNAL":
      return dimension(65, "HIGH", "EXPLICIT_AUTHORITY_INTERNAL");
    case "INDUSTRY":
      return dimension(55, "HIGH", "EXPLICIT_AUTHORITY_INDUSTRY");
    case "COMMUNITY":
      return dimension(35, "HIGH", "EXPLICIT_AUTHORITY_COMMUNITY");
    case "UNKNOWN":
      return dimension(null, "LOW", "AUTHORITY_NOT_EXPLICITLY_ASSIGNED");
  }
}

function freshnessScore(
  latestCapturedAt: string | undefined,
  assessedAt: string,
): SourceIntelligenceDimension {
  if (!latestCapturedAt) return dimension(null, "LOW", "NO_RAW_ARTIFACT_RECENCY_EVIDENCE");
  const ageDays = Math.max(0, (Date.parse(assessedAt) - Date.parse(latestCapturedAt)) / 86_400_000);
  if (ageDays <= 7) return dimension(95, "HIGH", "CAPTURED_WITHIN_7_DAYS");
  if (ageDays <= 30) return dimension(80, "HIGH", "CAPTURED_WITHIN_30_DAYS");
  if (ageDays <= 90) return dimension(60, "HIGH", "CAPTURED_WITHIN_90_DAYS");
  if (ageDays <= 365) return dimension(40, "HIGH", "CAPTURED_WITHIN_365_DAYS");
  return dimension(20, "HIGH", "CAPTURE_OLDER_THAN_365_DAYS");
}

function evidenceabilityScore(
  snapshot: SourceIntelligenceInputSnapshot,
): SourceIntelligenceDimension {
  if (snapshot.rawArtifactCount === 0 || snapshot.graphNodeCount === 0) {
    return dimension(15, "MEDIUM", "NO_ARTIFACT_BACKED_GRAPH_EVIDENCE");
  }
  const provenanceCoverage = snapshot.rawProvenanceNodeCount / snapshot.graphNodeCount;
  const score = 30 + provenanceCoverage * 60 + Math.min(10, snapshot.rawArtifactCount);
  return dimension(
    score,
    "HIGH",
    "RAW_ARTIFACT_PROVENANCE_COVERAGE",
    "IMMUTABLE_ARTIFACT_EVIDENCE_PRESENT",
  );
}

function relevanceScore(snapshot: SourceIntelligenceInputSnapshot): SourceIntelligenceDimension {
  if (snapshot.contentNodeCount === 0) {
    return dimension(
      categoryBaseline(snapshot.sourceCategory),
      "LOW",
      "CATEGORY_BASELINE_ONLY",
      "NO_CONTENT_NODES_YET",
    );
  }
  const topicalRatio = snapshot.relevantContentNodeCount / snapshot.contentNodeCount;
  const retainedBoost = Math.min(10, snapshot.retainedNodeCount * 2);
  const score = 30 + topicalRatio * 60 + retainedBoost;
  return dimension(
    score,
    topicalRatio > 0 ? "HIGH" : "MEDIUM",
    "GRAPH_TOPIC_COVERAGE",
    ...(snapshot.retainedNodeCount > 0 ? ["HUMAN_RETAINED_EVIDENCE"] : []),
  );
}

function noveltyScore(snapshot: SourceIntelligenceInputSnapshot): SourceIntelligenceDimension {
  if (
    snapshot.previousGraphNodeCount === undefined ||
    snapshot.previousDistinctArtifactHashCount === undefined
  ) {
    return dimension(null, "LOW", "NO_PREVIOUS_ASSESSMENT_BASELINE");
  }
  const nodeDelta = Math.max(0, snapshot.graphNodeCount - snapshot.previousGraphNodeCount);
  const artifactDelta = Math.max(
    0,
    snapshot.distinctArtifactHashCount - snapshot.previousDistinctArtifactHashCount,
  );
  if (nodeDelta === 0 && artifactDelta === 0) {
    return dimension(10, "HIGH", "NO_NEW_GRAPH_OR_ARTIFACT_EVIDENCE");
  }
  return dimension(
    Math.min(100, 35 + nodeDelta * 3 + artifactDelta * 12),
    "HIGH",
    "NEW_EVIDENCE_SINCE_PREVIOUS_ASSESSMENT",
  );
}

function acquisitionCostScore(
  snapshot: SourceIntelligenceInputSnapshot,
): SourceIntelligenceDimension {
  if (snapshot.rawArtifactCount === 0) {
    return dimension(null, "LOW", "NO_ACQUISITION_FOOTPRINT_YET");
  }
  const averageBytes = snapshot.rawArtifactBytes / snapshot.rawArtifactCount;
  const mb = snapshot.rawArtifactBytes / 1_048_576;
  const score = Math.min(
    100,
    10 + Math.log2(Math.max(1, averageBytes / 32_768)) * 10 + Math.log2(Math.max(1, mb)) * 5,
  );
  return dimension(
    score,
    "MEDIUM",
    "OBSERVED_BYTE_FOOTPRINT_PROXY",
    "COST_SCORE_IS_HEURISTIC_NOT_BILLING_DATA",
  );
}

function fingerprint(snapshot: SourceIntelligenceInputSnapshot): string {
  const currentEvidence = {
    sourceCategory: snapshot.sourceCategory,
    sourceStatus: snapshot.sourceStatus,
    explicitAuthorityLevel: snapshot.explicitAuthorityLevel,
    graphNodeCount: snapshot.graphNodeCount,
    contentNodeCount: snapshot.contentNodeCount,
    relevantContentNodeCount: snapshot.relevantContentNodeCount,
    retainedNodeCount: snapshot.retainedNodeCount,
    rawProvenanceNodeCount: snapshot.rawProvenanceNodeCount,
    rawArtifactCount: snapshot.rawArtifactCount,
    distinctArtifactHashCount: snapshot.distinctArtifactHashCount,
    rawArtifactBytes: snapshot.rawArtifactBytes,
    ...(snapshot.latestCapturedAt ? { latestCapturedAt: snapshot.latestCapturedAt } : {}),
  };
  const stable = JSON.stringify(currentEvidence, Object.keys(currentEvidence).sort());
  return createHash("sha256").update(stable).digest("hex");
}

function assessmentId(sourceId: string, inputFingerprint: string): string {
  return `sia_${createHash("sha256")
    .update(`${sourceId}:${inputFingerprint}`)
    .digest("hex")
    .slice(0, 24)}`;
}

function scorePriority(dimensions: SourceIntelligenceAssessment["dimensions"]): number {
  const weighted: Array<[SourceIntelligenceDimension, number]> = [
    [dimensions.RELEVANCE, 0.4],
    [dimensions.EVIDENCEABILITY, 0.25],
    [dimensions.FRESHNESS, 0.2],
    [dimensions.NOVELTY, 0.1],
    [dimensions.AUTHORITY_SIGNAL, 0.05],
  ];
  let total = 0;
  let weight = 0;
  for (const [item, itemWeight] of weighted) {
    if (item.score === null) continue;
    total += item.score * itemWeight;
    weight += itemWeight;
  }
  const base = weight === 0 ? 0 : total / weight;
  const costPenalty =
    dimensions.ACQUISITION_COST.score === null ? 0 : dimensions.ACQUISITION_COST.score * 0.1;
  return clamp(base - costPenalty);
}

function tierFor(score: number): SourceIntelligenceTier {
  if (score >= 80) return "A";
  if (score >= 60) return "B";
  if (score >= 40) return "C";
  return "D";
}

function rescanFor(
  tier: SourceIntelligenceTier,
): SourceIntelligenceAssessment["recommendedRescan"] {
  if (tier === "A") {
    return { mode: "DAYS", intervalDays: 7, reasonCodes: ["TIER_A_WEEKLY_REVIEW"] };
  }
  if (tier === "B") {
    return { mode: "DAYS", intervalDays: 30, reasonCodes: ["TIER_B_MONTHLY_REVIEW"] };
  }
  if (tier === "C") {
    return { mode: "DAYS", intervalDays: 90, reasonCodes: ["TIER_C_QUARTERLY_REVIEW"] };
  }
  return { mode: "MANUAL", reasonCodes: ["TIER_D_MANUAL_ONLY"] };
}

export function evaluateSourceIntelligence(
  input: SourceIntelligenceEvaluationInput,
): SourceIntelligenceAssessment {
  const inputFingerprint = fingerprint(input.snapshot);
  const dimensions = {
    RELEVANCE: relevanceScore(input.snapshot),
    AUTHORITY_SIGNAL: authorityScore(input.snapshot.explicitAuthorityLevel),
    FRESHNESS: freshnessScore(input.snapshot.latestCapturedAt, input.assessedAt),
    EVIDENCEABILITY: evidenceabilityScore(input.snapshot),
    NOVELTY: noveltyScore(input.snapshot),
    ACQUISITION_COST: acquisitionCostScore(input.snapshot),
  } as const;
  const priorityScore = scorePriority(dimensions);
  const operationalTier = tierFor(priorityScore);
  return {
    protocolVersion: SOURCE_INTELLIGENCE_PROTOCOL_VERSION,
    objectType: "SOURCE_INTELLIGENCE_ASSESSMENT",
    id: assessmentId(input.sourceId, inputFingerprint),
    workspaceId: input.workspaceId,
    sourceId: input.sourceId,
    ...(input.profileId ? { profileId: input.profileId } : {}),
    assessedAt: input.assessedAt,
    evaluator: SOURCE_INTELLIGENCE_EVALUATOR,
    inputFingerprint,
    input: input.snapshot,
    dimensions,
    priorityScore,
    operationalTier,
    recommendedRescan: rescanFor(operationalTier),
    reasonCodes: [`OPERATIONAL_TIER_${operationalTier}`, "RECOMMENDATION_REQUIRES_OPERATOR_ACTION"],
    boundaries: {
      legalTruthVerified: false,
      authorityInferred: false,
      autoScheduleApplied: false,
    },
  };
}

function weightedScore(weighted: Array<[SourceIntelligenceDimension, number]>): number | null {
  let total = 0;
  let weight = 0;
  for (const [signal, signalWeight] of weighted) {
    if (signal.score === null) continue;
    total += signal.score * signalWeight;
    weight += signalWeight;
  }
  return weight === 0 ? null : clamp(total / weight);
}

function sourceValueBand(score: number): SourceValuePriorityBand {
  if (score >= 80) return "VERY_HIGH";
  if (score >= 60) return "HIGH";
  if (score >= 40) return "MEDIUM";
  return "LOW";
}

function sourceValueConfidence(
  relevance: SourceIntelligenceDimension,
  authority: SourceIntelligenceDimension,
): SourceIntelligenceConfidence {
  if (authority.score === null) return "LOW";
  if (relevance.confidence === "HIGH" && authority.confidence === "HIGH") return "HIGH";
  return "MEDIUM";
}

function evidenceMaturityStage(legacy: SourceIntelligenceAssessment): EvidenceMaturityStage {
  if (legacy.input.rawArtifactCount === 0) return "UNOBSERVED";
  const { FRESHNESS, EVIDENCEABILITY } = legacy.dimensions;
  if (
    legacy.input.rawProvenanceNodeCount > 0 &&
    FRESHNESS.score !== null &&
    FRESHNESS.score >= 80 &&
    EVIDENCEABILITY.score !== null &&
    EVIDENCEABILITY.score >= 50
  ) {
    return "CURRENT_TRACEABLE";
  }
  if (
    legacy.input.rawProvenanceNodeCount > 0 &&
    EVIDENCEABILITY.score !== null &&
    EVIDENCEABILITY.score >= 40
  ) {
    return "TRACEABLE";
  }
  return "CAPTURED";
}

function evidenceMaturityConfidence(
  legacy: SourceIntelligenceAssessment,
  stage: EvidenceMaturityStage,
): SourceIntelligenceConfidence {
  if (stage === "UNOBSERVED") return "LOW";
  if (
    legacy.dimensions.FRESHNESS.confidence === "HIGH" &&
    legacy.dimensions.EVIDENCEABILITY.confidence === "HIGH" &&
    legacy.dimensions.NOVELTY.score !== null
  ) {
    return "HIGH";
  }
  return "MEDIUM";
}

function dualAxisAssessmentId(legacy: SourceIntelligenceAssessment): string {
  return `si2_${createHash("sha256")
    .update(
      `${SOURCE_INTELLIGENCE_DUAL_AXIS_PROTOCOL_VERSION}:${legacy.id}:${legacy.inputFingerprint}`,
    )
    .digest("hex")
    .slice(0, 24)}`;
}

export function projectSourceIntelligenceV2(
  legacy: SourceIntelligenceAssessment,
): SourceIntelligenceAssessmentV2 {
  const relevance = legacy.dimensions.RELEVANCE;
  const authority = legacy.dimensions.AUTHORITY_SIGNAL;
  const valueScore = weightedScore([
    [relevance, 0.4],
    [authority, 0.6],
  ]);
  const sourceValueScore = valueScore ?? 0;
  const valueBand = sourceValueBand(sourceValueScore);
  const maturityStage = evidenceMaturityStage(legacy);
  const maturityScore =
    maturityStage === "UNOBSERVED"
      ? null
      : weightedScore([
          [legacy.dimensions.FRESHNESS, 0.4],
          [legacy.dimensions.EVIDENCEABILITY, 0.4],
          [legacy.dimensions.NOVELTY, 0.2],
        ]);

  return {
    protocolVersion: SOURCE_INTELLIGENCE_DUAL_AXIS_PROTOCOL_VERSION,
    objectType: "SOURCE_INTELLIGENCE_DUAL_AXIS_ASSESSMENT",
    id: dualAxisAssessmentId(legacy),
    workspaceId: legacy.workspaceId,
    sourceId: legacy.sourceId,
    ...(legacy.profileId ? { profileId: legacy.profileId } : {}),
    assessedAt: legacy.assessedAt,
    evaluator: SOURCE_INTELLIGENCE_DUAL_AXIS_EVALUATOR,
    inputFingerprint: legacy.inputFingerprint,
    sourceValuePriority: {
      score: sourceValueScore,
      band: valueBand,
      confidence: sourceValueConfidence(relevance, authority),
      signals: { relevance, authority },
      reasonCodes: [
        `SOURCE_VALUE_${valueBand}`,
        "SOURCE_VALUE_EXCLUDES_EVIDENCE_MATURITY_SIGNALS",
        ...(authority.score === null ? ["EXPLICIT_AUTHORITY_UNKNOWN"] : []),
      ],
    },
    evidenceMaturity: {
      score: maturityScore,
      stage: maturityStage,
      confidence: evidenceMaturityConfidence(legacy, maturityStage),
      signals: {
        freshness: legacy.dimensions.FRESHNESS,
        evidenceability: legacy.dimensions.EVIDENCEABILITY,
        novelty: legacy.dimensions.NOVELTY,
      },
      reasonCodes: [
        `EVIDENCE_MATURITY_${maturityStage}`,
        ...(maturityStage === "UNOBSERVED" ? ["NO_RAW_ARTIFACT_EVIDENCE_HELD"] : []),
      ],
    },
    decisionContext: {
      observedAcquisitionCost: legacy.dimensions.ACQUISITION_COST,
    },
    compatibility: {
      projectionMode: "V1_READ_COMPATIBLE",
      legacyProtocolVersion: SOURCE_INTELLIGENCE_PROTOCOL_VERSION,
      legacyAssessmentId: legacy.id,
      legacyPriorityScore: legacy.priorityScore,
      legacyOperationalTier: legacy.operationalTier,
      legacyRecommendedRescan: legacy.recommendedRescan,
    },
    scheduling: {
      policyStatus: "NOT_AUTHORIZED_UNCALIBRATED",
    },
    reasonCodes: [
      `SOURCE_VALUE_${valueBand}`,
      `EVIDENCE_MATURITY_${maturityStage}`,
      "DUAL_AXIS_NOT_SCHEDULING_AUTHORITY",
    ],
    boundaries: {
      legalTruthVerified: false,
      authorityInferred: false,
      professionalQualityVerified: false,
      identityVerified: false,
      autoScheduleApplied: false,
      grantsCollectionAuthority: false,
      grantsMgsnQualification: false,
    },
  };
}
