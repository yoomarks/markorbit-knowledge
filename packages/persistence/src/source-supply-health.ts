import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import {
  SOURCE_SUPPLY_HEALTH_PROTOCOL_VERSION,
  type ArtifactKind,
  type SourceCoverageCatalogState,
  type SourceCoverageChangeSensitivity,
  type SourceCoverageFamily,
  type SourceCoverageTier,
  type SourceDefinition,
  type SourceSupplyAcquisitionHealth,
  type SourceSupplyFreshnessHealth,
  type SourceSupplyGap,
  type SourceSupplyHealthRecord,
  type SourceSupplyHealthState,
  type SourceSupplyHealthSummary,
  type SourceSupplyLatestRun,
  type SourceSupplyNormalizationHealth,
  type SourceSupplyRetrievalHealth,
} from "@markorbit/contracts";
import { ensureExecutionLedger } from "./execution-ledger";
import { initializeRegistry, RegistryValidationError, SqliteSourceRepository } from "./index";
import { ensureRawArtifactRegistry } from "./raw-artifact-registry";
import { ensureRetrievalIndex } from "./retrieval-index";
import {
  evaluateSourceCoverage,
  listSourceCoverageTargets,
} from "./source-coverage-catalog";
import { ensureStagingContentRegistry } from "./staging-content-registry";

export const SOURCE_SUPPLY_MAX_AGE_HOURS: Record<SourceCoverageChangeSensitivity, number> = {
  HIGH: 48,
  NORMAL: 168,
  LOW: 720,
};

export type SourceSupplyHealthFilters = {
  workspaceId: string;
  jurisdiction?: string;
  family?: SourceCoverageFamily;
  coverageTier?: SourceCoverageTier;
  catalogState?: SourceCoverageCatalogState;
  targetId?: string;
  state?: SourceSupplyHealthState;
};

export type SourceSupplyHealthListResult = {
  protocolVersion: typeof SOURCE_SUPPLY_HEALTH_PROTOCOL_VERSION;
  observedAt: string;
  items: SourceSupplyHealthRecord[];
  summary: SourceSupplyHealthSummary;
};

export interface SourceSupplyHealthRepository {
  list(filters: SourceSupplyHealthFilters): SourceSupplyHealthListResult;
}

type CountRow = {
  total: number;
  latest_at: string | null;
};

type StagingCountRow = CountRow & {
  ready_count: number;
};

type RetrievalCountRow = {
  total: number;
  current_count: number;
  current_version: number | null;
  current_chunk_count: number;
  latest_indexed_at: string | null;
};

function listWorkspaceSources(
  database: DatabaseSync,
  workspaceId: string,
): SourceDefinition[] {
  const repository = new SqliteSourceRepository(database);
  const items: SourceDefinition[] = [];
  let offset = 0;
  while (true) {
    const page = repository.list({ workspaceId, limit: 100, offset });
    items.push(...page.items);
    offset += page.items.length;
    if (offset >= page.total || page.items.length === 0) return items;
  }
}

function inClause(sourceIds: readonly string[]): { sql: string; values: SQLInputValue[] } {
  if (sourceIds.length === 0) return { sql: "NULL", values: [] };
  return { sql: sourceIds.map(() => "?").join(","), values: [...sourceIds] };
}

function latestRun(database: DatabaseSync, workspaceId: string, sourceIds: string[]): SourceSupplyLatestRun {
  if (sourceIds.length === 0) return null;
  const sources = inClause(sourceIds);
  const row = database
    .prepare(
      `SELECT id, status, requested_at, updated_at
       FROM collection_runs
       WHERE workspace_id = ? AND source_id IN (${sources.sql})
       ORDER BY created_at DESC, id DESC
       LIMIT 1`,
    )
    .get(workspaceId, ...sources.values) as
    | { id: string; status: string; requested_at: string; updated_at: string }
    | undefined;
  if (!row) return null;
  return {
    runId: row.id,
    status: row.status,
    requestedAt: row.requested_at,
    updatedAt: row.updated_at,
  };
}

function acquisitionHealth(
  database: DatabaseSync,
  workspaceId: string,
  sourceIds: string[],
): SourceSupplyAcquisitionHealth {
  if (sourceIds.length === 0) {
    return { artifactCount: 0, artifactKinds: [], latestArtifactAt: null };
  }
  const sources = inClause(sourceIds);
  const row = database
    .prepare(
      `SELECT COUNT(*) AS total, MAX(created_at) AS latest_at
       FROM raw_artifacts
       WHERE workspace_id = ? AND source_id IN (${sources.sql}) AND status = 'REGISTERED'`,
    )
    .get(workspaceId, ...sources.values) as CountRow;
  const kinds = database
    .prepare(
      `SELECT DISTINCT artifact_kind
       FROM raw_artifacts
       WHERE workspace_id = ? AND source_id IN (${sources.sql}) AND status = 'REGISTERED'
       ORDER BY artifact_kind`,
    )
    .all(workspaceId, ...sources.values)
    .map((item) => String((item as { artifact_kind: string }).artifact_kind) as ArtifactKind);
  return {
    artifactCount: Number(row.total),
    artifactKinds: kinds,
    latestArtifactAt: row.latest_at,
  };
}

function normalizationHealth(
  database: DatabaseSync,
  workspaceId: string,
  sourceIds: string[],
): SourceSupplyNormalizationHealth {
  if (sourceIds.length === 0) {
    return {
      stagingDocumentCount: 0,
      readyDocumentCount: 0,
      latestDocumentAt: null,
      latestStatus: null,
    };
  }
  const sources = inClause(sourceIds);
  const row = database
    .prepare(
      `SELECT COUNT(*) AS total,
              COALESCE(SUM(CASE WHEN status = 'READY' THEN 1 ELSE 0 END), 0) AS ready_count,
              MAX(created_at) AS latest_at
       FROM staging_documents
       WHERE workspace_id = ? AND source_id IN (${sources.sql})`,
    )
    .get(workspaceId, ...sources.values) as StagingCountRow;
  const latest = database
    .prepare(
      `SELECT status
       FROM staging_documents
       WHERE workspace_id = ? AND source_id IN (${sources.sql})
       ORDER BY created_at DESC, id DESC
       LIMIT 1`,
    )
    .get(workspaceId, ...sources.values) as { status: string } | undefined;
  return {
    stagingDocumentCount: Number(row.total),
    readyDocumentCount: Number(row.ready_count),
    latestDocumentAt: row.latest_at,
    latestStatus: latest?.status ?? null,
  };
}

function retrievalHealth(
  database: DatabaseSync,
  workspaceId: string,
  sourceIds: string[],
): SourceSupplyRetrievalHealth {
  if (sourceIds.length === 0) {
    return {
      indexedDocumentCount: 0,
      currentDocumentCount: 0,
      currentArtifactVersion: null,
      currentChunkCount: 0,
      latestIndexedAt: null,
    };
  }
  const sources = inClause(sourceIds);
  const row = database
    .prepare(
      `SELECT COUNT(*) AS total,
              COALESCE(SUM(CASE WHEN is_current = 1 THEN 1 ELSE 0 END), 0) AS current_count,
              MAX(CASE WHEN is_current = 1 THEN artifact_version END) AS current_version,
              COALESCE(SUM(CASE WHEN is_current = 1 THEN chunk_count ELSE 0 END), 0) AS current_chunk_count,
              MAX(indexed_at) AS latest_indexed_at
       FROM retrieval_documents
       WHERE workspace_id = ? AND source_id IN (${sources.sql})`,
    )
    .get(workspaceId, ...sources.values) as RetrievalCountRow;
  return {
    indexedDocumentCount: Number(row.total),
    currentDocumentCount: Number(row.current_count),
    currentArtifactVersion: row.current_version === null ? null : Number(row.current_version),
    currentChunkCount: Number(row.current_chunk_count),
    latestIndexedAt: row.latest_indexed_at,
  };
}

export function deriveSourceSupplyFreshness(
  lastObservedAt: string | null,
  changeSensitivity: SourceCoverageChangeSensitivity,
  observedAt: Date,
): SourceSupplyFreshnessHealth {
  const maxAgeHours = SOURCE_SUPPLY_MAX_AGE_HOURS[changeSensitivity];
  if (!lastObservedAt) {
    return { state: "UNOBSERVED", lastObservedAt: null, ageHours: null, maxAgeHours };
  }
  const observedMs = Date.parse(lastObservedAt);
  if (!Number.isFinite(observedMs)) {
    throw new RegistryValidationError("Persisted source-supply observation timestamp is invalid");
  }
  const ageHours = Math.max(0, (observedAt.getTime() - observedMs) / 3_600_000);
  return {
    state: ageHours <= maxAgeHours ? "FRESH" : "STALE",
    lastObservedAt,
    ageHours: Number(ageHours.toFixed(2)),
    maxAgeHours,
  };
}

export function deriveSourceSupplyGaps(input: {
  registered: boolean;
  latestRun: SourceSupplyLatestRun;
  acquisition: SourceSupplyAcquisitionHealth;
  normalization: SourceSupplyNormalizationHealth;
  retrieval: SourceSupplyRetrievalHealth;
  freshness: SourceSupplyFreshnessHealth;
}): SourceSupplyGap[] {
  const gaps: SourceSupplyGap[] = [];
  if (!input.registered) gaps.push("SOURCE_UNREGISTERED");
  if (input.registered && input.acquisition.artifactCount === 0) gaps.push("NO_ACQUISITION_EVIDENCE");
  if (input.latestRun?.status === "FAILED") gaps.push("LATEST_COLLECTION_FAILED");
  if (input.freshness.state === "STALE") gaps.push("STALE_ACQUISITION");
  if (input.registered && input.normalization.readyDocumentCount === 0) {
    gaps.push("NO_NORMALIZED_DOCUMENT");
  }
  if (input.registered && input.retrieval.currentDocumentCount === 0) {
    gaps.push("NO_RETRIEVAL_DOCUMENT");
  }
  return gaps;
}

export function deriveSourceSupplyState(
  registered: boolean,
  acquisition: SourceSupplyAcquisitionHealth,
  gaps: readonly SourceSupplyGap[],
): SourceSupplyHealthState {
  if (!registered || acquisition.artifactCount === 0) return "BLOCKED";
  return gaps.length === 0 ? "READY" : "DEGRADED";
}

export function summarizeSourceSupplyHealth(
  items: readonly SourceSupplyHealthRecord[],
): SourceSupplyHealthSummary {
  const summary: SourceSupplyHealthSummary = {
    total: items.length,
    byState: { READY: 0, DEGRADED: 0, BLOCKED: 0 },
    registered: 0,
    acquisitionObserved: 0,
    normalizedAvailable: 0,
    retrievalAvailable: 0,
    byFreshness: { FRESH: 0, STALE: 0, UNOBSERVED: 0 },
    gapCounts: {},
  };
  for (const item of items) {
    summary.byState[item.state] += 1;
    if (item.registrationState === "REGISTERED") summary.registered += 1;
    if (item.acquisition.artifactCount > 0) summary.acquisitionObserved += 1;
    if (item.normalization.readyDocumentCount > 0) summary.normalizedAvailable += 1;
    if (item.retrieval.currentDocumentCount > 0) summary.retrievalAvailable += 1;
    summary.byFreshness[item.freshness.state] += 1;
    for (const gap of item.gaps) summary.gapCounts[gap] = (summary.gapCounts[gap] ?? 0) + 1;
  }
  return summary;
}

export class SqliteSourceSupplyHealthRepository implements SourceSupplyHealthRepository {
  constructor(
    private readonly database: DatabaseSync,
    private readonly clock: () => Date = () => new Date(),
  ) {
    initializeRegistry(database);
    ensureExecutionLedger(database);
    ensureRawArtifactRegistry(database);
    ensureStagingContentRegistry(database);
    ensureRetrievalIndex(database);
  }

  list(filters: SourceSupplyHealthFilters): SourceSupplyHealthListResult {
    const workspaceId = filters.workspaceId.trim();
    if (!workspaceId) throw new RegistryValidationError("workspaceId is required");
    const observedAt = this.clock();
    const targets = listSourceCoverageTargets({
      jurisdiction: filters.jurisdiction,
      family: filters.family,
      coverageTier: filters.coverageTier,
      catalogState: filters.catalogState,
    }).filter((target) => !filters.targetId || target.id === filters.targetId);
    const sources = listWorkspaceSources(this.database, workspaceId);
    const registrations = new Map(
      evaluateSourceCoverage(sources, targets).map((registration) => [
        registration.targetId,
        registration,
      ]),
    );

    const items = targets
      .map((target): SourceSupplyHealthRecord => {
        const registration = registrations.get(target.id);
        const sourceIds = registration?.sourceIds ?? [];
        const registered = sourceIds.length > 0;
        const run = latestRun(this.database, workspaceId, sourceIds);
        const acquisition = acquisitionHealth(this.database, workspaceId, sourceIds);
        const normalization = normalizationHealth(this.database, workspaceId, sourceIds);
        const retrieval = retrievalHealth(this.database, workspaceId, sourceIds);
        const freshness = deriveSourceSupplyFreshness(
          acquisition.latestArtifactAt,
          target.changeSensitivity,
          observedAt,
        );
        const gaps = deriveSourceSupplyGaps({
          registered,
          latestRun: run,
          acquisition,
          normalization,
          retrieval,
          freshness,
        });
        return {
          protocolVersion: SOURCE_SUPPLY_HEALTH_PROTOCOL_VERSION,
          objectType: "SOURCE_SUPPLY_HEALTH",
          targetId: target.id,
          workspaceId,
          jurisdiction: target.jurisdiction,
          family: target.family,
          coverageTier: target.coverageTier,
          catalogState: target.catalogState,
          changeSensitivity: target.changeSensitivity,
          displayName: target.displayName,
          canonicalUri: target.canonicalUri,
          registrationState: registered ? "REGISTERED" : "UNREGISTERED",
          sourceIds,
          latestRun: run,
          acquisition,
          normalization,
          retrieval,
          freshness,
          gaps,
          state: deriveSourceSupplyState(registered, acquisition, gaps),
          observedAt: observedAt.toISOString(),
        };
      })
      .filter((item) => !filters.state || item.state === filters.state);

    return {
      protocolVersion: SOURCE_SUPPLY_HEALTH_PROTOCOL_VERSION,
      observedAt: observedAt.toISOString(),
      items,
      summary: summarizeSourceSupplyHealth(items),
    };
  }
}
