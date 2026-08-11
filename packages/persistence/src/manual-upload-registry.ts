import { createHash, randomBytes } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { RegistryConflictError, RegistryError, RegistryValidationError, initializeRegistry } from "./index";

const MIGRATION_ID = "0017_manual_upload_requests";
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export const MANUAL_UPLOAD_REQUEST_STATUSES = ["PREPARED", "RUN_BOUND", "COMPLETED", "FAILED"] as const;
export type ManualUploadRequestStatus = (typeof MANUAL_UPLOAD_REQUEST_STATUSES)[number];

export type ManualUploadRequestRecord = {
  requestId: string;
  workspaceId: string;
  sourceId: string;
  idempotencyKey: string;
  requestSha256: string;
  fileSha256: string;
  fileSizeBytes: number;
  originalName: string;
  mimeType: string;
  artifactKind: "MARKDOWN" | "TEXT" | "PDF" | "DOCX" | "CSV" | "JSON";
  actorType: "LOCAL_ADMIN" | "API_CLIENT";
  actorId: string;
  status: ManualUploadRequestStatus;
  runId?: string;
  artifactId?: string;
  receiptId?: string;
  failureCode?: string;
  failureMessage?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
};

export type PrepareManualUploadRequestInput = Omit<
  ManualUploadRequestRecord,
  "requestId" | "requestSha256" | "status" | "createdAt" | "updatedAt"
> & {
  requestSha256: string;
};

export type PrepareManualUploadRequestResult = {
  record: ManualUploadRequestRecord;
  replayed: boolean;
};

export interface ManualUploadRequestRepository {
  prepare(input: PrepareManualUploadRequestInput): PrepareManualUploadRequestResult;
  bindRun(requestId: string, runId: string): ManualUploadRequestRecord;
  complete(requestId: string, artifactId: string, receiptId: string): ManualUploadRequestRecord;
  fail(requestId: string, code: string, message: string): ManualUploadRequestRecord;
  getById(requestId: string): ManualUploadRequestRecord | null;
  getByIdempotency(workspaceId: string, idempotencyKey: string): ManualUploadRequestRecord | null;
}

export class ManualUploadRequestNotFoundError extends RegistryError {
  constructor(id: string) {
    super("MANUAL_UPLOAD_REQUEST_NOT_FOUND", `Manual upload request ${id} was not found`, { id });
  }
}

function encodeBase32(value: bigint, length: number): string {
  let output = "";
  let remaining = value;
  for (let index = 0; index < length; index += 1) {
    output = CROCKFORD[Number(remaining & 31n)] + output;
    remaining >>= 5n;
  }
  return output;
}

export function generateManualUploadRequestId(now = Date.now()): string {
  const timestamp = encodeBase32(BigInt(now), 10);
  const randomValue = BigInt(`0x${randomBytes(10).toString("hex")}`);
  return `mup_${timestamp}${encodeBase32(randomValue, 16)}`;
}

function cleanText(value: string, field: string, max: number): string {
  const cleaned = value.trim();
  if (!cleaned || cleaned.length > max) {
    throw new RegistryValidationError(`${field} must contain 1 to ${max} characters`);
  }
  return cleaned;
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function assertSha256(value: string, field: string): string {
  const cleaned = value.trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(cleaned)) {
    throw new RegistryValidationError(`${field} must be a SHA-256 hex digest`);
  }
  return cleaned;
}

function parseRecord(value: string): ManualUploadRequestRecord {
  const parsed = JSON.parse(value) as ManualUploadRequestRecord;
  if (
    !parsed ||
    typeof parsed.requestId !== "string" ||
    typeof parsed.workspaceId !== "string" ||
    typeof parsed.sourceId !== "string" ||
    typeof parsed.idempotencyKey !== "string" ||
    typeof parsed.requestSha256 !== "string" ||
    !MANUAL_UPLOAD_REQUEST_STATUSES.includes(parsed.status)
  ) {
    throw new RegistryValidationError("Persisted manual upload request is invalid");
  }
  return parsed;
}

export function ensureManualUploadRegistry(database: DatabaseSync): void {
  initializeRegistry(database);
  const applied = database.prepare("SELECT id FROM schema_migrations WHERE id = ?").get(MIGRATION_ID);
  if (applied) return;
  database.exec("BEGIN IMMEDIATE;");
  try {
    database.exec(`
      CREATE TABLE IF NOT EXISTS manual_upload_requests (
        request_id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        source_id TEXT NOT NULL,
        idempotency_key TEXT NOT NULL,
        request_sha256 TEXT NOT NULL,
        file_sha256 TEXT NOT NULL,
        status TEXT NOT NULL,
        run_id TEXT,
        artifact_id TEXT,
        document_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        completed_at TEXT,
        FOREIGN KEY (workspace_id) REFERENCES workspaces(id),
        FOREIGN KEY (source_id) REFERENCES source_definitions(id),
        UNIQUE (workspace_id, idempotency_key)
      ) STRICT;
      CREATE INDEX IF NOT EXISTS idx_manual_upload_requests_source
        ON manual_upload_requests(source_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_manual_upload_requests_run
        ON manual_upload_requests(run_id);
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

export class SqliteManualUploadRequestRepository implements ManualUploadRequestRepository {
  constructor(
    private readonly database: DatabaseSync,
    private readonly clock: () => Date = () => new Date(),
    private readonly idFactory: () => string = () => generateManualUploadRequestId(),
  ) {
    ensureManualUploadRegistry(database);
  }

  prepare(input: PrepareManualUploadRequestInput): PrepareManualUploadRequestResult {
    const workspaceId = cleanText(input.workspaceId, "workspaceId", 80);
    const sourceId = cleanText(input.sourceId, "sourceId", 80);
    const idempotencyKey = cleanText(input.idempotencyKey, "idempotencyKey", 128);
    const requestSha256 = assertSha256(input.requestSha256, "requestSha256");
    const fileSha256 = assertSha256(input.fileSha256, "fileSha256");
    if (!Number.isSafeInteger(input.fileSizeBytes) || input.fileSizeBytes < 0) {
      throw new RegistryValidationError("fileSizeBytes must be a non-negative safe integer");
    }
    const existing = this.getByIdempotency(workspaceId, idempotencyKey);
    if (existing) {
      if (existing.requestSha256 !== requestSha256) {
        throw new RegistryConflictError(
          "MANUAL_UPLOAD_IDEMPOTENCY_CONFLICT",
          "Idempotency key was reused with a different manual upload request",
        );
      }
      return { record: existing, replayed: true };
    }
    const now = this.clock().toISOString();
    const record: ManualUploadRequestRecord = {
      requestId: this.idFactory(),
      workspaceId,
      sourceId,
      idempotencyKey,
      requestSha256,
      fileSha256,
      fileSizeBytes: input.fileSizeBytes,
      originalName: cleanText(input.originalName, "originalName", 255),
      mimeType: cleanText(input.mimeType, "mimeType", 200),
      artifactKind: input.artifactKind,
      actorType: input.actorType,
      actorId: cleanText(input.actorId, "actorId", 200),
      status: "PREPARED",
      createdAt: now,
      updatedAt: now,
    };
    this.database
      .prepare(
        `INSERT INTO manual_upload_requests (
           request_id, workspace_id, source_id, idempotency_key, request_sha256,
           file_sha256, status, document_json, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        record.requestId,
        record.workspaceId,
        record.sourceId,
        record.idempotencyKey,
        record.requestSha256,
        record.fileSha256,
        record.status,
        JSON.stringify(record),
        now,
        now,
      );
    return { record, replayed: false };
  }

  bindRun(requestId: string, runId: string): ManualUploadRequestRecord {
    const current = this.require(requestId);
    if (current.runId) {
      if (current.runId !== runId) {
        throw new RegistryConflictError(
          "MANUAL_UPLOAD_RUN_CONFLICT",
          "Manual upload request is already bound to another run",
        );
      }
      return current;
    }
    if (current.status !== "PREPARED") {
      throw new RegistryConflictError(
        "MANUAL_UPLOAD_STATE_CONFLICT",
        `Cannot bind a run while request is ${current.status}`,
      );
    }
    return this.update({ ...current, runId, status: "RUN_BOUND", updatedAt: this.clock().toISOString() });
  }

  complete(requestId: string, artifactId: string, receiptId: string): ManualUploadRequestRecord {
    const current = this.require(requestId);
    if (current.status === "COMPLETED") {
      if (current.artifactId !== artifactId || current.receiptId !== receiptId) {
        throw new RegistryConflictError(
          "MANUAL_UPLOAD_COMPLETION_CONFLICT",
          "Manual upload request already completed with different evidence",
        );
      }
      return current;
    }
    if (current.status !== "RUN_BOUND") {
      throw new RegistryConflictError(
        "MANUAL_UPLOAD_STATE_CONFLICT",
        `Cannot complete request while it is ${current.status}`,
      );
    }
    const now = this.clock().toISOString();
    return this.update({
      ...current,
      artifactId: cleanText(artifactId, "artifactId", 80),
      receiptId: cleanText(receiptId, "receiptId", 80),
      status: "COMPLETED",
      updatedAt: now,
      completedAt: now,
    });
  }

  fail(requestId: string, code: string, message: string): ManualUploadRequestRecord {
    const current = this.require(requestId);
    if (current.status === "COMPLETED") return current;
    return this.update({
      ...current,
      failureCode: cleanText(code, "failureCode", 100),
      failureMessage: cleanText(message, "failureMessage", 1000),
      status: "FAILED",
      updatedAt: this.clock().toISOString(),
    });
  }

  getById(requestId: string): ManualUploadRequestRecord | null {
    const row = this.database
      .prepare("SELECT document_json FROM manual_upload_requests WHERE request_id = ?")
      .get(requestId) as { document_json: string } | undefined;
    return row ? parseRecord(row.document_json) : null;
  }

  getByIdempotency(workspaceId: string, idempotencyKey: string): ManualUploadRequestRecord | null {
    const row = this.database
      .prepare(
        "SELECT document_json FROM manual_upload_requests WHERE workspace_id = ? AND idempotency_key = ?",
      )
      .get(workspaceId, idempotencyKey) as { document_json: string } | undefined;
    return row ? parseRecord(row.document_json) : null;
  }

  private require(requestId: string): ManualUploadRequestRecord {
    const record = this.getById(requestId);
    if (!record) throw new ManualUploadRequestNotFoundError(requestId);
    return record;
  }

  private update(record: ManualUploadRequestRecord): ManualUploadRequestRecord {
    const result = this.database
      .prepare(
        `UPDATE manual_upload_requests
         SET status = ?, run_id = ?, artifact_id = ?, document_json = ?, updated_at = ?, completed_at = ?
         WHERE request_id = ?`,
      )
      .run(
        record.status,
        record.runId ?? null,
        record.artifactId ?? null,
        JSON.stringify(record),
        record.updatedAt,
        record.completedAt ?? null,
        record.requestId,
      );
    if (result.changes !== 1) throw new ManualUploadRequestNotFoundError(record.requestId);
    return record;
  }
}

export function manualUploadRequestFingerprint(input: {
  workspaceId: string;
  sourceId: string;
  originalName: string;
  mimeType: string;
  artifactKind: string;
  fileSizeBytes: number;
  fileSha256: string;
  actorType: string;
  actorId: string;
}): string {
  return sha256(JSON.stringify(input));
}
