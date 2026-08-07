import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  CONVERSION_EXECUTION_VERSION,
  isConversionAttempt,
  isConversionOutputReadyReport,
  isConversionRun,
  isStagingDocumentDescriptor,
  isStagingOutputUploadGrant,
  type ConversionAttempt,
  type ConversionOutputReadyReport,
  type ConversionRun,
  type StagingDocumentDescriptor,
  type StagingOutputUploadGrant,
} from "@markorbit/contracts";
import { RegistryConflictError, RegistryError, RegistryValidationError } from "./index";
import { ensureConversionRuntimeTransitions } from "./conversion-runtime-transitions";

const MIGRATION_ID = "0012_staging_content_registry";
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const SHA256 = /^[a-f0-9]{64}$/;
const KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;
const MAX_CONTENT_BYTES = 5_000_000;

export type IngestGeneratedStagingContentInput = {
  workspaceId: string;
  workerId: string;
  conversionRunId: string;
  conversionAttemptId: string;
  uploadGrantId: string;
  idempotencyKey: string;
  title: string;
  content: Uint8Array;
};

export type StagingDocumentRecord = {
  descriptor: StagingDocumentDescriptor;
  createdAt: string;
  updatedAt: string;
};

export type StagingDocumentListFilters = {
  workspaceId: string;
  conversionRunId?: string;
  sourceId?: string;
  status?: StagingDocumentDescriptor["status"];
  limit?: number;
  offset?: number;
};

export type StagingDocumentListResult = {
  items: StagingDocumentRecord[];
  total: number;
  limit: number;
  offset: number;
};

export type StagingContentIngestResult = {
  record: StagingDocumentRecord;
  replayed: boolean;
  contentCreated: boolean;
};

export interface StagingContentRegistryRepository {
  ingestGenerated(input: IngestGeneratedStagingContentInput): StagingContentIngestResult;
  getDocument(id: string, workspaceId: string): StagingDocumentRecord | null;
  getByConversionRun(conversionRunId: string, workspaceId: string): StagingDocumentRecord | null;
  listDocuments(filters: StagingDocumentListFilters): StagingDocumentListResult;
  readContent(id: string, workspaceId: string): Uint8Array;
}

export class StagingDocumentNotFoundError extends RegistryError {
  constructor(id: string) {
    super("STAGING_DOCUMENT_NOT_FOUND", `Staging document ${id} was not found`, { id });
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

function typedId(prefix: string, now = Date.now()): string {
  const timestamp = encodeBase32(BigInt(now), 10);
  const randomValue = BigInt(`0x${randomBytes(10).toString("hex")}`);
  return `${prefix}_${timestamp}${encodeBase32(randomValue, 16)}`;
}

function sha256(value: Uint8Array | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function stable(value: unknown): string {
  if (value === undefined) return "null";
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .filter((key) => (value as Record<string, unknown>)[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stable((value as Record<string, unknown>)[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function requestDigest(input: IngestGeneratedStagingContentInput, contentHash: string): string {
  return sha256(
    stable({
      workspaceId: input.workspaceId,
      workerId: input.workerId,
      conversionRunId: input.conversionRunId,
      conversionAttemptId: input.conversionAttemptId,
      uploadGrantId: input.uploadGrantId,
      idempotencyKey: input.idempotencyKey,
      title: input.title,
      contentHash,
      sizeBytes: input.content.byteLength,
    }),
  );
}

function parseRun(value: string): ConversionRun {
  const parsed = JSON.parse(value) as unknown;
  if (!isConversionRun(parsed))
    throw new RegistryValidationError("Persisted ConversionRun is invalid");
  return parsed;
}

function parseAttempt(value: string): ConversionAttempt {
  const parsed = JSON.parse(value) as unknown;
  if (!isConversionAttempt(parsed)) {
    throw new RegistryValidationError("Persisted ConversionAttempt is invalid");
  }
  return parsed;
}

function parseGrant(value: string): StagingOutputUploadGrant {
  const parsed = JSON.parse(value) as unknown;
  if (!isStagingOutputUploadGrant(parsed)) {
    throw new RegistryValidationError("Persisted StagingOutputUploadGrant is invalid");
  }
  return parsed;
}

function parseDescriptor(value: string): StagingDocumentDescriptor {
  const parsed = JSON.parse(value) as unknown;
  if (!isStagingDocumentDescriptor(parsed)) {
    throw new RegistryValidationError("Persisted StagingDocumentDescriptor is invalid");
  }
  return parsed;
}

function normalizeLimit(value?: number): number {
  if (value === undefined) return 25;
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RegistryValidationError("limit must be a positive integer");
  }
  return Math.min(value, 100);
}

function normalizeOffset(value?: number): number {
  if (value === undefined) return 0;
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RegistryValidationError("offset must be a non-negative integer");
  }
  return value;
}

export function ensureStagingContentRegistry(database: DatabaseSync): void {
  ensureConversionRuntimeTransitions(database);
  if (database.prepare("SELECT id FROM schema_migrations WHERE id = ?").get(MIGRATION_ID)) return;
  database.exec("BEGIN IMMEDIATE;");
  try {
    database.exec(`
      CREATE TABLE IF NOT EXISTS staging_content_objects (
        sha256 TEXT PRIMARY KEY,
        size_bytes INTEGER NOT NULL CHECK (size_bytes > 0),
        media_type TEXT NOT NULL CHECK (media_type = 'text/markdown'),
        storage_ref TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL
      ) STRICT;

      CREATE TABLE IF NOT EXISTS staging_documents (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        source_id TEXT NOT NULL,
        raw_artifact_id TEXT NOT NULL,
        conversion_run_id TEXT NOT NULL UNIQUE,
        target_path TEXT NOT NULL,
        content_sha256 TEXT NOT NULL,
        size_bytes INTEGER NOT NULL CHECK (size_bytes > 0),
        status TEXT NOT NULL CHECK (status IN ('GENERATED','READY','BLOCKED','ARCHIVED')),
        document_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (conversion_run_id) REFERENCES conversion_runs(id),
        FOREIGN KEY (content_sha256) REFERENCES staging_content_objects(sha256),
        UNIQUE (workspace_id, target_path)
      ) STRICT;

      CREATE TABLE IF NOT EXISTS staging_content_ingest_idempotency (
        workspace_id TEXT NOT NULL,
        worker_id TEXT NOT NULL,
        idempotency_key TEXT NOT NULL,
        request_digest TEXT NOT NULL,
        staging_document_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (workspace_id, worker_id, idempotency_key),
        FOREIGN KEY (staging_document_id) REFERENCES staging_documents(id)
      ) STRICT;

      CREATE INDEX IF NOT EXISTS idx_staging_documents_workspace_status
        ON staging_documents(workspace_id, status, created_at);
      CREATE INDEX IF NOT EXISTS idx_staging_documents_source
        ON staging_documents(workspace_id, source_id, created_at);
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

export class SqliteStagingContentRegistryRepository implements StagingContentRegistryRepository {
  constructor(
    private readonly database: DatabaseSync,
    private readonly storageRoot: string,
    private readonly clock: () => Date = () => new Date(),
    private readonly documentId: () => string = () => typedId("std"),
  ) {
    ensureStagingContentRegistry(database);
    mkdirSync(storageRoot, { recursive: true });
  }

  ingestGenerated(input: IngestGeneratedStagingContentInput): StagingContentIngestResult {
    const title = input.title.trim();
    if (!KEY.test(input.idempotencyKey)) {
      throw new RegistryValidationError("Invalid staging ingest idempotency key");
    }
    if (!title || title.length > 300) {
      throw new RegistryValidationError("title must contain 1-300 characters");
    }
    if (!(input.content instanceof Uint8Array) || input.content.byteLength === 0) {
      throw new RegistryValidationError("Generated staging content must be non-empty bytes");
    }
    if (input.content.byteLength > MAX_CONTENT_BYTES) {
      throw new RegistryValidationError("Generated staging content exceeds the maximum size");
    }
    const contentHash = sha256(input.content);
    const digest = requestDigest(input, contentHash);
    const now = this.clock().toISOString();
    const relativeStorageRef = join(
      "sha256",
      contentHash.slice(0, 2),
      `${contentHash}.md`,
    ).replaceAll("\\", "/");
    const absolutePath = join(this.storageRoot, relativeStorageRef);
    const temporaryPath = `${absolutePath}.${randomBytes(8).toString("hex")}.tmp`;
    let contentCreated = false;

    this.database.exec("BEGIN IMMEDIATE;");
    try {
      const replay = this.database
        .prepare(
          `SELECT request_digest, staging_document_id FROM staging_content_ingest_idempotency
           WHERE workspace_id = ? AND worker_id = ? AND idempotency_key = ?`,
        )
        .get(input.workspaceId, input.workerId, input.idempotencyKey) as
        { request_digest: string; staging_document_id: string } | undefined;
      if (replay) {
        if (replay.request_digest !== digest) {
          throw new RegistryConflictError(
            "STAGING_INGEST_IDEMPOTENCY_CONFLICT",
            "Staging ingest idempotency key was reused with different content or metadata",
          );
        }
        const record = this.requireDocument(replay.staging_document_id, input.workspaceId);
        this.database.exec("COMMIT;");
        return { record, replayed: true, contentCreated: false };
      }

      const run = this.loadRun(input.conversionRunId);
      const attempt = this.loadAttempt(input.conversionAttemptId);
      const grant = this.loadGrant(input.uploadGrantId);
      const report = this.loadOutputReport(input.conversionRunId, input.conversionAttemptId);
      this.assertBinding(input, run, attempt, grant, report, contentHash);

      const existingRun = this.getByConversionRun(input.conversionRunId, input.workspaceId);
      if (existingRun) {
        throw new RegistryConflictError(
          "STAGING_RUN_ALREADY_REGISTERED",
          "ConversionRun already has a Staging document",
        );
      }
      const pathConflict = this.database
        .prepare(
          "SELECT content_sha256 FROM staging_documents WHERE workspace_id = ? AND target_path = ?",
        )
        .get(input.workspaceId, grant.normalizedTargetPath) as
        { content_sha256: string } | undefined;
      if (pathConflict && pathConflict.content_sha256 !== contentHash) {
        throw new RegistryConflictError(
          "STAGING_TARGET_PATH_CONFLICT",
          "Target path is already bound to different immutable content",
        );
      }

      if (existsSync(absolutePath)) {
        this.verifyStoredBytes(absolutePath, contentHash, input.content.byteLength);
      } else {
        mkdirSync(dirname(absolutePath), { recursive: true });
        writeFileSync(temporaryPath, input.content, { flag: "wx" });
        renameSync(temporaryPath, absolutePath);
        contentCreated = true;
      }

      this.database
        .prepare(
          `INSERT OR IGNORE INTO staging_content_objects
           (sha256, size_bytes, media_type, storage_ref, created_at) VALUES (?, ?, ?, ?, ?)`,
        )
        .run(contentHash, input.content.byteLength, "text/markdown", relativeStorageRef, now);

      const descriptor: StagingDocumentDescriptor = {
        contractVersion: CONVERSION_EXECUTION_VERSION,
        objectType: "STAGING_DOCUMENT_DESCRIPTOR",
        id: this.documentId(),
        workspaceId: run.workspaceId,
        sourceId: run.sourceId,
        rawArtifactId: run.rawArtifactId,
        conversionRunId: run.id,
        title,
        targetPath: grant.normalizedTargetPath,
        outputFormat: "MARKDOWN",
        contentHash: { algorithm: "SHA-256", value: contentHash },
        sizeBytes: input.content.byteLength,
        contentAddressedRef: `cas:sha256:${contentHash}`,
        frontmatterSummary: { fieldCount: 0, fields: [] },
        converter: run.converter,
        generatedAt: now,
        validation: { outcome: "PASS", checks: [], warnings: [] },
        status: "GENERATED",
      };
      if (!isStagingDocumentDescriptor(descriptor)) {
        throw new RegistryValidationError("Generated StagingDocumentDescriptor is invalid");
      }

      this.database
        .prepare(
          `INSERT INTO staging_documents
           (id, workspace_id, source_id, raw_artifact_id, conversion_run_id, target_path,
            content_sha256, size_bytes, status, document_json, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          descriptor.id,
          descriptor.workspaceId,
          descriptor.sourceId,
          descriptor.rawArtifactId,
          descriptor.conversionRunId,
          descriptor.targetPath,
          contentHash,
          descriptor.sizeBytes,
          descriptor.status,
          JSON.stringify(descriptor),
          now,
          now,
        );
      this.database
        .prepare(
          `INSERT INTO staging_content_ingest_idempotency
           (workspace_id, worker_id, idempotency_key, request_digest, staging_document_id, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(input.workspaceId, input.workerId, input.idempotencyKey, digest, descriptor.id, now);
      this.database.exec("COMMIT;");
      return {
        record: { descriptor, createdAt: now, updatedAt: now },
        replayed: false,
        contentCreated,
      };
    } catch (error) {
      this.database.exec("ROLLBACK;");
      if (existsSync(temporaryPath)) rmSync(temporaryPath, { force: true });
      if (contentCreated) {
        const referenced = this.database
          .prepare("SELECT 1 FROM staging_content_objects WHERE sha256 = ?")
          .get(contentHash);
        if (!referenced) rmSync(absolutePath, { force: true });
      }
      throw error;
    }
  }

  getDocument(id: string, workspaceId: string): StagingDocumentRecord | null {
    const row = this.database
      .prepare(
        `SELECT document_json, created_at, updated_at FROM staging_documents
         WHERE id = ? AND workspace_id = ?`,
      )
      .get(id, workspaceId) as
      { document_json: string; created_at: string; updated_at: string } | undefined;
    return row
      ? {
          descriptor: parseDescriptor(row.document_json),
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        }
      : null;
  }

  getByConversionRun(conversionRunId: string, workspaceId: string): StagingDocumentRecord | null {
    const row = this.database
      .prepare(
        `SELECT document_json, created_at, updated_at FROM staging_documents
         WHERE conversion_run_id = ? AND workspace_id = ?`,
      )
      .get(conversionRunId, workspaceId) as
      { document_json: string; created_at: string; updated_at: string } | undefined;
    return row
      ? {
          descriptor: parseDescriptor(row.document_json),
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        }
      : null;
  }

  listDocuments(filters: StagingDocumentListFilters): StagingDocumentListResult {
    const limit = normalizeLimit(filters.limit);
    const offset = normalizeOffset(filters.offset);
    const clauses = ["workspace_id = ?"];
    const parameters: Array<string | number> = [filters.workspaceId];
    if (filters.conversionRunId) {
      clauses.push("conversion_run_id = ?");
      parameters.push(filters.conversionRunId);
    }
    if (filters.sourceId) {
      clauses.push("source_id = ?");
      parameters.push(filters.sourceId);
    }
    if (filters.status) {
      clauses.push("status = ?");
      parameters.push(filters.status);
    }
    const where = clauses.join(" AND ");
    const total = Number(
      (
        this.database
          .prepare(`SELECT COUNT(*) AS count FROM staging_documents WHERE ${where}`)
          .get(...parameters) as { count: number }
      ).count,
    );
    const rows = this.database
      .prepare(
        `SELECT document_json, created_at, updated_at FROM staging_documents
         WHERE ${where} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
      )
      .all(...parameters, limit, offset) as Array<{
      document_json: string;
      created_at: string;
      updated_at: string;
    }>;
    return {
      items: rows.map((row) => ({
        descriptor: parseDescriptor(row.document_json),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })),
      total,
      limit,
      offset,
    };
  }

  readContent(id: string, workspaceId: string): Uint8Array {
    const document = this.requireDocument(id, workspaceId).descriptor;
    const row = this.database
      .prepare("SELECT storage_ref, size_bytes FROM staging_content_objects WHERE sha256 = ?")
      .get(document.contentHash.value) as { storage_ref: string; size_bytes: number } | undefined;
    if (!row) throw new RegistryError("STAGING_CONTENT_NOT_FOUND", "Staging CAS object is missing");
    const absolutePath = join(this.storageRoot, row.storage_ref);
    if (!existsSync(absolutePath)) {
      throw new RegistryError("STAGING_CONTENT_NOT_FOUND", "Staging CAS file is missing");
    }
    const content = readFileSync(absolutePath);
    this.verifyStoredBytes(absolutePath, document.contentHash.value, document.sizeBytes);
    return new Uint8Array(content);
  }

  private requireDocument(id: string, workspaceId: string): StagingDocumentRecord {
    const record = this.getDocument(id, workspaceId);
    if (!record) throw new StagingDocumentNotFoundError(id);
    return record;
  }

  private loadRun(id: string): ConversionRun {
    const row = this.database
      .prepare("SELECT document_json FROM conversion_runs WHERE id = ?")
      .get(id) as { document_json: string } | undefined;
    if (!row)
      throw new RegistryError("CONVERSION_RUN_NOT_FOUND", `ConversionRun ${id} was not found`);
    return parseRun(row.document_json);
  }

  private loadAttempt(id: string): ConversionAttempt {
    const row = this.database
      .prepare("SELECT document_json FROM conversion_attempts WHERE id = ?")
      .get(id) as { document_json: string } | undefined;
    if (!row)
      throw new RegistryError(
        "CONVERSION_ATTEMPT_NOT_FOUND",
        `ConversionAttempt ${id} was not found`,
      );
    return parseAttempt(row.document_json);
  }

  private loadGrant(id: string): StagingOutputUploadGrant {
    const row = this.database
      .prepare("SELECT document_json FROM conversion_upload_grants WHERE id = ?")
      .get(id) as { document_json: string } | undefined;
    if (!row)
      throw new RegistryError("STAGING_UPLOAD_GRANT_NOT_FOUND", `Upload grant ${id} was not found`);
    return parseGrant(row.document_json);
  }

  private loadOutputReport(runId: string, attemptId: string): ConversionOutputReadyReport {
    const rows = this.database
      .prepare(
        `SELECT document_json FROM conversion_runtime_reports
         WHERE conversion_run_id = ? AND conversion_attempt_id = ?
         ORDER BY created_at DESC`,
      )
      .all(runId, attemptId) as Array<{ document_json: string }>;
    for (const row of rows) {
      const parsed = JSON.parse(row.document_json) as unknown;
      if (isConversionOutputReadyReport(parsed)) return parsed;
    }
    throw new RegistryConflictError(
      "STAGING_OUTPUT_READY_REQUIRED",
      "Staging ingest requires persisted output-ready evidence",
    );
  }

  private assertBinding(
    input: IngestGeneratedStagingContentInput,
    run: ConversionRun,
    attempt: ConversionAttempt,
    grant: StagingOutputUploadGrant,
    report: ConversionOutputReadyReport,
    contentHash: string,
  ): void {
    if (
      run.workspaceId !== input.workspaceId ||
      attempt.workspaceId !== input.workspaceId ||
      grant.workspaceId !== input.workspaceId ||
      run.id !== input.conversionRunId ||
      attempt.conversionRunId !== run.id ||
      grant.conversionRunId !== run.id ||
      attempt.id !== input.conversionAttemptId ||
      grant.conversionAttemptId !== attempt.id ||
      attempt.workerId !== input.workerId ||
      grant.workerId !== input.workerId
    ) {
      throw new RegistryConflictError(
        "STAGING_SCOPE_MISMATCH",
        "Staging ingest scope does not match",
      );
    }
    if (run.status !== "VERIFYING" || attempt.status !== "OUTPUT_REPORTED") {
      throw new RegistryConflictError(
        "STAGING_OUTPUT_NOT_READY",
        "ConversionRun and Attempt must have output-ready evidence",
      );
    }
    if (
      report.output.uploadGrantId !== grant.id ||
      report.output.targetPath !== grant.normalizedTargetPath ||
      report.output.mediaType !== "text/markdown" ||
      report.output.sha256 !== contentHash ||
      report.output.sizeBytes !== input.content.byteLength ||
      input.content.byteLength > grant.maximumBytes ||
      grant.expiresAt < report.occurredAt
    ) {
      throw new RegistryConflictError(
        "STAGING_OUTPUT_EVIDENCE_MISMATCH",
        "Content does not match output-ready evidence and upload grant",
      );
    }
    if (!SHA256.test(contentHash)) {
      throw new RegistryValidationError("Invalid staging content SHA-256");
    }
  }

  private verifyStoredBytes(path: string, expectedHash: string, expectedSize: number): void {
    const content = readFileSync(path);
    if (content.byteLength !== expectedSize || sha256(content) !== expectedHash) {
      throw new RegistryConflictError(
        "STAGING_CAS_INTEGRITY_MISMATCH",
        "Staging CAS integrity mismatch: stored bytes do not match immutable evidence",
      );
    }
  }
}
