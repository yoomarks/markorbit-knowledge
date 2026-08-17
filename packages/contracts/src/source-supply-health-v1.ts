import type { ArtifactKind } from "./schema-v1";
import type { SourceCompatibilityBaselineState } from "./source-compatibility-v1";
import type {
  SourceCoverageCatalogState,
  SourceCoverageChangeSensitivity,
  SourceCoverageFamily,
  SourceCoverageTier,
} from "./source-coverage-v1";

export const SOURCE_SUPPLY_HEALTH_PROTOCOL_VERSION = "1.2" as const;

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
  gapCounts: Partial<Record<SourceSupplyGap, number>>;
};
