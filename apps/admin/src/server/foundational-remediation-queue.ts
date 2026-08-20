import { DatabaseSync } from "node:sqlite";
import type { SourceCoverageTarget } from "@markorbit/contracts";
import { RegistryValidationError, SqliteSourceRepository } from "@markorbit/persistence";
import { SqliteCollectionPlanRepository } from "@markorbit/persistence/collection-plans";
import { listSourceCoverageTargets } from "@markorbit/persistence/source-coverage";
import { SqliteCompatibilityAwareSupplyHealthRepository } from "@markorbit/persistence/source-compatibility-supply-health";
import { SqliteRetrievalQualityAuditRepository } from "@markorbit/persistence/retrieval-quality-audit";
import { SqliteRetrievalRelevanceAuditRepository } from "@markorbit/persistence/retrieval-relevance-audit";
import {
  evaluateFoundationalReadiness,
  normalizeFoundationalJurisdiction,
  type FoundationalRetrievalQualityItem,
  type FoundationalRetrievalRelevanceItem,
  type FoundationalSupplyHealthItem,
} from "@markorbit/worker-runtime/foundational-readiness";
import { buildFoundationalRemediationQueue } from "@markorbit/worker-runtime/foundational-remediation-queue";
import {
  assembleFoundationalRemediationQueueSnapshot,
  type FoundationalApiRemediationItem,
  type FoundationalApiRemediationStatus,
  type FoundationalRemediationQueueSnapshot,
} from "@markorbit/worker-runtime/foundational-remediation-snapshot";
import { listAllWorkspaceSources } from "./source-pagination";

const API_ARTIFACT_KINDS = new Set(["JSON", "XML", "CSV", "TEXT"]);
const WEB_ATTACHMENT_ARTIFACT_KINDS = new Set([
  "PDF",
  "DOCX",
  "XLSX",
  "CSV",
  "JSON",
  "XML",
  "EMAIL",
  "IMAGE",
  "TEXT",
]);

export type FoundationalRemediationQueueSnapshotFilters = {
  workspaceId: string;
  jurisdiction: string;
  targetId?: string;
  topK?: number;
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

function requiredApiArtifactKinds(target: SourceCoverageTarget): string[] {
  const webCapturable = new Set(["HTML", "MARKDOWN"]);
  if (target.acquisition.fetchAttachmentsHint) {
    for (const kind of WEB_ATTACHMENT_ARTIFACT_KINDS) webCapturable.add(kind);
  }
  return target.acquisition.expectedArtifactKinds.filter(
    (kind) => API_ARTIFACT_KINDS.has(kind) && !webCapturable.has(kind),
  );
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  const a = [...left].sort();
  const b = [...right].sort();
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function apiRemediationItem(
  database: DatabaseSync,
  workspaceId: string,
  target: SourceCoverageTarget,
  requiredArtifactKinds: string[],
): FoundationalApiRemediationItem {
  const sources = listAllWorkspaceSources(new SqliteSourceRepository(database), workspaceId).filter(
    (source) =>
      source.extensions?.["x-markorbit-source-coverage-remediation-target-id"] === target.id,
  );
  if (sources.length === 0) {
    return {
      targetId: target.id,
      state: "UNPREPARED",
      requiredArtifactKinds,
      sourceId: null,
      planId: null,
      endpointBinding: null,
      workerEndpointBindingState: "EXTERNAL_UNVERIFIED",
      collectionAuthorization: "NONE",
      automaticExecution: false,
    };
  }

  if (sources.length !== 1) {
    return {
      targetId: target.id,
      state: "INVALID",
      requiredArtifactKinds,
      sourceId: null,
      planId: null,
      endpointBinding: null,
      workerEndpointBindingState: "EXTERNAL_UNVERIFIED",
      collectionAuthorization: "NONE",
      automaticExecution: false,
    };
  }

  const source = sources[0];
  const endpointBinding =
    typeof source.connectorConfig.endpointBinding === "string"
      ? source.connectorConfig.endpointBinding
      : null;
  const sourceValid =
    source.sourceType === "API" &&
    source.status === "ACTIVE" &&
    source.connector.connectorId === "api-worker" &&
    source.connector.version === "1.0.0" &&
    endpointBinding !== null &&
    source.extensions?.["x-markorbit-collection-authorization"] === false;

  const plans = new SqliteCollectionPlanRepository(database)
    .listForSource(source.id)
    .filter(
      (record) =>
        record.plan.extensions?.["x-markorbit-source-coverage-remediation-target-id"] === target.id,
    );
  const plan = plans.length === 1 ? plans[0].plan : null;
  const planValid =
    plan !== null &&
    plan.status === "ACTIVE" &&
    plan.schedule.mode === "MANUAL" &&
    sameStrings(plan.output.artifactKinds, requiredArtifactKinds) &&
    plan.extensions?.["x-markorbit-collection-authorization"] === false;

  return {
    targetId: target.id,
    state: sourceValid && planValid ? "PREPARED_AWAITING_WORKER_BINDING" : "INVALID",
    requiredArtifactKinds,
    sourceId: source.id,
    planId: plan?.id ?? null,
    endpointBinding,
    workerEndpointBindingState: "EXTERNAL_UNVERIFIED",
    collectionAuthorization: "NONE",
    automaticExecution: false,
  };
}

function apiRemediationStatus(
  database: DatabaseSync,
  filters: FoundationalRemediationQueueSnapshotFilters,
  readinessTargetIds: ReadonlySet<string>,
): FoundationalApiRemediationStatus {
  const targets = listSourceCoverageTargets({
    jurisdiction: filters.jurisdiction,
    coverageTier: "FOUNDATIONAL",
    catalogState: "ACTIVE",
  }).filter(
    (target) =>
      readinessTargetIds.has(target.id) && (!filters.targetId || target.id === filters.targetId),
  );
  const items = targets
    .map((target) => ({ target, requiredArtifactKinds: requiredApiArtifactKinds(target) }))
    .filter((entry) => entry.requiredArtifactKinds.length > 0)
    .map((entry) =>
      apiRemediationItem(database, filters.workspaceId, entry.target, entry.requiredArtifactKinds),
    );
  return {
    requiredCount: items.length,
    preparedCount: items.filter((item) => item.state === "PREPARED_AWAITING_WORKER_BINDING").length,
    invalidCount: items.filter((item) => item.state === "INVALID").length,
    items,
  };
}

export function buildFoundationalRemediationQueueSnapshot(
  database: DatabaseSync,
  filters: FoundationalRemediationQueueSnapshotFilters,
  clock: () => Date = () => new Date(),
): FoundationalRemediationQueueSnapshot {
  const normalized = normalizeFilters(filters);
  const health = new SqliteCompatibilityAwareSupplyHealthRepository(database, clock).list({
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
    compatibilityState: item.compatibility?.state ?? "UNOBSERVED",
    compatibilityFreshness: item.compatibility?.freshness ?? "UNOBSERVED",
    compatibilityObservedAt: item.compatibility?.observedAt ?? null,
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
  const remediationQueue = buildFoundationalRemediationQueue(readiness, normalized.workspaceId);
  const apiRemediation = apiRemediationStatus(
    database,
    normalized,
    new Set(readiness.targets.map((target) => target.targetId)),
  );

  return assembleFoundationalRemediationQueueSnapshot({
    workspaceId: normalized.workspaceId,
    targetId: normalized.targetId,
    topK: normalized.topK,
    observedAt: clock().toISOString(),
    readiness,
    remediationQueue,
    apiRemediation,
  });
}
