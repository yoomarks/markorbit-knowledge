import type { ArtifactKind } from "./schema-v1";
import type {
  SourceCompatibilityBaselineState,
  SourceCompatibilityState,
} from "./source-compatibility-v1";
import type {
  SourceCoverageCatalogState,
  SourceCoverageChangeSensitivity,
  SourceCoverageFamily,
  SourceCoverageTier,
} from "./source-coverage-v1";
import type { EvidenceMaturityStage } from "./source-intelligence-v2";

export const SOURCE_SUPPLY_HEALTH_PROTOCOL_VERSION = "1.5" as const;

export const SOURCE_SUPPLY_HEALTH_STATES = ["READY", "DEGRADED", "BLOCKED"] as const;
export type SourceSupplyHealthState = (typeof SOURCE_SUPPLY_HEALTH_STATES)[number];

export const SOURCE_SUPPLY_FRESHNESS_STATES = ["FRESH", "STALE", "UNOBSERVED"] as const;
export type SourceSupplyFreshnessState = (typeof SOURCE_SUPPLY_FRESHNESS_STATES)[number];

export const SOURCE_SUPPLY_COMPATIBILITY_STATES = [
  "PASS",
  "DEGRADED",
  "BLOCKED",
  "UNOBSERVED",
] as const;
export type SourceSupplyCompatibilityState = (typeof SOURCE_SUPPLY_COMPATIBILITY_STATES)[number];

export const SOURCE_SUPPLY_COMPATIBILITY_FRESHNESS_STATES = [
  "FRESH",
  "STALE",
  "UNOBSERVED",
] as const;
export type SourceSupplyCompatibilityFreshnessState =
  (typeof SOURCE_SUPPLY_COMPATIBILITY_FRESHNESS_STATES)[number];

export const SOURCE_SUPPLY_COMPATIBILITY_REPROBE_STATES = [
  "UNOBSERVED",
  "STARTED",
  "COMPLETED",
  "FAILED",
] as const;
export type SourceSupplyCompatibilityReprobeState =
  (typeof SOURCE_SUPPLY_COMPATIBILITY_REPROBE_STATES)[number];

export const SOURCE_SUPPLY_TOPOLOGY_PROJECTION_STATES = [
  "UNREGISTERED",
  "COMPLETE",
  "PARTIAL",
  "FAILED",
] as const;
export type SourceSupplyTopologyProjectionState =
  (typeof SOURCE_SUPPLY_TOPOLOGY_PROJECTION_STATES)[number];

export const SOURCE_SUPPLY_INTELLIGENCE_COVERAGE_STATES = [
  "UNREGISTERED",
  "UNASSESSED",
  "PARTIAL",
  "COMPLETE",
] as const;
export type SourceSupplyIntelligenceCoverageState =
  (typeof SOURCE_SUPPLY_INTELLIGENCE_COVERAGE_STATES)[number];

export const SOURCE_SUPPLY_GAPS = [
  "SOURCE_UNREGISTERED",
  "NO_ACQUISITION_EVIDENCE",
  "LATEST_COLLECTION_FAILED",
  "STALE_ACQUISITION",
  "NO_NORMALIZED_DOCUMENT",
  "NO_RETRIEVAL_DOCUMENT",
  "PRIMARY_PATH_DEGRADED",
  "EXTERNAL_COMPATIBILITY_BLOCKED",
] as const;
export type SourceSupplyGap = (typeof SOURCE_SUPPLY_GAPS)[number];

export type SourceSupplyLatestRun = {
  runId: string;
  status: string;
  requestedAt: string;
  updatedAt: string;
} | null;

export type SourceSupplyAcquisitionHealth = {
  artifactCount: number;
  artifactKinds: ArtifactKind[];
  latestArtifactAt: string | null;
};

export type SourceSupplyNormalizationHealth = {
  stagingDocumentCount: number;
  readyDocumentCount: number;
  latestDocumentAt: string | null;
  latestStatus: string | null;
};

export type SourceSupplyRetrievalHealth = {
  indexedDocumentCount: number;
  currentDocumentCount: number;
  currentArtifactVersion: number | null;
  currentChunkCount: number;
  latestIndexedAt: string | null;
};

export type SourceSupplyFreshnessHealth = {
  state: SourceSupplyFreshnessState;
  lastObservedAt: string | null;
  ageHours: number | null;
  maxAgeHours: number;
};

/**
 * Objective provenance for the compatibility observation currently projected
 * into supply health. `commitSha` identifies the exact source revision under
 * test; `workflowSha` identifies the GitHub Actions checkout revision. Neither
 * field implies semantic meaning or collection authorization.
 */
export type SourceSupplyCompatibilityEvidenceProvenance = {
  provider: string;
  repository: string;
  runId: string;
  runAttempt: string;
  commitSha: string;
  workflowSha: string;
  workflow: string;
  eventName: string;
  sourceRef: string | null;
  serverUrl: string | null;
};

export type SourceSupplyCompatibilityHealth = {
  state: SourceSupplyCompatibilityState;
  freshness: SourceSupplyCompatibilityFreshnessState;
  observedAt: string | null;
  ageHours: number | null;
  maxAgeHours: number;
  primaryUri: string | null;
  renderJavascript: boolean | null;
  errorCode: string | null;
  errorMessage: string | null;
  baselineTargetId: string | null;
  baselineState: SourceCompatibilityBaselineState | null;
  evidenceProvenance?: SourceSupplyCompatibilityEvidenceProvenance | null;
};

/**
 * Latest governed compatibility re-probe execution for a target. This is a
 * read-only lifecycle projection and cannot alter supply state, gaps,
 * collection authorization or scheduling.
 */
export type SourceSupplyCompatibilityReprobeHealth = {
  state: SourceSupplyCompatibilityReprobeState;
  executionId: string | null;
  intentId: string | null;
  startedAt: string | null;
  completedAt: string | null;
  observationId: string | null;
  observationObservedAt: string | null;
  observationState: SourceCompatibilityState | null;
  errorCode: string | null;
  errorMessage: string | null;
};

/**
 * Read-only operational coverage projected from the existing SourceRegistryV2,
 * SourceGraph and RawArtifact evidence for the Sources registered to one
 * coverage target. These counters describe what has been observed; they do not
 * infer authority, source value, legal truth or collection authorization.
 */
export type SourceSupplyOperationalTopologyHealth = {
  projectionState: SourceSupplyTopologyProjectionState;
  registeredSourceCount: number;
  projectedSourceCount: number;
  unprojectableSourceIds: string[];
  sourceRegistryV2ObservedSourceCount: number;
  sourceGraphObservedSourceCount: number;
  explicitParentageObservedSourceCount: number;
  explicitAuthorityObservedSourceCount: number;
  entrypointCount: number;
  graphMappedEntrypointCount: number;
  artifactLinkedEntrypointCount: number;
  rawArtifactCount: number;
  discoveryProvenanceCount: number;
  relationshipCount: number;
  familyRootSourceIds: string[];
};

/**
 * Advisory observation coverage from the existing Source Intelligence V2
 * projection. Only evidence-maturity stages are surfaced here. Source-value
 * priority, semantic relevance and scheduling recommendations remain outside
 * Source Supply Health. This projection cannot alter health state or gaps.
 */
export type SourceSupplyEvidenceMaturityHealth = {
  coverageState: SourceSupplyIntelligenceCoverageState;
  registeredSourceCount: number;
  assessedSourceCount: number;
  unassessedSourceIds: string[];
  latestAssessedAt: string | null;
  byStage: Record<EvidenceMaturityStage, number>;
};

export type SourceSupplyHealthRecord = {
  protocolVersion: typeof SOURCE_SUPPLY_HEALTH_PROTOCOL_VERSION;
  objectType: "SOURCE_SUPPLY_HEALTH";
  targetId: string;
  workspaceId: string;
  jurisdiction: string;
  family: SourceCoverageFamily;
  coverageTier: SourceCoverageTier;
  catalogState: SourceCoverageCatalogState;
  changeSensitivity: SourceCoverageChangeSensitivity;
  displayName: string;
  canonicalUri: string;
  registrationState: "REGISTERED" | "UNREGISTERED";
  sourceIds: string[];
  latestRun: SourceSupplyLatestRun;
  acquisition: SourceSupplyAcquisitionHealth;
  normalization: SourceSupplyNormalizationHealth;
  retrieval: SourceSupplyRetrievalHealth;
  freshness: SourceSupplyFreshnessHealth;
  compatibility?: SourceSupplyCompatibilityHealth;
  latestCompatibilityReprobe?: SourceSupplyCompatibilityReprobeHealth;
  operationalTopology?: SourceSupplyOperationalTopologyHealth;
  evidenceMaturity?: SourceSupplyEvidenceMaturityHealth;
  gaps: SourceSupplyGap[];
  state: SourceSupplyHealthState;
  observedAt: string;
};

export type SourceSupplyHealthSummary = {
  total: number;
  byState: Record<SourceSupplyHealthState, number>;
  registered: number;
  acquisitionObserved: number;
  normalizedAvailable: number;
  retrievalAvailable: number;
  byFreshness: Record<SourceSupplyFreshnessState, number>;
  byCompatibility?: Record<SourceSupplyCompatibilityState, number>;
  byCompatibilityFreshness?: Record<SourceSupplyCompatibilityFreshnessState, number>;
  byCompatibilityReprobe?: Record<SourceSupplyCompatibilityReprobeState, number>;
  compatibilityProvenanceObserved?: number;
  byTopologyProjection?: Record<SourceSupplyTopologyProjectionState, number>;
  topologySourceRegistryV2Observed?: number;
  topologySourceGraphObserved?: number;
  topologyExplicitParentageObserved?: number;
  topologyExplicitAuthorityObserved?: number;
  byIntelligenceCoverage?: Record<SourceSupplyIntelligenceCoverageState, number>;
  gapCounts: Partial<Record<SourceSupplyGap, number>>;
};
