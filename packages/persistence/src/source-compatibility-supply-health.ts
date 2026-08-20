import { DatabaseSync } from "node:sqlite";
import type {
  SourceCompatibilityObservation,
  SourceSupplyCompatibilityEvidenceProvenance,
  SourceSupplyCompatibilityHealth,
  SourceSupplyCompatibilityReprobeHealth,
  SourceSupplyCompatibilityReprobeState,
  SourceSupplyCompatibilityState,
  SourceSupplyGap,
  SourceSupplyHealthRecord,
  SourceSupplyOperationalTopologyHealth,
  SourceSupplyTopologyProjectionState,
} from "@markorbit/contracts";
import { RegistryError, RegistryValidationError } from "./index";
import { SqliteSourceCompatibilityObservationRepository } from "./source-compatibility-observations";
import { latestSourceCompatibilityReprobeExecutions } from "./source-compatibility-reprobe-execution-query";
import type { SourceCompatibilityReprobeExecution } from "./source-compatibility-reprobe-execution";
import { SqliteSourceOperationalTopologyRepository } from "./source-operational-topology";
import {
  SqliteSourceSupplyHealthRepository,
  summarizeSourceSupplyHealth,
  type SourceSupplyHealthFilters,
  type SourceSupplyHealthListResult,
  type SourceSupplyHealthRepository,
} from "./source-supply-health";

export const SOURCE_COMPATIBILITY_MAX_AGE_HOURS = 48;

const GIT_SHA = /^[a-f0-9]{40}$/iu;

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function requiredEvidenceText(context: Record<string, unknown>, field: string): string {
  const value = context[field];
  if (typeof value !== "string" || !value.trim()) {
    throw new RegistryValidationError(`Persisted compatibility evidence ${field} is invalid`);
  }
  return value.trim();
}

function compatibilityEvidenceProvenance(
  observation: SourceCompatibilityObservation,
): SourceSupplyCompatibilityEvidenceProvenance | null {
  const details = record(observation.details);
  if (!details || details.evidenceContext === undefined) return null;
  const context = record(details.evidenceContext);
  if (!context) {
    throw new RegistryValidationError("Persisted compatibility evidenceContext is invalid");
  }
  const commitSha = requiredEvidenceText(context, "commitSha").toLowerCase();
  const workflowSha = requiredEvidenceText(context, "workflowSha").toLowerCase();
  if (!GIT_SHA.test(commitSha) || !GIT_SHA.test(workflowSha)) {
    throw new RegistryValidationError("Persisted compatibility evidence git revision is invalid");
  }
  const sourceRef = context.sourceRef;
  const serverUrl = context.serverUrl;
  if (sourceRef !== undefined && (typeof sourceRef !== "string" || !sourceRef.trim())) {
    throw new RegistryValidationError("Persisted compatibility evidence sourceRef is invalid");
  }
  if (serverUrl !== undefined && (typeof serverUrl !== "string" || !serverUrl.trim())) {
    throw new RegistryValidationError("Persisted compatibility evidence serverUrl is invalid");
  }
  return {
    provider: requiredEvidenceText(context, "provider"),
    repository: requiredEvidenceText(context, "repository"),
    runId: requiredEvidenceText(context, "runId"),
    runAttempt: requiredEvidenceText(context, "runAttempt"),
    commitSha,
    workflowSha,
    workflow: requiredEvidenceText(context, "workflow"),
    eventName: requiredEvidenceText(context, "eventName"),
    sourceRef: typeof sourceRef === "string" ? sourceRef.trim() : null,
    serverUrl: typeof serverUrl === "string" ? serverUrl.trim() : null,
  };
}

function compatibilityHealth(
  observation: SourceCompatibilityObservation | undefined,
  observedAt: Date,
): SourceSupplyCompatibilityHealth {
  if (!observation) {
    return {
      state: "UNOBSERVED",
      freshness: "UNOBSERVED",
      observedAt: null,
      ageHours: null,
      maxAgeHours: SOURCE_COMPATIBILITY_MAX_AGE_HOURS,
      primaryUri: null,
      renderJavascript: null,
      errorCode: null,
      errorMessage: null,
      baselineTargetId: null,
      baselineState: null,
      evidenceProvenance: null,
    };
  }
  const observationMs = Date.parse(observation.observedAt);
  if (!Number.isFinite(observationMs)) {
    throw new RegistryValidationError(
      "Persisted source-compatibility observation timestamp is invalid",
    );
  }
  const ageHours = Math.max(0, (observedAt.getTime() - observationMs) / 3_600_000);
  return {
    state: observation.state,
    freshness: ageHours <= SOURCE_COMPATIBILITY_MAX_AGE_HOURS ? "FRESH" : "STALE",
    observedAt: observation.observedAt,
    ageHours: Number(ageHours.toFixed(2)),
    maxAgeHours: SOURCE_COMPATIBILITY_MAX_AGE_HOURS,
    primaryUri: observation.primaryUri,
    renderJavascript: observation.renderJavascript,
    errorCode: observation.errorCode ?? null,
    errorMessage: observation.errorMessage ?? null,
    baselineTargetId: observation.baselineTargetId ?? null,
    baselineState: observation.baselineState ?? null,
    evidenceProvenance: compatibilityEvidenceProvenance(observation),
  };
}

function compatibilityGap(state: SourceSupplyCompatibilityState): SourceSupplyGap | null {
  if (state === "DEGRADED") return "PRIMARY_PATH_DEGRADED";
  if (state === "BLOCKED") return "EXTERNAL_COMPATIBILITY_BLOCKED";
  return null;
}

export function applySourceCompatibilityHealth(
  item: SourceSupplyHealthRecord,
  compatibility: SourceSupplyCompatibilityHealth,
): SourceSupplyHealthRecord {
  const actionable = compatibility.freshness === "FRESH";
  const gap = actionable ? compatibilityGap(compatibility.state) : null;
  const gaps = gap && !item.gaps.includes(gap) ? [...item.gaps, gap] : [...item.gaps];
  const state =
    actionable && compatibility.state === "BLOCKED"
      ? "BLOCKED"
      : actionable && compatibility.state === "DEGRADED" && item.state === "READY"
        ? "DEGRADED"
        : item.state;
  return { ...item, compatibility, gaps, state };
}

export class SqliteCompatibilityAwareSupplyHealthRepository implements SourceSupplyHealthRepository {
  private readonly base: SqliteSourceSupplyHealthRepository;
  private readonly compatibility: SqliteSourceCompatibilityObservationRepository;

  constructor(
    database: DatabaseSync,
    private readonly clock: () => Date = () => new Date(),
  ) {
    this.base = new SqliteSourceSupplyHealthRepository(database, clock);
    this.compatibility = new SqliteSourceCompatibilityObservationRepository(database);
  }

  list(filters: SourceSupplyHealthFilters): SourceSupplyHealthListResult {
    const base = this.base.list({ ...filters, state: undefined });
    const observedAt = this.clock();
    const latest = this.compatibility.latest(base.items.map((item) => item.targetId));
    const items = base.items
      .map((item) =>
        applySourceCompatibilityHealth(
          item,
          compatibilityHealth(latest.get(item.targetId), observedAt),
        ),
      )
      .filter((item) => !filters.state || item.state === filters.state);
    const summary = summarizeSourceSupplyHealth(items);
    const byCompatibility: Record<SourceSupplyCompatibilityState, number> = {
      PASS: 0,
      DEGRADED: 0,
      BLOCKED: 0,
      UNOBSERVED: 0,
    };
    const byCompatibilityFreshness = {
      FRESH: 0,
      STALE: 0,
      UNOBSERVED: 0,
    };
    let compatibilityProvenanceObserved = 0;
    for (const item of items) {
      byCompatibility[item.compatibility?.state ?? "UNOBSERVED"] += 1;
      byCompatibilityFreshness[item.compatibility?.freshness ?? "UNOBSERVED"] += 1;
      if (item.compatibility?.evidenceProvenance) compatibilityProvenanceObserved += 1;
    }
    return {
      ...base,
      items,
      summary: {
        ...summary,
        byCompatibility,
        byCompatibilityFreshness,
        compatibilityProvenanceObserved,
      },
    };
  }
}

function topologyProjectionState(
  registeredSourceCount: number,
  projectedSourceCount: number,
): SourceSupplyTopologyProjectionState {
  if (registeredSourceCount === 0) return "UNREGISTERED";
  if (projectedSourceCount === registeredSourceCount) return "COMPLETE";
  if (projectedSourceCount === 0) return "FAILED";
  return "PARTIAL";
}

export function projectSourceSupplyOperationalTopology(
  sourceIds: readonly string[],
  topology: Pick<SqliteSourceOperationalTopologyRepository, "get">,
): SourceSupplyOperationalTopologyHealth {
  const uniqueSourceIds = [...new Set(sourceIds)].sort();
  let projectedSourceCount = 0;
  let sourceRegistryV2ObservedSourceCount = 0;
  let sourceGraphObservedSourceCount = 0;
  let explicitParentageObservedSourceCount = 0;
  let explicitAuthorityObservedSourceCount = 0;
  let entrypointCount = 0;
  let graphMappedEntrypointCount = 0;
  let artifactLinkedEntrypointCount = 0;
  let rawArtifactCount = 0;
  let discoveryProvenanceCount = 0;
  let relationshipCount = 0;
  const familyRootSourceIds = new Set<string>();
  const unprojectableSourceIds: string[] = [];

  for (const sourceId of uniqueSourceIds) {
    try {
      const observation = topology.get(sourceId);
      projectedSourceCount += 1;
      if (observation.coverage.sourceRegistryV2Observed) sourceRegistryV2ObservedSourceCount += 1;
      if (observation.coverage.sourceGraphObserved) sourceGraphObservedSourceCount += 1;
      if (observation.coverage.explicitParentageObserved) explicitParentageObservedSourceCount += 1;
      if (observation.coverage.explicitAuthorityObserved) explicitAuthorityObservedSourceCount += 1;
      entrypointCount += observation.entrypoints.length;
      graphMappedEntrypointCount += observation.entrypoints.filter(
        (entrypoint) => entrypoint.graphNodeId !== null,
      ).length;
      artifactLinkedEntrypointCount += observation.entrypoints.filter(
        (entrypoint) => entrypoint.artifactIds.length > 0,
      ).length;
      rawArtifactCount += observation.artifacts.length;
      discoveryProvenanceCount += observation.discoveryProvenance.length;
      relationshipCount += observation.relationships.length;
      familyRootSourceIds.add(observation.family.familyRootSourceId);
    } catch (error) {
      if (!(error instanceof RegistryError)) throw error;
      unprojectableSourceIds.push(sourceId);
    }
  }

  return {
    projectionState: topologyProjectionState(uniqueSourceIds.length, projectedSourceCount),
    registeredSourceCount: uniqueSourceIds.length,
    projectedSourceCount,
    unprojectableSourceIds,
    sourceRegistryV2ObservedSourceCount,
    sourceGraphObservedSourceCount,
    explicitParentageObservedSourceCount,
    explicitAuthorityObservedSourceCount,
    entrypointCount,
    graphMappedEntrypointCount,
    artifactLinkedEntrypointCount,
    rawArtifactCount,
    discoveryProvenanceCount,
    relationshipCount,
    familyRootSourceIds: [...familyRootSourceIds].sort(),
  };
}

function compatibilityReprobeHealth(
  execution: SourceCompatibilityReprobeExecution | undefined,
): SourceSupplyCompatibilityReprobeHealth {
  if (!execution) {
    return {
      state: "UNOBSERVED",
      executionId: null,
      intentId: null,
      startedAt: null,
      completedAt: null,
      observationId: null,
      observationObservedAt: null,
      observationState: null,
      errorCode: null,
      errorMessage: null,
    };
  }
  return {
    state: execution.status,
    executionId: execution.executionId,
    intentId: execution.intentId,
    startedAt: execution.startedAt,
    completedAt: execution.completedAt,
    observationId: execution.observationId,
    observationObservedAt: execution.observationObservedAt,
    observationState: execution.observationState,
    errorCode: execution.errorCode,
    errorMessage: execution.errorMessage,
  };
}

/**
 * Final read model for the Source Supply Health API. Compatibility remains the
 * only optional observation that can change READY/DEGRADED/BLOCKED state here.
 * Operational topology and re-probe lifecycle are evidence coverage only and
 * are deliberately neutral to health state, gaps, scheduling and collection
 * authorization.
 */
export class SqliteOperationalSupplyHealthRepository implements SourceSupplyHealthRepository {
  private readonly base: SqliteCompatibilityAwareSupplyHealthRepository;
  private readonly topology: SqliteSourceOperationalTopologyRepository;

  constructor(
    private readonly database: DatabaseSync,
    clock: () => Date = () => new Date(),
  ) {
    this.base = new SqliteCompatibilityAwareSupplyHealthRepository(database, clock);
    this.topology = new SqliteSourceOperationalTopologyRepository(database);
  }

  list(filters: SourceSupplyHealthFilters): SourceSupplyHealthListResult {
    const base = this.base.list(filters);
    const latestReprobes = latestSourceCompatibilityReprobeExecutions(this.database, {
      workspaceId: filters.workspaceId,
      targetIds: base.items.map((item) => item.targetId),
    });
    const items = base.items.map((item) => ({
      ...item,
      latestCompatibilityReprobe: compatibilityReprobeHealth(latestReprobes.get(item.targetId)),
      operationalTopology: projectSourceSupplyOperationalTopology(item.sourceIds, this.topology),
    }));
    const byTopologyProjection: Record<SourceSupplyTopologyProjectionState, number> = {
      UNREGISTERED: 0,
      COMPLETE: 0,
      PARTIAL: 0,
      FAILED: 0,
    };
    const byCompatibilityReprobe: Record<SourceSupplyCompatibilityReprobeState, number> = {
      UNOBSERVED: 0,
      STARTED: 0,
      COMPLETED: 0,
      FAILED: 0,
    };
    let topologySourceRegistryV2Observed = 0;
    let topologySourceGraphObserved = 0;
    let topologyExplicitParentageObserved = 0;
    let topologyExplicitAuthorityObserved = 0;

    for (const item of items) {
      const topologyHealth = item.operationalTopology;
      byTopologyProjection[topologyHealth.projectionState] += 1;
      byCompatibilityReprobe[item.latestCompatibilityReprobe.state] += 1;
      if (topologyHealth.sourceRegistryV2ObservedSourceCount > 0)
        topologySourceRegistryV2Observed += 1;
      if (topologyHealth.sourceGraphObservedSourceCount > 0) topologySourceGraphObserved += 1;
      if (topologyHealth.explicitParentageObservedSourceCount > 0)
        topologyExplicitParentageObserved += 1;
      if (topologyHealth.explicitAuthorityObservedSourceCount > 0)
        topologyExplicitAuthorityObserved += 1;
    }

    return {
      ...base,
      items,
      summary: {
        ...base.summary,
        byCompatibilityReprobe,
        byTopologyProjection,
        topologySourceRegistryV2Observed,
        topologySourceGraphObserved,
        topologyExplicitParentageObserved,
        topologyExplicitAuthorityObserved,
      },
    };
  }
}
