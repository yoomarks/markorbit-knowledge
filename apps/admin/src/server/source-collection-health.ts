import type { DatabaseSync, SQLInputValue } from "node:sqlite";
import type { CollectionRunStatus } from "@markorbit/contracts";
import { RegistryValidationError } from "@markorbit/persistence";

export type SourceCollectionHealthState =
  "NEVER_RUN" | "COLLECTING" | "HEALTHY" | "RETRYING" | "FAILING" | "CANCELLED";

export type SourceCollectionHealth = {
  state: SourceCollectionHealthState;
  latestRunStatus: CollectionRunStatus | null;
  latestRunAt: string | null;
  lastFailureAt: string | null;
  consecutiveFailures: number;
  failedRuns: number;
};

export type SourceCollectionHealthRow = {
  sourceId: string;
  status: CollectionRunStatus;
  updatedAt: string;
  retrying: boolean;
  jobFailureAt: string | null;
};

const HISTORY_LIMIT = 20;
const MAX_SOURCES = 100;

function emptyHealth(): SourceCollectionHealth {
  return {
    state: "NEVER_RUN",
    latestRunStatus: null,
    latestRunAt: null,
    lastFailureAt: null,
    consecutiveFailures: 0,
    failedRuns: 0,
  };
}

export function summarizeSourceCollectionHealth(
  rows: SourceCollectionHealthRow[],
): SourceCollectionHealth {
  if (rows.length === 0) return emptyHealth();
  const latest = rows[0]!;
  let state: SourceCollectionHealthState;
  if (latest.retrying) state = "RETRYING";
  else if (latest.status === "FAILED") state = "FAILING";
  else if (latest.status === "COMPLETED") state = "HEALTHY";
  else if (latest.status === "CANCELLED") state = "CANCELLED";
  else state = "COLLECTING";

  let consecutiveFailures = 0;
  for (const row of rows) {
    if (row.status !== "FAILED") break;
    consecutiveFailures += 1;
  }
  const failedRuns = rows.filter((row) => row.status === "FAILED").length;
  const lastFailureAt =
    rows.find((row) => row.jobFailureAt !== null)?.jobFailureAt ??
    rows.find((row) => row.status === "FAILED")?.updatedAt ??
    null;

  return {
    state,
    latestRunStatus: latest.status,
    latestRunAt: latest.updatedAt,
    lastFailureAt,
    consecutiveFailures,
    failedRuns,
  };
}

export function listSourceCollectionHealth(
  database: DatabaseSync,
  sourceIds: string[],
  historyLimit = HISTORY_LIMIT,
): Record<string, SourceCollectionHealth> {
  const ids = [...new Set(sourceIds.map((id) => id.trim()).filter(Boolean))];
  if (ids.length === 0) return {};
  if (ids.length > MAX_SOURCES) {
    throw new RegistryValidationError(`sourceIds must contain at most ${MAX_SOURCES} sources`);
  }
  if (!Number.isInteger(historyLimit) || historyLimit < 1 || historyLimit > 100) {
    throw new RegistryValidationError("historyLimit must be an integer from 1 to 100");
  }

  const placeholders = ids.map(() => "?").join(", ");
  const rows = database
    .prepare(
      `WITH ranked AS (
         SELECT r.id, r.source_id, r.status, r.updated_at,
                ROW_NUMBER() OVER (
                  PARTITION BY r.source_id
                  ORDER BY r.created_at DESC, r.id DESC
                ) AS row_number
         FROM collection_runs r
         WHERE r.source_id IN (${placeholders})
       )
       SELECT ranked.source_id AS sourceId,
              ranked.status,
              ranked.updated_at AS updatedAt,
              EXISTS(
                SELECT 1 FROM jobs j
                WHERE j.run_id = ranked.id
                  AND (j.status = 'RETRY' OR (j.attempt > 1 AND j.status IN ('PENDING', 'LEASED', 'RUNNING')))
              ) AS retrying,
              (
                SELECT MAX(j.updated_at) FROM jobs j
                WHERE j.run_id = ranked.id
                  AND j.status IN ('RETRY', 'FAILED', 'DEAD_LETTER')
              ) AS jobFailureAt
       FROM ranked
       WHERE ranked.row_number <= ?
       ORDER BY ranked.source_id ASC, ranked.row_number ASC`,
    )
    .all(...(ids as SQLInputValue[]), historyLimit) as Array<{
    sourceId: string;
    status: CollectionRunStatus;
    updatedAt: string;
    retrying: number;
    jobFailureAt: string | null;
  }>;

  const grouped = new Map<string, SourceCollectionHealthRow[]>();
  for (const id of ids) grouped.set(id, []);
  for (const row of rows) {
    grouped.get(row.sourceId)?.push({ ...row, retrying: row.retrying === 1 });
  }
  return Object.fromEntries(
    ids.map((id) => [id, summarizeSourceCollectionHealth(grouped.get(id) ?? [])]),
  );
}
