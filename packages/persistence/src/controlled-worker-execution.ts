import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import {
  WORKER_EXECUTION_PROTOCOL_VERSION,
  isCollectionRun,
  isExecutionAttempt,
  isExecutionEvent,
  isExecutionExecutor,
  isExecutionFailure,
  isExecutionReceipt,
  isJob,
  isJobLease,
  type CollectionRun,
  type CollectionRunStatus,
  type ExecutionAttempt,
  type ExecutionAttemptStatus,
  type ExecutionEvent,
  type ExecutionEventType,
  type ExecutionExecutor,
  type ExecutionFailure,
  type ExecutionReceipt,
  type Job,
  type JobLease,
  type JobLeaseStatus,
  type JobStatus,
} from "@markorbit/contracts";
import { RegistryConflictError, RegistryError, RegistryValidationError } from "./index";
import { generateJobId } from "./execution-ledger";
import {
  SqliteWorkerRegistryRepository,
  ensureWorkerRegistry,
  type WorkerRegistryRepository,
} from "./safe-worker-registry";

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const MIGRATION_ID = "0006_worker_execution";
const ACTIVE_EXECUTION_STATES: ExecutionAttemptStatus[] = ["RUNNING", "UPLOADING", "VERIFYING"];

export type StartExecutionInput = {
  executor: ExecutionExecutor;
  idempotencyKey: string;
};

export type StageExecutionInput = {
  idempotencyKey: string;
};

export type CompleteExecutionInput = {
  receipt: ExecutionReceipt;
  idempotencyKey: string;
};

export type FailExecutionInput = {
  code: string;
  message: string;
  retryable: boolean;
  idempotencyKey: string;
};

export type ExecutionTransitionResult = {
  attempt: ExecutionAttempt;
  event: ExecutionEvent;
  replayed: boolean;
};

export type ExecutionAttemptRecord = {
  attempt: ExecutionAttempt;
  events: ExecutionEvent[];
};

export interface WorkerExecutionRepository {
  start(
    workerId: string,
    credential: string,
    leaseId: string,
    leaseToken: string,
    input: StartExecutionInput,
  ): ExecutionTransitionResult;
  markUploading(
    workerId: string,
    credential: string,
    leaseId: string,
    leaseToken: string,
    input: StageExecutionInput,
  ): ExecutionTransitionResult;
  markVerifying(
    workerId: string,
    credential: string,
    leaseId: string,
    leaseToken: string,
    input: StageExecutionInput,
  ): ExecutionTransitionResult;
  complete(
    workerId: string,
    credential: string,
    leaseId: string,
    leaseToken: string,
    input: CompleteExecutionInput,
  ): ExecutionTransitionResult;
  fail(
    workerId: string,
    credential: string,
    leaseId: string,
    leaseToken: string,
    input: FailExecutionInput,
  ): ExecutionTransitionResult;
  getById(id: string): ExecutionAttemptRecord | null;
  getByLeaseId(leaseId: string): ExecutionAttemptRecord | null;
  listForRun(runId: string): ExecutionAttemptRecord[];
  reconcileExpired(): number;
}

export class ExecutionAttemptNotFoundError extends RegistryError {
  constructor(id: string) {
    super("EXECUTION_ATTEMPT_NOT_FOUND", `Execution attempt ${id} was not found`, { id });
  }
}

export class ExecutionLeaseNotFoundError extends RegistryError {
  constructor(id: string) {
    super("EXECUTION_LEASE_NOT_FOUND", `Execution lease ${id} was not found`, { id });
  }
}

type LeaseContext = {
  lease: JobLease;
  job: Job;
  run: CollectionRun;
  tokenDigest: string;
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

function typedId(prefix: "exa" | "eve", now = Date.now()): string {
  const timestamp = encodeBase32(BigInt(now), 10);
  const randomValue = BigInt(`0x${randomBytes(10).toString("hex")}`);
  return `${prefix}_${timestamp}${encodeBase32(randomValue, 16)}`;
}

export function generateExecutionAttemptId(now = Date.now()): string {
  return typedId("exa", now);
}

export function generateExecutionEventId(now = Date.now()): string {
  return typedId("eve", now);
}

function digest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

function digestHex(value: string): string {
  return digest(value).toString("hex");
}

function verifyDigest(value: string, expectedHex: string): boolean {
  const actual = digest(value);
  const expected = Buffer.from(expectedHex, "hex");
  return expected.length === actual.length && timingSafeEqual(actual, expected);
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function normalizeIdempotencyKey(value: string): string {
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > 128) {
    throw new RegistryValidationError("Idempotency key must contain 1 to 128 characters");
  }
  return normalized;
}

function hashPayload(value: unknown): string {
  return digestHex(JSON.stringify(value));
}

function parseJob(value: unknown): Job {
  const parsed = typeof value === "string" ? (JSON.parse(value) as unknown) : value;
  if (!isJob(parsed)) {
    throw new RegistryValidationError("Persisted Job no longer satisfies Execution Contract v1");
  }
  return parsed;
}

function parseRun(value: unknown): CollectionRun {
  const parsed = typeof value === "string" ? (JSON.parse(value) as unknown) : value;
  if (!isCollectionRun(parsed)) {
    throw new RegistryValidationError(
      "Persisted CollectionRun no longer satisfies Execution Contract v1",
    );
  }
  return parsed;
}

function parseLease(value: unknown): JobLease {
  const parsed = typeof value === "string" ? (JSON.parse(value) as unknown) : value;
  if (!isJobLease(parsed)) {
    throw new RegistryValidationError("Persisted JobLease no longer satisfies Worker Protocol v1");
  }
  return parsed;
}

function parseAttempt(value: unknown): ExecutionAttempt {
  const parsed = typeof value === "string" ? (JSON.parse(value) as unknown) : value;
  if (!isExecutionAttempt(parsed)) {
    throw new RegistryValidationError(
      "Persisted ExecutionAttempt no longer satisfies Worker Execution Protocol v1",
    );
  }
  return parsed;
}

function parseEvent(value: unknown): ExecutionEvent {
  const parsed = typeof value === "string" ? (JSON.parse(value) as unknown) : value;
  if (!isExecutionEvent(parsed)) {
    throw new RegistryValidationError(
      "Persisted ExecutionEvent no longer satisfies Worker Execution Protocol v1",
    );
  }
  return parsed;
}

export function ensureWorkerExecutionRegistry(database: DatabaseSync): void {
  ensureWorkerRegistry(database);
  const applied = database
    .prepare("SELECT id FROM schema_migrations WHERE id = ?")
    .get(MIGRATION_ID);
  if (applied) return;

  database.exec("BEGIN IMMEDIATE;");
  try {
    database.exec(`
      CREATE TABLE IF NOT EXISTS execution_attempts (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        run_id TEXT NOT NULL,
        job_id TEXT NOT NULL,
        job_attempt INTEGER NOT NULL,
        lease_id TEXT NOT NULL UNIQUE,
        worker_id TEXT NOT NULL,
        status TEXT NOT NULL,
        executor_id TEXT NOT NULL,
        executor_version TEXT NOT NULL,
        executor_mode TEXT NOT NULL,
        document_json TEXT NOT NULL,
        started_at TEXT NOT NULL,
        completed_at TEXT,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (run_id) REFERENCES collection_runs(id),
        FOREIGN KEY (job_id) REFERENCES jobs(id),
        FOREIGN KEY (lease_id) REFERENCES job_leases(id),
        FOREIGN KEY (worker_id) REFERENCES worker_definitions(id),
        UNIQUE (job_id, job_attempt)
      ) STRICT;

      CREATE TABLE IF NOT EXISTS execution_events (
        id TEXT PRIMARY KEY,
        attempt_id TEXT NOT NULL,
        sequence INTEGER NOT NULL,
        event_type TEXT NOT NULL,
        from_status TEXT,
        to_status TEXT NOT NULL,
        idempotency_key TEXT NOT NULL,
        payload_hash TEXT NOT NULL,
        document_json TEXT NOT NULL,
        recorded_at TEXT NOT NULL,
        FOREIGN KEY (attempt_id) REFERENCES execution_attempts(id),
        UNIQUE (attempt_id, sequence)
      ) STRICT;

      CREATE TABLE IF NOT EXISTS execution_transition_requests (
        worker_id TEXT NOT NULL,
        lease_id TEXT NOT NULL,
        idempotency_key TEXT NOT NULL,
        operation TEXT NOT NULL,
        payload_hash TEXT NOT NULL,
        result_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (worker_id, lease_id, idempotency_key),
        FOREIGN KEY (worker_id) REFERENCES worker_definitions(id),
        FOREIGN KEY (lease_id) REFERENCES job_leases(id)
      ) STRICT;

      CREATE INDEX IF NOT EXISTS idx_execution_attempts_run
        ON execution_attempts(run_id, started_at);
      CREATE INDEX IF NOT EXISTS idx_execution_attempts_worker_status
        ON execution_attempts(worker_id, status, updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_execution_events_attempt_sequence
        ON execution_events(attempt_id, sequence);
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

export class SqliteWorkerExecutionRepository implements WorkerExecutionRepository {
  private readonly workers: WorkerRegistryRepository;

  constructor(
    private readonly database: DatabaseSync,
    private readonly clock: () => Date = () => new Date(),
    private readonly attemptIdFactory: () => string = () => generateExecutionAttemptId(),
    private readonly eventIdFactory: () => string = () => generateExecutionEventId(),
    private readonly jobIdFactory: () => string = () => generateJobId(),
  ) {
    ensureWorkerExecutionRegistry(database);
    this.workers = new SqliteWorkerRegistryRepository(database, clock);
  }

  start(
    workerId: string,
    credential: string,
    leaseId: string,
    leaseToken: string,
    input: StartExecutionInput,
  ): ExecutionTransitionResult {
    if (!isExecutionExecutor(input.executor)) {
      throw new RegistryValidationError("Invalid execution executor");
    }
    const key = normalizeIdempotencyKey(input.idempotencyKey);
    const payloadDigest = hashPayload({ executor: input.executor });
    this.authenticate(workerId, credential, leaseId, leaseToken);
    const replay = this.findReplay(workerId, leaseId, key, "START", payloadDigest);
    if (replay) return replay;

    const now = this.clock().toISOString();
    this.database.exec("BEGIN IMMEDIATE;");
    try {
      const { lease, job, run } = this.requireActiveContext(workerId, leaseId, leaseToken, now);
      if (job.status !== "LEASED" || run.status !== "PENDING") {
        throw new RegistryConflictError(
          "EXECUTION_START_STATE_CONFLICT",
          "Execution can start only from LEASED Job and PENDING CollectionRun",
        );
      }
      if (this.getByLeaseIdInTransaction(leaseId)) {
        throw new RegistryConflictError(
          "EXECUTION_ATTEMPT_ALREADY_EXISTS",
          "The lease already has an execution attempt",
        );
      }

      const attempt: ExecutionAttempt = {
        contractVersion: WORKER_EXECUTION_PROTOCOL_VERSION,
        objectType: "EXECUTION_ATTEMPT",
        id: this.attemptIdFactory(),
        workspaceId: job.workspaceId,
        runId: job.runId,
        jobId: job.id,
        jobAttempt: job.attempt,
        leaseId: lease.id,
        workerId,
        connector: clone(job.connector),
        executor: clone(input.executor),
        status: "RUNNING",
        startedAt: now,
        updatedAt: now,
      };
      if (!isExecutionAttempt(attempt)) {
        throw new RegistryValidationError("ExecutionAttempt does not satisfy protocol v1");
      }
      const event = this.buildEvent(
        attempt,
        undefined,
        "RUNNING",
        "STARTED",
        key,
        payloadDigest,
        now,
      );
      this.insertAttempt(attempt);
      this.insertEvent(event);
      this.updateJob(job, "RUNNING", now);
      this.updateRun(run, "RUNNING", now);
      const result: ExecutionTransitionResult = { attempt, event, replayed: false };
      this.storeReplay(workerId, leaseId, key, "START", payloadDigest, result, now);
      this.database.exec("COMMIT;");
      return result;
    } catch (error) {
      this.database.exec("ROLLBACK;");
      throw error;
    }
  }

  markUploading(
    workerId: string,
    credential: string,
    leaseId: string,
    leaseToken: string,
    input: StageExecutionInput,
  ): ExecutionTransitionResult {
    return this.transition(
      workerId,
      credential,
      leaseId,
      leaseToken,
      input.idempotencyKey,
      "UPLOADING",
      "RUNNING",
      "UPLOADING",
    );
  }

  markVerifying(
    workerId: string,
    credential: string,
    leaseId: string,
    leaseToken: string,
    input: StageExecutionInput,
  ): ExecutionTransitionResult {
    return this.transition(
      workerId,
      credential,
      leaseId,
      leaseToken,
      input.idempotencyKey,
      "VERIFYING",
      "UPLOADING",
      "VERIFYING",
    );
  }

  complete(
    workerId: string,
    credential: string,
    leaseId: string,
    leaseToken: string,
    input: CompleteExecutionInput,
  ): ExecutionTransitionResult {
    if (!isExecutionReceipt(input.receipt)) {
      throw new RegistryValidationError("Invalid execution receipt");
    }
    return this.terminal(
      workerId,
      credential,
      leaseId,
      leaseToken,
      input.idempotencyKey,
      "COMPLETE",
      hashPayload({ receipt: input.receipt }),
      { receipt: input.receipt },
    );
  }

  fail(
    workerId: string,
    credential: string,
    leaseId: string,
    leaseToken: string,
    input: FailExecutionInput,
  ): ExecutionTransitionResult {
    const code = input.code.trim();
    const message = input.message.trim();
    const key = normalizeIdempotencyKey(input.idempotencyKey);
    const payloadDigest = hashPayload({ code, message, retryable: input.retryable });
    this.authenticate(workerId, credential, leaseId, leaseToken);
    const replay = this.findReplay(workerId, leaseId, key, "FAIL", payloadDigest);
    if (replay) return replay;

    const failure: ExecutionFailure = {
      code,
      message,
      retryable: input.retryable,
      occurredAt: this.clock().toISOString(),
    };
    if (!isExecutionFailure(failure)) {
      throw new RegistryValidationError("Invalid execution failure");
    }
    return this.terminalAuthenticated(workerId, leaseId, leaseToken, key, "FAIL", payloadDigest, {
      failure,
    });
  }

  getById(id: string): ExecutionAttemptRecord | null {
    const row = this.database
      .prepare("SELECT document_json FROM execution_attempts WHERE id = ?")
      .get(id) as { document_json: string } | undefined;
    return row ? this.recordForAttempt(parseAttempt(row.document_json)) : null;
  }

  getByLeaseId(leaseId: string): ExecutionAttemptRecord | null {
    const row = this.database
      .prepare("SELECT document_json FROM execution_attempts WHERE lease_id = ?")
      .get(leaseId) as { document_json: string } | undefined;
    return row ? this.recordForAttempt(parseAttempt(row.document_json)) : null;
  }

  listForRun(runId: string): ExecutionAttemptRecord[] {
    return this.database
      .prepare("SELECT document_json FROM execution_attempts WHERE run_id = ? ORDER BY started_at")
      .all(runId)
      .map((row) =>
        this.recordForAttempt(parseAttempt((row as { document_json: string }).document_json)),
      );
  }

  reconcileExpired(): number {
    const now = this.clock().toISOString();
    this.database.exec("BEGIN IMMEDIATE;");
    try {
      const rows = this.database
        .prepare(
          `SELECT a.document_json AS attempt_json, l.document_json AS lease_json,
                  j.document_json AS job_json, r.document_json AS run_json
           FROM execution_attempts a
           JOIN job_leases l ON l.id = a.lease_id
           JOIN jobs j ON j.id = a.job_id
           JOIN collection_runs r ON r.id = a.run_id
           WHERE a.status IN ('RUNNING', 'UPLOADING', 'VERIFYING')
             AND (l.status != 'ACTIVE' OR l.expires_at <= ?)
           ORDER BY a.started_at, a.id`,
        )
        .all(now) as Array<{
        attempt_json: string;
        lease_json: string;
        job_json: string;
        run_json: string;
      }>;

      for (const row of rows) {
        const attempt = parseAttempt(row.attempt_json);
        const lease = parseLease(row.lease_json);
        const job = parseJob(row.job_json);
        const run = parseRun(row.run_json);
        const failure: ExecutionFailure = {
          code: "LEASE_EXPIRED_DURING_EXECUTION",
          message:
            "The execution lease ended after execution started; external outcome is unknown.",
          retryable: false,
          occurredAt: now,
        };
        const nextAttempt: ExecutionAttempt = {
          ...clone(attempt),
          status: "FAILED",
          updatedAt: now,
          completedAt: now,
          failure,
        };
        const key = `system-reconcile-${lease.id}`.slice(0, 128);
        const payloadDigest = hashPayload({ code: failure.code, leaseStatus: lease.status });
        const event = this.buildEvent(
          nextAttempt,
          attempt.status,
          "FAILED",
          "ABANDONED",
          key,
          payloadDigest,
          now,
        );
        this.updateAttempt(nextAttempt);
        this.insertEvent(event);
        this.updateJob(job, "FAILED", now);
        this.updateRun(run, "FAILED", now);
        if (lease.status === "ACTIVE") {
          this.closeLease(lease, "EXPIRED", "LEASE_EXPIRED_DURING_EXECUTION", now);
        }
      }
      this.database.exec("COMMIT;");
      return rows.length;
    } catch (error) {
      this.database.exec("ROLLBACK;");
      throw error;
    }
  }

  private transition(
    workerId: string,
    credential: string,
    leaseId: string,
    leaseToken: string,
    idempotencyKey: string,
    operation: "UPLOADING" | "VERIFYING",
    expected: "RUNNING" | "UPLOADING",
    target: "UPLOADING" | "VERIFYING",
  ): ExecutionTransitionResult {
    const key = normalizeIdempotencyKey(idempotencyKey);
    const payloadDigest = hashPayload({ target });
    this.authenticate(workerId, credential, leaseId, leaseToken);
    const replay = this.findReplay(workerId, leaseId, key, operation, payloadDigest);
    if (replay) return replay;

    const now = this.clock().toISOString();
    this.database.exec("BEGIN IMMEDIATE;");
    try {
      const { job } = this.requireActiveContext(workerId, leaseId, leaseToken, now);
      const record = this.requireAttemptByLease(leaseId);
      if (record.attempt.status !== expected || job.status !== expected) {
        throw new RegistryConflictError(
          "EXECUTION_TRANSITION_CONFLICT",
          `Expected ${expected} before ${target}`,
        );
      }
      const nextAttempt: ExecutionAttempt = {
        ...clone(record.attempt),
        status: target,
        updatedAt: now,
      };
      const event = this.buildEvent(
        nextAttempt,
        expected,
        target,
        operation,
        key,
        payloadDigest,
        now,
      );
      this.updateAttempt(nextAttempt);
      this.insertEvent(event);
      this.updateJob(job, target, now);
      const result: ExecutionTransitionResult = {
        attempt: nextAttempt,
        event,
        replayed: false,
      };
      this.storeReplay(workerId, leaseId, key, operation, payloadDigest, result, now);
      this.database.exec("COMMIT;");
      return result;
    } catch (error) {
      this.database.exec("ROLLBACK;");
      throw error;
    }
  }

  private terminal(
    workerId: string,
    credential: string,
    leaseId: string,
    leaseToken: string,
    idempotencyKey: string,
    operation: "COMPLETE",
    payloadDigest: string,
    terminal: { receipt: ExecutionReceipt },
  ): ExecutionTransitionResult {
    const key = normalizeIdempotencyKey(idempotencyKey);
    this.authenticate(workerId, credential, leaseId, leaseToken);
    const replay = this.findReplay(workerId, leaseId, key, operation, payloadDigest);
    if (replay) return replay;
    return this.terminalAuthenticated(
      workerId,
      leaseId,
      leaseToken,
      key,
      operation,
      payloadDigest,
      terminal,
    );
  }

  private terminalAuthenticated(
    workerId: string,
    leaseId: string,
    leaseToken: string,
    key: string,
    operation: "COMPLETE" | "FAIL",
    payloadDigest: string,
    terminal: { receipt: ExecutionReceipt } | { failure: ExecutionFailure },
  ): ExecutionTransitionResult {
    const now = this.clock().toISOString();
    this.database.exec("BEGIN IMMEDIATE;");
    try {
      const { lease, job, run } = this.requireActiveContext(workerId, leaseId, leaseToken, now);
      const record = this.requireAttemptByLease(leaseId);
      const completing = "receipt" in terminal;
      if (completing && (record.attempt.status !== "VERIFYING" || job.status !== "VERIFYING")) {
        throw new RegistryConflictError(
          "EXECUTION_TRANSITION_CONFLICT",
          "Completion requires VERIFYING state",
        );
      }
      if (!completing && !ACTIVE_EXECUTION_STATES.includes(record.attempt.status)) {
        throw new RegistryConflictError(
          "EXECUTION_TRANSITION_CONFLICT",
          "Failure requires an active execution state",
        );
      }
      if (
        completing &&
        JSON.stringify(record.attempt.executor) !== JSON.stringify(terminal.receipt.executor)
      ) {
        throw new RegistryConflictError(
          "EXECUTION_EXECUTOR_MISMATCH",
          "Receipt executor must match the started execution executor",
        );
      }
      if (completing) {
        this.assertReceiptMatchesJob(terminal.receipt, job);
        this.assertArtifactEvidence(record.attempt.id, terminal.receipt);
      }

      const target: "COMPLETED" | "FAILED" = completing ? "COMPLETED" : "FAILED";
      const nextAttempt: ExecutionAttempt = {
        ...clone(record.attempt),
        status: target,
        updatedAt: now,
        completedAt: now,
        ...(completing
          ? { receipt: clone(terminal.receipt) }
          : { failure: clone(terminal.failure) }),
      };
      if (!isExecutionAttempt(nextAttempt)) {
        throw new RegistryValidationError("Terminal attempt does not satisfy protocol v1");
      }
      const event = this.buildEvent(
        nextAttempt,
        record.attempt.status,
        target,
        completing ? "COMPLETED" : "FAILED",
        key,
        payloadDigest,
        now,
      );
      this.updateAttempt(nextAttempt);
      this.insertEvent(event);
      let leaseReason = completing ? "EXECUTION_COMPLETED" : "EXECUTION_FAILED";
      if (completing) {
        this.updateJob(job, "COMPLETED", now);
        this.updateRun(run, "COMPLETED", now);
      } else if (terminal.failure.retryable && job.attempt < job.maxAttempts) {
        this.updateJob(job, "RETRY", now);
        this.insertRetryJob(job, now);
        this.updateRun(run, "PENDING", now);
        leaseReason = "EXECUTION_RETRY_SCHEDULED";
      } else if (terminal.failure.retryable) {
        this.updateJob(job, "DEAD_LETTER", now);
        this.updateRun(run, "FAILED", now);
        leaseReason = "EXECUTION_RETRY_EXHAUSTED";
      } else {
        this.updateJob(job, "FAILED", now);
        this.updateRun(run, "FAILED", now);
      }
      this.closeLease(lease, "RELEASED", leaseReason, now);
      const result: ExecutionTransitionResult = {
        attempt: nextAttempt,
        event,
        replayed: false,
      };
      this.storeReplay(workerId, leaseId, key, operation, payloadDigest, result, now);
      this.database.exec("COMMIT;");
      return result;
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
  ): LeaseContext {
    this.workers.verifyCredential(workerId, credential);
    const context = this.loadLeaseContext(leaseId);
    if (context.lease.workerId !== workerId || !verifyDigest(leaseToken, context.tokenDigest)) {
      throw new RegistryConflictError(
        "EXECUTION_LEASE_AUTHENTICATION_FAILED",
        "Invalid lease ownership or token",
      );
    }
    return context;
  }

  private requireActiveContext(
    workerId: string,
    leaseId: string,
    leaseToken: string,
    now: string,
  ): LeaseContext {
    const context = this.loadLeaseContext(leaseId);
    if (context.lease.workerId !== workerId || !verifyDigest(leaseToken, context.tokenDigest)) {
      throw new RegistryConflictError(
        "EXECUTION_LEASE_AUTHENTICATION_FAILED",
        "Invalid lease ownership or token",
      );
    }
    if (
      context.lease.status !== "ACTIVE" ||
      Date.parse(context.lease.expiresAt) <= Date.parse(now)
    ) {
      throw new RegistryConflictError(
        "EXECUTION_LEASE_NOT_ACTIVE",
        "Execution requires an active lease",
      );
    }
    return context;
  }

  private loadLeaseContext(leaseId: string): LeaseContext {
    const row = this.database
      .prepare(
        `SELECT l.document_json AS lease_json, l.token_digest,
                j.document_json AS job_json, r.document_json AS run_json
         FROM job_leases l
         JOIN jobs j ON j.id = l.job_id
         JOIN collection_runs r ON r.id = l.run_id
         WHERE l.id = ?`,
      )
      .get(leaseId) as
      { lease_json: string; token_digest: string; job_json: string; run_json: string } | undefined;
    if (!row) throw new ExecutionLeaseNotFoundError(leaseId);
    return {
      lease: parseLease(row.lease_json),
      job: parseJob(row.job_json),
      run: parseRun(row.run_json),
      tokenDigest: row.token_digest,
    };
  }

  private requireAttemptByLease(leaseId: string): ExecutionAttemptRecord {
    const record = this.getByLeaseIdInTransaction(leaseId);
    if (!record) throw new ExecutionAttemptNotFoundError(leaseId);
    return record;
  }

  private getByLeaseIdInTransaction(leaseId: string): ExecutionAttemptRecord | null {
    const row = this.database
      .prepare("SELECT document_json FROM execution_attempts WHERE lease_id = ?")
      .get(leaseId) as { document_json: string } | undefined;
    return row ? this.recordForAttempt(parseAttempt(row.document_json)) : null;
  }

  private recordForAttempt(attempt: ExecutionAttempt): ExecutionAttemptRecord {
    const events = this.database
      .prepare("SELECT document_json FROM execution_events WHERE attempt_id = ? ORDER BY sequence")
      .all(attempt.id)
      .map((row) => parseEvent((row as { document_json: string }).document_json));
    return { attempt, events };
  }

  private buildEvent(
    attempt: ExecutionAttempt,
    fromStatus: ExecutionAttemptStatus | undefined,
    toStatus: ExecutionAttemptStatus,
    eventType: ExecutionEventType,
    idempotencyKey: string,
    payloadDigest: string,
    recordedAt: string,
  ): ExecutionEvent {
    const sequence =
      Number(
        (
          this.database
            .prepare("SELECT COUNT(*) AS count FROM execution_events WHERE attempt_id = ?")
            .get(attempt.id) as { count: number }
        ).count,
      ) + 1;
    const event: ExecutionEvent = {
      contractVersion: WORKER_EXECUTION_PROTOCOL_VERSION,
      objectType: "EXECUTION_EVENT",
      id: this.eventIdFactory(),
      attemptId: attempt.id,
      sequence,
      eventType,
      ...(fromStatus ? { fromStatus } : {}),
      toStatus,
      idempotencyKey,
      payloadHash: payloadDigest,
      recordedAt,
    };
    if (!isExecutionEvent(event)) {
      throw new RegistryValidationError("ExecutionEvent does not satisfy protocol v1");
    }
    return event;
  }

  private assertReceiptMatchesJob(receipt: ExecutionReceipt, job: Job): void {
    const requested = new Set(job.planSnapshot.output.artifactKinds);
    const supported = new Set(job.connectorSnapshot.outputArtifactKinds);
    const unsupported = receipt.outputKinds.filter(
      (kind) => !requested.has(kind) || !supported.has(kind),
    );
    if (unsupported.length > 0) {
      throw new RegistryConflictError(
        "EXECUTION_RECEIPT_OUTPUT_MISMATCH",
        "Execution receipt contains output kinds outside the immutable Job snapshots",
        { unsupported },
      );
    }
  }

  private assertArtifactEvidence(executionAttemptId: string, receipt: ExecutionReceipt): void {
    if (receipt.metadataOnly) return;
    const table = this.database
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'raw_artifacts'")
      .get();
    if (!table) {
      throw new RegistryConflictError(
        "ARTIFACT_RECEIPT_NOT_FINALIZED",
        "Artifact-backed completion requires the RawArtifact ingestion registry",
      );
    }
    const rows = receipt.artifactReceiptIds.map((receiptId) => {
      const row = this.database
        .prepare(
          `SELECT a.execution_attempt_id, a.artifact_kind, a.document_json,
                  s.status AS session_status, s.receipt_json
           FROM raw_artifacts a
           JOIN artifact_ingestion_sessions s ON s.id = a.session_id
           WHERE a.receipt_id = ?`,
        )
        .get(receiptId) as
        | {
            execution_attempt_id: string;
            artifact_kind: string;
            document_json: string;
            session_status: string;
            receipt_json: string | null;
          }
        | undefined;
      if (!row || row.session_status !== "FINALIZED" || !row.receipt_json) {
        throw new RegistryConflictError(
          "ARTIFACT_RECEIPT_NOT_FINALIZED",
          `Artifact ingestion receipt ${receiptId} is not finalized`,
        );
      }
      const artifact = JSON.parse(row.document_json) as {
        sizeBytes?: unknown;
        artifactKind?: unknown;
      };
      if (
        row.execution_attempt_id !== executionAttemptId ||
        typeof artifact.sizeBytes !== "number" ||
        typeof artifact.artifactKind !== "string"
      ) {
        throw new RegistryConflictError(
          "ARTIFACT_RECEIPT_EXECUTION_MISMATCH",
          "Artifact receipt does not belong to this execution attempt",
        );
      }
      return { sizeBytes: artifact.sizeBytes, artifactKind: artifact.artifactKind };
    });
    const observedKinds = [...new Set(rows.map((row) => row.artifactKind))].sort();
    const declaredKinds = [...receipt.outputKinds].sort();
    const observedBytes = rows.reduce((sum, row) => sum + row.sizeBytes, 0);
    if (
      JSON.stringify(observedKinds) !== JSON.stringify(declaredKinds) ||
      rows.length !== receipt.itemsObserved ||
      observedBytes !== receipt.bytesPrepared
    ) {
      throw new RegistryConflictError(
        "ARTIFACT_RECEIPT_TOTAL_MISMATCH",
        "Finalized artifact evidence does not match the execution receipt",
      );
    }
  }

  private insertAttempt(attempt: ExecutionAttempt): void {
    this.database
      .prepare(
        `INSERT INTO execution_attempts (
           id, workspace_id, run_id, job_id, job_attempt, lease_id, worker_id, status,
           executor_id, executor_version, executor_mode, document_json, started_at,
           completed_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        attempt.id,
        attempt.workspaceId,
        attempt.runId,
        attempt.jobId,
        attempt.jobAttempt,
        attempt.leaseId,
        attempt.workerId,
        attempt.status,
        attempt.executor.executorId,
        attempt.executor.version,
        attempt.executor.mode,
        JSON.stringify(attempt),
        attempt.startedAt,
        attempt.completedAt ?? null,
        attempt.updatedAt,
      );
  }

  private updateAttempt(attempt: ExecutionAttempt): void {
    if (!isExecutionAttempt(attempt)) {
      throw new RegistryValidationError("ExecutionAttempt does not satisfy protocol v1");
    }
    this.database
      .prepare(
        `UPDATE execution_attempts SET status = ?, document_json = ?, completed_at = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(
        attempt.status,
        JSON.stringify(attempt),
        attempt.completedAt ?? null,
        attempt.updatedAt,
        attempt.id,
      );
  }

  private insertEvent(event: ExecutionEvent): void {
    this.database
      .prepare(
        `INSERT INTO execution_events (
           id, attempt_id, sequence, event_type, from_status, to_status,
           idempotency_key, payload_hash, document_json, recorded_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        event.id,
        event.attemptId,
        event.sequence,
        event.eventType,
        event.fromStatus ?? null,
        event.toStatus,
        event.idempotencyKey,
        event.payloadHash,
        JSON.stringify(event),
        event.recordedAt,
      );
  }

  private insertRetryJob(job: Job, timestamp: string): Job {
    const backoffMs = job.planSnapshot.policy.retry.backoffSeconds * 1_000;
    const retryJob: Job = {
      ...clone(job),
      id: this.jobIdFactory(),
      status: "PENDING",
      attempt: job.attempt + 1,
      availableAt: new Date(Date.parse(timestamp) + backoffMs).toISOString(),
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    if (!isJob(retryJob)) {
      throw new RegistryValidationError("Retry Job does not satisfy Execution Contract v1");
    }
    this.database
      .prepare(
        `INSERT INTO jobs (
           id, run_id, workspace_id, source_id, plan_id, connector_id, connector_version,
           job_type, status, attempt, available_at, document_json, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        retryJob.id,
        retryJob.runId,
        retryJob.workspaceId,
        retryJob.sourceId,
        retryJob.planId,
        retryJob.connector.connectorId,
        retryJob.connector.version,
        retryJob.jobType,
        retryJob.status,
        retryJob.attempt,
        retryJob.availableAt,
        JSON.stringify(retryJob),
        retryJob.createdAt,
        retryJob.updatedAt,
      );
    return retryJob;
  }

  private updateJob(job: Job, status: JobStatus, timestamp: string): void {
    const next = { ...clone(job), status, updatedAt: timestamp };
    if (!isJob(next)) throw new RegistryValidationError("Job transition violates contract v1");
    this.database
      .prepare("UPDATE jobs SET status = ?, document_json = ?, updated_at = ? WHERE id = ?")
      .run(status, JSON.stringify(next), timestamp, job.id);
  }

  private updateRun(run: CollectionRun, status: CollectionRunStatus, timestamp: string): void {
    const next = { ...clone(run), status, updatedAt: timestamp };
    if (!isCollectionRun(next)) {
      throw new RegistryValidationError("CollectionRun transition violates contract v1");
    }
    this.database
      .prepare(
        "UPDATE collection_runs SET status = ?, document_json = ?, updated_at = ? WHERE id = ?",
      )
      .run(status, JSON.stringify(next), timestamp, run.id);
  }

  private closeLease(
    lease: JobLease,
    status: Exclude<JobLeaseStatus, "ACTIVE">,
    reason: string,
    timestamp: string,
  ): void {
    const next: JobLease = {
      ...clone(lease),
      status,
      updatedAt: timestamp,
      closedAt: timestamp,
      closeReason: reason,
    };
    if (!isJobLease(next)) {
      throw new RegistryValidationError("Lease close violates Worker Protocol v1");
    }
    this.database
      .prepare(`UPDATE job_leases SET status = ?, document_json = ?, updated_at = ? WHERE id = ?`)
      .run(status, JSON.stringify(next), timestamp, lease.id);
  }

  private findReplay(
    workerId: string,
    leaseId: string,
    key: string,
    operation: string,
    payloadDigest: string,
  ): ExecutionTransitionResult | null {
    const row = this.database
      .prepare(
        `SELECT operation, payload_hash, result_json FROM execution_transition_requests
         WHERE worker_id = ? AND lease_id = ? AND idempotency_key = ?`,
      )
      .get(workerId, leaseId, key) as
      { operation: string; payload_hash: string; result_json: string } | undefined;
    if (!row) return null;
    if (row.operation !== operation || row.payload_hash !== payloadDigest) {
      throw new RegistryConflictError(
        "EXECUTION_IDEMPOTENCY_CONFLICT",
        "Idempotency key was already used with a different operation or payload",
      );
    }
    const parsed = JSON.parse(row.result_json) as unknown;
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !("attempt" in parsed) ||
      !("event" in parsed) ||
      !isExecutionAttempt(parsed.attempt) ||
      !isExecutionEvent(parsed.event)
    ) {
      throw new RegistryValidationError("Stored execution replay result is invalid");
    }
    return { attempt: parsed.attempt, event: parsed.event, replayed: true };
  }

  private storeReplay(
    workerId: string,
    leaseId: string,
    key: string,
    operation: string,
    payloadDigest: string,
    result: ExecutionTransitionResult,
    timestamp: string,
  ): void {
    this.database
      .prepare(
        `INSERT INTO execution_transition_requests (
           worker_id, lease_id, idempotency_key, operation, payload_hash, result_json, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(workerId, leaseId, key, operation, payloadDigest, JSON.stringify(result), timestamp);
  }
}
