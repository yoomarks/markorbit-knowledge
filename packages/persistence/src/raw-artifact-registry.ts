import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { mkdirSync, createReadStream, existsSync, lstatSync, rmSync } from "node:fs";
import { link, mkdir, open, rename, rm, lstat } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import {
  ARTIFACT_INGESTION_PROTOCOL_VERSION,
  ARTIFACT_KINDS,
  ARTIFACT_STATUSES,
  SCHEMA_V1_VERSION,
  isArtifactIngestionEvent,
  isArtifactIngestionReceipt,
  isArtifactIngestionSession,
  isArtifactUploadDescriptor,
  isArtifactVerificationResult,
  isExecutionAttempt,
  isExecutionReceipt,
  isJob,
  isJobLease,
  isRawArtifact,
  isCollectionRun,
  type ArtifactIngestionEvent,
  type ArtifactIngestionFailure,
  type ArtifactIngestionReceipt,
  type ArtifactIngestionSession,
  type ArtifactKind,
  type ArtifactUploadDescriptor,
  type ArtifactVerificationResult,
  type CollectionRun,
  type ExecutionAttempt,
  type ExecutionReceipt,
  type Job,
  type JobLease,
  type RawArtifact,
} from "@markorbit/contracts";
import { RegistryConflictError, RegistryError, RegistryValidationError } from "./index";
import {
  SqliteWorkerRegistryRepository,
  type WorkerRegistryRepository,
} from "./safe-worker-registry";
import { ensureWorkerExecutionRegistry } from "./controlled-worker-execution";

const MIGRATION_ID = "0007_raw_artifact_ingestion";
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;
const DEFAULT_MAX_BYTES = 100 * 1024 * 1024;

export type CreateArtifactSessionInput = {
  workerId: string;
  credential: string;
  leaseId: string;
  leaseToken: string;
  descriptor: ArtifactUploadDescriptor;
  idempotencyKey: string;
};

export type ArtifactSessionRecord = {
  session: ArtifactIngestionSession;
  verification?: ArtifactVerificationResult;
  receipt?: ArtifactIngestionReceipt;
  failure?: ArtifactIngestionFailure;
  events: ArtifactIngestionEvent[];
};

export type ArtifactListFilters = {
  workspaceId?: string;
  sourceId?: string;
  runId?: string;
  executionAttemptId?: string;
  artifactKind?: ArtifactKind;
  status?: RawArtifact["status"];
  mimeType?: string;
  sha256?: string;
  q?: string;
  limit?: number;
  offset?: number;
};

export type RawArtifactView = {
  artifact: RawArtifact;
  jobId: string;
  jobAttempt: number;
  executionAttemptId: string;
  sessionId: string;
  receiptId: string;
  contentObject: {
    sha256: string;
    sizeBytes: number;
    referenceCount: number;
    storageUri: string;
    createdAt: string;
    verifiedAt: string;
  };
};

export type RawArtifactListResult = {
  items: RawArtifactView[];
  total: number;
  limit: number;
  offset: number;
  summary: Record<RawArtifact["status"], number> & { total: number };
};

export type StreamUploadResult = {
  session: ArtifactIngestionSession;
  verification: ArtifactVerificationResult;
};

export type CheckArtifactContentInput = {
  workerId: string;
  credential: string;
  leaseId: string;
  leaseToken: string;
  artifactKind: ArtifactKind;
  canonicalUri: string;
  sha256: string;
};

export type ArtifactContentIdentityResult = {
  unchanged: boolean;
  latestArtifactId: string | null;
  latestSha256: string | null;
};

export interface RawArtifactRepository {
  createSession(input: CreateArtifactSessionInput): {
    record: ArtifactSessionRecord;
    replayed: boolean;
  };
  checkCurrentContent(input: CheckArtifactContentInput): ArtifactContentIdentityResult;
  uploadContent(
    workerId: string,
    credential: string,
    leaseId: string,
    leaseToken: string,
    sessionId: string,
    chunks: AsyncIterable<Uint8Array>,
  ): Promise<StreamUploadResult>;
  finalize(
    workerId: string,
    credential: string,
    leaseId: string,
    leaseToken: string,
    sessionId: string,
  ): Promise<{ artifact: RawArtifactView; receipt: ArtifactIngestionReceipt; replayed: boolean }>;
  abort(
    workerId: string,
    credential: string,
    leaseId: string,
    leaseToken: string,
    sessionId: string,
    reason?: string,
  ): ArtifactSessionRecord;
  getSession(id: string): ArtifactSessionRecord | null;
  getArtifact(id: string): RawArtifactView | null;
  list(filters?: ArtifactListFilters): RawArtifactListResult;
  contentPath(id: string): {
    path: string;
    mimeType: string;
    originalName: string;
    sizeBytes: number;
  };
  cleanupAbandoned(olderThan: Date): number;
}

export class ArtifactSessionNotFoundError extends RegistryError {
  constructor(id: string) {
    super("ARTIFACT_SESSION_NOT_FOUND", `Artifact ingestion session ${id} was not found`, { id });
  }
}

export class RawArtifactNotFoundError extends RegistryError {
  constructor(id: string) {
    super("RAW_ARTIFACT_NOT_FOUND", `RawArtifact ${id} was not found`, { id });
  }
}

export class ArtifactStorageError extends RegistryError {
  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(code, message, details);
  }
}

type AuthenticatedExecutionContext = {
  lease: JobLease;
  job: Job;
  run: CollectionRun;
  attempt: ExecutionAttempt;
};

type SessionRow = {
  document_json: string;
  verification_json: string | null;
  receipt_json: string | null;
  failure_json: string | null;
  temp_relative_path: string | null;
  descriptor_hash: string;
};

function encodeBase32(value: bigint, length: number): string {
  let output = "";
  let remaining = value;
  for (let index = 0; index < length; index += 1) {
    output = CROCKFORD[Number(remaining & 31n)] + output;
    remaining >>= 5n;
  }
  return output;
}

function typedId(prefix: "ing" | "air" | "aev" | "art", now = Date.now()): string {
  const timestamp = encodeBase32(BigInt(now), 10);
  const randomValue = BigInt(`0x${randomBytes(10).toString("hex")}`);
  return `${prefix}_${timestamp}${encodeBase32(randomValue, 16)}`;
}

export function generateArtifactSessionId(now = Date.now()): string {
  return typedId("ing", now);
}

export function generateArtifactReceiptId(now = Date.now()): string {
  return typedId("air", now);
}

export function generateArtifactEventId(now = Date.now()): string {
  return typedId("aev", now);
}

export function generateRawArtifactId(now = Date.now()): string {
  return typedId("art", now);
}

function digestBuffer(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

function digestHex(value: string): string {
  return digestBuffer(value).toString("hex");
}

function verifyDigest(value: string, expectedHex: string): boolean {
  const actual = digestBuffer(value);
  const expected = Buffer.from(expectedHex, "hex");
  return expected.length === actual.length && timingSafeEqual(actual, expected);
}

function constantTimeHexEqual(actualHex: string, expectedHex: string): boolean {
  if (!/^[a-f0-9]{64}$/.test(actualHex) || !/^[a-f0-9]{64}$/.test(expectedHex)) return false;
  const actual = Buffer.from(actualHex, "hex");
  const expected = Buffer.from(expectedHex, "hex");
  return timingSafeEqual(actual, expected);
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function normalizeIdempotencyKey(value: string): string {
  const normalized = value.trim();
  if (normalized.length < 1 || normalized.length > 128) {
    throw new RegistryValidationError("Idempotency key must contain 1 to 128 characters");
  }
  return normalized;
}

function safeOriginalName(value: string): string {
  const normalized = basename(value.replace(/[\u0000-\u001f\u007f]/g, "")).trim();
  if (!normalized || normalized === "." || normalized === "..") return "artifact.bin";
  return normalized.slice(0, 255);
}

function parseSession(value: string): ArtifactIngestionSession {
  const parsed = JSON.parse(value) as unknown;
  if (!isArtifactIngestionSession(parsed)) {
    throw new RegistryValidationError(
      "Persisted ingestion session no longer satisfies protocol v1",
    );
  }
  return parsed;
}

function parseVerification(value: string): ArtifactVerificationResult {
  const parsed = JSON.parse(value) as unknown;
  if (!isArtifactVerificationResult(parsed)) {
    throw new RegistryValidationError(
      "Persisted verification result no longer satisfies protocol v1",
    );
  }
  return parsed;
}

function parseReceipt(value: string): ArtifactIngestionReceipt {
  const parsed = JSON.parse(value) as unknown;
  if (!isArtifactIngestionReceipt(parsed)) {
    throw new RegistryValidationError(
      "Persisted ingestion receipt no longer satisfies protocol v1",
    );
  }
  return parsed;
}

function parseFailure(value: string): ArtifactIngestionFailure {
  const parsed = JSON.parse(value) as ArtifactIngestionFailure;
  if (
    !parsed ||
    typeof parsed.code !== "string" ||
    typeof parsed.message !== "string" ||
    typeof parsed.occurredAt !== "string"
  ) {
    throw new RegistryValidationError("Persisted ingestion failure is invalid");
  }
  return parsed;
}

function parseEvent(value: string): ArtifactIngestionEvent {
  const parsed = JSON.parse(value) as unknown;
  if (!isArtifactIngestionEvent(parsed)) {
    throw new RegistryValidationError("Persisted ingestion event no longer satisfies protocol v1");
  }
  return parsed;
}

function parseRawArtifact(value: string): RawArtifact {
  const parsed = JSON.parse(value) as unknown;
  if (!isRawArtifact(parsed)) {
    throw new RegistryValidationError("Persisted RawArtifact no longer satisfies Schema v1");
  }
  return parsed;
}

function parseJob(value: string): Job {
  const parsed = JSON.parse(value) as unknown;
  if (!isJob(parsed)) throw new RegistryValidationError("Persisted Job is invalid");
  return parsed;
}

function parseRun(value: string): CollectionRun {
  const parsed = JSON.parse(value) as unknown;
  if (!isCollectionRun(parsed))
    throw new RegistryValidationError("Persisted CollectionRun is invalid");
  return parsed;
}

function parseLease(value: string): JobLease {
  const parsed = JSON.parse(value) as unknown;
  if (!isJobLease(parsed)) throw new RegistryValidationError("Persisted JobLease is invalid");
  return parsed;
}

function parseAttempt(value: string): ExecutionAttempt {
  const parsed = JSON.parse(value) as unknown;
  if (!isExecutionAttempt(parsed))
    throw new RegistryValidationError("Persisted execution attempt is invalid");
  return parsed;
}

function normalizeLimit(value: number | undefined): number {
  if (value === undefined) return DEFAULT_LIMIT;
  if (!Number.isInteger(value) || value <= 0)
    throw new RegistryValidationError("limit must be positive");
  return Math.min(value, MAX_LIMIT);
}

function normalizeOffset(value: number | undefined): number {
  if (value === undefined) return 0;
  if (!Number.isInteger(value) || value < 0)
    throw new RegistryValidationError("offset must be non-negative");
  return value;
}

function pathInside(root: string, candidate: string): boolean {
  const rel = relative(root, candidate);
  return rel === "" || (!rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel));
}

async function hashFile(path: string): Promise<{ sha256: string; sizeBytes: number }> {
  const hash = createHash("sha256");
  let sizeBytes = 0;
  for await (const chunk of createReadStream(path)) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    hash.update(bytes);
    sizeBytes += bytes.length;
  }
  return { sha256: hash.digest("hex"), sizeBytes };
}

export class LocalContentAddressedStore {
  readonly root: string;
  readonly maxBytes: number;

  constructor(root: string, maxBytes = DEFAULT_MAX_BYTES) {
    this.root = resolve(root);
    if (!Number.isInteger(maxBytes) || maxBytes <= 0) {
      throw new RegistryValidationError("Artifact size limit must be a positive integer");
    }
    this.maxBytes = maxBytes;
    mkdirSync(join(this.root, "objects", "sha256"), { recursive: true });
    mkdirSync(join(this.root, "sessions"), { recursive: true });
    mkdirSync(join(this.root, "quarantine"), { recursive: true });
    const rootStat = lstatSync(this.root);
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
      throw new ArtifactStorageError(
        "ARTIFACT_STORAGE_ROOT_INVALID",
        "Artifact store root must be a real directory",
      );
    }
  }

  sessionRelativePath(sessionId: string): string {
    if (!/^ing_[0-9A-HJKMNP-TV-Z]{26}$/.test(sessionId)) {
      throw new RegistryValidationError("Invalid ingestion session ID");
    }
    return join("sessions", sessionId, "content.part");
  }

  private resolveRelative(relativePath: string): string {
    if (isAbsolute(relativePath) || relativePath.includes("\0")) {
      throw new ArtifactStorageError(
        "ARTIFACT_PATH_REJECTED",
        "Absolute or invalid storage path rejected",
      );
    }
    const resolved = resolve(this.root, relativePath);
    if (!pathInside(this.root, resolved)) {
      throw new ArtifactStorageError("ARTIFACT_PATH_REJECTED", "Storage-root escape rejected");
    }
    return resolved;
  }

  objectRelativePath(digest: string): string {
    if (!/^[a-f0-9]{64}$/.test(digest)) throw new RegistryValidationError("Invalid SHA-256 digest");
    return join("objects", "sha256", digest.slice(0, 2), digest.slice(2, 4), digest);
  }

  objectPath(digest: string): string {
    return this.resolveRelative(this.objectRelativePath(digest));
  }

  async writeSession(
    sessionId: string,
    chunks: AsyncIterable<Uint8Array>,
  ): Promise<{ relativePath: string; sha256: string; sizeBytes: number }> {
    const relativePath = this.sessionRelativePath(sessionId);
    const target = this.resolveRelative(relativePath);
    await mkdir(dirname(target), { recursive: true });
    try {
      const parent = await lstat(dirname(target));
      if (parent.isSymbolicLink())
        throw new ArtifactStorageError(
          "ARTIFACT_SYMLINK_REJECTED",
          "Symlink session directory rejected",
        );
    } catch (error) {
      if (error instanceof ArtifactStorageError) throw error;
    }
    const handle = await open(target, "wx", 0o600);
    const hash = createHash("sha256");
    let sizeBytes = 0;
    try {
      for await (const chunk of chunks) {
        const bytes = Buffer.from(chunk);
        sizeBytes += bytes.length;
        if (sizeBytes > this.maxBytes) {
          throw new ArtifactStorageError(
            "ARTIFACT_TOO_LARGE",
            `Artifact exceeds ${this.maxBytes} bytes`,
          );
        }
        hash.update(bytes);
        await handle.write(bytes);
      }
      await handle.sync();
    } catch (error) {
      await handle.close();
      await rm(target, { force: true });
      throw error;
    }
    await handle.close();
    return { relativePath, sha256: hash.digest("hex"), sizeBytes };
  }

  async quarantine(relativePath: string, sessionId: string): Promise<void> {
    const source = this.resolveRelative(relativePath);
    const target = this.resolveRelative(join("quarantine", `${sessionId}-${Date.now()}.part`));
    await mkdir(dirname(target), { recursive: true });
    if (existsSync(source)) await rename(source, target);
  }

  async finalize(relativePath: string, digest: string, expectedSize: number): Promise<string> {
    const source = this.resolveRelative(relativePath);
    const sourceStat = await lstat(source);
    if (!sourceStat.isFile() || sourceStat.isSymbolicLink()) {
      throw new ArtifactStorageError(
        "ARTIFACT_TEMP_INVALID",
        "Temporary upload must be a regular file",
      );
    }
    const targetRelative = this.objectRelativePath(digest);
    const target = this.resolveRelative(targetRelative);
    await mkdir(dirname(target), { recursive: true });
    try {
      await link(source, target);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "EEXIST") throw error;
    }
    const targetStat = await lstat(target);
    if (!targetStat.isFile() || targetStat.isSymbolicLink()) {
      throw new ArtifactStorageError(
        "ARTIFACT_OBJECT_INVALID",
        "Content object must be a regular file",
      );
    }
    const verified = await hashFile(target);
    if (verified.sha256 !== digest || verified.sizeBytes !== expectedSize) {
      throw new ArtifactStorageError(
        "ARTIFACT_OBJECT_VERIFICATION_FAILED",
        "Existing content object failed verification",
      );
    }
    await rm(source, { force: true });
    await rm(dirname(source), { recursive: true, force: true });
    return targetRelative;
  }

  resolveObject(relativePath: string): string {
    const path = this.resolveRelative(relativePath);
    const info = lstatSync(path);
    if (!info.isFile() || info.isSymbolicLink()) {
      throw new ArtifactStorageError(
        "ARTIFACT_OBJECT_INVALID",
        "Content object is not a regular file",
      );
    }
    return path;
  }

  cleanupSession(relativePath: string | null): void {
    if (!relativePath) return;
    const path = this.resolveRelative(relativePath);
    rmSync(dirname(path), { recursive: true, force: true });
  }
}

export function ensureRawArtifactRegistry(database: DatabaseSync): void {
  ensureWorkerExecutionRegistry(database);
  const applied = database
    .prepare("SELECT id FROM schema_migrations WHERE id = ?")
    .get(MIGRATION_ID);
  if (applied) return;
  database.exec("BEGIN IMMEDIATE;");
  try {
    database.exec(`
      CREATE TABLE IF NOT EXISTS artifact_ingestion_sessions (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        source_id TEXT NOT NULL,
        run_id TEXT NOT NULL,
        job_id TEXT NOT NULL,
        job_attempt INTEGER NOT NULL,
        execution_attempt_id TEXT NOT NULL,
        lease_id TEXT NOT NULL,
        worker_id TEXT NOT NULL,
        status TEXT NOT NULL,
        idempotency_key TEXT NOT NULL,
        descriptor_hash TEXT NOT NULL,
        document_json TEXT NOT NULL,
        verification_json TEXT,
        receipt_json TEXT,
        failure_json TEXT,
        temp_relative_path TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        finalized_at TEXT,
        FOREIGN KEY (source_id) REFERENCES source_definitions(id),
        FOREIGN KEY (run_id) REFERENCES collection_runs(id),
        FOREIGN KEY (job_id) REFERENCES jobs(id),
        FOREIGN KEY (execution_attempt_id) REFERENCES execution_attempts(id),
        FOREIGN KEY (lease_id) REFERENCES job_leases(id),
        FOREIGN KEY (worker_id) REFERENCES worker_definitions(id),
        UNIQUE (workspace_id, idempotency_key)
      ) STRICT;

      CREATE TABLE IF NOT EXISTS content_objects (
        digest TEXT PRIMARY KEY,
        size_bytes INTEGER NOT NULL,
        relative_path TEXT NOT NULL UNIQUE,
        storage_uri TEXT NOT NULL UNIQUE,
        reference_count INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        verified_at TEXT NOT NULL
      ) STRICT;

      CREATE TABLE IF NOT EXISTS raw_artifacts (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        source_id TEXT NOT NULL,
        run_id TEXT NOT NULL,
        job_id TEXT NOT NULL,
        job_attempt INTEGER NOT NULL,
        execution_attempt_id TEXT NOT NULL,
        session_id TEXT NOT NULL UNIQUE,
        receipt_id TEXT NOT NULL UNIQUE,
        content_digest TEXT NOT NULL,
        artifact_kind TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        status TEXT NOT NULL,
        canonical_uri TEXT,
        document_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (source_id) REFERENCES source_definitions(id),
        FOREIGN KEY (run_id) REFERENCES collection_runs(id),
        FOREIGN KEY (job_id) REFERENCES jobs(id),
        FOREIGN KEY (execution_attempt_id) REFERENCES execution_attempts(id),
        FOREIGN KEY (session_id) REFERENCES artifact_ingestion_sessions(id),
        FOREIGN KEY (content_digest) REFERENCES content_objects(digest)
      ) STRICT;

      CREATE TABLE IF NOT EXISTS artifact_ingestion_events (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        sequence INTEGER NOT NULL,
        event_type TEXT NOT NULL,
        document_json TEXT NOT NULL,
        recorded_at TEXT NOT NULL,
        FOREIGN KEY (session_id) REFERENCES artifact_ingestion_sessions(id),
        UNIQUE (session_id, sequence)
      ) STRICT;

      CREATE INDEX IF NOT EXISTS idx_artifact_sessions_execution
        ON artifact_ingestion_sessions(execution_attempt_id, status, created_at);
      CREATE INDEX IF NOT EXISTS idx_raw_artifacts_workspace_status
        ON raw_artifacts(workspace_id, status, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_raw_artifacts_source
        ON raw_artifacts(source_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_raw_artifacts_run
        ON raw_artifacts(run_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_raw_artifacts_hash
        ON raw_artifacts(content_digest, created_at DESC);
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

export class SqliteRawArtifactRepository implements RawArtifactRepository {
  private readonly workers: WorkerRegistryRepository;
  private readonly store: LocalContentAddressedStore;

  constructor(
    private readonly database: DatabaseSync,
    storageRoot: string,
    private readonly clock: () => Date = () => new Date(),
    private readonly sessionIdFactory: () => string = () => generateArtifactSessionId(),
    private readonly receiptIdFactory: () => string = () => generateArtifactReceiptId(),
    private readonly artifactIdFactory: () => string = () => generateRawArtifactId(),
    private readonly eventIdFactory: () => string = () => generateArtifactEventId(),
    maxBytes = DEFAULT_MAX_BYTES,
  ) {
    ensureRawArtifactRegistry(database);
    this.workers = new SqliteWorkerRegistryRepository(database, clock);
    this.store = new LocalContentAddressedStore(storageRoot, maxBytes);
  }

  createSession(input: CreateArtifactSessionInput): {
    record: ArtifactSessionRecord;
    replayed: boolean;
  } {
    if (!isArtifactUploadDescriptor(input.descriptor)) {
      throw new RegistryValidationError("Artifact descriptor does not satisfy protocol v1");
    }
    const key = normalizeIdempotencyKey(input.idempotencyKey);
    const context = this.authenticate(
      input.workerId,
      input.credential,
      input.leaseId,
      input.leaseToken,
    );
    const descriptor = clone(input.descriptor);
    descriptor.originalName = safeOriginalName(descriptor.originalName);
    const descriptorHash = digestHex(JSON.stringify(descriptor));
    const existing = this.database
      .prepare(
        "SELECT id, descriptor_hash FROM artifact_ingestion_sessions WHERE workspace_id = ? AND idempotency_key = ?",
      )
      .get(context.run.workspaceId, key) as { id: string; descriptor_hash: string } | undefined;
    if (existing) {
      if (existing.descriptor_hash !== descriptorHash) {
        throw new RegistryConflictError(
          "ARTIFACT_INGESTION_IDEMPOTENCY_CONFLICT",
          "Idempotency key was reused with different artifact metadata",
        );
      }
      const record = this.getSession(existing.id);
      if (!record) throw new ArtifactSessionNotFoundError(existing.id);
      return { record, replayed: true };
    }
    if (!["RUNNING", "UPLOADING", "VERIFYING"].includes(context.attempt.status)) {
      throw new RegistryConflictError(
        "ARTIFACT_EXECUTION_STATE_CONFLICT",
        "Artifact ingestion requires an active execution attempt",
      );
    }
    const now = this.clock().toISOString();
    const session: ArtifactIngestionSession = {
      protocolVersion: ARTIFACT_INGESTION_PROTOCOL_VERSION,
      objectType: "ARTIFACT_INGESTION_SESSION",
      id: this.sessionIdFactory(),
      workspaceId: context.run.workspaceId,
      sourceId: context.run.sourceId,
      runId: context.run.id,
      jobId: context.job.id,
      jobAttempt: context.job.attempt,
      executionAttemptId: context.attempt.id,
      leaseId: context.lease.id,
      workerId: input.workerId,
      connector: {
        connectorId: context.job.connectorSnapshot.connectorId,
        version: context.job.connectorSnapshot.version,
      },
      descriptor,
      status: "CREATED",
      idempotencyKey: key,
      createdAt: now,
      updatedAt: now,
    };
    if (!isArtifactIngestionSession(session)) {
      throw new RegistryValidationError("Generated ingestion session is invalid");
    }
    this.database.exec("BEGIN IMMEDIATE;");
    try {
      this.database
        .prepare(
          `INSERT INTO artifact_ingestion_sessions (
             id, workspace_id, source_id, run_id, job_id, job_attempt, execution_attempt_id,
             lease_id, worker_id, status, idempotency_key, descriptor_hash, document_json,
             created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          session.id,
          session.workspaceId,
          session.sourceId,
          session.runId,
          session.jobId,
          session.jobAttempt,
          session.executionAttemptId,
          session.leaseId,
          session.workerId,
          session.status,
          session.idempotencyKey,
          descriptorHash,
          JSON.stringify(session),
          now,
          now,
        );
      this.insertEvent(session.id, "SESSION_CREATED", now);
      this.database.exec("COMMIT;");
    } catch (error) {
      this.database.exec("ROLLBACK;");
      throw error;
    }
    return { record: this.requireSession(session.id), replayed: false };
  }

  checkCurrentContent(input: CheckArtifactContentInput): ArtifactContentIdentityResult {
    const context = this.authenticate(
      input.workerId,
      input.credential,
      input.leaseId,
      input.leaseToken,
    );
    const canonicalUri = input.canonicalUri.trim();
    if (!canonicalUri || canonicalUri.length > 2048) {
      throw new RegistryValidationError("canonicalUri must contain 1 to 2048 characters");
    }
    try {
      const parsed = new URL(canonicalUri);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        throw new Error("unsupported protocol");
      }
    } catch {
      throw new RegistryValidationError("canonicalUri must be an absolute http(s) URL");
    }
    if (!ARTIFACT_KINDS.includes(input.artifactKind)) {
      throw new RegistryValidationError("Unknown artifactKind");
    }
    const sha256 = input.sha256.trim().toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(sha256)) {
      throw new RegistryValidationError("sha256 must be a lowercase SHA-256 digest");
    }
    const row = this.database
      .prepare(
        `SELECT id, content_digest AS contentDigest
         FROM raw_artifacts
         WHERE workspace_id = ? AND source_id = ? AND canonical_uri = ? AND artifact_kind = ?
         ORDER BY created_at DESC, id DESC
         LIMIT 1`,
      )
      .get(context.run.workspaceId, context.run.sourceId, canonicalUri, input.artifactKind) as
      { id: string; contentDigest: string } | undefined;
    if (!row) {
      return { unchanged: false, latestArtifactId: null, latestSha256: null };
    }
    return {
      unchanged: constantTimeHexEqual(row.contentDigest, sha256),
      latestArtifactId: row.id,
      latestSha256: row.contentDigest,
    };
  }

  async uploadContent(
    workerId: string,
    credential: string,
    leaseId: string,
    leaseToken: string,
    sessionId: string,
    chunks: AsyncIterable<Uint8Array>,
  ): Promise<StreamUploadResult> {
    this.authenticate(workerId, credential, leaseId, leaseToken);
    const record = this.requireSession(sessionId);
    this.assertOwnership(record.session, workerId, leaseId);
    if (record.session.status === "VERIFIED") {
      if (!record.verification)
        throw new RegistryValidationError("Verified session lacks evidence");
      return { session: record.session, verification: record.verification };
    }
    if (record.session.status !== "CREATED") {
      throw new RegistryConflictError(
        "ARTIFACT_SESSION_STATE_CONFLICT",
        `Cannot upload content while session is ${record.session.status}`,
      );
    }
    const now = this.clock().toISOString();
    const uploading = { ...record.session, status: "UPLOADING" as const, updatedAt: now };
    this.updateSession(uploading, { tempRelativePath: this.store.sessionRelativePath(sessionId) });
    this.insertEvent(sessionId, "UPLOAD_STARTED", now);
    let observed: { relativePath: string; sha256: string; sizeBytes: number };
    try {
      observed = await this.store.writeSession(sessionId, chunks);
    } catch (error) {
      const failure: ArtifactIngestionFailure = {
        code: error instanceof ArtifactStorageError ? error.code : "ARTIFACT_UPLOAD_FAILED",
        message: error instanceof Error ? error.message : "Artifact upload failed",
        occurredAt: this.clock().toISOString(),
      };
      this.rejectSession(uploading, failure, null);
      throw error;
    }
    const sizeMatches = observed.sizeBytes === record.session.descriptor.expectedSizeBytes;
    const digestMatches = constantTimeHexEqual(
      observed.sha256,
      record.session.descriptor.expectedSha256,
    );
    const verification: ArtifactVerificationResult = {
      protocolVersion: ARTIFACT_INGESTION_PROTOCOL_VERSION,
      objectType: "ARTIFACT_VERIFICATION_RESULT",
      sessionId,
      status: !sizeMatches ? "SIZE_MISMATCH" : !digestMatches ? "DIGEST_MISMATCH" : "MATCHED",
      observedSizeBytes: observed.sizeBytes,
      observedSha256: observed.sha256,
      verifiedAt: this.clock().toISOString(),
      ...(!sizeMatches
        ? { failureCode: "ARTIFACT_SIZE_MISMATCH" }
        : !digestMatches
          ? { failureCode: "ARTIFACT_DIGEST_MISMATCH" }
          : {}),
    };
    if (!isArtifactVerificationResult(verification)) {
      throw new RegistryValidationError("Generated verification result is invalid");
    }
    if (verification.status !== "MATCHED") {
      await this.store.quarantine(observed.relativePath, sessionId);
      const failure: ArtifactIngestionFailure = {
        code: verification.failureCode!,
        message: "Observed upload identity does not match the declared descriptor",
        occurredAt: verification.verifiedAt,
      };
      this.rejectSession(uploading, failure, verification);
      throw new RegistryConflictError(failure.code, failure.message, {
        expectedSizeBytes: record.session.descriptor.expectedSizeBytes,
        observedSizeBytes: observed.sizeBytes,
        expectedSha256: record.session.descriptor.expectedSha256,
        observedSha256: observed.sha256,
      });
    }
    const verifiedSession: ArtifactIngestionSession = {
      ...uploading,
      status: "VERIFIED",
      updatedAt: verification.verifiedAt,
    };
    this.database.exec("BEGIN IMMEDIATE;");
    try {
      this.updateSession(verifiedSession, {
        verification,
        tempRelativePath: observed.relativePath,
      });
      this.insertEvent(sessionId, "UPLOAD_VERIFIED", verification.verifiedAt);
      this.database.exec("COMMIT;");
    } catch (error) {
      this.database.exec("ROLLBACK;");
      throw error;
    }
    return { session: verifiedSession, verification };
  }

  async finalize(
    workerId: string,
    credential: string,
    leaseId: string,
    leaseToken: string,
    sessionId: string,
  ): Promise<{ artifact: RawArtifactView; receipt: ArtifactIngestionReceipt; replayed: boolean }> {
    this.authenticate(workerId, credential, leaseId, leaseToken);
    const record = this.requireSession(sessionId);
    this.assertOwnership(record.session, workerId, leaseId);
    if (record.session.status === "FINALIZED") {
      if (!record.receipt) throw new RegistryValidationError("Finalized session lacks receipt");
      const artifact = this.getArtifact(record.receipt.artifactId);
      if (!artifact) throw new RawArtifactNotFoundError(record.receipt.artifactId);
      return { artifact, receipt: record.receipt, replayed: true };
    }
    if (record.session.status !== "VERIFIED" || !record.verification) {
      throw new RegistryConflictError(
        "ARTIFACT_SESSION_NOT_VERIFIED",
        "Only a verified ingestion session can be finalized",
      );
    }
    const row = this.sessionRow(sessionId);
    if (!row.temp_relative_path) {
      throw new RegistryValidationError("Verified session lacks temporary storage reference");
    }
    const now = this.clock().toISOString();
    const objectRelativePath = await this.store.finalize(
      row.temp_relative_path,
      record.verification.observedSha256,
      record.verification.observedSizeBytes,
    );
    const storageUri = `artifact+local://sha256/${record.verification.observedSha256}`;
    const previous = record.session.descriptor.canonicalUri
      ? (this.database
          .prepare(
            `SELECT document_json FROM raw_artifacts
             WHERE workspace_id = ? AND source_id = ? AND canonical_uri = ?
             ORDER BY created_at DESC, id DESC LIMIT 1`,
          )
          .get(
            record.session.workspaceId,
            record.session.sourceId,
            record.session.descriptor.canonicalUri,
          ) as { document_json: string } | undefined)
      : undefined;
    const previousArtifact = previous ? parseRawArtifact(previous.document_json) : undefined;
    const artifactId = this.artifactIdFactory();
    const receiptId = this.receiptIdFactory();
    const rawArtifact: RawArtifact = {
      schemaVersion: SCHEMA_V1_VERSION,
      objectType: "RAW_ARTIFACT",
      id: artifactId,
      workspaceId: record.session.workspaceId,
      sourceId: record.session.sourceId,
      collectionRunId: record.session.runId,
      version: previousArtifact ? previousArtifact.version + 1 : 1,
      ...(previousArtifact ? { supersedesArtifactId: previousArtifact.id } : {}),
      artifactKind: record.session.descriptor.artifactKind,
      mimeType: record.session.descriptor.mimeType,
      originalName: safeOriginalName(record.session.descriptor.originalName),
      ...(record.session.descriptor.canonicalUri
        ? { canonicalUri: record.session.descriptor.canonicalUri }
        : {}),
      storage: { provider: "LOCAL", uri: storageUri },
      binaryHash: { algorithm: "SHA-256", value: record.verification.observedSha256 },
      contentHash: { algorithm: "SHA-256", value: record.verification.observedSha256 },
      sizeBytes: record.verification.observedSizeBytes,
      capturedAt: now,
      ...(record.session.descriptor.publishedAt
        ? { publishedAt: record.session.descriptor.publishedAt }
        : {}),
      collector: {
        connectorId: record.session.connector.connectorId,
        connectorVersion: record.session.connector.version,
        workerId: record.session.workerId,
        requestId: record.session.id,
      },
      provenance: {
        sourceUri: record.session.descriptor.sourceUri,
        ...(record.session.descriptor.parentArtifactIds
          ? { parentArtifactIds: record.session.descriptor.parentArtifactIds }
          : {}),
      },
      status: "REGISTERED",
      createdAt: now,
      extensions: {
        "x-markorbit-ingestion": {
          jobId: record.session.jobId,
          jobAttempt: record.session.jobAttempt,
          executionAttemptId: record.session.executionAttemptId,
          sessionId: record.session.id,
          receiptId,
        },
      },
    };
    if (!isRawArtifact(rawArtifact)) {
      throw new RegistryValidationError("Generated RawArtifact does not satisfy Schema v1");
    }
    const receipt: ArtifactIngestionReceipt = {
      protocolVersion: ARTIFACT_INGESTION_PROTOCOL_VERSION,
      objectType: "ARTIFACT_INGESTION_RECEIPT",
      id: receiptId,
      sessionId: record.session.id,
      artifactId,
      executionAttemptId: record.session.executionAttemptId,
      contentSha256: record.verification.observedSha256,
      sizeBytes: record.verification.observedSizeBytes,
      artifactKind: record.session.descriptor.artifactKind,
      finalizedAt: now,
    };
    if (!isArtifactIngestionReceipt(receipt)) {
      throw new RegistryValidationError("Generated ingestion receipt is invalid");
    }
    const finalizedSession: ArtifactIngestionSession = {
      ...record.session,
      status: "FINALIZED",
      updatedAt: now,
      finalizedAt: now,
    };
    this.database.exec("BEGIN IMMEDIATE;");
    try {
      this.database
        .prepare(
          `INSERT INTO content_objects (
             digest, size_bytes, relative_path, storage_uri, reference_count, created_at, verified_at
           ) VALUES (?, ?, ?, ?, 1, ?, ?)
           ON CONFLICT(digest) DO UPDATE SET
             reference_count = reference_count + 1,
             verified_at = excluded.verified_at`,
        )
        .run(
          record.verification.observedSha256,
          record.verification.observedSizeBytes,
          objectRelativePath,
          storageUri,
          now,
          now,
        );
      this.database
        .prepare(
          `INSERT INTO raw_artifacts (
             id, workspace_id, source_id, run_id, job_id, job_attempt, execution_attempt_id,
             session_id, receipt_id, content_digest, artifact_kind, mime_type, status,
             canonical_uri, document_json, created_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          rawArtifact.id,
          rawArtifact.workspaceId,
          rawArtifact.sourceId,
          record.session.runId,
          record.session.jobId,
          record.session.jobAttempt,
          record.session.executionAttemptId,
          record.session.id,
          receipt.id,
          record.verification.observedSha256,
          rawArtifact.artifactKind,
          rawArtifact.mimeType,
          rawArtifact.status,
          rawArtifact.canonicalUri ?? null,
          JSON.stringify(rawArtifact),
          now,
        );
      this.updateSession(finalizedSession, { receipt, tempRelativePath: null });
      this.insertEvent(sessionId, "FINALIZED", now);
      this.database.exec("COMMIT;");
    } catch (error) {
      this.database.exec("ROLLBACK;");
      throw error;
    }
    const view = this.getArtifact(rawArtifact.id);
    if (!view) throw new RawArtifactNotFoundError(rawArtifact.id);
    return { artifact: view, receipt, replayed: false };
  }

  abort(
    workerId: string,
    credential: string,
    leaseId: string,
    leaseToken: string,
    sessionId: string,
    reason?: string,
  ): ArtifactSessionRecord {
    this.authenticate(workerId, credential, leaseId, leaseToken);
    const record = this.requireSession(sessionId);
    this.assertOwnership(record.session, workerId, leaseId);
    if (["FINALIZED", "ABORTED", "QUARANTINED"].includes(record.session.status)) return record;
    const now = this.clock().toISOString();
    const failure: ArtifactIngestionFailure = {
      code: "ARTIFACT_INGESTION_ABORTED",
      message: (reason?.trim() || "Artifact ingestion was aborted").slice(0, 1000),
      occurredAt: now,
    };
    const aborted: ArtifactIngestionSession = {
      ...record.session,
      status: "ABORTED",
      updatedAt: now,
    };
    const row = this.sessionRow(sessionId);
    this.store.cleanupSession(row.temp_relative_path);
    this.database.exec("BEGIN IMMEDIATE;");
    try {
      this.updateSession(aborted, { failure, tempRelativePath: null });
      this.insertEvent(sessionId, "ABORTED", now);
      this.database.exec("COMMIT;");
    } catch (error) {
      this.database.exec("ROLLBACK;");
      throw error;
    }
    return this.requireSession(sessionId);
  }

  getSession(id: string): ArtifactSessionRecord | null {
    const row = this.database
      .prepare(
        `SELECT document_json, verification_json, receipt_json, failure_json, temp_relative_path,
                descriptor_hash
         FROM artifact_ingestion_sessions WHERE id = ?`,
      )
      .get(id) as SessionRow | undefined;
    if (!row) return null;
    const events = this.database
      .prepare(
        "SELECT document_json FROM artifact_ingestion_events WHERE session_id = ? ORDER BY sequence",
      )
      .all(id)
      .map((event) => parseEvent((event as { document_json: string }).document_json));
    return {
      session: parseSession(row.document_json),
      ...(row.verification_json ? { verification: parseVerification(row.verification_json) } : {}),
      ...(row.receipt_json ? { receipt: parseReceipt(row.receipt_json) } : {}),
      ...(row.failure_json ? { failure: parseFailure(row.failure_json) } : {}),
      events,
    };
  }

  getArtifact(id: string): RawArtifactView | null {
    const row = this.database
      .prepare(
        `SELECT a.document_json, a.job_id, a.job_attempt, a.execution_attempt_id,
                a.session_id, a.receipt_id, o.digest, o.size_bytes, o.reference_count,
                o.storage_uri, o.created_at, o.verified_at
         FROM raw_artifacts a
         JOIN content_objects o ON o.digest = a.content_digest
         WHERE a.id = ?`,
      )
      .get(id) as
      | {
          document_json: string;
          job_id: string;
          job_attempt: number;
          execution_attempt_id: string;
          session_id: string;
          receipt_id: string;
          digest: string;
          size_bytes: number;
          reference_count: number;
          storage_uri: string;
          created_at: string;
          verified_at: string;
        }
      | undefined;
    if (!row) return null;
    return {
      artifact: parseRawArtifact(row.document_json),
      jobId: row.job_id,
      jobAttempt: row.job_attempt,
      executionAttemptId: row.execution_attempt_id,
      sessionId: row.session_id,
      receiptId: row.receipt_id,
      contentObject: {
        sha256: row.digest,
        sizeBytes: row.size_bytes,
        referenceCount: row.reference_count,
        storageUri: row.storage_uri,
        createdAt: row.created_at,
        verifiedAt: row.verified_at,
      },
    };
  }

  list(filters: ArtifactListFilters = {}): RawArtifactListResult {
    const limit = normalizeLimit(filters.limit);
    const offset = normalizeOffset(filters.offset);
    if (filters.artifactKind && !ARTIFACT_KINDS.includes(filters.artifactKind)) {
      throw new RegistryValidationError("Unknown artifactKind filter");
    }
    if (filters.status && !ARTIFACT_STATUSES.includes(filters.status)) {
      throw new RegistryValidationError("Unknown artifact status filter");
    }
    if (filters.sha256 && !/^[a-f0-9]{64}$/.test(filters.sha256)) {
      throw new RegistryValidationError("Invalid SHA-256 filter");
    }
    const clauses: string[] = [];
    const values: SQLInputValue[] = [];
    const equals = (column: string, value: string | undefined) => {
      if (!value) return;
      clauses.push(`${column} = ?`);
      values.push(value);
    };
    equals("a.workspace_id", filters.workspaceId);
    equals("a.source_id", filters.sourceId);
    equals("a.run_id", filters.runId);
    equals("a.execution_attempt_id", filters.executionAttemptId);
    equals("a.artifact_kind", filters.artifactKind);
    equals("a.status", filters.status);
    equals("a.mime_type", filters.mimeType);
    equals("a.content_digest", filters.sha256);
    if (filters.q?.trim()) {
      clauses.push(
        "(json_extract(a.document_json, '$.originalName') LIKE ? OR a.canonical_uri LIKE ?)",
      );
      const query = `%${filters.q.trim()}%`;
      values.push(query, query);
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const rows = this.database
      .prepare(
        `SELECT a.id FROM raw_artifacts a ${where}
         ORDER BY a.created_at DESC, a.id DESC LIMIT ? OFFSET ?`,
      )
      .all(...values, limit, offset) as Array<{ id: string }>;
    const items = rows
      .map((row) => this.getArtifact(row.id))
      .filter((item): item is RawArtifactView => !!item);
    const total = Number(
      (
        this.database
          .prepare(`SELECT COUNT(*) AS count FROM raw_artifacts a ${where}`)
          .get(...values) as { count: number }
      ).count,
    );
    const summaryRows = this.database
      .prepare("SELECT status, COUNT(*) AS count FROM raw_artifacts GROUP BY status")
      .all() as Array<{ status: RawArtifact["status"]; count: number }>;
    const summary = Object.fromEntries(ARTIFACT_STATUSES.map((status) => [status, 0])) as Record<
      RawArtifact["status"],
      number
    >;
    for (const row of summaryRows)
      if (ARTIFACT_STATUSES.includes(row.status)) summary[row.status] = Number(row.count);
    return {
      items,
      total,
      limit,
      offset,
      summary: { ...summary, total: Object.values(summary).reduce((sum, count) => sum + count, 0) },
    };
  }

  contentPath(id: string): {
    path: string;
    mimeType: string;
    originalName: string;
    sizeBytes: number;
  } {
    const row = this.database
      .prepare(
        `SELECT a.document_json, o.relative_path
         FROM raw_artifacts a JOIN content_objects o ON o.digest = a.content_digest WHERE a.id = ?`,
      )
      .get(id) as { document_json: string; relative_path: string } | undefined;
    if (!row) throw new RawArtifactNotFoundError(id);
    const artifact = parseRawArtifact(row.document_json);
    return {
      path: this.store.resolveObject(row.relative_path),
      mimeType: artifact.mimeType,
      originalName: artifact.originalName,
      sizeBytes: artifact.sizeBytes,
    };
  }

  cleanupAbandoned(olderThan: Date): number {
    const rows = this.database
      .prepare(
        `SELECT id, temp_relative_path FROM artifact_ingestion_sessions
         WHERE status IN ('CREATED', 'UPLOADING') AND updated_at < ?`,
      )
      .all(olderThan.toISOString()) as Array<{ id: string; temp_relative_path: string | null }>;
    const now = this.clock().toISOString();
    this.database.exec("BEGIN IMMEDIATE;");
    try {
      for (const row of rows) {
        this.store.cleanupSession(row.temp_relative_path);
        const record = this.requireSession(row.id);
        const failure: ArtifactIngestionFailure = {
          code: "ARTIFACT_SESSION_ABANDONED",
          message: "Incomplete ingestion session was cleaned up",
          occurredAt: now,
        };
        this.updateSession(
          { ...record.session, status: "ABORTED", updatedAt: now },
          { failure, tempRelativePath: null },
        );
        this.insertEvent(row.id, "ABORTED", now);
      }
      this.database.exec("COMMIT;");
      return rows.length;
    } catch (error) {
      this.database.exec("ROLLBACK;");
      throw error;
    }
  }

  private authenticate(
    workerId: string,
    credential: string,
    leaseId: string,
    leaseToken: string,
  ): AuthenticatedExecutionContext {
    this.workers.verifyCredential(workerId, credential);
    const row = this.database
      .prepare(
        `SELECT l.document_json AS lease_json, l.token_digest,
                j.document_json AS job_json, r.document_json AS run_json,
                a.document_json AS attempt_json
         FROM job_leases l
         JOIN jobs j ON j.id = l.job_id
         JOIN collection_runs r ON r.id = l.run_id
         JOIN execution_attempts a ON a.lease_id = l.id
         WHERE l.id = ?`,
      )
      .get(leaseId) as
      | {
          lease_json: string;
          token_digest: string;
          job_json: string;
          run_json: string;
          attempt_json: string;
        }
      | undefined;
    if (!row)
      throw new RegistryConflictError(
        "ARTIFACT_EXECUTION_CONTEXT_NOT_FOUND",
        "Active execution context was not found",
      );
    const lease = parseLease(row.lease_json);
    if (
      lease.workerId !== workerId ||
      !verifyDigest(leaseToken, row.token_digest) ||
      lease.status !== "ACTIVE" ||
      Date.parse(lease.expiresAt) <= this.clock().getTime()
    ) {
      throw new RegistryConflictError(
        "ARTIFACT_LEASE_AUTHENTICATION_FAILED",
        "Invalid or inactive artifact ingestion lease",
      );
    }
    const attempt = parseAttempt(row.attempt_json);
    if (["COMPLETED", "FAILED"].includes(attempt.status)) {
      throw new RegistryConflictError(
        "ARTIFACT_EXECUTION_TERMINAL",
        "Terminal execution cannot ingest artifacts",
      );
    }
    return { lease, job: parseJob(row.job_json), run: parseRun(row.run_json), attempt };
  }

  private assertOwnership(
    session: ArtifactIngestionSession,
    workerId: string,
    leaseId: string,
  ): void {
    if (session.workerId !== workerId || session.leaseId !== leaseId) {
      throw new RegistryConflictError(
        "ARTIFACT_SESSION_OWNERSHIP_MISMATCH",
        "Session is owned by another Worker or lease",
      );
    }
  }

  private requireSession(id: string): ArtifactSessionRecord {
    const record = this.getSession(id);
    if (!record) throw new ArtifactSessionNotFoundError(id);
    return record;
  }

  private sessionRow(id: string): SessionRow {
    const row = this.database
      .prepare(
        `SELECT document_json, verification_json, receipt_json, failure_json,
                temp_relative_path, descriptor_hash
         FROM artifact_ingestion_sessions WHERE id = ?`,
      )
      .get(id) as SessionRow | undefined;
    if (!row) throw new ArtifactSessionNotFoundError(id);
    return row;
  }

  private updateSession(
    session: ArtifactIngestionSession,
    options: {
      verification?: ArtifactVerificationResult;
      receipt?: ArtifactIngestionReceipt;
      failure?: ArtifactIngestionFailure;
      tempRelativePath?: string | null;
    } = {},
  ): void {
    if (!isArtifactIngestionSession(session)) {
      throw new RegistryValidationError("Session update does not satisfy protocol v1");
    }
    this.database
      .prepare(
        `UPDATE artifact_ingestion_sessions SET
           status = ?, document_json = ?,
           verification_json = COALESCE(?, verification_json),
           receipt_json = COALESCE(?, receipt_json),
           failure_json = COALESCE(?, failure_json),
           temp_relative_path = ?, updated_at = ?, finalized_at = ?
         WHERE id = ?`,
      )
      .run(
        session.status,
        JSON.stringify(session),
        options.verification ? JSON.stringify(options.verification) : null,
        options.receipt ? JSON.stringify(options.receipt) : null,
        options.failure ? JSON.stringify(options.failure) : null,
        options.tempRelativePath === undefined
          ? this.sessionRow(session.id).temp_relative_path
          : options.tempRelativePath,
        session.updatedAt,
        session.finalizedAt ?? null,
        session.id,
      );
  }

  private rejectSession(
    session: ArtifactIngestionSession,
    failure: ArtifactIngestionFailure,
    verification: ArtifactVerificationResult | null,
  ): void {
    const rejected: ArtifactIngestionSession = {
      ...session,
      status: "QUARANTINED",
      updatedAt: failure.occurredAt,
    };
    this.database.exec("BEGIN IMMEDIATE;");
    try {
      this.updateSession(rejected, {
        ...(verification ? { verification } : {}),
        failure,
        tempRelativePath: null,
      });
      this.insertEvent(rejected.id, "UPLOAD_REJECTED", failure.occurredAt, failure);
      this.database.exec("COMMIT;");
    } catch (error) {
      this.database.exec("ROLLBACK;");
      throw error;
    }
  }

  private insertEvent(
    sessionId: string,
    eventType: ArtifactIngestionEvent["eventType"],
    recordedAt: string,
    failure?: ArtifactIngestionFailure,
  ): ArtifactIngestionEvent {
    const sequence = Number(
      (
        this.database
          .prepare(
            "SELECT COALESCE(MAX(sequence), 0) + 1 AS sequence FROM artifact_ingestion_events WHERE session_id = ?",
          )
          .get(sessionId) as { sequence: number }
      ).sequence,
    );
    const event: ArtifactIngestionEvent = {
      protocolVersion: ARTIFACT_INGESTION_PROTOCOL_VERSION,
      objectType: "ARTIFACT_INGESTION_EVENT",
      id: this.eventIdFactory(),
      sessionId,
      sequence,
      eventType,
      recordedAt,
      ...(failure ? { failure } : {}),
    };
    if (!isArtifactIngestionEvent(event))
      throw new RegistryValidationError("Generated ingestion event is invalid");
    this.database
      .prepare(
        `INSERT INTO artifact_ingestion_events
         (id, session_id, sequence, event_type, document_json, recorded_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        event.id,
        event.sessionId,
        event.sequence,
        event.eventType,
        JSON.stringify(event),
        event.recordedAt,
      );
    return event;
  }
}

export function assertFinalizedArtifactReceipts(
  database: DatabaseSync,
  executionAttemptId: string,
  receipt: ExecutionReceipt,
): void {
  if (!isExecutionReceipt(receipt))
    throw new RegistryValidationError("Execution receipt is invalid");
  if (receipt.metadataOnly) return;
  ensureRawArtifactRegistry(database);
  const rows = receipt.artifactReceiptIds.map((id) => {
    const row = database
      .prepare(
        `SELECT s.receipt_json, a.document_json
         FROM artifact_ingestion_sessions s
         JOIN raw_artifacts a ON a.session_id = s.id
         WHERE a.receipt_id = ? AND s.status = 'FINALIZED'`,
      )
      .get(id) as { receipt_json: string; document_json: string } | undefined;
    if (!row) {
      throw new RegistryConflictError(
        "ARTIFACT_RECEIPT_NOT_FINALIZED",
        `Artifact ingestion receipt ${id} is not finalized`,
      );
    }
    return {
      receipt: parseReceipt(row.receipt_json),
      artifact: parseRawArtifact(row.document_json),
    };
  });
  if (rows.some((row) => row.receipt.executionAttemptId !== executionAttemptId)) {
    throw new RegistryConflictError(
      "ARTIFACT_RECEIPT_EXECUTION_MISMATCH",
      "Artifact receipts must belong to the completing execution attempt",
    );
  }
  const kinds = [...new Set(rows.map((row) => row.artifact.artifactKind))].sort();
  const declaredKinds = [...receipt.outputKinds].sort();
  if (JSON.stringify(kinds) !== JSON.stringify(declaredKinds)) {
    throw new RegistryConflictError(
      "ARTIFACT_RECEIPT_KIND_MISMATCH",
      "Finalized artifact kinds do not match the execution receipt",
    );
  }
  const bytes = rows.reduce((sum, row) => sum + row.artifact.sizeBytes, 0);
  if (rows.length !== receipt.itemsObserved || bytes !== receipt.bytesPrepared) {
    throw new RegistryConflictError(
      "ARTIFACT_RECEIPT_TOTAL_MISMATCH",
      "Finalized artifact counts or byte totals do not match the execution receipt",
    );
  }
}
