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
import { evaluateSourceCoverage, listSourceCoverageTargets } from "./source-coverage-catalog";
import { ensureStagingContentRegistry } from "./staging-content-registry";

export const SOURCE_SUPPLY_MAX_AGE_HOURS: Record<SourceCoverageChangeSensitivity, number> = {
  HIGH: 48,
  NORMAL: 168,
  LOW: 720,
};

const SQL_CHUNK_SIZE = 400;

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

type LatestRunSnapshot = { run: SourceSupplyLatestRun; createdAt: string; id: string };
type NormalizationSnapshot = { health: SourceSupplyNormalizationHealth; latestId: string | null };
type SupplySnapshot = {
  runs: Map<string, LatestRunSnapshot>;
  acquisition: Map<string, SourceSupplyAcquisitionHealth>;
  normalization: Map<string, NormalizationSnapshot>;
  retrieval: Map<string, SourceSupplyRetrievalHealth>;
};

function listWorkspaceSources(database: DatabaseSync, workspaceId: string): SourceDefinition[] {
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

function chunks(sourceIds: readonly string[]): string[][] {
  const unique = [...new Set(sourceIds)];
  const result: string[][] = [];
  for (let offset = 0; offset < unique.length; offset += SQL_CHUNK_SIZE) {
    result.push(unique.slice(offset, offset + SQL_CHUNK_SIZE));
  }
  return result;
}

function inClause(sourceIds: readonly string[]): { sql: string; values: SQLInputValue[] } {
  return { sql: sourceIds.map(() => "?").join(","), values: [...sourceIds] };
}

function loadSnapshot(
  database: DatabaseSync,
  workspaceId: string,
  sourceIds: readonly string[],
): SupplySnapshot {
  const snapshot: SupplySnapshot = {
    runs: new Map(),
    acquisition: new Map(),
    normalization: new Map(),
    retrieval: new Map(),
  };

  for (const sourceIdChunk of chunks(sourceIds)) {
    const sourceClause = inClause(sourceIdChunk);

    const runRows = database
      .prepare(
        `SELECT source_id, id, status, requested_at, updated_at, created_at
         FROM (
           SELECT source_id, id, status, requested_at, updated_at, created_at,
                  ROW_NUMBER() OVER (
                    PARTITION BY source_id ORDER BY created_at DESC, id DESC
                  ) AS row_number
           FROM collection_runs
           WHERE workspace_id = ? AND source_id IN (${sourceClause.sql})
         )
         WHERE row_number = 1`,
      )
      .all(workspaceId, ...sourceClause.values) as Array<{
      source_id: string;
      id: string;
      status: string;
      requested_at: string;
      updated_at: string;
      created_at: string;
    }>;
    for (const row of runRows) {
      snapshot.runs.set(row.source_id, {
        run: {
          runId: row.id,
          status: row.status,
          requestedAt: row.requested_at,
          updatedAt: row.updated_at,
        },
        createdAt: row.created_at,
        id: row.id,
      });
    }

    const artifactRows = database
      .prepare(
        `SELECT source_id,
                COUNT(*) AS total,
                MAX(created_at) AS latest_at,
                GROUP_CONCAT(DISTINCT artifact_kind) AS artifact_kinds
         FROM raw_artifacts
         WHERE workspace_id = ?
           AND source_id IN (${sourceClause.sql})
           AND status = 'REGISTERED'
         GROUP BY source_id`,
      )
      .all(workspaceId, ...sourceClause.values) as Array<{
      source_id: string;
      total: number;
      latest_at: string | null;
      artifact_kinds: string | null;
    }>;
    for (const row of artifactRows) {
      const artifactKinds = (row.artifact_kinds ?? "")
        .split(",")
        .filter(Boolean)
        .map((kind) => kind as ArtifactKind)
        .sort();
      snapshot.acquisition.set(row.source_id, {
        artifactCount: Number(row.total),
        artifactKinds,
        latestArtifactAt: row.latest_at,
      });
    }

    const stagingRows = database
      .prepare(
        `WITH ranked AS (
           SELECT source_id, status, created_at, id,
                  ROW_NUMBER() OVER (
                    PARTITION BY source_id ORDER BY created_at DESC, id DESC
                  ) AS row_number
           FROM staging_documents
           WHERE workspace_id = ? AND source_id IN (${sourceClause.sql})
         ), aggregated AS (
           SELECT source_id,
                  COUNT(*) AS total,
                  COALESCE(SUM(CASE WHEN status = 'READY' THEN 1 ELSE 0 END), 0) AS ready_count,
                  MAX(created_at) AS latest_at
           FROM staging_documents
           WHERE workspace_id = ? AND source_id IN (${sourceClause.sql})
           GROUP BY source_id
         )
         SELECT aggregated.source_id, aggregated.total, aggregated.ready_count,
                aggregated.latest_at, ranked.status AS latest_status, ranked.id AS latest_id
         FROM aggregated
         LEFT JOIN ranked
           ON ranked.source_id = aggregated.source_id AND ranked.row_number = 1`,
      )
      .all(
        workspaceId,
        ...sourceClause.values,
        workspaceId,
        ...sourceClause.values,
      ) as Array<{
      source_id: string;
      total: number;
      ready_count: number;
      latest_at: string | null;
      latest_status: string | null;
      latest_id: string | null;
    }>;
    for (const row of stagingRows) {
      snapshot.normalization.set(row.source_id, {
        health: {
          stagingDocumentCount: Number(row.total),
          readyDocumentCount: Number(row.ready_count),
          latestDocumentAt: row.latest_at,
          latestStatus: row.latest_status,
        },
        latestId: row.latest_id,
      });
    }

    const retrievalRows = database
      .prepare(
        `SELECT source_id,
                COUNT(*) AS total,
                COALESCE(SUM(CASE WHEN is_current = 1 THEN 1 ELSE 0 END), 0) AS current_count,
                MAX(CASE WHEN is_current = 1 THEN artifact_version END) AS current_version,
                COALESCE(SUM(CASE WHEN is_current = 1 THEN chunk_count ELSE 0 END), 0) AS current_chunk_count,
                MAX(indexed_at) AS latest_indexed_at
         FROM retrieval_documents
         WHERE workspace_id = ? AND source_id IN (${sourceClause.sql})
         GROUP BY source_id`,
      )
      .all(workspaceId, ...sourceClause.values) as Array<{
      source_id: string;
      total: number;
      current_count: number;
      current_version: number | null;
      current_chunk_count: number;
      latest_indexed_at: string | null;
    }>;
    for (const row of retrievalRows) {
      snapshot.retrieval.set(row.source_id, {
        indexedDocumentCount: Number(row.total),
        currentDocumentCount: Number(row.current_count),
        currentArtifactVersion: row.current_version === null ? null : Number(row.current_version),
        currentChunkCount: Number(row.current_chunk_count),
        latestIndexedAt: row.latest_indexed_at,
      });
    }
  }

  return snapshot;
}

function isLater(
  candidateAt: string,
  candidateId: string,
  currentAt: string | null,
  currentId: string | null,
): boolean {
  return (
    currentAt === null ||
    candidateAt > currentAt ||
    (candidateAt === currentAt && candidateId > (currentId ?? ""))
  );
}

function latestRun(sourceIds: readonly string[], snapshot: SupplySnapshot): SourceSupplyLatestRun {
  let current: LatestRunSnapshot | null = null;
  for (const sourceId of sourceIds) {
    const candidate = snapshot.runs.get(sourceId);
    if (
      candidate &&
      isLater(candidate.createdAt, candidate.id, current?.createdAt ?? null, current?.id ?? null)
    ) {
      current = candidate;
    }
  }
  return current?.run ?? null;
}

function acquisitionHealth(
  sourceIds: readonly string[],
  snapshot: SupplySnapshot,
): SourceSupplyAcquisitionHealth {
  let artifactCount = 0;
  let latestArtifactAt: string | null = null;
  const artifactKinds = new Set<ArtifactKind>();
  for (const sourceId of sourceIds) {
    const current = snapshot.acquisition.get(sourceId);
    if (!current) continue;
    artifactCount += current.artifactCount;
    current.artifactKinds.forEach((kind) => artifactKinds.add(kind));
    if (
      current.latestArtifactAt &&
      (!latestArtifactAt || current.latestArtifactAt > latestArtifactAt)
    ) {
      latestArtifactAt = current.latestArtifactAt;
    }
  }
  return { artifactCount, artifactKinds: [...artifactKinds].sort(), latestArtifactAt };
}

function normalizationHealth(
  sourceIds: readonly string[],
  snapshot: SupplySnapshot,
): SourceSupplyNormalizationHealth {
  let stagingDocumentCount = 0;
  let readyDocumentCount = 0;
  let latestDocumentAt: string | null = null;
  let latestStatus: string | null = null;
  let latestId: string | null = null;
  for (const sourceId of sourceIds) {
    const current = snapshot.normalization.get(sourceId);
    if (!current) continue;
    stagingDocumentCount += current.health.stagingDocumentCount;
    readyDocumentCount += current.health.readyDocumentCount;
    if (
      current.health.latestDocumentAt &&
      isLater(
        current.health.latestDocumentAt,
        current.latestId ?? "",
        latestDocumentAt,
        latestId,
      )
    ) {
      latestDocumentAt = current.health.latestDocumentAt;
      latestStatus = current.health.latestStatus;
      latestId = current.latestId;
    }
  }
  return { stagingDocumentCount, readyDocumentCount, latestDocumentAt, latestStatus };
}

function retrievalHealth(
  sourceIds: readonly string[],
  snapshot: SupplySnapshot,
): SourceSupplyRetrievalHealth {
  let indexedDocumentCount = 0;
  let currentDocumentCount = 0;
  let currentArtifactVersion: number | null = null;
  let currentChunkCount = 0;
  let latestIndexedAt: string | null = null;
  for (const sourceId of sourceIds) {
    const current = snapshot.retrieval.get(sourceId);
    if (!current) continue;
    indexedDocumentCount += current.indexedDocumentCount;
    currentDocumentCount += current.currentDocumentCount;
    currentChunkCount += current.currentChunkCount;
    if (
      current.currentArtifactVersion !== null &&
      (currentArtifactVersion === null || current.currentArtifactVersion > currentArtifactVersion)
    ) {
      currentArtifactVersion = current.currentArtifactVersion;
    }
    if (
      current.latestIndexedAt &&
      (!latestIndexedAt || current.latestIndexedAt > latestIndexedAt)
    ) {
      latestIndexedAt = current.latestIndexedAt;
    }
  }
  return {
    indexedDocumentCount,
    currentDocumentCount,
    currentArtifactVersion,
    currentChunkCount,
    latestIndexedAt,
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
  if (input.registered && input.acquisition.artifactCount === 0)
    gaps.push("NO_ACQUISITION_EVIDENCE");
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
    const registeredSourceIds = [
      ...new Set([...registrations.values()].flatMap((registration) => registration.sourceIds)),
    ];
    const snapshot = loadSnapshot(this.database, workspaceId, registeredSourceIds);

    const items = targets
      .map((target): SourceSupplyHealthRecord => {
        const registration = registrations.get(target.id);
        const sourceIds = registration?.sourceIds ?? [];
        const registered = sourceIds.length > 0;
        const run = latestRun(sourceIds, snapshot);
        const acquisition = acquisitionHealth(sourceIds, snapshot);
        const normalization = normalizationHealth(sourceIds, snapshot);
        const retrieval = retrievalHealth(sourceIds, snapshot);
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
