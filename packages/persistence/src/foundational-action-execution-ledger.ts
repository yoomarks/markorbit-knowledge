import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import type { CollectionRunStatus } from "@markorbit/contracts";
import { SqliteExecutionLedgerRepository, ensureExecutionLedger } from "./execution-ledger";
import { SqliteFoundationalActionIntentRepository } from "./foundational-action-intent-ledger";
import { RegistryConflictError, RegistryValidationError } from "./index";

const MIGRATION_ID = "0018_foundational_action_executions";
const KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;
const ACTOR = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,199}$/;
const INTENT_ID = /^fai_[a-f0-9]{32}$/;
const EXECUTION_ID = /^fae_[a-f0-9]{32}$/;
const MAX_LIMIT = 100;

export type FoundationalActionExecutionRecord = {
  protocolVersion: "1.0";
  objectType: "FOUNDATIONAL_ACTION_EXECUTION";
  executionId: string;
  intentId: string;
  workspaceId: string;
  jurisdiction: string;
  targetId: string;
  readinessStage: "COLLECT";
  actionCode: "DISPATCH_GOVERNED_COLLECTION";
  executionPath: "FOUNDATIONAL_OPERATOR_EXPLICIT_DISPATCH";
  status: "DISPATCHED";
  requestedByActorId: string;
  approvedByActorId: string;
  executedByActorId: string;
  approvalMode: "APPROVED_INTENT_PLUS_EXPLICIT_EXECUTE";
  explicitExecute: true;
  automaticExecution: false;
  collectionAuthorization: "EXPLICIT_SINGLE_TARGET_MANUAL_DISPATCH";
  executionAuthorization: "CONSUMED_BY_DISPATCH";
  sourceId: string;
  planId: string;
  runId: string;
  jobIds: string[];
  runStatusAtDispatch: CollectionRunStatus;
  idempotencyKey: string;
  intentUpdatedAt: string;
  sourceSnapshotObservedAt: string;
  revalidatedAt: string;
  dispatchedAt: string;
  replayed: boolean;
};

export type FoundationalActionExecutionListFilters = {
  workspaceId: string;
  jurisdiction?: string;
  targetId?: string;
  executedByActorId?: string;
  limit?: number;
};

type ExecutionRow = {
  id: string;
  intent_id: string;
  workspace_id: string;
  jurisdiction: string;
  target_id: string;
  action_code: "DISPATCH_GOVERNED_COLLECTION";
  executed_by_actor_id: string;
  run_id: string;
  idempotency_key: string;
  semantic_fingerprint: string;
  document_json: string;
  dispatched_at: string;
};

export function foundationalActionExecutionId(workspaceId: string, idempotencyKey: string): string {
  const digest = createHash("sha256").update(`${workspaceId}\u0000${idempotencyKey}`).digest("hex");
  return `fae_${digest.slice(0, 32)}`;
}

function rowExecution(row: ExecutionRow, replayed = false): FoundationalActionExecutionRecord {
  const parsed = JSON.parse(row.document_json) as FoundationalActionExecutionRecord;
  return { ...parsed, replayed };
}

function fingerprint(execution: FoundationalActionExecutionRecord): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        intentId: execution.intentId,
        workspaceId: execution.workspaceId,
        targetId: execution.targetId,
        actionCode: execution.actionCode,
        executedByActorId: execution.executedByActorId,
        sourceId: execution.sourceId,
        planId: execution.planId,
        runId: execution.runId,
      }),
    )
    .digest("hex");
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

function assertExecution(execution: FoundationalActionExecutionRecord): void {
  if (!EXECUTION_ID.test(execution.executionId)) {
    throw new RegistryValidationError("executionId is invalid");
  }
  if (!INTENT_ID.test(execution.intentId)) throw new RegistryValidationError("intentId is invalid");
  if (!execution.workspaceId.trim()) throw new RegistryValidationError("workspaceId is required");
  if (!execution.jurisdiction.trim()) throw new RegistryValidationError("jurisdiction is required");
  if (!execution.targetId.trim()) throw new RegistryValidationError("targetId is required");
  if (!ACTOR.test(execution.executedByActorId)) {
    throw new RegistryValidationError("executedByActorId is invalid");
  }
  if (!KEY.test(execution.idempotencyKey)) {
    throw new RegistryValidationError("idempotencyKey is invalid");
  }
  if (
    execution.protocolVersion !== "1.0" ||
    execution.objectType !== "FOUNDATIONAL_ACTION_EXECUTION" ||
    execution.readinessStage !== "COLLECT" ||
    execution.actionCode !== "DISPATCH_GOVERNED_COLLECTION" ||
    execution.executionPath !== "FOUNDATIONAL_OPERATOR_EXPLICIT_DISPATCH" ||
    execution.status !== "DISPATCHED" ||
    execution.explicitExecute !== true ||
    execution.automaticExecution !== false ||
    execution.collectionAuthorization !== "EXPLICIT_SINGLE_TARGET_MANUAL_DISPATCH" ||
    execution.executionAuthorization !== "CONSUMED_BY_DISPATCH"
  ) {
    throw new RegistryValidationError("Foundational action execution policy fields are invalid");
  }
  if (
    execution.executionId !==
    foundationalActionExecutionId(execution.workspaceId, execution.idempotencyKey)
  ) {
    throw new RegistryValidationError("executionId does not match workspace/idempotency identity");
  }
  if (!execution.runId.trim() || !execution.sourceId.trim() || !execution.planId.trim()) {
    throw new RegistryValidationError("sourceId, planId and runId are required");
  }
  if (execution.jobIds.length === 0 || execution.jobIds.some((value) => !value.trim())) {
    throw new RegistryValidationError("At least one jobId is required");
  }
}

function ensureLedger(database: DatabaseSync): void {
  ensureExecutionLedger(database);
  new SqliteFoundationalActionIntentRepository(database);
  if (database.prepare("SELECT id FROM schema_migrations WHERE id = ?").get(MIGRATION_ID)) return;
  database.exec("BEGIN IMMEDIATE;");
  try {
    database.exec(`
      CREATE TABLE IF NOT EXISTS foundational_action_executions (
        id TEXT PRIMARY KEY,
        intent_id TEXT NOT NULL UNIQUE,
        workspace_id TEXT NOT NULL,
        jurisdiction TEXT NOT NULL,
        target_id TEXT NOT NULL,
        action_code TEXT NOT NULL CHECK (action_code = 'DISPATCH_GOVERNED_COLLECTION'),
        executed_by_actor_id TEXT NOT NULL,
        run_id TEXT NOT NULL UNIQUE,
        idempotency_key TEXT NOT NULL,
        semantic_fingerprint TEXT NOT NULL,
        document_json TEXT NOT NULL,
        dispatched_at TEXT NOT NULL,
        FOREIGN KEY (intent_id) REFERENCES foundational_action_intents(id),
        FOREIGN KEY (run_id) REFERENCES collection_runs(id),
        UNIQUE (workspace_id, idempotency_key)
      ) STRICT;

      CREATE INDEX IF NOT EXISTS idx_foundational_action_executions_scope
        ON foundational_action_executions(workspace_id, jurisdiction, target_id, dispatched_at DESC);
      CREATE INDEX IF NOT EXISTS idx_foundational_action_executions_actor
        ON foundational_action_executions(workspace_id, executed_by_actor_id, dispatched_at DESC);
    `);
    database
      .prepare("INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)")
      .run(MIGRATION_ID, new Date().toISOString());
    database.exec("COMMIT;");
  } catch (error) {
    database.exec("ROLLBACK;");
    throw error;
  }
}

export class SqliteFoundationalActionExecutionRepository {
  constructor(private readonly database: DatabaseSync) {
    ensureLedger(database);
  }

  create(execution: FoundationalActionExecutionRecord): FoundationalActionExecutionRecord {
    assertExecution(execution);
    const intent = new SqliteFoundationalActionIntentRepository(this.database).getById(
      execution.intentId,
    );
    if (!intent) {
      throw new RegistryConflictError(
        "FOUNDATIONAL_ACTION_INTENT_NOT_FOUND",
        `Foundational action intent ${execution.intentId} was not found`,
      );
    }
    if (
      intent.status !== "APPROVED" ||
      intent.workspaceId !== execution.workspaceId ||
      intent.jurisdiction !== execution.jurisdiction ||
      intent.targetId !== execution.targetId ||
      intent.readinessStage !== "COLLECT" ||
      intent.actionCode !== "DISPATCH_GOVERNED_COLLECTION" ||
      intent.executionPath !== "FOUNDATIONAL_OPERATOR_EXPLICIT_DISPATCH" ||
      !intent.approvedByActorId ||
      intent.approvedByActorId !== execution.approvedByActorId
    ) {
      throw new RegistryConflictError(
        "FOUNDATIONAL_ACTION_EXECUTION_INTENT_MISMATCH",
        "Execution does not match an approved COLLECT action intent",
      );
    }

    const runRecord = new SqliteExecutionLedgerRepository(this.database).getById(execution.runId);
    if (!runRecord) {
      throw new RegistryConflictError(
        "FOUNDATIONAL_ACTION_EXECUTION_RUN_NOT_FOUND",
        `Collection run ${execution.runId} was not found`,
      );
    }
    const runJobIds = runRecord.jobs.map((job) => job.id);
    if (
      runRecord.run.workspaceId !== execution.workspaceId ||
      runRecord.run.sourceId !== execution.sourceId ||
      runRecord.run.planId !== execution.planId ||
      !sameStrings(runJobIds, execution.jobIds)
    ) {
      throw new RegistryConflictError(
        "FOUNDATIONAL_ACTION_EXECUTION_RUN_MISMATCH",
        "Execution does not match the persisted CollectionRun/Job record",
      );
    }

    const semanticFingerprint = fingerprint(execution);
    const byKey = this.database
      .prepare(
        `SELECT * FROM foundational_action_executions
          WHERE workspace_id = ? AND idempotency_key = ?`,
      )
      .get(execution.workspaceId, execution.idempotencyKey) as unknown as ExecutionRow | undefined;
    if (byKey) {
      if (byKey.semantic_fingerprint !== semanticFingerprint) {
        throw new RegistryConflictError(
          "FOUNDATIONAL_ACTION_EXECUTION_IDEMPOTENCY_CONFLICT",
          "Idempotency key is already bound to a different foundational action execution",
        );
      }
      return rowExecution(byKey, true);
    }

    const byIntent = this.database
      .prepare("SELECT * FROM foundational_action_executions WHERE intent_id = ?")
      .get(execution.intentId) as unknown as ExecutionRow | undefined;
    if (byIntent) {
      if (byIntent.semantic_fingerprint === semanticFingerprint)
        return rowExecution(byIntent, true);
      throw new RegistryConflictError(
        "FOUNDATIONAL_ACTION_INTENT_ALREADY_EXECUTED",
        "This foundational action intent already dispatched a collection run",
        { runId: byIntent.run_id },
      );
    }

    const stored = { ...execution, replayed: false };
    this.database
      .prepare(
        `INSERT INTO foundational_action_executions
         (id, intent_id, workspace_id, jurisdiction, target_id, action_code,
          executed_by_actor_id, run_id, idempotency_key, semantic_fingerprint,
          document_json, dispatched_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        stored.executionId,
        stored.intentId,
        stored.workspaceId,
        stored.jurisdiction,
        stored.targetId,
        stored.actionCode,
        stored.executedByActorId,
        stored.runId,
        stored.idempotencyKey,
        semanticFingerprint,
        JSON.stringify(stored),
        stored.dispatchedAt,
      );
    return stored;
  }

  getByIntentId(intentIdRaw: string): FoundationalActionExecutionRecord | null {
    const intentId = intentIdRaw.trim();
    if (!INTENT_ID.test(intentId)) throw new RegistryValidationError("intentId is invalid");
    const row = this.database
      .prepare("SELECT * FROM foundational_action_executions WHERE intent_id = ?")
      .get(intentId) as unknown as ExecutionRow | undefined;
    return row ? rowExecution(row) : null;
  }

  list(filters: FoundationalActionExecutionListFilters): FoundationalActionExecutionRecord[] {
    const workspaceId = filters.workspaceId.trim();
    if (!workspaceId) throw new RegistryValidationError("workspaceId is required");
    const limitRaw = filters.limit ?? 50;
    if (!Number.isSafeInteger(limitRaw) || limitRaw <= 0) {
      throw new RegistryValidationError("limit must be a positive integer");
    }
    const where = ["workspace_id = ?"];
    const values: Array<string | number> = [workspaceId];
    if (filters.jurisdiction?.trim()) {
      where.push("jurisdiction = ?");
      values.push(filters.jurisdiction.trim());
    }
    if (filters.targetId?.trim()) {
      where.push("target_id = ?");
      values.push(filters.targetId.trim());
    }
    if (filters.executedByActorId?.trim()) {
      where.push("executed_by_actor_id = ?");
      values.push(filters.executedByActorId.trim());
    }
    values.push(Math.min(limitRaw, MAX_LIMIT));
    const rows = this.database
      .prepare(
        `SELECT * FROM foundational_action_executions
          WHERE ${where.join(" AND ")}
          ORDER BY dispatched_at DESC, id DESC
          LIMIT ?`,
      )
      .all(...values) as unknown as ExecutionRow[];
    return rows.map((row) => rowExecution(row));
  }
}
