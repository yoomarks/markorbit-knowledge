import { DatabaseSync } from "node:sqlite";
import { RegistryValidationError } from "./index";
import type {
  SourceCompatibilityReprobeExecution,
  SourceCompatibilityReprobeExecutionStatus,
} from "./source-compatibility-reprobe-execution";

const MAX_LIMIT = 100;
const TABLE_NAME = "source_compatibility_reprobe_executions";

export type SourceCompatibilityReprobeExecutionListFilters = {
  workspaceId: string;
  jurisdiction?: string;
  targetId?: string;
  status?: SourceCompatibilityReprobeExecutionStatus;
  limit?: number;
};

type ExecutionRow = {
  target_id?: string;
  document_json: string;
};

function normalizedLimit(value: number | undefined): number {
  const limit = value ?? 50;
  if (!Number.isSafeInteger(limit) || limit <= 0 || limit > MAX_LIMIT) {
    throw new RegistryValidationError(`limit must be an integer between 1 and ${MAX_LIMIT}`);
  }
  return limit;
}

function normalizedStatus(
  value: SourceCompatibilityReprobeExecutionStatus | undefined,
): SourceCompatibilityReprobeExecutionStatus | undefined {
  if (value === undefined) return undefined;
  if (value !== "STARTED" && value !== "COMPLETED" && value !== "FAILED") {
    throw new RegistryValidationError("status is invalid");
  }
  return value;
}

function executionLedgerExists(database: DatabaseSync): boolean {
  return Boolean(
    database
      .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?")
      .get(TABLE_NAME),
  );
}

export function listSourceCompatibilityReprobeExecutions(
  database: DatabaseSync,
  filters: SourceCompatibilityReprobeExecutionListFilters,
): SourceCompatibilityReprobeExecution[] {
  const workspaceId = filters.workspaceId.trim();
  if (!workspaceId) throw new RegistryValidationError("workspaceId is required");
  const limit = normalizedLimit(filters.limit);
  const status = normalizedStatus(filters.status);

  // Read models must stay side-effect free. An uninitialized ledger is simply empty history.
  if (!executionLedgerExists(database)) return [];

  const where = ["workspace_id = ?"];
  const values: Array<string | number> = [workspaceId];
  const jurisdiction = filters.jurisdiction?.trim().toUpperCase();
  if (jurisdiction) {
    where.push("jurisdiction = ?");
    values.push(jurisdiction);
  }
  const targetId = filters.targetId?.trim();
  if (targetId) {
    where.push("target_id = ?");
    values.push(targetId);
  }
  if (status) {
    where.push("status = ?");
    values.push(status);
  }
  values.push(limit);

  const rows = database
    .prepare(
      `SELECT document_json
         FROM source_compatibility_reprobe_executions
        WHERE ${where.join(" AND ")}
        ORDER BY updated_at DESC, id DESC
        LIMIT ?`,
    )
    .all(...values) as unknown as ExecutionRow[];

  return rows.map((row) => JSON.parse(row.document_json) as SourceCompatibilityReprobeExecution);
}

/**
 * Returns at most one latest execution for each requested target without
 * initializing the ledger or imposing the history endpoint's 100-row limit.
 */
export function latestSourceCompatibilityReprobeExecutions(
  database: DatabaseSync,
  input: { workspaceId: string; targetIds: readonly string[] },
): ReadonlyMap<string, SourceCompatibilityReprobeExecution> {
  const workspaceId = input.workspaceId.trim();
  if (!workspaceId) throw new RegistryValidationError("workspaceId is required");
  const requested = new Set(input.targetIds.map((value) => value.trim()).filter(Boolean));
  if (requested.size === 0 || !executionLedgerExists(database)) return new Map();

  const rows = database
    .prepare(
      `SELECT target_id, document_json
         FROM (
           SELECT target_id, document_json,
                  ROW_NUMBER() OVER (
                    PARTITION BY target_id
                    ORDER BY updated_at DESC, id DESC
                  ) AS row_number
             FROM source_compatibility_reprobe_executions
            WHERE workspace_id = ?
         )
        WHERE row_number = 1`,
    )
    .all(workspaceId) as unknown as Array<{ target_id: string; document_json: string }>;

  const latest = new Map<string, SourceCompatibilityReprobeExecution>();
  for (const row of rows) {
    if (!requested.has(row.target_id)) continue;
    latest.set(row.target_id, JSON.parse(row.document_json) as SourceCompatibilityReprobeExecution);
  }
  return latest;
}

export {
  reconcileSourceCompatibilityReprobeExecution,
  type SourceCompatibilityReprobeReconciliationResult,
} from "./source-compatibility-reprobe-reconciliation";
