import type { DatabaseSync } from "node:sqlite";
import {
  isAcquisitionRunEvidence,
  type AcquisitionPlaybookHistory,
  type AcquisitionRunEvidence,
  type ExecutionAttempt,
} from "@markorbit/contracts";
import {
  RegistryConflictError,
  RegistryValidationError,
} from "@markorbit/persistence";
import { SqliteAcquisitionIntelligenceRepository } from "@markorbit/persistence/acquisition-intelligence";
import type { ExecutionLedgerRepository } from "@markorbit/persistence/execution-ledger";
import type { WorkerExecutionRepository } from "@markorbit/persistence/worker-execution";
import type { WorkerRegistryRepository } from "@markorbit/persistence/workers";

export const ACQUISITION_INTELLIGENCE_WORKER_INTAKE_VERSION =
  "ACQUISITION_INTELLIGENCE_WORKER_INTAKE_V1" as const;

export type AcquisitionIntelligenceWorkerIntakeResult = {
  version: typeof ACQUISITION_INTELLIGENCE_WORKER_INTAKE_VERSION;
  workerId: string;
  runId: string;
  sourceId: string;
  executionAttemptId: string;
  replayed: boolean;
  lessonsRecorded: number;
  playbookHistory: AcquisitionPlaybookHistory;
};

export type AcquisitionIntelligenceWorkerIntakeDependencies = {
  database: DatabaseSync;
  workers: Pick<WorkerRegistryRepository, "verifyCredential">;
  runs: Pick<ExecutionLedgerRepository, "getById">;
  executions: Pick<WorkerExecutionRepository, "listForRun">;
};

function requireTerminalAttempt(
  workerId: string,
  runId: string,
  executions: ReturnType<WorkerExecutionRepository["listForRun"]>,
): ExecutionAttempt {
  const terminal = executions
    .map((record) => record.attempt)
    .filter(
      (attempt) =>
        attempt.workerId === workerId &&
        attempt.runId === runId &&
        (attempt.status === "COMPLETED" || attempt.status === "FAILED"),
    )
    .sort((left, right) =>
      (right.completedAt ?? right.updatedAt).localeCompare(left.completedAt ?? left.updatedAt),
    )[0];
  if (!terminal) {
    throw new RegistryConflictError(
      "ACQUISITION_LEARNING_EXECUTION_NOT_TERMINAL",
      "Learning evidence requires a terminal execution attempt owned by the authenticated Worker",
      { workerId, runId },
    );
  }
  return terminal;
}

function assertOutcomeMatchesControlPlane(
  runStatus: string,
  attempt: ExecutionAttempt,
  outcome: AcquisitionRunEvidence["outcome"],
): void {
  if (runStatus === "COMPLETED") {
    if (attempt.status !== "COMPLETED" || (outcome !== "SUCCESS" && outcome !== "DEGRADED")) {
      throw new RegistryConflictError(
        "ACQUISITION_LEARNING_OUTCOME_MISMATCH",
        "A completed CollectionRun only accepts SUCCESS or DEGRADED learning evidence from a completed execution",
      );
    }
    return;
  }
  if (runStatus === "FAILED") {
    if (attempt.status !== "FAILED" || outcome !== "FAILED") {
      throw new RegistryConflictError(
        "ACQUISITION_LEARNING_OUTCOME_MISMATCH",
        "A failed CollectionRun only accepts FAILED learning evidence from a failed execution",
      );
    }
    return;
  }
  throw new RegistryConflictError(
    "ACQUISITION_LEARNING_RUN_NOT_TERMINAL",
    `CollectionRun ${attempt.runId} is ${runStatus}; learning is recorded only after a terminal run state`,
  );
}

function trustedEvidence(
  evidence: AcquisitionRunEvidence,
  workerId: string,
  attempt: ExecutionAttempt,
): AcquisitionRunEvidence {
  if (!attempt.completedAt) {
    throw new RegistryConflictError(
      "ACQUISITION_LEARNING_EXECUTION_TIMESTAMP_MISSING",
      "Terminal execution attempt is missing completedAt",
    );
  }
  const durationMs = Date.parse(attempt.completedAt) - Date.parse(attempt.startedAt);
  if (!Number.isFinite(durationMs) || durationMs < 0) {
    throw new RegistryConflictError(
      "ACQUISITION_LEARNING_EXECUTION_TIMESTAMP_INVALID",
      "Control-plane execution timestamps are invalid",
    );
  }
  const bytes = attempt.status === "COMPLETED" ? attempt.receipt?.bytesPrepared : undefined;
  const normalized: AcquisitionRunEvidence = {
    ...evidence,
    startedAt: attempt.startedAt,
    finishedAt: attempt.completedAt,
    performance: {
      ...evidence.performance,
      durationMs,
      ...(typeof bytes === "number" ? { bytes } : {}),
    },
    evidenceRefs: [
      ...new Set([
        ...evidence.evidenceRefs,
        `execution-attempt:${attempt.id}`,
        `worker:${workerId}`,
      ]),
    ].sort(),
  };
  if (!isAcquisitionRunEvidence(normalized)) {
    throw new RegistryValidationError("Trusted acquisition learning evidence is invalid");
  }
  return normalized;
}

export function recordAcquisitionIntelligenceWorkerIntake(
  input: {
    workerId: string;
    credential: string;
    evidence: unknown;
  },
  dependencies: AcquisitionIntelligenceWorkerIntakeDependencies,
): AcquisitionIntelligenceWorkerIntakeResult {
  const workerId = input.workerId.trim();
  if (!workerId) throw new RegistryValidationError("workerId is required");

  // Authentication must happen before parsing Worker observations or initializing
  // the acquisition-intelligence write registry.
  const worker = dependencies.workers.verifyCredential(workerId, input.credential);

  if (!isAcquisitionRunEvidence(input.evidence)) {
    throw new RegistryValidationError("evidence must satisfy AcquisitionRunEvidence v1");
  }
  const evidence = input.evidence;
  const record = dependencies.runs.getById(evidence.runId);
  if (!record) {
    throw new RegistryConflictError(
      "ACQUISITION_LEARNING_RUN_NOT_FOUND",
      `CollectionRun ${evidence.runId} was not found`,
    );
  }
  if (record.run.workspaceId !== worker.workspaceId) {
    throw new RegistryConflictError(
      "ACQUISITION_LEARNING_WORKSPACE_MISMATCH",
      "Authenticated Worker and CollectionRun belong to different workspaces",
    );
  }
  if (record.run.sourceId !== evidence.sourceId) {
    throw new RegistryConflictError(
      "ACQUISITION_LEARNING_SOURCE_MISMATCH",
      "Learning evidence sourceId does not match the governed CollectionRun",
    );
  }

  const attempt = requireTerminalAttempt(
    workerId,
    evidence.runId,
    dependencies.executions.listForRun(evidence.runId),
  );
  if (attempt.workspaceId !== worker.workspaceId) {
    throw new RegistryConflictError(
      "ACQUISITION_LEARNING_EXECUTION_WORKSPACE_MISMATCH",
      "Terminal execution attempt and authenticated Worker belong to different workspaces",
    );
  }
  assertOutcomeMatchesControlPlane(record.run.status, attempt, evidence.outcome);

  const repository = new SqliteAcquisitionIntelligenceRepository(dependencies.database);
  const replayed = repository.getRunEvidence(evidence.runId) !== null;
  const learned = repository.recordLearningRun(trustedEvidence(evidence, workerId, attempt));

  return {
    version: ACQUISITION_INTELLIGENCE_WORKER_INTAKE_VERSION,
    workerId,
    runId: learned.evidence.runId,
    sourceId: learned.evidence.sourceId,
    executionAttemptId: attempt.id,
    replayed,
    lessonsRecorded: learned.lessons.length,
    playbookHistory: learned.playbookHistory,
  };
}
