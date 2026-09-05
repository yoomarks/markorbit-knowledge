import type { SourceSupplyFreshnessState } from "./source-supply-health-v1";

export const EVIDENCE_SUPPLY_HEALTH_PROTOCOL_VERSION = "1.0" as const;

export const EVIDENCE_SUPPLY_HEALTH_STATES = [
  "HEALTHY",
  "DEGRADED",
  "STALE",
  "BLOCKED",
  "PARTIAL",
  "UNKNOWN",
] as const;
export type EvidenceSupplyHealthState = (typeof EVIDENCE_SUPPLY_HEALTH_STATES)[number];

export const EVIDENCE_SUPPLY_COVERAGE_STATES = ["COMPLETE", "PARTIAL", "UNKNOWN"] as const;
export type EvidenceSupplyCoverageState = (typeof EVIDENCE_SUPPLY_COVERAGE_STATES)[number];

export const EVIDENCE_SUPPLY_SCHEDULE_STATES = [
  "UNCONFIGURED",
  "MANUAL",
  "AUTOMATIC",
  "MIXED",
] as const;
export type EvidenceSupplyScheduleState = (typeof EVIDENCE_SUPPLY_SCHEDULE_STATES)[number];

export type EvidenceSupplyLatencyDistribution = {
  sampleSize: number;
  p50Ms: number | null;
  p95Ms: number | null;
  maxMs: number | null;
};

export type EvidenceSupplyHealthReasonCode =
  | "SOURCE_UNREGISTERED"
  | "NO_ACQUISITION_EVIDENCE"
  | "NO_ACTIVE_SOURCE"
  | "SUPPLY_BLOCKED"
  | "SUPPLY_DEGRADED"
  | "ACQUISITION_STALE"
  | "KNOWN_LIMITATION"
  | "SCHEDULER_ERROR"
  | "RECENT_ACQUISITION_FAILURES"
  | `SUPPLY_GAP:${string}`
  | `EXPECTED_ARTIFACT_KIND_MISSING:${string}`
  | `SCHEDULER_ERROR:${string}`;

export type EvidenceSupplyCoverageFacts = {
  state: EvidenceSupplyCoverageState;
  reasons: string[];
  expectedArtifactKinds: string[];
  observedArtifactKinds: string[];
  missingExpectedArtifactKinds: string[];
};

export type EvidenceSupplyFreshnessFacts = {
  state: SourceSupplyFreshnessState;
  lastSuccessfulAcquisitionAt: string | null;
  ageHours: number | null;
  maxAgeHours: number | null;
};

export type EvidenceSupplyScheduleFacts = {
  state: EvidenceSupplyScheduleState;
  planCount: number;
  activePlanCount: number;
  expectedCadences: string[];
  nextScheduledCheckAt: string | null;
  schedulerErrorCount: number;
  latestSchedulerError: {
    code: string;
    message: string;
    at: string;
    planId: string;
  } | null;
};

export type EvidenceSupplyReliabilityFacts = {
  windowDays: number;
  attempts: number;
  completed: number;
  failed: number;
  cancelled: number;
  successRate: number | null;
  lastCompletedAt: string | null;
  lastFailedAt: string | null;
};

export type EvidenceSupplyLatencyFacts = {
  windowDays: number;
  publicationToCapture: EvidenceSupplyLatencyDistribution;
  captureToNormalized: EvidenceSupplyLatencyDistribution;
  normalizedToRetrievalReady: EvidenceSupplyLatencyDistribution;
  basis: {
    publication: "RETRIEVAL_DOCUMENT_PUBLISHED_AT";
    capture: "RETRIEVAL_DOCUMENT_CAPTURED_AT";
    normalized: "STAGING_DOCUMENT_CREATED_AT";
    retrievalReady: "RETRIEVAL_DOCUMENT_INDEXED_AT";
  };
};

export type EvidenceSupplyChangeActivityFacts = {
  updates7d: number;
  updates30d: number;
  lastObservedChangeAt: string | null;
};

/**
 * Objective, explainable evidence-supply situation for one curated coverage target.
 * This read model composes durable operational facts only. It must not infer legal
 * truth, semantic relevance, source value, business priority or Core recommendations.
 */
export type EvidenceSupplyHealthRecordV1 = {
  protocolVersion: typeof EVIDENCE_SUPPLY_HEALTH_PROTOCOL_VERSION;
  objectType: "EVIDENCE_SUPPLY_HEALTH";
  workspaceId: string;
  targetId: string;
  sourceIds: string[];
  state: EvidenceSupplyHealthState;
  reasonCodes: EvidenceSupplyHealthReasonCode[];
  coverage: EvidenceSupplyCoverageFacts;
  freshness: EvidenceSupplyFreshnessFacts;
  schedule: EvidenceSupplyScheduleFacts;
  reliability: EvidenceSupplyReliabilityFacts;
  latency: EvidenceSupplyLatencyFacts;
  changeActivity: EvidenceSupplyChangeActivityFacts;
  observedAt: string;
};

export type EvidenceSupplyHealthSummaryV1 = {
  total: number;
  byState: Record<EvidenceSupplyHealthState, number>;
  coverage: Record<EvidenceSupplyCoverageState, number>;
  requiringAttention: number;
  stale: number;
  blocked: number;
  recentChanges30d: number;
};

export type EvidenceSupplyHealthResultV1 = {
  protocolVersion: typeof EVIDENCE_SUPPLY_HEALTH_PROTOCOL_VERSION;
  objectType: "EVIDENCE_SUPPLY_HEALTH_RESULT";
  workspaceId: string;
  observedAt: string;
  items: EvidenceSupplyHealthRecordV1[];
  summary: EvidenceSupplyHealthSummaryV1;
};
