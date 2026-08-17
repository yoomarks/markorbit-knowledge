import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { RegistryConflictError, RegistryValidationError, initializeRegistry } from "./index";

const MIGRATION_ID = "0017_foundational_action_intents";
const KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;
const ACTOR = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,199}$/;
const ID = /^fai_[a-f0-9]{32}$/;
const MAX_LIMIT = 100;

export type FoundationalActionIntentRecord = {
  protocolVersion: "1.0";
  objectType: "FOUNDATIONAL_ACTION_INTENT";
  intentId: string;
  workspaceId: string;
  jurisdiction: string;
  targetId: string;
  readinessStage:
    "REGISTER" | "COLLECT" | "INGEST" | "CONVERT" | "INDEX" | "QUALITY" | "RELEVANCE" | "HEALTH";
  actionCode:
    | "REGISTER_SOURCE"
    | "DISPATCH_GOVERNED_COLLECTION"
    | "REVIEW_INGEST_EVIDENCE"
    | "RUN_CONVERSION_RECOVERY"
    | "REINDEX_VERIFIED_CANONICAL"
    | "OPEN_RETRIEVAL_REMEDIATION_PLAN"
    | "REVIEW_RELEVANCE_AUDIT_COVERAGE"
    | "REVIEW_RELEVANCE_PROBE_CONFIG"
    | "REVIEW_SOURCE_FILTERED_RETRIEVAL"
    | "REVIEW_GLOBAL_RETRIEVAL_RANKING"
    | "REVIEW_RELEVANCE_AUDIT"
    | "REPROBE_SOURCE_COMPATIBILITY"
    | "REVIEW_SUPPLY_HEALTH";
  operatorInstruction: string;
  executionPath:
    | "MANUAL_OPERATOR"
    | "FOUNDATIONAL_OPERATOR_EXPLICIT_DISPATCH"
    | "CONVERSION_RECOVERY"
    | "CANONICAL_INDEXING"
    | "M16_PLANNER_THEN_M17_EXPLICIT_OPERATOR"
    | "M18_RELEVANCE_AUDIT";
  collectionAuthorizationRequired: boolean;
  automaticExecution: false;
  executionAuthorization: "NONE";
  requestedByActorId: string;
  approvalRequired: true;
  approvedByActorId: string | null;
  canceledByActorId: string | null;
  status: "PENDING_APPROVAL" | "APPROVED" | "CANCELED";
  idempotencyKey: string;
  readinessProtocolVersion: string;
  queueProtocolVersion: string;
  sourceSnapshotObservedAt: string;
  createdAt: string;
  updatedAt: string;
  replayed: boolean;
};

export type FoundationalActionIntentListFilters = {
  workspaceId: string;
  jurisdiction?: string;
  targetId?: string;
  status?: FoundationalActionIntentRecord["status"];
  limit?: number;
};

type IntentRow = {
  id: string;
  workspace_id: string;
  jurisdiction: string;
  target_id: string;
  readiness_stage: FoundationalActionIntentRecord["readinessStage"];
  action_code: FoundationalActionIntentRecord["actionCode"];
  status: FoundationalActionIntentRecord["status"];
  requested_by_actor_id: string;
  idempotency_key: string;
  semantic_fingerprint: string;
  document_json: string;
  created_at: string;
  updated_at: string;
};

export function foundationalActionIntentId(workspaceId: string, idempotencyKey: string): string {
  const digest = createHash("sha256").update(`${workspaceId}\u0000${idempotencyKey}`).digest("hex");
  return `fai_${digest.slice(0, 32)}`;
}

function semanticFingerprint(intent: FoundationalActionIntentRecord): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        workspaceId: intent.workspaceId,
        jurisdiction: intent.jurisdiction,
        targetId: intent.targetId,
        readinessStage: intent.readinessStage,
        actionCode: intent.actionCode,
        requestedByActorId: intent.requestedByActorId,
      }),
    )
    .digest("hex");
}

function rowIntent(row: IntentRow, replayed = false): FoundationalActionIntentRecord {
  const parsed = JSON.parse(row.document_json) as FoundationalActionIntentRecord;
  return { ...parsed, replayed };
}

function assertIntent(intent: FoundationalActionIntentRecord): void {
  if (!ID.test(intent.intentId)) throw new RegistryValidationError("intentId is invalid");
  if (!intent.workspaceId.trim()) throw new RegistryValidationError("workspaceId is required");
  if (!intent.jurisdiction.trim()) throw new RegistryValidationError("jurisdiction is required");
  if (!intent.targetId.trim()) throw new RegistryValidationError("targetId is required");
  if (!ACTOR.test(intent.requestedByActorId)) {
    throw new RegistryValidationError("requestedByActorId is invalid");
  }
  if (!KEY.test(intent.idempotencyKey)) {
    throw new RegistryValidationError("idempotencyKey is invalid");
  }
  if (intent.automaticExecution !== false || intent.executionAuthorization !== "NONE") {
    throw new RegistryValidationError(
      "Foundational action intents cannot carry execution authorization",
    );
  }
  if (intent.approvalRequired !== true || intent.status !== "PENDING_APPROVAL") {
    throw new RegistryValidationError(
      "New foundational action intents must start PENDING_APPROVAL",
    );
  }
  if (intent.intentId !== foundationalActionIntentId(intent.workspaceId, intent.idempotencyKey)) {
    throw new RegistryValidationError("intentId does not match workspace/idempotency identity");
  }
}

function ensureLedger(database: DatabaseSync): void {
  initializeRegistry(database);
  if (database.prepare("SELECT id FROM schema_migrations WHERE id = ?").get(MIGRATION_ID)) return;
  database.exec("BEGIN IMMEDIATE;");
  try {
    database.exec(`
      CREATE TABLE IF NOT EXISTS foundational_action_intents (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        jurisdiction TEXT NOT NULL,
        target_id TEXT NOT NULL,
        readiness_stage TEXT NOT NULL CHECK (readiness_stage IN ('REGISTER','COLLECT','INGEST','CONVERT','INDEX','QUALITY','RELEVANCE','HEALTH')),
        action_code TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('PENDING_APPROVAL','APPROVED','CANCELED')),
        requested_by_actor_id TEXT NOT NULL,
        idempotency_key TEXT NOT NULL,
        semantic_fingerprint TEXT NOT NULL,
        document_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE (workspace_id, idempotency_key)
      ) STRICT;

      CREATE INDEX IF NOT EXISTS idx_foundational_action_intents_scope
        ON foundational_action_intents(workspace_id, jurisdiction, target_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_foundational_action_intents_status
        ON foundational_action_intents(workspace_id, status, updated_at DESC);
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

export class SqliteFoundationalActionIntentRepository {
  constructor(
    private readonly database: DatabaseSync,
    private readonly clock: () => Date = () => new Date(),
  ) {
    ensureLedger(database);
  }

  create(intent: FoundationalActionIntentRecord): FoundationalActionIntentRecord {
    assertIntent(intent);
    const fingerprint = semanticFingerprint(intent);
    const existing = this.database
      .prepare(
        `SELECT * FROM foundational_action_intents
          WHERE workspace_id = ? AND idempotency_key = ?`,
      )
      .get(intent.workspaceId, intent.idempotencyKey) as unknown as IntentRow | undefined;
    if (existing) {
      if (existing.semantic_fingerprint !== fingerprint) {
        throw new RegistryConflictError(
          "FOUNDATIONAL_ACTION_INTENT_IDEMPOTENCY_CONFLICT",
          "Idempotency key is already bound to a different foundational action intent",
        );
      }
      return rowIntent(existing, true);
    }

    const stored = { ...intent, replayed: false };
    this.database
      .prepare(
        `INSERT INTO foundational_action_intents
         (id, workspace_id, jurisdiction, target_id, readiness_stage, action_code, status,
          requested_by_actor_id, idempotency_key, semantic_fingerprint, document_json,
          created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        stored.intentId,
        stored.workspaceId,
        stored.jurisdiction,
        stored.targetId,
        stored.readinessStage,
        stored.actionCode,
        stored.status,
        stored.requestedByActorId,
        stored.idempotencyKey,
        fingerprint,
        JSON.stringify(stored),
        stored.createdAt,
        stored.updatedAt,
      );
    return stored;
  }

  getById(intentIdRaw: string): FoundationalActionIntentRecord | null {
    const intentId = intentIdRaw.trim();
    if (!ID.test(intentId)) throw new RegistryValidationError("intentId is invalid");
    const row = this.database
      .prepare("SELECT * FROM foundational_action_intents WHERE id = ?")
      .get(intentId) as unknown as IntentRow | undefined;
    return row ? rowIntent(row) : null;
  }

  approve(intentIdRaw: string, actorIdRaw: string): FoundationalActionIntentRecord {
    return this.transition(intentIdRaw, actorIdRaw, "APPROVED");
  }

  cancel(intentIdRaw: string, actorIdRaw: string): FoundationalActionIntentRecord {
    return this.transition(intentIdRaw, actorIdRaw, "CANCELED");
  }

  list(filters: FoundationalActionIntentListFilters): FoundationalActionIntentRecord[] {
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
    if (filters.status) {
      where.push("status = ?");
      values.push(filters.status);
    }
    values.push(Math.min(limitRaw, MAX_LIMIT));
    const rows = this.database
      .prepare(
        `SELECT * FROM foundational_action_intents
          WHERE ${where.join(" AND ")}
          ORDER BY updated_at DESC, id DESC
          LIMIT ?`,
      )
      .all(...values) as unknown as IntentRow[];
    return rows.map((row) => rowIntent(row));
  }

  private transition(
    intentIdRaw: string,
    actorIdRaw: string,
    nextStatus: "APPROVED" | "CANCELED",
  ): FoundationalActionIntentRecord {
    const current = this.getById(intentIdRaw);
    if (!current) {
      throw new RegistryConflictError(
        "FOUNDATIONAL_ACTION_INTENT_NOT_FOUND",
        `Foundational action intent ${intentIdRaw.trim()} was not found`,
      );
    }
    const actorId = actorIdRaw.trim();
    if (!ACTOR.test(actorId)) throw new RegistryValidationError("actorId is invalid");
    if (current.status === "CANCELED") {
      if (nextStatus === "CANCELED" && current.canceledByActorId === actorId) return current;
      throw new RegistryConflictError(
        "FOUNDATIONAL_ACTION_INTENT_FINALIZED",
        "Canceled foundational action intents cannot be approved or changed",
      );
    }
    if (current.status === "APPROVED" && nextStatus === "APPROVED") {
      if (current.approvedByActorId === actorId) return current;
      throw new RegistryConflictError(
        "FOUNDATIONAL_ACTION_INTENT_ALREADY_APPROVED",
        "Foundational action intent was already approved by another actor",
      );
    }

    const updatedAt = this.clock().toISOString();
    const next: FoundationalActionIntentRecord = {
      ...current,
      status: nextStatus,
      approvedByActorId: nextStatus === "APPROVED" ? actorId : current.approvedByActorId,
      canceledByActorId: nextStatus === "CANCELED" ? actorId : current.canceledByActorId,
      updatedAt,
      replayed: false,
      executionAuthorization: "NONE",
      automaticExecution: false,
    };
    this.database
      .prepare(
        `UPDATE foundational_action_intents
            SET status = ?, document_json = ?, updated_at = ?
          WHERE id = ?`,
      )
      .run(next.status, JSON.stringify(next), updatedAt, next.intentId);
    return next;
  }
}
