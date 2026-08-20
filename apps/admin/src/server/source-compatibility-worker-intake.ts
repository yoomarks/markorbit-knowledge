import type { DatabaseSync } from "node:sqlite";
import { RegistryConflictError, RegistryValidationError } from "@markorbit/persistence";
import { parseRepresentativeLiveCanarySummary } from "@markorbit/persistence/source-compatibility-import";
import { SqliteSourceCompatibilityObservationRepository } from "@markorbit/persistence/source-compatibility-observations";
import { SqliteSourceCompatibilityReprobeExecutionRepository } from "@markorbit/persistence/source-compatibility-reprobe-executions";
import type { WorkerRegistryRepository } from "@markorbit/persistence/workers";

export const SOURCE_COMPATIBILITY_WORKER_INTAKE_VERSION =
  "SOURCE_COMPATIBILITY_WORKER_INTAKE_V1" as const;

export type SourceCompatibilityWorkerIntakeResult = {
  version: typeof SOURCE_COMPATIBILITY_WORKER_INTAKE_VERSION;
  recorded: number;
  observedAt: string | null;
  states: {
    PASS: number;
    DEGRADED: number;
    BLOCKED: number;
  };
};

export type SourceCompatibilityWorkerIntakeDependencies = {
  database: DatabaseSync;
  workers: Pick<WorkerRegistryRepository, "verifyCredential">;
};

function bindReprobeExecution(
  database: DatabaseSync,
  input: { reprobeExecutionId: string; workerId: string },
  observations: ReturnType<typeof parseRepresentativeLiveCanarySummary>,
): string {
  const executionId = input.reprobeExecutionId.trim();
  if (!executionId) throw new RegistryValidationError("reprobeExecutionId is required");
  const execution = new SqliteSourceCompatibilityReprobeExecutionRepository(database).getById(
    executionId,
  );
  if (!execution) {
    throw new RegistryConflictError(
      "SOURCE_COMPATIBILITY_REPROBE_EXECUTION_NOT_FOUND",
      `Compatibility re-probe execution ${executionId} was not found`,
    );
  }
  if (execution.workerId !== input.workerId) {
    throw new RegistryConflictError(
      "SOURCE_COMPATIBILITY_REPROBE_WORKER_MISMATCH",
      "Compatibility observation can only be bound by the worker that started the re-probe",
    );
  }
  if (execution.status === "FAILED") {
    throw new RegistryConflictError(
      "SOURCE_COMPATIBILITY_REPROBE_ALREADY_FAILED",
      "Failed compatibility re-probe executions cannot accept new observations",
    );
  }
  if (observations.length !== 1) {
    throw new RegistryConflictError(
      "SOURCE_COMPATIBILITY_REPROBE_OBSERVATION_COUNT_INVALID",
      "A re-probe intake must contain exactly one target observation",
      { executionId, observationCount: observations.length },
    );
  }
  const observation = observations[0]!;
  if (
    observation.targetId !== execution.targetId ||
    observation.jurisdiction.toUpperCase() !== execution.jurisdiction.toUpperCase()
  ) {
    throw new RegistryConflictError(
      "SOURCE_COMPATIBILITY_REPROBE_OBSERVATION_SCOPE_MISMATCH",
      "Compatibility observation does not match the bound re-probe execution scope",
      {
        executionId,
        expectedTargetId: execution.targetId,
        actualTargetId: observation.targetId,
        expectedJurisdiction: execution.jurisdiction,
        actualJurisdiction: observation.jurisdiction,
      },
    );
  }
  if (
    execution.status === "COMPLETED" &&
    (execution.observationObservedAt !== observation.observedAt ||
      execution.observationState !== observation.state)
  ) {
    throw new RegistryConflictError(
      "SOURCE_COMPATIBILITY_REPROBE_ALREADY_COMPLETED",
      "Completed compatibility re-probe executions only accept an exact observation replay",
      {
        executionId,
        expectedObservedAt: execution.observationObservedAt,
        actualObservedAt: observation.observedAt,
        expectedState: execution.observationState,
        actualState: observation.state,
      },
    );
  }
  return execution.executionId;
}

export function recordSourceCompatibilityWorkerIntake(
  input: {
    workerId: string;
    credential: string;
    summary: unknown;
    reprobeExecutionId?: string;
  },
  dependencies: SourceCompatibilityWorkerIntakeDependencies,
): SourceCompatibilityWorkerIntakeResult {
  const workerId = input.workerId.trim();
  if (!workerId) throw new RegistryValidationError("workerId is required");

  // Authenticate before parsing external probe output or initializing any write-side registry.
  dependencies.workers.verifyCredential(workerId, input.credential);

  const parsed = parseRepresentativeLiveCanarySummary(input.summary);
  const reprobeExecutionId = input.reprobeExecutionId
    ? bindReprobeExecution(
        dependencies.database,
        { reprobeExecutionId: input.reprobeExecutionId, workerId },
        parsed,
      )
    : undefined;
  const observations = parsed.map((observation) => ({
    ...observation,
    details: {
      ...(observation.details ?? {}),
      recordedByWorkerId: workerId,
      intake: SOURCE_COMPATIBILITY_WORKER_INTAKE_VERSION,
      ...(reprobeExecutionId ? { reprobeExecutionId } : {}),
    },
  }));
  const repository = new SqliteSourceCompatibilityObservationRepository(dependencies.database);
  const recorded = repository.recordMany(observations);

  return {
    version: SOURCE_COMPATIBILITY_WORKER_INTAKE_VERSION,
    recorded: recorded.length,
    observedAt: recorded[0]?.observedAt ?? null,
    states: recorded.reduce(
      (states, observation) => {
        states[observation.state] += 1;
        return states;
      },
      { PASS: 0, DEGRADED: 0, BLOCKED: 0 },
    ),
  };
}
