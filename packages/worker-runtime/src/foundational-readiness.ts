export const FOUNDATIONAL_READINESS_PROTOCOL_VERSION = "1.2" as const;
export const US_FOUNDATIONAL_READINESS_PROTOCOL_VERSION = FOUNDATIONAL_READINESS_PROTOCOL_VERSION;

export const FOUNDATIONAL_READINESS_STAGES = [
  "REGISTER",
  "COLLECT",
  "INGEST",
  "CONVERT",
  "INDEX",
  "QUALITY",
  "RELEVANCE",
  "HEALTH",
  "READY",
] as const;

export type FoundationalReadinessStage = (typeof FOUNDATIONAL_READINESS_STAGES)[number];

export type FoundationalSupplyHealthItem = {
  targetId: string;
  sourceIds: string[];
  state: "READY" | "DEGRADED" | "BLOCKED";
  registrationState: "REGISTERED" | "UNREGISTERED";
  latestRunStatus: string | null;
  artifactCount: number;
  readyDocumentCount: number;
  currentDocumentCount: number;
  freshnessState: string;
  gaps: string[];
};

export type FoundationalRetrievalQualityItem = {
  sourceId: string;
  state: "READY" | "DEGRADED" | "BLOCKED";
  gaps: string[];
  isCurrent: boolean;
};

export type FoundationalRetrievalRelevanceItem = {
  targetId: string;
  state: "READY" | "DEGRADED" | "BLOCKED" | "NOT_APPLICABLE";
  gaps: string[];
  probeCount: number;
};

export type FoundationalRetrievalQualityState =
  | "READY"
  | "DEGRADED"
  | "BLOCKED"
  | "MISSING"
  | "NOT_APPLICABLE";

export type FoundationalRetrievalRelevanceState =
  | "READY"
  | "DEGRADED"
  | "BLOCKED"
  | "MISSING"
  | "NOT_APPLICABLE";

export type FoundationalReadinessTarget = {
  targetId: string;
  stage: FoundationalReadinessStage;
  ready: boolean;
  healthState: FoundationalSupplyHealthItem["state"] | "MISSING";
  gaps: string[];
  reason: string | null;
  retrievalQualityState: FoundationalRetrievalQualityState;
  retrievalAuditDocumentCount: number;
  retrievalAuditGaps: string[];
  retrievalRelevanceState: FoundationalRetrievalRelevanceState;
  retrievalRelevanceProbeCount: number;
  retrievalRelevanceGaps: string[];
};

export type FoundationalReadinessGate = {
  protocolVersion: typeof FOUNDATIONAL_READINESS_PROTOCOL_VERSION;
  objectType: "FOUNDATIONAL_READINESS_GATE";
  jurisdiction: string;
  state: "READY" | "NOT_READY";
  totalCount: number;
  readyCount: number;
  blockingCount: number;
  readyPercent: number;
  byStage: Record<FoundationalReadinessStage, number>;
  targets: FoundationalReadinessTarget[];
};

type RetrievalQualityEvaluation = {
  state: FoundationalRetrievalQualityState;
  documentCount: number;
  gaps: string[];
};

type RetrievalRelevanceEvaluation = {
  state: FoundationalRetrievalRelevanceState;
  probeCount: number;
  gaps: string[];
};

export function normalizeFoundationalJurisdiction(raw: string): string {
  const jurisdiction = raw.trim().toUpperCase();
  if (!jurisdiction) throw new Error("jurisdiction is required");
  if (!/^[A-Z0-9-]{2,12}$/.test(jurisdiction)) throw new Error("jurisdiction is invalid");
  return jurisdiction;
}

export function deriveFoundationalReadinessStage(
  item: FoundationalSupplyHealthItem,
): FoundationalReadinessStage {
  const gaps = new Set(item.gaps);
  if (item.registrationState === "UNREGISTERED" || gaps.has("SOURCE_UNREGISTERED")) {
    return "REGISTER";
  }
  if (item.artifactCount === 0) {
    return item.latestRunStatus === "COMPLETED" ? "INGEST" : "COLLECT";
  }
  if (
    item.latestRunStatus === "FAILED" ||
    gaps.has("LATEST_COLLECTION_FAILED") ||
    gaps.has("STALE_ACQUISITION") ||
    item.freshnessState === "STALE"
  ) {
    return "COLLECT";
  }
  if (item.readyDocumentCount === 0 || gaps.has("NO_NORMALIZED_DOCUMENT")) return "CONVERT";
  if (item.currentDocumentCount === 0 || gaps.has("NO_RETRIEVAL_DOCUMENT")) return "INDEX";
  if (item.state === "READY" && item.gaps.length === 0) return "READY";
  return "HEALTH";
}

export function evaluateFoundationalRetrievalQuality(
  item: FoundationalSupplyHealthItem,
  qualityItems: readonly FoundationalRetrievalQualityItem[],
): RetrievalQualityEvaluation {
  if (item.currentDocumentCount === 0) {
    return { state: "NOT_APPLICABLE", documentCount: 0, gaps: [] };
  }
  const sourceIds = new Set(item.sourceIds);
  const current = qualityItems.filter(
    (quality) => quality.isCurrent && sourceIds.has(quality.sourceId),
  );
  if (current.length === 0) {
    return { state: "MISSING", documentCount: 0, gaps: ["RETRIEVAL_AUDIT_MISSING"] };
  }
  const gaps = [...new Set(current.flatMap((quality) => quality.gaps))].sort();
  if (current.length !== item.currentDocumentCount) gaps.unshift("RETRIEVAL_AUDIT_COVERAGE_MISMATCH");
  if (
    current.some((quality) => quality.state === "BLOCKED") ||
    current.length !== item.currentDocumentCount
  ) {
    return { state: "BLOCKED", documentCount: current.length, gaps };
  }
  if (current.some((quality) => quality.state === "DEGRADED")) {
    return { state: "DEGRADED", documentCount: current.length, gaps };
  }
  return { state: "READY", documentCount: current.length, gaps };
}

export function evaluateFoundationalRetrievalRelevance(
  item: FoundationalSupplyHealthItem,
  relevanceItems: readonly FoundationalRetrievalRelevanceItem[],
): RetrievalRelevanceEvaluation {
  if (item.currentDocumentCount === 0) {
    return { state: "NOT_APPLICABLE", probeCount: 0, gaps: [] };
  }
  const matching = relevanceItems.filter((relevance) => relevance.targetId === item.targetId);
  if (matching.length === 0) {
    return {
      state: "MISSING",
      probeCount: 0,
      gaps: ["RETRIEVAL_RELEVANCE_AUDIT_MISSING"],
    };
  }
  if (matching.length > 1) {
    return {
      state: "BLOCKED",
      probeCount: matching.reduce((total, relevance) => total + relevance.probeCount, 0),
      gaps: ["RETRIEVAL_RELEVANCE_AUDIT_DUPLICATE"],
    };
  }
  const relevance = matching[0];
  if (relevance.state === "NOT_APPLICABLE") {
    return {
      state: "BLOCKED",
      probeCount: relevance.probeCount,
      gaps: ["RETRIEVAL_RELEVANCE_NOT_APPLICABLE_WITH_CURRENT_DOCUMENTS", ...relevance.gaps],
    };
  }
  return { state: relevance.state, probeCount: relevance.probeCount, gaps: [...relevance.gaps] };
}

function supplyReasonFor(
  item: FoundationalSupplyHealthItem,
  stage: FoundationalReadinessStage,
): string | null {
  if (stage === "READY") return null;
  if (stage === "INGEST") return "COLLECTION_COMPLETED_WITHOUT_RAW_ARTIFACT";
  if (item.gaps.length > 0) return item.gaps.join(",");
  return `SUPPLY_${item.state}`;
}

function qualityReasonFor(quality: RetrievalQualityEvaluation): string {
  return quality.gaps.length > 0 ? quality.gaps.join(",") : `RETRIEVAL_QUALITY_${quality.state}`;
}

function relevanceReasonFor(relevance: RetrievalRelevanceEvaluation): string {
  return relevance.gaps.length > 0
    ? relevance.gaps.join(",")
    : `RETRIEVAL_RELEVANCE_${relevance.state}`;
}

export function evaluateFoundationalReadiness(
  jurisdiction: string,
  targetIds: readonly string[],
  healthItems: readonly FoundationalSupplyHealthItem[],
  qualityItems: readonly FoundationalRetrievalQualityItem[],
  relevanceItems: readonly FoundationalRetrievalRelevanceItem[] = [],
): FoundationalReadinessGate {
  const normalized = normalizeFoundationalJurisdiction(jurisdiction);
  const expected = [...new Set(targetIds)];
  if (expected.length === 0) {
    throw new Error(`${normalized} FOUNDATIONAL readiness requires at least one target`);
  }
  const healthMap = new Map<string, FoundationalSupplyHealthItem>();
  for (const item of healthItems) {
    if (healthMap.has(item.targetId)) throw new Error(`Duplicate supply health for ${item.targetId}`);
    healthMap.set(item.targetId, item);
  }
  const byStage = Object.fromEntries(
    FOUNDATIONAL_READINESS_STAGES.map((stage) => [stage, 0]),
  ) as Record<FoundationalReadinessStage, number>;
  const targets: FoundationalReadinessTarget[] = expected.map((targetId) => {
    const item = healthMap.get(targetId);
    if (!item) {
      byStage.HEALTH += 1;
      return {
        targetId,
        stage: "HEALTH",
        ready: false,
        healthState: "MISSING",
        gaps: ["HEALTH_RECORD_MISSING"],
        reason: "HEALTH_RECORD_MISSING",
        retrievalQualityState: "NOT_APPLICABLE",
        retrievalAuditDocumentCount: 0,
        retrievalAuditGaps: [],
        retrievalRelevanceState: "NOT_APPLICABLE",
        retrievalRelevanceProbeCount: 0,
        retrievalRelevanceGaps: [],
      };
    }
    const supplyStage = deriveFoundationalReadinessStage(item);
    const quality = evaluateFoundationalRetrievalQuality(item, qualityItems);
    const relevance = evaluateFoundationalRetrievalRelevance(item, relevanceItems);
    let stage = supplyStage;
    if (supplyStage === "READY" && quality.state !== "READY") stage = "QUALITY";
    else if (supplyStage === "READY" && relevance.state !== "READY") stage = "RELEVANCE";
    byStage[stage] += 1;
    return {
      targetId,
      stage,
      ready: stage === "READY",
      healthState: item.state,
      gaps: item.gaps,
      reason:
        stage === "QUALITY"
          ? qualityReasonFor(quality)
          : stage === "RELEVANCE"
            ? relevanceReasonFor(relevance)
            : supplyReasonFor(item, stage),
      retrievalQualityState: quality.state,
      retrievalAuditDocumentCount: quality.documentCount,
      retrievalAuditGaps: quality.gaps,
      retrievalRelevanceState: relevance.state,
      retrievalRelevanceProbeCount: relevance.probeCount,
      retrievalRelevanceGaps: relevance.gaps,
    };
  });
  const readyCount = targets.filter((target) => target.ready).length;
  const totalCount = targets.length;
  return {
    protocolVersion: FOUNDATIONAL_READINESS_PROTOCOL_VERSION,
    objectType: "FOUNDATIONAL_READINESS_GATE",
    jurisdiction: normalized,
    state: readyCount === totalCount ? "READY" : "NOT_READY",
    totalCount,
    readyCount,
    blockingCount: totalCount - readyCount,
    readyPercent: Number(((readyCount / totalCount) * 100).toFixed(2)),
    byStage,
    targets,
  };
}

export function evaluateUsFoundationalReadiness(
  targetIds: readonly string[],
  healthItems: readonly FoundationalSupplyHealthItem[],
  qualityItems: readonly FoundationalRetrievalQualityItem[],
  relevanceItems: readonly FoundationalRetrievalRelevanceItem[] = [],
): FoundationalReadinessGate {
  return evaluateFoundationalReadiness("US", targetIds, healthItems, qualityItems, relevanceItems);
}

export function evaluateWipoFoundationalReadiness(
  targetIds: readonly string[],
  healthItems: readonly FoundationalSupplyHealthItem[],
  qualityItems: readonly FoundationalRetrievalQualityItem[],
  relevanceItems: readonly FoundationalRetrievalRelevanceItem[] = [],
): FoundationalReadinessGate {
  return evaluateFoundationalReadiness("WO", targetIds, healthItems, qualityItems, relevanceItems);
}
