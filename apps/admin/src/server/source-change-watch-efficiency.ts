import type { DatabaseSync } from "node:sqlite";
import { RegistryValidationError } from "@markorbit/persistence";

export type SourceChangeWatchEfficiency = {
  sourceId: string;
  sourceName: string;
  completedRuns: number;
  metadataOnlyRuns: number;
  http304NoBodyRuns: number;
  bodyComparedNoChangeRuns: number;
  artifactProducingRuns: number;
  noChangeRatePercent: number;
  activeValidatorEndpoints: number;
  latestCompletedAt: string | null;
  latestValidatorAt: string | null;
};

export type SourceChangeWatchEfficiencySummary = {
  windowHours: number;
  completedRuns: number;
  metadataOnlyRuns: number;
  http304NoBodyRuns: number;
  bodyComparedNoChangeRuns: number;
  artifactProducingRuns: number;
  noChangeRatePercent: number;
  activeValidatorSources: number;
  activeValidatorEndpoints: number;
  latestValidatorAt: string | null;
  sources: SourceChangeWatchEfficiency[];
};

const DEFAULT_WINDOW_HOURS = 24;
const DEFAULT_LIMIT = 8;
const MAX_WINDOW_HOURS = 24 * 30;
const MAX_LIMIT = 50;

function tableExists(database: DatabaseSync, tableName: string): boolean {
  return Boolean(
    database
      .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?")
      .get(tableName),
  );
}

function percentage(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 1_000) / 10;
}

function emptySummary(windowHours: number): SourceChangeWatchEfficiencySummary {
  return {
    windowHours,
    completedRuns: 0,
    metadataOnlyRuns: 0,
    http304NoBodyRuns: 0,
    bodyComparedNoChangeRuns: 0,
    artifactProducingRuns: 0,
    noChangeRatePercent: 0,
    activeValidatorSources: 0,
    activeValidatorEndpoints: 0,
    latestValidatorAt: null,
    sources: [],
  };
}

export function listSourceChangeWatchEfficiency(
  database: DatabaseSync,
  workspaceId: string,
  options: { windowHours?: number; limit?: number; observedAt?: Date } = {},
): SourceChangeWatchEfficiencySummary {
  const normalizedWorkspaceId = workspaceId.trim();
  if (!normalizedWorkspaceId) throw new RegistryValidationError("workspaceId is required");

  const windowHours = options.windowHours ?? DEFAULT_WINDOW_HOURS;
  if (!Number.isInteger(windowHours) || windowHours < 1 || windowHours > MAX_WINDOW_HOURS) {
    throw new RegistryValidationError(
      `windowHours must be an integer from 1 to ${MAX_WINDOW_HOURS}`,
    );
  }
  const limit = options.limit ?? DEFAULT_LIMIT;
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    throw new RegistryValidationError(`limit must be an integer from 1 to ${MAX_LIMIT}`);
  }
  const observedAt = options.observedAt ?? new Date();
  if (Number.isNaN(observedAt.getTime())) {
    throw new RegistryValidationError("observedAt must be a valid Date");
  }

  const summary = emptySummary(windowHours);
  const hasExecutionEvidence =
    tableExists(database, "execution_attempts") &&
    tableExists(database, "jobs") &&
    tableExists(database, "source_definitions");
  const hasValidators = tableExists(database, "http_validator_checkpoints");

  const validatorBySource = new Map<
    string,
    { activeValidatorEndpoints: number; latestValidatorAt: string | null }
  >();
  if (hasValidators) {
    const validatorTotals = database
      .prepare(
        `SELECT COUNT(DISTINCT source_id) AS activeValidatorSources,
                COUNT(*) AS activeValidatorEndpoints,
                MAX(updated_at) AS latestValidatorAt
         FROM http_validator_checkpoints
         WHERE workspace_id = ?`,
      )
      .get(normalizedWorkspaceId) as {
      activeValidatorSources: number;
      activeValidatorEndpoints: number;
      latestValidatorAt: string | null;
    };
    summary.activeValidatorSources = Number(validatorTotals.activeValidatorSources);
    summary.activeValidatorEndpoints = Number(validatorTotals.activeValidatorEndpoints);
    summary.latestValidatorAt = validatorTotals.latestValidatorAt;

    const rows = database
      .prepare(
        `SELECT source_id AS sourceId,
                COUNT(*) AS activeValidatorEndpoints,
                MAX(updated_at) AS latestValidatorAt
         FROM http_validator_checkpoints
         WHERE workspace_id = ?
         GROUP BY source_id`,
      )
      .all(normalizedWorkspaceId) as Array<{
      sourceId: string;
      activeValidatorEndpoints: number;
      latestValidatorAt: string | null;
    }>;
    for (const row of rows) {
      validatorBySource.set(row.sourceId, {
        activeValidatorEndpoints: Number(row.activeValidatorEndpoints),
        latestValidatorAt: row.latestValidatorAt,
      });
    }
  }

  if (!hasExecutionEvidence) return summary;

  const sinceAt = new Date(observedAt.getTime() - windowHours * 60 * 60 * 1_000).toISOString();
  const watchCte = `WITH watch_attempts AS (
    SELECT j.source_id AS sourceId,
           CAST(json_extract(a.document_json, '$.receipt.metadataOnly') AS INTEGER) AS metadataOnly,
           CAST(COALESCE(json_extract(a.document_json, '$.receipt.itemsObserved'), 0) AS INTEGER) AS itemsObserved,
           CAST(COALESCE(json_extract(a.document_json, '$.receipt.bytesPrepared'), 0) AS INTEGER) AS bytesPrepared,
           a.completed_at AS completedAt
    FROM execution_attempts a
    JOIN jobs j ON j.id = a.job_id
    WHERE a.workspace_id = ?
      AND a.status = 'COMPLETED'
      AND a.completed_at >= ?
      AND json_extract(j.document_json, '$.planSnapshot.schedule.mode') = 'CHANGE_WATCH'
      AND json_extract(a.document_json, '$.receipt.metadataOnly') IS NOT NULL
  )`;

  const totals = database
    .prepare(
      `${watchCte}
       SELECT COUNT(*) AS completedRuns,
              COALESCE(SUM(CASE WHEN metadataOnly = 1 THEN 1 ELSE 0 END), 0) AS metadataOnlyRuns,
              COALESCE(SUM(CASE WHEN metadataOnly = 1 AND itemsObserved = 0 AND bytesPrepared = 0 THEN 1 ELSE 0 END), 0) AS http304NoBodyRuns,
              COALESCE(SUM(CASE WHEN metadataOnly = 1 AND itemsObserved > 0 THEN 1 ELSE 0 END), 0) AS bodyComparedNoChangeRuns,
              COALESCE(SUM(CASE WHEN metadataOnly = 0 THEN 1 ELSE 0 END), 0) AS artifactProducingRuns
       FROM watch_attempts`,
    )
    .get(normalizedWorkspaceId, sinceAt) as {
    completedRuns: number;
    metadataOnlyRuns: number;
    http304NoBodyRuns: number;
    bodyComparedNoChangeRuns: number;
    artifactProducingRuns: number;
  };

  summary.completedRuns = Number(totals.completedRuns);
  summary.metadataOnlyRuns = Number(totals.metadataOnlyRuns);
  summary.http304NoBodyRuns = Number(totals.http304NoBodyRuns);
  summary.bodyComparedNoChangeRuns = Number(totals.bodyComparedNoChangeRuns);
  summary.artifactProducingRuns = Number(totals.artifactProducingRuns);
  summary.noChangeRatePercent = percentage(summary.metadataOnlyRuns, summary.completedRuns);

  const sourceRows = database
    .prepare(
      `${watchCte}
       SELECT w.sourceId,
              COALESCE(s.name, w.sourceId) AS sourceName,
              COUNT(*) AS completedRuns,
              COALESCE(SUM(CASE WHEN w.metadataOnly = 1 THEN 1 ELSE 0 END), 0) AS metadataOnlyRuns,
              COALESCE(SUM(CASE WHEN w.metadataOnly = 1 AND w.itemsObserved = 0 AND w.bytesPrepared = 0 THEN 1 ELSE 0 END), 0) AS http304NoBodyRuns,
              COALESCE(SUM(CASE WHEN w.metadataOnly = 1 AND w.itemsObserved > 0 THEN 1 ELSE 0 END), 0) AS bodyComparedNoChangeRuns,
              COALESCE(SUM(CASE WHEN w.metadataOnly = 0 THEN 1 ELSE 0 END), 0) AS artifactProducingRuns,
              MAX(w.completedAt) AS latestCompletedAt
       FROM watch_attempts w
       LEFT JOIN source_definitions s ON s.id = w.sourceId AND s.workspace_id = ?
       GROUP BY w.sourceId, s.name
       ORDER BY latestCompletedAt DESC, completedRuns DESC, w.sourceId ASC
       LIMIT ?`,
    )
    .all(normalizedWorkspaceId, sinceAt, normalizedWorkspaceId, limit) as Array<{
    sourceId: string;
    sourceName: string;
    completedRuns: number;
    metadataOnlyRuns: number;
    http304NoBodyRuns: number;
    bodyComparedNoChangeRuns: number;
    artifactProducingRuns: number;
    latestCompletedAt: string | null;
  }>;

  summary.sources = sourceRows.map((row) => {
    const validators = validatorBySource.get(row.sourceId);
    const completedRuns = Number(row.completedRuns);
    const metadataOnlyRuns = Number(row.metadataOnlyRuns);
    return {
      sourceId: row.sourceId,
      sourceName: row.sourceName,
      completedRuns,
      metadataOnlyRuns,
      http304NoBodyRuns: Number(row.http304NoBodyRuns),
      bodyComparedNoChangeRuns: Number(row.bodyComparedNoChangeRuns),
      artifactProducingRuns: Number(row.artifactProducingRuns),
      noChangeRatePercent: percentage(metadataOnlyRuns, completedRuns),
      activeValidatorEndpoints: validators?.activeValidatorEndpoints ?? 0,
      latestCompletedAt: row.latestCompletedAt,
      latestValidatorAt: validators?.latestValidatorAt ?? null,
    };
  });

  return summary;
}
