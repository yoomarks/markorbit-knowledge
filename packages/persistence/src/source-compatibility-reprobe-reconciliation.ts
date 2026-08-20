import type { DatabaseSync } from "node:sqlite";
import { RegistryConflictError, RegistryValidationError } from "./index";
import {
  SqliteSourceCompatibilityReprobeExecutionRepository,
  type SourceCompatibilityReprobeExecution,
} from "./source-compatibility-reprobe-execution";

export type SourceCompatibilityReprobeReconciliationResult = {
  reconciled: boolean;
  execution: SourceCompatibilityReprobeExecution;
};

type ObservationRow = {
  id: string;
  target_id: string;
  state: "PASS" | "DEGRADED" | "BLOCKED";
  observed_at: string;
  details_json: string;
};

function normalizedWorkerId(value: string): string {
  const workerId = value.trim();
  if (!workerId) throw new RegistryValidationError("workerId is required");
  return workerId;
}

/**
 * Completes a STARTED compatibility re-probe from evidence that was already
 * durably persisted by the same worker and explicitly bound to the exact
 * execution. No external acquisition is performed here.
 */
export function reconcileSourceCompatibilityReprobeExecution(
  database: DatabaseSync,
  input: { executionId: string; workerId: string },
  clock: () => Date = () => new Date(),
): SourceCompatibilityReprobeReconciliationResult {
  const workerId = normalizedWorkerId(input.workerId);
  const executions = new SqliteSourceCompatibilityReprobeExecutionRepository(database, clock);
  const execution = executions.getById(input.executionId);
  if (!execution) {
    throw new RegistryConflictError(
      "SOURCE_COMPATIBILITY_REPROBE_EXECUTION_NOT_FOUND",
      `Compatibility re-probe execution ${input.executionId.trim()} was not found`,
    );
  }
  if (execution.workerId !== workerId) {
    throw new RegistryConflictError(
      "SOURCE_COMPATIBILITY_REPROBE_WORKER_MISMATCH",
      "Compatibility re-probe can only be reconciled by the worker that started it",
    );
  }
  if (execution.status === "COMPLETED") {
    return { reconciled: true, execution: { ...execution, replayed: true } };
  }
  if (execution.status === "FAILED") {
    return { reconciled: false, execution };
  }

  const rows = database
    .prepare(
      `SELECT id, target_id, state, observed_at, details_json
         FROM source_compatibility_observations
        WHERE target_id = ?
        ORDER BY observed_at DESC, id DESC`,
    )
    .all(execution.targetId) as unknown as ObservationRow[];
  const matches = rows.filter((row) => {
    const details = JSON.parse(row.details_json || "{}") as Record<string, unknown>;
    return (
      details.reprobeExecutionId === execution.executionId &&
      details.recordedByWorkerId === workerId
    );
  });
  if (matches.length === 0) return { reconciled: false, execution };
  if (matches.length > 1) {
    throw new RegistryConflictError(
      "SOURCE_COMPATIBILITY_REPROBE_RECONCILIATION_AMBIGUOUS",
      "More than one compatibility observation is bound to this re-probe execution",
      { executionId: execution.executionId, observationIds: matches.map((row) => row.id) },
    );
  }

  const observation = matches[0]!;
  const completed = executions.complete({
    executionId: execution.executionId,
    workerId,
    observedAt: observation.observed_at,
    state: observation.state,
  });
  return { reconciled: true, execution: completed };
}
