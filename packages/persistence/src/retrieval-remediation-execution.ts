import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import {
  RegistryConflictError,
  RegistryError,
  RegistryValidationError,
  initializeRegistry,
} from "./index";
import { ensureRetrievalIndex } from "./retrieval-index";
import {
  SqliteRetrievalQualityAuditRepository,
  type RetrievalQualityAuditRecord,
  type RetrievalQualityGap,
} from "./retrieval-quality-audit";
import {
  deriveRetrievalQualityRemediationActions,
  type RetrievalQualityRemediationActionCode,
} from "./retrieval-quality-remediation";

const MIGRATION_ID = "0016_retrieval_remediation_execution";
const KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;
const ACTOR = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,199}$/;
const MAX_LIMIT = 100;

const VERSION_GAPS = new Set<RetrievalQualityGap>([
  "MULTIPLE_CURRENT_VERSIONS",
  "CURRENT_VERSION_NOT_LATEST",
]);
const INDEX_GAPS = new Set<RetrievalQualityGap>([
  "NO_CHUNKS",
  "CHUNK_COUNT_MISMATCH",
  "CHUNK_ORDINAL_GAP",
  "EMPTY_CHUNK",
  "FTS_ROW_COUNT_MISMATCH",
]);

export const RETRIEVAL_REMEDIATION_EXECUTION_PROTOCOL_VERSION = "1.0" as const;

export type RetrievalRemediationExecutableAction =
  "RECONCILE_CURRENT_VERSION" | "REBUILD_RETRIEVAL_INDEX";

export type ExecuteRetrievalRemediationInput = {
  workspaceId: string;
  stagingDocumentId: string;
  actionCode: RetrievalQualityRemediationActionCode;
  actorId: string;
  idempotencyKey: string;
  approved: boolean;
};

export type RetrievalRemediationExecution = {
  protocolVersion: typeof RETRIEVAL_REMEDIATION_EXECUTION_PROTOCOL_VERSION;
  objectType: "RETRIEVAL_REMEDIATION_EXECUTION";
  executionId: string;
  workspaceId: string;
  sourceId: string;
  documentId: string;
  stagingDocumentId: string;
  artifactVersion: number;
  actionCode: RetrievalRemediationExecutableAction;
  actorId: string;
  approvalMode: "EXPLICIT_OPERATOR";
  status: "COMPLETED";
  beforeGaps: RetrievalQualityGap[];
  afterGaps: RetrievalQualityGap[];
  effects: string[];
  executedAt: string;
  idempotencyKey: string;
  replayed: boolean;
};

export type RetrievalRemediationExecutionList = {
  protocolVersion: typeof RETRIEVAL_REMEDIATION_EXECUTION_PROTOCOL_VERSION;
  objectType: "RETRIEVAL_REMEDIATION_EXECUTION_LIST";
  workspaceId: string;
  items: RetrievalRemediationExecution[];
};

type ExecutionRow = {
  id: string;
  workspace_id: string;
  source_id: string;
  document_id: string;
  staging_document_id: string;
  artifact_version: number;
  action_code: RetrievalRemediationExecutableAction;
  actor_id: string;
  before_gaps_json: string;
  after_gaps_json: string;
  effects_json: string;
  executed_at: string;
  idempotency_key: string;
};

type FtsChunkRow = {
  chunk_id: string;
  workspace_id: string;
  source_id: string;
  title: string;
  heading_path_json: string;
  text: string;
};

function executionId(workspaceId: string, idempotencyKey: string): string {
  const digest = createHash("sha256").update(`${workspaceId}\u0000${idempotencyKey}`).digest("hex");
  return `rrx_${digest.slice(0, 32)}`;
}

function rowExecution(row: ExecutionRow, replayed: boolean): RetrievalRemediationExecution {
  return {
    protocolVersion: RETRIEVAL_REMEDIATION_EXECUTION_PROTOCOL_VERSION,
    objectType: "RETRIEVAL_REMEDIATION_EXECUTION",
    executionId: row.id,
    workspaceId: row.workspace_id,
    sourceId: row.source_id,
    documentId: row.document_id,
    stagingDocumentId: row.staging_document_id,
    artifactVersion: Number(row.artifact_version),
    actionCode: row.action_code,
    actorId: row.actor_id,
    approvalMode: "EXPLICIT_OPERATOR",
    status: "COMPLETED",
    beforeGaps: JSON.parse(row.before_gaps_json) as RetrievalQualityGap[],
    afterGaps: JSON.parse(row.after_gaps_json) as RetrievalQualityGap[],
    effects: JSON.parse(row.effects_json) as string[],
    executedAt: row.executed_at,
    idempotencyKey: row.idempotency_key,
    replayed,
  };
}

function assertExecutableAction(
  actionCode: RetrievalQualityRemediationActionCode,
): asserts actionCode is RetrievalRemediationExecutableAction {
  if (actionCode === "RESTORE_PROVENANCE_EVIDENCE") {
    throw new RegistryConflictError(
      "REMEDIATION_ACTION_MANUAL_ONLY",
      "Provenance restoration requires governed evidence recovery or a new acquisition/conversion version",
    );
  }
  if (actionCode === "REVIEW_DUPLICATE_CHUNKING") {
    throw new RegistryConflictError(
      "REMEDIATION_ACTION_MANUAL_ONLY",
      "Duplicate chunk review remains a human review action and does not authorize destructive deduplication",
    );
  }
}

function ensureExecutionRegistry(database: DatabaseSync): void {
  initializeRegistry(database);
  ensureRetrievalIndex(database);
  if (database.prepare("SELECT id FROM schema_migrations WHERE id = ?").get(MIGRATION_ID)) return;
  database.exec("BEGIN IMMEDIATE;");
  try {
    database.exec(`
      CREATE TABLE IF NOT EXISTS retrieval_remediation_executions (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        source_id TEXT NOT NULL,
        document_id TEXT NOT NULL,
        staging_document_id TEXT NOT NULL,
        artifact_version INTEGER NOT NULL CHECK (artifact_version > 0),
        action_code TEXT NOT NULL CHECK (action_code IN ('RECONCILE_CURRENT_VERSION','REBUILD_RETRIEVAL_INDEX')),
        actor_id TEXT NOT NULL,
        before_gaps_json TEXT NOT NULL,
        after_gaps_json TEXT NOT NULL,
        effects_json TEXT NOT NULL,
        executed_at TEXT NOT NULL,
        idempotency_key TEXT NOT NULL,
        UNIQUE (workspace_id, idempotency_key)
      ) STRICT;

      CREATE INDEX IF NOT EXISTS idx_retrieval_remediation_execution_document
        ON retrieval_remediation_executions(workspace_id, staging_document_id, executed_at DESC);
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

export class SqliteRetrievalRemediationExecutionRepository {
  private readonly audits: SqliteRetrievalQualityAuditRepository;

  constructor(
    private readonly database: DatabaseSync,
    private readonly clock: () => Date = () => new Date(),
  ) {
    ensureExecutionRegistry(database);
    this.audits = new SqliteRetrievalQualityAuditRepository(database, clock);
  }

  execute(input: ExecuteRetrievalRemediationInput): RetrievalRemediationExecution {
    const workspaceId = input.workspaceId.trim();
    const stagingDocumentId = input.stagingDocumentId.trim();
    const actorId = input.actorId.trim();
    const idempotencyKey = input.idempotencyKey.trim();
    if (!workspaceId) throw new RegistryValidationError("workspaceId is required");
    if (!stagingDocumentId) throw new RegistryValidationError("stagingDocumentId is required");
    if (!ACTOR.test(actorId)) throw new RegistryValidationError("actorId is invalid");
    if (!KEY.test(idempotencyKey)) throw new RegistryValidationError("idempotencyKey is invalid");
    if (input.approved !== true) {
      throw new RegistryConflictError(
        "REMEDIATION_EXPLICIT_APPROVAL_REQUIRED",
        "Controlled retrieval remediation requires approved=true from an explicit operator action",
      );
    }
    assertExecutableAction(input.actionCode);

    const replay = this.database
      .prepare(
        `SELECT * FROM retrieval_remediation_executions
          WHERE workspace_id = ? AND idempotency_key = ?`,
      )
      .get(workspaceId, idempotencyKey) as unknown as ExecutionRow | undefined;
    if (replay) {
      if (
        replay.staging_document_id !== stagingDocumentId ||
        replay.action_code !== input.actionCode ||
        replay.actor_id !== actorId
      ) {
        throw new RegistryConflictError(
          "REMEDIATION_IDEMPOTENCY_CONFLICT",
          "Idempotency key is already bound to a different remediation execution",
        );
      }
      return rowExecution(replay, true);
    }

    const before = this.auditRecord(workspaceId, stagingDocumentId);
    const plannedCodes = new Set(
      deriveRetrievalQualityRemediationActions(before.gaps).map((action) => action.code),
    );
    if (!plannedCodes.has(input.actionCode)) {
      throw new RegistryConflictError(
        "REMEDIATION_ACTION_NOT_CURRENTLY_REQUIRED",
        `Action ${input.actionCode} is not required by the current retrieval quality audit`,
      );
    }

    if (input.actionCode === "REBUILD_RETRIEVAL_INDEX") {
      const indexGaps = before.gaps.filter((gap) => INDEX_GAPS.has(gap));
      const unsupported = indexGaps.filter((gap) => gap !== "FTS_ROW_COUNT_MISMATCH");
      if (unsupported.length > 0) {
        throw new RegistryConflictError(
          "REMEDIATION_CANONICAL_REINDEX_REQUIRED",
          "Chunk-structure drift requires reindexing from verified canonical Markdown through the existing indexing boundary",
          { unsupportedGaps: unsupported },
        );
      }
    }

    const executedAt = this.clock().toISOString();
    const effects: string[] = [];
    let inTransaction = false;
    try {
      this.database.exec("BEGIN IMMEDIATE;");
      inTransaction = true;
      if (input.actionCode === "RECONCILE_CURRENT_VERSION") {
        effects.push(...this.reconcileCurrentVersion(before));
      } else {
        effects.push(...this.rebuildFtsProjection(before));
      }

      const after = this.auditRecord(workspaceId, stagingDocumentId);
      if (
        input.actionCode === "RECONCILE_CURRENT_VERSION" &&
        after.gaps.some((gap) => VERSION_GAPS.has(gap))
      ) {
        throw new RegistryConflictError(
          "REMEDIATION_VERIFICATION_FAILED",
          "Current-version reconciliation did not clear version projection gaps",
        );
      }
      if (
        input.actionCode === "REBUILD_RETRIEVAL_INDEX" &&
        after.gaps.includes("FTS_ROW_COUNT_MISMATCH")
      ) {
        throw new RegistryConflictError(
          "REMEDIATION_VERIFICATION_FAILED",
          "FTS projection rebuild did not restore retrieval row parity",
        );
      }

      const id = executionId(workspaceId, idempotencyKey);
      this.database
        .prepare(
          `INSERT INTO retrieval_remediation_executions
           (id, workspace_id, source_id, document_id, staging_document_id, artifact_version,
            action_code, actor_id, before_gaps_json, after_gaps_json, effects_json, executed_at,
            idempotency_key)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          id,
          workspaceId,
          before.sourceId,
          before.documentId,
          stagingDocumentId,
          before.artifactVersion,
          input.actionCode,
          actorId,
          JSON.stringify(before.gaps),
          JSON.stringify(after.gaps),
          JSON.stringify(effects),
          executedAt,
          idempotencyKey,
        );
      this.database.exec("COMMIT;");
      inTransaction = false;
      return {
        protocolVersion: RETRIEVAL_REMEDIATION_EXECUTION_PROTOCOL_VERSION,
        objectType: "RETRIEVAL_REMEDIATION_EXECUTION",
        executionId: id,
        workspaceId,
        sourceId: before.sourceId,
        documentId: before.documentId,
        stagingDocumentId,
        artifactVersion: before.artifactVersion,
        actionCode: input.actionCode,
        actorId,
        approvalMode: "EXPLICIT_OPERATOR",
        status: "COMPLETED",
        beforeGaps: before.gaps,
        afterGaps: after.gaps,
        effects,
        executedAt,
        idempotencyKey,
        replayed: false,
      };
    } catch (error) {
      if (inTransaction) this.database.exec("ROLLBACK;");
      throw error;
    }
  }

  list(workspaceIdRaw: string, limitRaw = 50): RetrievalRemediationExecutionList {
    const workspaceId = workspaceIdRaw.trim();
    if (!workspaceId) throw new RegistryValidationError("workspaceId is required");
    if (!Number.isSafeInteger(limitRaw) || limitRaw <= 0) {
      throw new RegistryValidationError("limit must be a positive integer");
    }
    const limit = Math.min(limitRaw, MAX_LIMIT);
    const rows = this.database
      .prepare(
        `SELECT * FROM retrieval_remediation_executions
          WHERE workspace_id = ?
          ORDER BY executed_at DESC, id DESC
          LIMIT ?`,
      )
      .all(workspaceId, limit) as unknown as ExecutionRow[];
    return {
      protocolVersion: RETRIEVAL_REMEDIATION_EXECUTION_PROTOCOL_VERSION,
      objectType: "RETRIEVAL_REMEDIATION_EXECUTION_LIST",
      workspaceId,
      items: rows.map((row) => rowExecution(row, false)),
    };
  }

  private auditRecord(workspaceId: string, stagingDocumentId: string): RetrievalQualityAuditRecord {
    const record = this.audits
      .list({ workspaceId, includeHistorical: true })
      .items.find((item) => item.stagingDocumentId === stagingDocumentId);
    if (!record) {
      throw new RegistryError(
        "RETRIEVAL_DOCUMENT_NOT_FOUND",
        `Retrieval document ${stagingDocumentId} was not found in workspace ${workspaceId}`,
      );
    }
    return record;
  }

  private reconcileCurrentVersion(record: RetrievalQualityAuditRecord): string[] {
    const latest = this.database
      .prepare(
        `SELECT MAX(artifact_version) AS version
           FROM retrieval_documents
          WHERE workspace_id = ? AND document_id = ?`,
      )
      .get(record.workspaceId, record.documentId) as { version: number | null };
    if (latest.version === null) {
      throw new RegistryError(
        "RETRIEVAL_DOCUMENT_NOT_FOUND",
        "No retrieval versions remain to reconcile",
      );
    }
    const result = this.database
      .prepare(
        `UPDATE retrieval_documents
            SET is_current = CASE WHEN artifact_version = ? THEN 1 ELSE 0 END
          WHERE workspace_id = ? AND document_id = ?`,
      )
      .run(Number(latest.version), record.workspaceId, record.documentId);
    return [
      `Rebuilt current-version projection for ${record.documentId} at artifact version ${Number(latest.version)} (${Number(result.changes)} rows evaluated).`,
    ];
  }

  private rebuildFtsProjection(record: RetrievalQualityAuditRecord): string[] {
    const chunks = this.database
      .prepare(
        `SELECT c.chunk_id, c.workspace_id, d.source_id, d.title, c.heading_path_json, c.text
           FROM retrieval_chunks c
           JOIN retrieval_documents d ON d.staging_document_id = c.staging_document_id
          WHERE c.workspace_id = ? AND c.staging_document_id = ?
          ORDER BY c.ordinal`,
      )
      .all(record.workspaceId, record.stagingDocumentId) as unknown as FtsChunkRow[];
    if (chunks.length === 0) {
      throw new RegistryConflictError(
        "REMEDIATION_CANONICAL_REINDEX_REQUIRED",
        "No persisted retrieval chunks are available; rebuild from verified canonical Markdown instead",
      );
    }
    this.database
      .prepare(
        `DELETE FROM retrieval_chunks_fts
          WHERE chunk_id IN (
            SELECT chunk_id FROM retrieval_chunks
             WHERE workspace_id = ? AND staging_document_id = ?
          )`,
      )
      .run(record.workspaceId, record.stagingDocumentId);
    const insert = this.database.prepare(
      `INSERT INTO retrieval_chunks_fts
       (chunk_id, workspace_id, source_id, title, heading_path, body)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );
    for (const chunk of chunks) {
      insert.run(
        chunk.chunk_id,
        chunk.workspace_id,
        chunk.source_id,
        chunk.title,
        (JSON.parse(chunk.heading_path_json) as string[]).join(" > "),
        chunk.text,
      );
    }
    return [`Rebuilt ${chunks.length} FTS projection rows from persisted retrieval chunks.`];
  }
}
