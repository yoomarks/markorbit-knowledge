import type { DatabaseSync } from "node:sqlite";
import { RegistryValidationError } from "@markorbit/persistence";
import { parseRepresentativeLiveCanarySummary } from "@markorbit/persistence/source-compatibility-import";
import { SqliteSourceCompatibilityObservationRepository } from "@markorbit/persistence/source-compatibility-observations";
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

export function recordSourceCompatibilityWorkerIntake(
  input: {
    workerId: string;
    credential: string;
    summary: unknown;
  },
  dependencies: SourceCompatibilityWorkerIntakeDependencies,
): SourceCompatibilityWorkerIntakeResult {
  const workerId = input.workerId.trim();
  if (!workerId) throw new RegistryValidationError("workerId is required");

  // Authenticate before parsing external probe output or initializing any write-side registry.
  dependencies.workers.verifyCredential(workerId, input.credential);

  const observations = parseRepresentativeLiveCanarySummary(input.summary).map((observation) => ({
    ...observation,
    details: {
      ...(observation.details ?? {}),
      recordedByWorkerId: workerId,
      intake: SOURCE_COMPATIBILITY_WORKER_INTAKE_VERSION,
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
