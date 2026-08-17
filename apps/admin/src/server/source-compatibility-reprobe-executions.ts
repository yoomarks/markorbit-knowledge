import type { DatabaseSync } from "node:sqlite";
import { RegistryConflictError, RegistryValidationError } from "@markorbit/persistence";
import {
  SqliteSourceCompatibilityReprobeExecutionRepository,
  type SourceCompatibilityReprobeExecution,
} from "@markorbit/persistence/source-compatibility-reprobe-executions";
import { SqliteFoundationalActionIntentRepository } from "@markorbit/persistence/foundational-action-intents";
import type { WorkerRegistryRepository } from "@markorbit/persistence/workers";
import type { SourceCompatibilityState } from "@markorbit/contracts";
import { buildFoundationalRemediationQueueSnapshot } from "./foundational-remediation-queue";

export const SOURCE_COMPATIBILITY_REPROBE_WORKER_API_VERSION =
  "SOURCE_COMPATIBILITY_REPROBE_WORKER_API_V1" as const;

export type SourceCompatibilityReprobeDependencies = {
  database: DatabaseSync;
  workers: Pick<WorkerRegistryRepository, "verifyCredential">;
  clock?: () => Date;
};

function required(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) throw new RegistryValidationError(`${field} is required`);
  return normalized;
}

function authenticate(
  workerIdRaw: string,
  credential: string,
  dependencies: SourceCompatibilityReprobeDependencies,
): string {
  const workerId = required(workerIdRaw, "workerId");
  dependencies.workers.verifyCredential(workerId, credential);
  return workerId;
}

function currentReprobeAction(
  database: DatabaseSync,
  input: { workspaceId: string; jurisdiction: string; targetId: string },
  clock: () => Date,
): void {
  const snapshot = buildFoundationalRemediationQueueSnapshot(
    database,
    {
      workspaceId: input.workspaceId,
      jurisdiction: input.jurisdiction,
      targetId: input.targetId,
    },
    clock,
  );
  const item = snapshot.remediationQueue.items.find(
    (candidate) => candidate.targetId === input.targetId,
  );
  const action = item?.actions.find(
    (candidate) => candidate.code === "REPROBE_SOURCE_COMPATIBILITY",
  );
  if (
    !item ||
    item.stage !== "HEALTH" ||
    !action ||
    action.executionPath !== "MANUAL_OPERATOR" ||
    action.collectionAuthorizationRequired !== false ||
    action.automaticExecution !== false
  ) {
    throw new RegistryConflictError(
      "SOURCE_COMPATIBILITY_REPROBE_INTENT_STALE",
      "The approved compatibility re-probe intent no longer matches the current foundational remediation queue",
      {
        currentStage: item?.stage ?? "READY",
        availableActionCodes: item?.actions.map((candidate) => candidate.code) ?? [],
      },
    );
  }
}

export function startSourceCompatibilityReprobeExecution(
  input: {
    workerId: string;
    credential: string;
    intentId: string;
    executedByActorId: string;
    idempotencyKey: string;
  },
  dependencies: SourceCompatibilityReprobeDependencies,
): SourceCompatibilityReprobeExecution {
  const workerId = authenticate(input.workerId, input.credential, dependencies);
  const clock = dependencies.clock ?? (() => new Date());
  const intentId = required(input.intentId, "intentId");
  const intent = new SqliteFoundationalActionIntentRepository(dependencies.database, clock).getById(
    intentId,
  );
  if (!intent) {
    throw new RegistryConflictError(
      "SOURCE_COMPATIBILITY_REPROBE_INTENT_NOT_FOUND",
      `Foundational action intent ${intentId} was not found`,
    );
  }

  const existing = new SqliteSourceCompatibilityReprobeExecutionRepository(
    dependencies.database,
    clock,
  ).getByIntentId(intent.intentId);
  if (existing) {
    return new SqliteSourceCompatibilityReprobeExecutionRepository(
      dependencies.database,
      clock,
    ).start({
      intentId: intent.intentId,
      workerId,
      executedByActorId: required(input.executedByActorId, "executedByActorId"),
      idempotencyKey: required(input.idempotencyKey, "idempotencyKey"),
    });
  }

  currentReprobeAction(
    dependencies.database,
    {
      workspaceId: intent.workspaceId,
      jurisdiction: intent.jurisdiction,
      targetId: intent.targetId,
    },
    clock,
  );
  return new SqliteSourceCompatibilityReprobeExecutionRepository(
    dependencies.database,
    clock,
  ).start({
    intentId: intent.intentId,
    workerId,
    executedByActorId: required(input.executedByActorId, "executedByActorId"),
    idempotencyKey: required(input.idempotencyKey, "idempotencyKey"),
  });
}

export function completeSourceCompatibilityReprobeExecution(
  input: {
    workerId: string;
    credential: string;
    executionId: string;
    observedAt: string;
    state: SourceCompatibilityState;
  },
  dependencies: SourceCompatibilityReprobeDependencies,
): SourceCompatibilityReprobeExecution {
  const workerId = authenticate(input.workerId, input.credential, dependencies);
  return new SqliteSourceCompatibilityReprobeExecutionRepository(
    dependencies.database,
    dependencies.clock,
  ).complete({
    executionId: required(input.executionId, "executionId"),
    workerId,
    observedAt: required(input.observedAt, "observedAt"),
    state: input.state,
  });
}

export function failSourceCompatibilityReprobeExecution(
  input: {
    workerId: string;
    credential: string;
    executionId: string;
    errorCode: string;
    errorMessage: string;
  },
  dependencies: SourceCompatibilityReprobeDependencies,
): SourceCompatibilityReprobeExecution {
  const workerId = authenticate(input.workerId, input.credential, dependencies);
  return new SqliteSourceCompatibilityReprobeExecutionRepository(
    dependencies.database,
    dependencies.clock,
  ).fail({
    executionId: required(input.executionId, "executionId"),
    workerId,
    errorCode: required(input.errorCode, "errorCode"),
    errorMessage: required(input.errorMessage, "errorMessage"),
  });
}
