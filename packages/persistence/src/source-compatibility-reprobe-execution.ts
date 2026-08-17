import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { SOURCE_COMPATIBILITY_STATES, type SourceCompatibilityState } from "@markorbit/contracts";
import { SqliteFoundationalActionIntentRepository } from "./foundational-action-intent-ledger";
import { RegistryConflictError, RegistryValidationError } from "./index";
import { ensureSourceCompatibilityObservationRegistry } from "./source-compatibility-observations";

const EXECUTION_ID = /^scrx_[a-f0-9]{32}$/;
const ACTOR = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,199}$/;
const KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;
const INITIALIZED_DATABASES = new WeakSet<DatabaseSync>();

export const SOURCE_COMPATIBILITY_REPROBE_EXECUTION_VERSION =
  "SOURCE_COMPATIBILITY_REPROBE_EXECUTION_V1" as const;

export type SourceCompatibilityReprobeExecutionStatus = "STARTED" | "COMPLETED" | "FAILED";

export type SourceCompatibilityReprobeExecution = {
  version: typeof SOURCE_COMPATIBILITY_REPROBE_EXECUTION_VERSION;
  objectType: "SOURCE_COMPATIBILITY_REPROBE_EXECUTION";
  executionId: string;
  intentId: string;
  workspaceId: string;
  jurisdiction: string;
  targetId: string;
  requestedByActorId: string;
  approvedByActorId: string;
  executedByActorId: string;
  workerId: string;
  status: SourceCompatibilityReprobeExecutionStatus;
  idempotencyKey: string;
  startedAt: string;
  completedAt: string | null;
  observationId: string | null;
  observationObservedAt: string | null;
  observationState: SourceCompatibilityState | null;
  errorCode: string | null;
  errorMessage: string | null;
  replayed: boolean;
};

type ExecutionRow = {
  id: string;
  intent_id: string;
  workspace_id: string;
  jurisdiction: string;
  target_id: string;
  executed_by_actor_id: string;
  worker_id: string;
  status: SourceCompatibilityReprobeExecutionStatus;
  idempotency_key: string;
  semantic_fingerprint: string;
  document_json: string;
};

function normalizeActor(value: string, field: string): string {
  const normalized = value.trim();
  if (!ACTOR.test(normalized)) throw new RegistryValidationError(`${field} is invalid`);
  return normalized;
}

function normalizeKey(value: string): string {
  const normalized = value.trim();
  if (!KEY.test(normalized)) throw new RegistryValidationError("idempotencyKey is invalid");
  return normalized;
}

function normalizedExecutionId(value: string): string {
  const normalized = value.trim();
  if (!EXECUTION_ID.test(normalized)) throw new RegistryValidationError("executionId is invalid");
  return normalized;
}

export function sourceCompatibilityReprobeExecutionId(
  workspaceId: string,
  idempotencyKey: string,
): string {
  const digest = createHash("sha256").update(`${workspaceId}\u0000${idempotencyKey}`).digest("hex");
  return `scrx_${digest.slice(0, 32)}`;
}

function semanticFingerprint(input: {
  intentId: string;
  workspaceId: string;
  targetId: string;
  workerId: string;
  executedByActorId: string;
}): string {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

function rowExecution(row: ExecutionRow, replayed = false): SourceCompatibilityReprobeExecution {
  const parsed = JSON.parse(row.document_json) as SourceCompatibilityReprobeExecution;
  return { ...parsed, replayed };
}

function ensureLedger(database: DatabaseSync): void {
  if (INITIALIZED_DATABASES.has(database)) return;
  new SqliteFoundationalActionIntentRepository(database);
  ensureSourceCompatibilityObservationRegistry(database);
  database.exec(`
    CREATE TABLE IF NOT EXISTS source_compatibility_reprobe_executions (
      id TEXT PRIMARY KEY,
      intent_id TEXT NOT NULL UNIQUE,
      workspace_id TEXT NOT NULL,
      jurisdiction TEXT NOT NULL,
      target_id TEXT NOT NULL,
      executed_by_actor_id TEXT NOT NULL,
      worker_id TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('STARTED', 'COMPLETED', 'FAILED')),
      idempotency_key TEXT NOT NULL,
      semantic_fingerprint TEXT NOT NULL,
      document_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (intent_id) REFERENCES foundational_action_intents(id),
      UNIQUE (workspace_id, idempotency_key)
    ) STRICT;
    CREATE INDEX IF NOT EXISTS source_compatibility_reprobe_executions_scope_idx
      ON source_compatibility_reprobe_executions(
        workspace_id, jurisdiction, target_id, updated_at DESC, id DESC
      );
  `);
  INITIALIZED_DATABASES.add(database);
}

export class SqliteSourceCompatibilityReprobeExecutionRepository {
  constructor(
    private readonly database: DatabaseSync,
    private readonly clock: () => Date = () => new Date(),
  ) {
    ensureLedger(database);
  }

  start(input: {
    intentId: string;
    workerId: string;
    executedByActorId: string;
    idempotencyKey: string;
  }): SourceCompatibilityReprobeExecution {
    const workerId = normalizeActor(input.workerId, "workerId");
    const executedByActorId = normalizeActor(input.executedByActorId, "executedByActorId");
    const idempotencyKey = normalizeKey(input.idempotencyKey);
    const intent = new SqliteFoundationalActionIntentRepository(this.database, this.clock).getById(
      input.intentId,
    );
    if (!intent) {
      throw new RegistryConflictError(
        "SOURCE_COMPATIBILITY_REPROBE_INTENT_NOT_FOUND",
        `Foundational action intent ${input.intentId.trim()} was not found`,
      );
    }
    if (intent.status !== "APPROVED" || !intent.approvedByActorId) {
      throw new RegistryConflictError(
        "SOURCE_COMPATIBILITY_REPROBE_INTENT_NOT_APPROVED",
        "Compatibility re-probe requires an APPROVED foundational action intent",
        { status: intent.status },
      );
    }
    if (
      intent.readinessStage !== "HEALTH" ||
      intent.actionCode !== "REPROBE_SOURCE_COMPATIBILITY" ||
      intent.executionPath !== "MANUAL_OPERATOR" ||
      intent.collectionAuthorizationRequired !== false ||
      intent.automaticExecution !== false ||
      intent.executionAuthorization !== "NONE"
    ) {
      throw new RegistryConflictError(
        "SOURCE_COMPATIBILITY_REPROBE_INTENT_UNSUPPORTED",
        "Only approved HEALTH / REPROBE_SOURCE_COMPATIBILITY intents can start a compatibility re-probe",
        { actionCode: intent.actionCode, readinessStage: intent.readinessStage },
      );
    }

    const fingerprint = semanticFingerprint({
      intentId: intent.intentId,
      workspaceId: intent.workspaceId,
      targetId: intent.targetId,
      workerId,
      executedByActorId,
    });
    const byIntent = this.database
      .prepare("SELECT * FROM source_compatibility_reprobe_executions WHERE intent_id = ?")
      .get(intent.intentId) as unknown as ExecutionRow | undefined;
    if (byIntent) {
      if (
        byIntent.semantic_fingerprint !== fingerprint ||
        byIntent.idempotency_key !== idempotencyKey
      ) {
        throw new RegistryConflictError(
          "SOURCE_COMPATIBILITY_REPROBE_INTENT_ALREADY_EXECUTED",
          "This compatibility re-probe intent is already bound to another execution",
          { executionId: byIntent.id },
        );
      }
      return rowExecution(byIntent, true);
    }

    const byKey = this.database
      .prepare(
        `SELECT * FROM source_compatibility_reprobe_executions
          WHERE workspace_id = ? AND idempotency_key = ?`,
      )
      .get(intent.workspaceId, idempotencyKey) as unknown as ExecutionRow | undefined;
    if (byKey) {
      if (byKey.semantic_fingerprint !== fingerprint) {
        throw new RegistryConflictError(
          "SOURCE_COMPATIBILITY_REPROBE_IDEMPOTENCY_CONFLICT",
          "idempotencyKey is already bound to another compatibility re-probe execution",
        );
      }
      return rowExecution(byKey, true);
    }

    const startedAt = this.clock().toISOString();
    const executionId = sourceCompatibilityReprobeExecutionId(intent.workspaceId, idempotencyKey);
    const execution: SourceCompatibilityReprobeExecution = {
      version: SOURCE_COMPATIBILITY_REPROBE_EXECUTION_VERSION,
      objectType: "SOURCE_COMPATIBILITY_REPROBE_EXECUTION",
      executionId,
      intentId: intent.intentId,
      workspaceId: intent.workspaceId,
      jurisdiction: intent.jurisdiction,
      targetId: intent.targetId,
      requestedByActorId: intent.requestedByActorId,
      approvedByActorId: intent.approvedByActorId,
      executedByActorId,
      workerId,
      status: "STARTED",
      idempotencyKey,
      startedAt,
      completedAt: null,
      observationId: null,
      observationObservedAt: null,
      observationState: null,
      errorCode: null,
      errorMessage: null,
      replayed: false,
    };
    this.database
      .prepare(
        `INSERT INTO source_compatibility_reprobe_executions (
          id, intent_id, workspace_id, jurisdiction, target_id, executed_by_actor_id,
          worker_id, status, idempotency_key, semantic_fingerprint, document_json,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        execution.executionId,
        execution.intentId,
        execution.workspaceId,
        execution.jurisdiction,
        execution.targetId,
        execution.executedByActorId,
        execution.workerId,
        execution.status,
        execution.idempotencyKey,
        fingerprint,
        JSON.stringify(execution),
        startedAt,
        startedAt,
      );
    return execution;
  }

  complete(input: {
    executionId: string;
    workerId: string;
    observedAt: string;
    state: SourceCompatibilityState;
  }): SourceCompatibilityReprobeExecution {
    const execution = this.requireExecution(input.executionId);
    const workerId = normalizeActor(input.workerId, "workerId");
    if (execution.workerId !== workerId) {
      throw new RegistryConflictError(
        "SOURCE_COMPATIBILITY_REPROBE_WORKER_MISMATCH",
        "Compatibility re-probe can only be completed by the worker that started it",
      );
    }
    if (!SOURCE_COMPATIBILITY_STATES.includes(input.state)) {
      throw new RegistryValidationError("state is invalid");
    }
    const observedAt = new Date(input.observedAt);
    if (Number.isNaN(observedAt.getTime())) {
      throw new RegistryValidationError("observedAt must be an ISO timestamp");
    }
    const normalizedObservedAt = observedAt.toISOString();
    if (execution.status === "COMPLETED") {
      if (
        execution.observationObservedAt === normalizedObservedAt &&
        execution.observationState === input.state
      ) {
        return { ...execution, replayed: true };
      }
      throw new RegistryConflictError(
        "SOURCE_COMPATIBILITY_REPROBE_ALREADY_COMPLETED",
        "Compatibility re-probe execution is already completed with another observation",
      );
    }
    if (execution.status === "FAILED") {
      throw new RegistryConflictError(
        "SOURCE_COMPATIBILITY_REPROBE_ALREADY_FAILED",
        "Failed compatibility re-probe executions cannot be completed",
      );
    }

    const observation = this.database
      .prepare(
        `SELECT id, state, details_json
           FROM source_compatibility_observations
          WHERE target_id = ? AND observed_at = ?`,
      )
      .get(execution.targetId, normalizedObservedAt) as
      { id: string; state: string; details_json: string } | undefined;
    if (!observation || observation.state !== input.state) {
      throw new RegistryConflictError(
        "SOURCE_COMPATIBILITY_REPROBE_OBSERVATION_MISSING",
        "Completion requires the matching persisted compatibility observation",
        { targetId: execution.targetId, observedAt: normalizedObservedAt, state: input.state },
      );
    }
    const details = JSON.parse(observation.details_json || "{}") as Record<string, unknown>;
    if (details.recordedByWorkerId !== workerId) {
      throw new RegistryConflictError(
        "SOURCE_COMPATIBILITY_REPROBE_OBSERVATION_WORKER_MISMATCH",
        "Completion observation was not recorded by the worker that started the re-probe",
      );
    }

    const completedAt = this.clock().toISOString();
    const next: SourceCompatibilityReprobeExecution = {
      ...execution,
      status: "COMPLETED",
      completedAt,
      observationId: observation.id,
      observationObservedAt: normalizedObservedAt,
      observationState: input.state,
      errorCode: null,
      errorMessage: null,
      replayed: false,
    };
    this.persist(next, completedAt);
    return next;
  }

  fail(input: {
    executionId: string;
    workerId: string;
    errorCode: string;
    errorMessage: string;
  }): SourceCompatibilityReprobeExecution {
    const execution = this.requireExecution(input.executionId);
    const workerId = normalizeActor(input.workerId, "workerId");
    if (execution.workerId !== workerId) {
      throw new RegistryConflictError(
        "SOURCE_COMPATIBILITY_REPROBE_WORKER_MISMATCH",
        "Compatibility re-probe can only be failed by the worker that started it",
      );
    }
    const errorCode = input.errorCode.trim();
    const errorMessage = input.errorMessage.trim();
    if (!errorCode) throw new RegistryValidationError("errorCode is required");
    if (!errorMessage) throw new RegistryValidationError("errorMessage is required");
    if (execution.status === "COMPLETED") {
      throw new RegistryConflictError(
        "SOURCE_COMPATIBILITY_REPROBE_ALREADY_COMPLETED",
        "Completed compatibility re-probe executions cannot be failed",
      );
    }
    if (execution.status === "FAILED") {
      if (execution.errorCode === errorCode && execution.errorMessage === errorMessage) {
        return { ...execution, replayed: true };
      }
      throw new RegistryConflictError(
        "SOURCE_COMPATIBILITY_REPROBE_ALREADY_FAILED",
        "Compatibility re-probe execution is already failed with another error",
      );
    }

    const completedAt = this.clock().toISOString();
    const next: SourceCompatibilityReprobeExecution = {
      ...execution,
      status: "FAILED",
      completedAt,
      errorCode,
      errorMessage,
      replayed: false,
    };
    this.persist(next, completedAt);
    return next;
  }

  getByIntentId(intentId: string): SourceCompatibilityReprobeExecution | null {
    const normalized = intentId.trim();
    if (!normalized) throw new RegistryValidationError("intentId is required");
    const row = this.database
      .prepare("SELECT * FROM source_compatibility_reprobe_executions WHERE intent_id = ?")
      .get(normalized) as unknown as ExecutionRow | undefined;
    return row ? rowExecution(row) : null;
  }

  getById(executionId: string): SourceCompatibilityReprobeExecution | null {
    const normalized = normalizedExecutionId(executionId);
    const row = this.database
      .prepare("SELECT * FROM source_compatibility_reprobe_executions WHERE id = ?")
      .get(normalized) as unknown as ExecutionRow | undefined;
    return row ? rowExecution(row) : null;
  }

  private requireExecution(executionId: string): SourceCompatibilityReprobeExecution {
    const execution = this.getById(executionId);
    if (!execution) {
      throw new RegistryConflictError(
        "SOURCE_COMPATIBILITY_REPROBE_EXECUTION_NOT_FOUND",
        `Compatibility re-probe execution ${executionId.trim()} was not found`,
      );
    }
    return execution;
  }

  private persist(execution: SourceCompatibilityReprobeExecution, updatedAt: string): void {
    this.database
      .prepare(
        `UPDATE source_compatibility_reprobe_executions
            SET status = ?, document_json = ?, updated_at = ?
          WHERE id = ?`,
      )
      .run(execution.status, JSON.stringify(execution), updatedAt, execution.executionId);
  }
}
