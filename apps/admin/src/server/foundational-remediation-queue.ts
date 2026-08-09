import { DatabaseSync } from "node:sqlite";
import { RegistryValidationError } from "@markorbit/persistence";
import { SqliteRetrievalQualityAuditRepository } from "@markorbit/persistence/retrieval-quality-audit";
import { SqliteRetrievalRelevanceAuditRepository } from "@markorbit/persistence/retrieval-relevance-audit";
import { SqliteSourceSupplyHealthRepository } from "@markorbit/persistence/source-supply-health";
import {
  evaluateFoundationalReadiness,
  normalizeFoundationalJurisdiction,
  type FoundationalReadinessGate,
  type FoundationalRetrievalQualityItem,
  type FoundationalRetrievalRelevanceItem,
  type FoundationalSupplyHealthItem,
} from "@markorbit/worker-runtime/foundational-readiness";
import {
  buildFoundationalRemediationQueue,
  type FoundationalRemediationQueue,
} from "@markorbit/worker-runtime/foundational-remediation-queue";

export const FOUNDATIONAL_REMEDIATION_QUEUE_SNAPSHOT_PROTOCOL_VERSION = "1.0" as const;

export type FoundationalRemediationQueueSnapshotFilters = {
  workspaceId: string;
  jurisdiction: string;
  targetId?: string;
  topK?: number;
};

export type FoundationalRemediationQueueSnapshot = {
  protocolVersion: typeof FOUNDATIONAL_REMEDIATION_QUEUE_SNAPSHOT_PROTOCOL_VERSION;
  objectType: "FOUNDATIONAL_REMEDIATION_QUEUE_SNAPSHOT";
  workspaceId: string;
  jurisdiction: string;
  targetId: string | null;
  topK: number | null;
  observedAt: string;
  readiness: FoundationalReadinessGate;
  remediationQueue: FoundationalRemediationQueue;
  executionPolicy: "READ_ONLY";
  collectionAuthorization: "NONE";
  mutationPerformed: false;
};

function normalizeFilters(
  filters: FoundationalRemediationQueueSnapshotFilters,
): FoundationalRemediationQueueSnapshotFilters {
  const workspaceId = filters.workspaceId.trim();
  if (!workspaceId) {
    throw new RegistryValidationError("workspaceId query parameter is required");
  }
  const jurisdiction = normalizeFoundationalJurisdiction(filters.jurisdiction);
  const targetId = filters.targetId?.trim() || undefined;
  if (filters.topK !== undefined) {
    if (!Number.isSafeInteger(filters.topK) || filters.topK <= 0 || filters.topK > 20) {
      throw new RegistryValidationError("topK query parameter must be an integer between 1 and 20");
    }
  }
  return { workspaceId, jurisdiction, targetId, topK: filters.topK };
}

export function buildFoundationalRemediationQueueSnapshot(
  database: DatabaseSync,
  filters: FoundationalRemediationQueueSnapshotFilters,
  clock: () => Date = () => new Date(),
): FoundationalRemediationQueueSnapshot {
  const normalized = normalizeFilters(filters);
  const health = new SqliteSourceSupplyHealthRepository(database).list({
    workspaceId: normalized.workspaceId,
    jurisdiction: normalized.jurisdiction,
    coverageTier: "FOUNDATIONAL",
    catalogState: "ACTIVE",
    targetId: normalized.targetId,
  });
  if (health.items.length === 0) {
    const target = normalized.targetId ? ` target ${normalized.targetId}` : "";
    throw new RegistryValidationError(
      `No ACTIVE FOUNDATIONAL${target} coverage is configured for ${normalized.jurisdiction}`,
    );
  }

  const quality = new SqliteRetrievalQualityAuditRepository(database).list({
    workspaceId: normalized.workspaceId,
    jurisdiction: normalized.jurisdiction,
  });
  const relevance = new SqliteRetrievalRelevanceAuditRepository(database).list({
    workspaceId: normalized.workspaceId,
    jurisdiction: normalized.jurisdiction,
    targetId: normalized.targetId,
    topK: normalized.topK,
  });

  const healthItems: FoundationalSupplyHealthItem[] = health.items.map((item) => ({
    targetId: item.targetId,
    sourceIds: [...item.sourceIds],
    state: item.state,
    registrationState: item.registrationState,
    latestRunStatus: item.latestRun?.status ?? null,
    artifactCount: item.acquisition.artifactCount,
    readyDocumentCount: item.normalization.readyDocumentCount,
    currentDocumentCount: item.retrieval.currentDocumentCount,
    freshnessState: item.freshness.state,
    gaps: [...item.gaps],
  }));
  const qualityItems: FoundationalRetrievalQualityItem[] = quality.items.map((item) => ({
    sourceId: item.sourceId,
    state: item.state,
    gaps: [...item.gaps],
    isCurrent: item.isCurrent,
  }));
  const relevanceItems: FoundationalRetrievalRelevanceItem[] = relevance.items.map((item) => ({
    targetId: item.targetId,
    state: item.state,
    gaps: [...item.gaps],
    probeCount: item.probes.length,
  }));
  const targetIds = healthItems.map((item) => item.targetId);
  const readiness = evaluateFoundationalReadiness(
    normalized.jurisdiction,
    targetIds,
    healthItems,
    qualityItems,
    relevanceItems,
  );

  return {
    protocolVersion: FOUNDATIONAL_REMEDIATION_QUEUE_SNAPSHOT_PROTOCOL_VERSION,
    objectType: "FOUNDATIONAL_REMEDIATION_QUEUE_SNAPSHOT",
    workspaceId: normalized.workspaceId,
    jurisdiction: normalized.jurisdiction,
    targetId: normalized.targetId ?? null,
    topK: normalized.topK ?? null,
    observedAt: clock().toISOString(),
    readiness,
    remediationQueue: buildFoundationalRemediationQueue(readiness, normalized.workspaceId),
    executionPolicy: "READ_ONLY",
    collectionAuthorization: "NONE",
    mutationPerformed: false,
  };
}
