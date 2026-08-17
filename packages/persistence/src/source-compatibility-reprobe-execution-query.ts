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
