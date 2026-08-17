import { DatabaseSync } from "node:sqlite";
import { RegistryValidationError } from "./index";
import {
  SqliteSourceCompatibilityReprobeExecutionRepository,
  type SourceCompatibilityReprobeExecution,
  type SourceCompatibilityReprobeExecutionStatus,
} from "./source-compatibility-reprobe-execution";

const MAX_LIMIT = 100;

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

export function listSourceCompatibilityReprobeExecutions(
  database: DatabaseSync,
  filters: SourceCompatibilityReprobeExecutionListFilters,
): SourceCompatibilityReprobeExecution[] {
  const workspaceId = filters.workspaceId.trim();
  if (!workspaceId) throw new RegistryValidationError("workspaceId is required");

  // Initialize the governed execution ledger through its owning repository before querying it.
  new SqliteSourceCompatibilityReprobeExecutionRepository(database);

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
  const status = normalizedStatus(filters.status);
  if (status) {
    where.push("status = ?");
    values.push(status);
  }
  values.push(normalizedLimit(filters.limit));

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
