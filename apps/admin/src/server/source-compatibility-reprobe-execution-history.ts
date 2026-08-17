import type { DatabaseSync } from "node:sqlite";
import { RegistryValidationError } from "@markorbit/persistence";
import {
  listSourceCompatibilityReprobeExecutions,
  type SourceCompatibilityReprobeExecutionListFilters,
} from "@markorbit/persistence/source-compatibility-reprobe-execution-query";
import type {
  SourceCompatibilityReprobeExecution,
  SourceCompatibilityReprobeExecutionStatus,
} from "@markorbit/persistence/source-compatibility-reprobe-executions";

export type CompatibilityReprobeExecutionHistoryFilters = {
  workspaceId: string;
  jurisdiction?: string;
  targetId?: string;
  status?: string;
  limit?: number;
};

function normalizeStatus(
  value: string | undefined,
): SourceCompatibilityReprobeExecutionStatus | undefined {
  if (!value?.trim()) return undefined;
  const status = value.trim().toUpperCase();
  if (status !== "STARTED" && status !== "COMPLETED" && status !== "FAILED") {
    throw new RegistryValidationError("status is invalid");
  }
  return status;
}

export function listCompatibilityReprobeExecutionHistory(
  database: DatabaseSync,
  filters: CompatibilityReprobeExecutionHistoryFilters,
): SourceCompatibilityReprobeExecution[] {
  const workspaceId = filters.workspaceId.trim();
  if (!workspaceId) throw new RegistryValidationError("workspaceId is required");
  const query: SourceCompatibilityReprobeExecutionListFilters = {
    workspaceId,
    jurisdiction: filters.jurisdiction?.trim() || undefined,
    targetId: filters.targetId?.trim() || undefined,
    status: normalizeStatus(filters.status),
    limit: filters.limit,
  };
  return listSourceCompatibilityReprobeExecutions(database, query);
}
