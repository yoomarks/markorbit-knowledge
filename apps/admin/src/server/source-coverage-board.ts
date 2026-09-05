import type { DatabaseSync } from "node:sqlite";
import { SqliteOperationalSupplyHealthRepository } from "@markorbit/persistence/source-compatibility-supply-health";
import {
  evaluateSourceCoverage,
  listSourceCoverageTargets,
} from "@markorbit/persistence/source-coverage";
import {
  deriveSourceCoverageBoundary,
  latestEvidenceTimestamp,
  type SourceCoverageBoundaryStatus,
} from "@/lib/source-coverage-board-model";
import { listAllWorkspaceSources } from "./source-pagination";
import { getRegistryDatabase, getSourceRepository } from "./source-registry";

type LatestArtifactEvidence = {
  artifactId: string;
  observedAt: string;
};

type LatestChangeEvidence = {
  sourceId: string;
  documentId: string;
  version: number;
  observedAt: string;
  addedSections: number;
  removedSections: number;
  modifiedSections: number;
};

export type SourceCoverageBoardRow = {
  targetId: string;
  jurisdiction: string;
  authorityName: string;
  authorityLevel: string;
  family: string;
  displayName: string;
  coverageTier: string;
  catalogState: string;
  canonicalUri: string;
  coverageStatus: SourceCoverageBoundaryStatus;
  coverageReasons: string[];
  sources: Array<{ id: string; name: string; status: string }>;
  acquisition: {
    mode: string;
    expectedArtifactKinds: string[];
    observedArtifactKinds: string[];
    missingExpectedArtifactKinds: string[];
    latestSuccessfulAt: string | null;
    latestArtifactId: string | null;
    renderJavascriptHint: boolean;
    fetchAttachmentsHint: boolean;
  };
  lastCheck: {
    at: string | null;
    runId: string | null;
    runStatus: string | null;
    compatibilityState: string;
    compatibilityFreshness: string;
  };
  lastObjectiveChange: LatestChangeEvidence | null;
  health: {
    state: string;
    freshness: string;
    gaps: string[];
  };
  limitationNote: string | null;
};

export type SourceCoverageBoard = {
  workspaceId: string;
  observedAt: string;
  rows: SourceCoverageBoardRow[];
  summary: {
    total: number;
    complete: number;
    partial: number;
    unknown: number;
    requiringAttention: number;
  };
};

function tableExists(database: DatabaseSync, tableName: string): boolean {
  return Boolean(
    database
      .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?")
      .get(tableName),
  );
}

function loadLatestArtifacts(
  database: DatabaseSync,
  workspaceId: string,
): Map<string, LatestArtifactEvidence> {
  if (!tableExists(database, "raw_artifacts")) return new Map();
  const rows = database
    .prepare(
      `SELECT source_id AS sourceId, id AS artifactId, created_at AS observedAt
       FROM (
         SELECT source_id, id, created_at,
                ROW_NUMBER() OVER (PARTITION BY source_id ORDER BY created_at DESC, id DESC) AS row_number
         FROM raw_artifacts
         WHERE workspace_id = ? AND status = 'REGISTERED'
       )
       WHERE row_number = 1`,
    )
    .all(workspaceId) as Array<{ sourceId: string; artifactId: string; observedAt: string }>;
  return new Map(rows.map((row) => [row.sourceId, row]));
}

function loadLatestChanges(
  database: DatabaseSync,
  workspaceId: string,
): Map<string, LatestChangeEvidence> {
  if (!tableExists(database, "document_change_events")) return new Map();
  const rows = database
    .prepare(
      `SELECT source_id AS sourceId,
              document_id AS documentId,
              to_version AS version,
              observed_at AS observedAt,
              added_sections AS addedSections,
              removed_sections AS removedSections,
              modified_sections AS modifiedSections
       FROM (
         SELECT *, ROW_NUMBER() OVER (
           PARTITION BY source_id ORDER BY observed_at DESC, sequence DESC
         ) AS row_number
         FROM document_change_events
         WHERE workspace_id = ? AND change_kind = 'UPDATED'
       )
       WHERE row_number = 1`,
    )
    .all(workspaceId) as LatestChangeEvidence[];
  return new Map(rows.map((row) => [row.sourceId, row]));
}

function latestForSources<T extends { observedAt: string }>(
  sourceIds: readonly string[],
  values: Map<string, T>,
): T | null {
  let latest: T | null = null;
  for (const sourceId of sourceIds) {
    const candidate = values.get(sourceId);
    if (candidate && (!latest || candidate.observedAt > latest.observedAt)) latest = candidate;
  }
  return latest;
}

export function getSourceCoverageBoard(workspaceId: string): SourceCoverageBoard {
  const database = getRegistryDatabase();
  const sources = listAllWorkspaceSources(getSourceRepository(), workspaceId);
  const targets = listSourceCoverageTargets().filter((target) => target.catalogState !== "RETIRED");
  const healthResult = new SqliteOperationalSupplyHealthRepository(database).list({ workspaceId });
  const healthByTarget = new Map(healthResult.items.map((health) => [health.targetId, health]));
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  const latestArtifacts = loadLatestArtifacts(database, workspaceId);
  const latestChanges = loadLatestChanges(database, workspaceId);
  const registrations = new Map(
    evaluateSourceCoverage(sources, targets).map((registration) => [
      registration.targetId,
      registration,
    ]),
  );

  const rows = targets.map((target) => {
    const registration = registrations.get(target.id)!;
    const registeredSources = registration.sourceIds
      .map((sourceId) => sourceById.get(sourceId))
      .filter((source) => source !== undefined);
    const health = healthByTarget.get(target.id);
    const artifact = latestForSources(registration.sourceIds, latestArtifacts);
    const change = latestForSources(registration.sourceIds, latestChanges);
    const boundary = deriveSourceCoverageBoundary({
      registrationState: registration.state,
      sourceStatuses: registeredSources.map((source) => source.status),
      supplyState: health?.state ?? "BLOCKED",
      gaps: [...(health?.gaps ?? ["SOURCE_UNREGISTERED"])],
      acquisitionArtifactCount: health?.acquisition.artifactCount ?? 0,
      observedArtifactKinds: [...(health?.acquisition.artifactKinds ?? [])],
      expectedArtifactKinds: [...target.acquisition.expectedArtifactKinds],
      knownLimitation: Boolean(target.notes?.trim()),
    });

    return {
      targetId: target.id,
      jurisdiction: target.jurisdiction,
      authorityName: target.authorityName,
      authorityLevel: target.authorityLevel,
      family: target.family,
      displayName: target.displayName,
      coverageTier: target.coverageTier,
      catalogState: target.catalogState,
      canonicalUri: target.canonicalUri,
      coverageStatus: boundary.status,
      coverageReasons: boundary.reasons,
      sources: registeredSources.map((source) => ({
        id: source.id,
        name: source.name,
        status: source.status,
      })),
      acquisition: {
        mode: target.acquisition.mode,
        expectedArtifactKinds: [...target.acquisition.expectedArtifactKinds],
        observedArtifactKinds: [...(health?.acquisition.artifactKinds ?? [])],
        missingExpectedArtifactKinds: boundary.missingExpectedArtifactKinds,
        latestSuccessfulAt: health?.acquisition.latestArtifactAt ?? null,
        latestArtifactId: artifact?.artifactId ?? null,
        renderJavascriptHint: target.acquisition.renderJavascriptHint,
        fetchAttachmentsHint: target.acquisition.fetchAttachmentsHint,
      },
      lastCheck: {
        at: latestEvidenceTimestamp(
          health?.latestRun?.updatedAt,
          health?.compatibility?.observedAt,
          health?.latestCompatibilityReprobe?.completedAt,
          health?.latestCompatibilityReprobe?.startedAt,
        ),
        runId: health?.latestRun?.runId ?? null,
        runStatus: health?.latestRun?.status ?? null,
        compatibilityState: health?.compatibility?.state ?? "UNOBSERVED",
        compatibilityFreshness: health?.compatibility?.freshness ?? "UNOBSERVED",
      },
      lastObjectiveChange: change,
      health: {
        state: health?.state ?? "BLOCKED",
        freshness: health?.freshness.state ?? "UNOBSERVED",
        gaps: [...(health?.gaps ?? ["SOURCE_UNREGISTERED"])],
      },
      limitationNote: target.notes?.trim() || null,
    } satisfies SourceCoverageBoardRow;
  });

  rows.sort(
    (left, right) =>
      left.jurisdiction.localeCompare(right.jurisdiction) ||
      left.authorityName.localeCompare(right.authorityName) ||
      left.family.localeCompare(right.family) ||
      left.displayName.localeCompare(right.displayName),
  );

  const complete = rows.filter((row) => row.coverageStatus === "COMPLETE").length;
  const partial = rows.filter((row) => row.coverageStatus === "PARTIAL").length;
  const unknown = rows.filter((row) => row.coverageStatus === "UNKNOWN").length;

  return {
    workspaceId,
    observedAt: healthResult.observedAt,
    rows,
    summary: {
      total: rows.length,
      complete,
      partial,
      unknown,
      requiringAttention: partial + unknown,
    },
  };
}
