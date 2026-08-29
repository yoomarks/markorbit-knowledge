import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import {
  CONVERSION_EXECUTION_VERSION,
  authorizeRuntimeReport,
  canTransitionConversionRun,
  forbiddenConversionExecutionField,
  isConversionAttempt,
  isConversionExecutionEvent,
  isConversionFailedReport,
  isConversionLease,
  isConversionOutputReadyReport,
  isConversionProgressReport,
  isConversionRun,
  isConversionStartedReport,
  isStagingDocumentDescriptor,
  isStagingOutputUploadGrant,
  type ConversionAttempt,
  type ConversionExecutionEvent,
  type ConversionFailedReport,
  type ConversionLease,
  type ConversionOutputReadyReport,
  type ConversionProgressReport,
  type ConversionRun,
  type ConversionStartedReport,
  type RuntimeReportBase,
  type StagingDocumentDescriptor,
  type StagingOutputUploadGrant,
} from "@markorbit/contracts";
import { RegistryConflictError, RegistryError, RegistryValidationError } from "./index";
import { ensureConversionRuntimePersistence } from "./conversion-runtime-persistence";
import { generateConversionEventId } from "./conversion-run-ledger";
import { SqliteWorkerRegistryRepository } from "./safe-worker-registry";

const MIGRATION_ID = "0011_conversion_runtime_transitions";
const FAILURE_CODE = /^[A-Z0-9][A-Z0-9_]{1,99}$/;
const KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;
const ACTOR = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/;

export type ConversionRuntimeTransitionResult = {
  run: ConversionRun;
  attempt: ConversionAttempt;
  lease: ConversionLease;
  event: ConversionExecutionEvent;
  replayed: boolean;
};

export type CompleteConversionVerificationInput = {
  workspaceId: string;
  verifierId: string;
  idempotencyKey: string;
  stagingDocument: StagingDocumentDescriptor;
};

export type FailConversionVerificationInput = {
  workspaceId: string;
  verifierId: string;
  idempotencyKey: string;
  conversionRunId: string;
  code: string;
  message: string;
};

export type ReconcileExpiredConversionLeaseInput = {
  workspaceId: string;
  reconcilerId: string;
  idempotencyKey: string;
};

export interface ConversionRuntimeTransitionRepository {
  submitStarted(
    report: ConversionStartedReport,
    workerCredential: string,
  ): ConversionRuntimeTransitionResult;
  submitProgress(
    report: ConversionProgressReport,
    workerCredential: string,
  ): ConversionRuntimeTransitionResult;
  submitOutputReady(
    report: ConversionOutputReadyReport,
    workerCredential: string,
  ): ConversionRuntimeTransitionResult;
  submitFailed(
    report: ConversionFailedReport,
    workerCredential: string,
  ): ConversionRuntimeTransitionResult;
  completeVerification(
    input: CompleteConversionVerificationInput,
  ): ConversionRuntimeTransitionResult;
  failVerification(input: FailConversionVerificationInput): ConversionRuntimeTransitionResult;
  reconcileExpiredStartedLease(
    leaseId: string,
    input: ReconcileExpiredConversionLeaseInput,
  ): ConversionRuntimeTransitionResult;
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

function digest(value: unknown): string {
  return createHash("sha256").update(stable(value), "utf8").digest("hex");
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function parseRun(value: string): ConversionRun {
  const parsed = JSON.parse(value) as unknown;
  if (!isConversionRun(parsed))
    throw new RegistryValidationError("Persisted ConversionRun is invalid");
  return parsed;
}

function parseLease(value: string): ConversionLease {
  const parsed = JSON.parse(value) as unknown;
  if (!isConversionLease(parsed))
    throw new RegistryValidationError("Persisted ConversionLease is invalid");
  return parsed;
}

function parseAttempt(value: string): ConversionAttempt {
  const parsed = JSON.parse(value) as unknown;
  if (!isConversionAttempt(parsed)) {
    throw new RegistryValidationError("Persisted ConversionAttempt is invalid");
  }
  return parsed;
}

function parseEvent(value: string): ConversionExecutionEvent {
  const parsed = JSON.parse(value) as unknown;
  if (!isConversionExecutionEvent(parsed)) {
    throw new RegistryValidationError("Persisted ConversionExecutionEvent is invalid");
  }
  return parsed;
}

function parseUploadGrant(value: string): StagingOutputUploadGrant {
  const parsed = JSON.parse(value) as unknown;
  if (!isStagingOutputUploadGrant(parsed)) {
    throw new RegistryValidationError("Persisted StagingOutputUploadGrant is invalid");
  }
  return parsed;
}

function validateKey(value: string): string {
  const key = value.trim();
  if (!KEY.test(key)) throw new RegistryValidationError("Invalid transition idempotency key");
  return key;
}

function validateActor(value: string, field: string): string {
  const actor = value.trim();
  if (!ACTOR.test(actor)) throw new RegistryValidationError(`Invalid ${field}`);
  return actor;
}

function validateFailure(code: string, message: string): void {
  if (!FAILURE_CODE.test(code)) throw new RegistryValidationError("Failure code must be uppercase");
  if (!message.trim() || message.length > 1000) {
    throw new RegistryValidationError("Failure message must contain 1-1000 characters");
  }
}

export function ensureConversionRuntimeTransitions(database: DatabaseSync): void {
  ensureConversionRuntimePersistence(database);
  if (database.prepare("SELECT id FROM schema_migrations WHERE id = ?").get(MIGRATION_ID)) return;
  database.exec("BEGIN IMMEDIATE;");
  try {
    database.exec(`
      CREATE TABLE IF NOT EXISTS conversion_runtime_reports (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        worker_id TEXT NOT NULL,
        conversion_run_id TEXT NOT NULL,
        conversion_attempt_id TEXT NOT NULL,
        conversion_lease_id TEXT NOT NULL,
        idempotency_key TEXT NOT NULL,
        report_digest TEXT NOT NULL,
        report_type TEXT NOT NULL,
        document_json TEXT NOT NULL,
        event_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (worker_id) REFERENCES worker_definitions(id),
        FOREIGN KEY (conversion_run_id) REFERENCES conversion_runs(id),
        FOREIGN KEY (conversion_attempt_id) REFERENCES conversion_attempts(id),
        FOREIGN KEY (conversion_lease_id) REFERENCES conversion_leases(id),
        FOREIGN KEY (event_id) REFERENCES conversion_execution_events(id),
        UNIQUE (workspace_id, worker_id, idempotency_key)
      ) STRICT;

      CREATE TABLE IF NOT EXISTS conversion_verifier_transitions (
        workspace_id TEXT NOT NULL,
        verifier_id TEXT NOT NULL,
        idempotency_key TEXT NOT NULL,
        request_digest TEXT NOT NULL,
        conversion_run_id TEXT NOT NULL,
        event_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (workspace_id, verifier_id, idempotency_key),
        FOREIGN KEY (conversion_run_id) REFERENCES conversion_runs(id),
        FOREIGN KEY (event_id) REFERENCES conversion_execution_events(id)
      ) STRICT;

      CREATE INDEX IF NOT EXISTS idx_conversion_runtime_reports_run
        ON conversion_runtime_reports(conversion_run_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_conversion_runtime_reports_attempt
        ON conversion_runtime_reports(conversion_attempt_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_conversion_verifier_transitions_run
        ON conversion_verifier_transitions(conversion_run_id, created_at);
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

export class SqliteConversionRuntimeTransitionRepository implements ConversionRuntimeTransitionRepository {
  private readonly workers: SqliteWorkerRegistryRepository;

  constructor(
    private readonly database: DatabaseSync,
    private readonly clock: () => Date = () => new Date(),
    private readonly eventId: () => string = () => generateConversionEventId(),
  ) {
    ensureConversionRuntimeTransitions(database);
    this.workers = new SqliteWorkerRegistryRepository(database, clock);
  }

  submitStarted(
    report: ConversionStartedReport,
    workerCredential: string,
  ): ConversionRuntimeTransitionResult {
    if (!isConversionStartedReport(report)) {
      throw new RegistryValidationError("Started report violates Conversion Runtime Protocol v1");
    }
    return this.applyWorkerReport(report, workerCredential, "STARTED");
  }

  submitProgress(
    report: ConversionProgressReport,
    workerCredential: string,
  ): ConversionRuntimeTransitionResult {
    if (!isConversionProgressReport(report)) {
      throw new RegistryValidationError("Progress report violates Conversion Runtime Protocol v1");
    }
    return this.applyWorkerReport(report, workerCredential, "PROGRESS");
  }

  submitOutputReady(
    report: ConversionOutputReadyReport,
    workerCredential: string,
  ): ConversionRuntimeTransitionResult {
    if (!isConversionOutputReadyReport(report)) {
      throw new RegistryValidationError(
        "Output-ready report violates Conversion Runtime Protocol v1",
      );
    }
    return this.applyWorkerReport(report, workerCredential, "OUTPUT_READY");
  }

  submitFailed(
    report: ConversionFailedReport,
    workerCredential: string,
  ): ConversionRuntimeTransitionResult {
    if (!isConversionFailedReport(report)) {
      throw new RegistryValidationError("Failed report violates Conversion Runtime Protocol v1");
    }
    validateFailure(report.failure.code, report.failure.message);
    return this.applyWorkerReport(report, workerCredential, "FAILED");
  }

  completeVerification(
    input: CompleteConversionVerificationInput,
  ): ConversionRuntimeTransitionResult {
    if (
      !isStagingDocumentDescriptor(input.stagingDocument) ||
      input.stagingDocument.status !== "READY"
    ) {
      throw new RegistryValidationError("Completion requires a READY StagingDocumentDescriptor");
    }
    const verifierId = validateActor(input.verifierId, "verifierId");
    const idempotencyKey = validateKey(input.idempotencyKey);
    const request = { ...input, verifierId, idempotencyKey };
    return this.applyVerifierTransition(
      request.workspaceId,
      verifierId,
      idempotencyKey,
      request.stagingDocument.conversionRunId,
      request,
      "COMPLETE",
    );
  }

  failVerification(input: FailConversionVerificationInput): ConversionRuntimeTransitionResult {
    const verifierId = validateActor(input.verifierId, "verifierId");
    const idempotencyKey = validateKey(input.idempotencyKey);
    validateFailure(input.code, input.message);
    const request = { ...input, verifierId, idempotencyKey };
    return this.applyVerifierTransition(
      request.workspaceId,
      verifierId,
      idempotencyKey,
      request.conversionRunId,
      request,
      "FAIL_VERIFICATION",
    );
  }

  reconcileExpiredStartedLease(
    leaseId: string,
    input: ReconcileExpiredConversionLeaseInput,
  ): ConversionRuntimeTransitionResult {
    const reconcilerId = validateActor(input.reconcilerId, "reconcilerId");
    const idempotencyKey = validateKey(input.idempotencyKey);
    const lease = this.loadLease(leaseId);
    const request = { leaseId, ...input, reconcilerId, idempotencyKey };
    return this.applyVerifierTransition(
      input.workspaceId,
      reconcilerId,
      idempotencyKey,
      lease.conversionRunId,
      request,
      "RECONCILE_EXPIRED",
    );
  }

  private applyWorkerReport(
    report:
      | ConversionStartedReport
      | ConversionProgressReport
      | ConversionOutputReadyReport
      | ConversionFailedReport,
    workerCredential: string,
    action: "STARTED" | "PROGRESS" | "OUTPUT_READY" | "FAILED",
  ): ConversionRuntimeTransitionResult {
    const worker = this.workers.verifyCredential(report.workerId, workerCredential);
    if (worker.workspaceId !== report.workspaceId) {
      throw new RegistryConflictError(
        "CONVERSION_REPORT_WORKSPACE_MISMATCH",
        "Worker credential belongs to another Workspace",
      );
    }
    const reportDigest = digest(report);
    this.database.exec("BEGIN IMMEDIATE;");
    try {
      const replay = this.workerReplay(report, reportDigest);
      if (replay) {
        this.database.exec("COMMIT;");
        return replay;
      }
      const run = this.loadRun(report.conversionRunId);
      const lease = this.loadLease(report.conversionLeaseId);
      const attempt = this.loadAttempt(report.conversionAttemptId);
      this.authorizeReport(report, run, lease, attempt);

      let nextRun = clone(run);
      let nextAttempt = clone(attempt);
      let nextLease = clone(lease);
      let event: ConversionExecutionEvent;

      if (action === "STARTED") {
        const startedReport = report as ConversionStartedReport;
        if (
          attempt.status !== "CLAIMED" ||
          startedReport.converter.converterId !== run.converter.converterId ||
          startedReport.converter.version !== run.converter.version
        ) {
          throw new RegistryConflictError(
            "CONVERSION_START_NOT_ALLOWED",
            "Only the claimed exact Converter attempt may start",
          );
        }
        if (!canTransitionConversionRun(run.status, "RUNNING")) {
          throw new RegistryConflictError("CONVERSION_TRANSITION_INVALID", "Run cannot start");
        }
        nextRun = {
          ...nextRun,
          status: "RUNNING",
          startedAt: report.occurredAt,
          updatedAt: report.occurredAt,
        };
        nextAttempt = {
          ...nextAttempt,
          status: "STARTED",
          startedAt: report.occurredAt,
        };
        event = this.event(run, nextRun, "STARTED", report.occurredAt, {
          type: "WORKER",
          id: report.workerId,
        });
      } else if (action === "PROGRESS") {
        const progressReport = report as ConversionProgressReport;
        if (attempt.status !== "STARTED" || run.status !== "RUNNING") {
          throw new RegistryConflictError(
            "CONVERSION_PROGRESS_NOT_ALLOWED",
            "Progress requires a RUNNING run and STARTED attempt",
          );
        }
        nextRun = { ...nextRun, updatedAt: report.occurredAt };
        event = this.event(
          run,
          nextRun,
          "PROGRESS_REPORTED",
          report.occurredAt,
          {
            type: "WORKER",
            id: report.workerId,
          },
          progressReport.progress.message,
          { percent: progressReport.progress.percent },
        );
      } else if (action === "OUTPUT_READY") {
        const outputReport = report as ConversionOutputReadyReport;
        if (attempt.status !== "STARTED" || !canTransitionConversionRun(run.status, "VERIFYING")) {
          throw new RegistryConflictError(
            "CONVERSION_OUTPUT_NOT_ALLOWED",
            "Output-ready requires a RUNNING run and STARTED attempt",
          );
        }
        const grant = this.loadUploadGrant(outputReport.output.uploadGrantId);
        this.validateOutput(outputReport, grant, run, lease, attempt);
        nextRun = {
          ...nextRun,
          status: "VERIFYING",
          verifyingAt: report.occurredAt,
          updatedAt: report.occurredAt,
        };
        nextAttempt = {
          ...nextAttempt,
          status: "OUTPUT_REPORTED",
          outcome: "OUTPUT_REPORTED",
          endedAt: report.occurredAt,
        };
        nextLease = {
          ...nextLease,
          status: "RELEASED",
          releasedAt: report.occurredAt,
        };
        event = this.event(
          run,
          nextRun,
          "VERIFICATION_STARTED",
          report.occurredAt,
          {
            type: "WORKER",
            id: report.workerId,
          },
          "Output evidence accepted for control-plane verification",
          undefined,
          undefined,
          undefined,
          { checkCount: 0, warningCount: 0 },
        );
      } else {
        const failedReport = report as ConversionFailedReport;
        if (attempt.status !== "STARTED" || run.status !== "RUNNING") {
          throw new RegistryConflictError(
            "CONVERSION_FAILURE_NOT_ALLOWED",
            "Worker failure requires a RUNNING run and STARTED attempt",
          );
        }
        const failure = {
          kind: "WORKER_ERROR" as const,
          code: failedReport.failure.code,
          message: failedReport.failure.message,
          retryable: false,
        };
        nextRun = {
          ...nextRun,
          status: "FAILED",
          failedAt: report.occurredAt,
          failure,
          updatedAt: report.occurredAt,
        };
        nextAttempt = {
          ...nextAttempt,
          status: "FAILED",
          outcome: "FAILED",
          endedAt: report.occurredAt,
          failure: clone(failedReport.failure),
        };
        nextLease = {
          ...nextLease,
          status: "RELEASED",
          releasedAt: report.occurredAt,
        };
        event = this.event(
          run,
          nextRun,
          "FAILED",
          report.occurredAt,
          {
            type: "WORKER",
            id: report.workerId,
          },
          undefined,
          undefined,
          failure,
        );
      }

      this.validateTransitionObjects(nextRun, nextAttempt, nextLease, event);
      this.persistTransition(run, nextRun, attempt, nextAttempt, lease, nextLease, event);
      this.database
        .prepare(
          `INSERT INTO conversion_runtime_reports
           (id, workspace_id, worker_id, conversion_run_id, conversion_attempt_id,
            conversion_lease_id, idempotency_key, report_digest, report_type,
            document_json, event_id, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          report.id,
          report.workspaceId,
          report.workerId,
          report.conversionRunId,
          report.conversionAttemptId,
          report.conversionLeaseId,
          report.idempotencyKey,
          reportDigest,
          report.objectType,
          JSON.stringify(report),
          event.id,
          this.clock().toISOString(),
        );
      this.database.exec("COMMIT;");
      return { run: nextRun, attempt: nextAttempt, lease: nextLease, event, replayed: false };
    } catch (error) {
      this.database.exec("ROLLBACK;");
      throw error;
    }
  }

  private applyVerifierTransition(
    workspaceId: string,
    actorId: string,
    idempotencyKey: string,
    conversionRunId: string,
    request: unknown,
    action: "COMPLETE" | "FAIL_VERIFICATION" | "RECONCILE_EXPIRED",
  ): ConversionRuntimeTransitionResult {
    const requestDigest = digest(request);
    this.database.exec("BEGIN IMMEDIATE;");
    try {
      const replay = this.verifierReplay(workspaceId, actorId, idempotencyKey, requestDigest);
      if (replay) {
        this.database.exec("COMMIT;");
        return replay;
      }
      const run = this.loadRun(conversionRunId);
      if (run.workspaceId !== workspaceId) {
        throw new RegistryConflictError(
          "CONVERSION_VERIFIER_WORKSPACE_MISMATCH",
          "ConversionRun belongs to another Workspace",
        );
      }
      const attempt = this.loadLatestAttempt(run.id);
      const lease = this.loadLease(attempt.conversionLeaseId);
      let nextRun = clone(run);
      let nextAttempt = clone(attempt);
      let nextLease = clone(lease);
      let event: ConversionExecutionEvent;
      const occurredAt = this.clock().toISOString();

      if (action === "COMPLETE") {
        const descriptor = (request as CompleteConversionVerificationInput).stagingDocument;
        if (run.status !== "VERIFYING" || attempt.status !== "OUTPUT_REPORTED") {
          throw new RegistryConflictError(
            "CONVERSION_COMPLETION_NOT_ALLOWED",
            "Completion requires VERIFYING run and OUTPUT_REPORTED attempt",
          );
        }
        this.validateDescriptor(run, descriptor);
        if (!canTransitionConversionRun(run.status, "COMPLETED")) {
          throw new RegistryConflictError("CONVERSION_TRANSITION_INVALID", "Run cannot complete");
        }
        nextRun = {
          ...nextRun,
          status: "COMPLETED",
          completedAt: occurredAt,
          stagingDocument: clone(descriptor),
          updatedAt: occurredAt,
        };
        event = this.event(
          run,
          nextRun,
          "COMPLETED",
          occurredAt,
          {
            type: "SYSTEM",
            id: actorId,
          },
          undefined,
          undefined,
          undefined,
          {
            stagingDocumentId: descriptor.id,
            contentHash: descriptor.contentHash.value,
            sizeBytes: descriptor.sizeBytes,
          },
        );
      } else if (action === "FAIL_VERIFICATION") {
        const failureInput = request as FailConversionVerificationInput;
        if (run.status !== "VERIFYING" || !canTransitionConversionRun(run.status, "FAILED")) {
          throw new RegistryConflictError(
            "CONVERSION_VERIFICATION_FAILURE_NOT_ALLOWED",
            "Verification failure requires a VERIFYING run",
          );
        }
        const failure = {
          kind: "VERIFICATION_FAILED" as const,
          code: failureInput.code,
          message: failureInput.message,
          retryable: false,
        };
        nextRun = {
          ...nextRun,
          status: "FAILED",
          failedAt: occurredAt,
          failure,
          updatedAt: occurredAt,
        };
        event = this.event(
          run,
          nextRun,
          "FAILED",
          occurredAt,
          {
            type: "SYSTEM",
            id: actorId,
          },
          undefined,
          undefined,
          failure,
        );
      } else {
        if (lease.status !== "ACTIVE" || attempt.status !== "STARTED" || run.status !== "RUNNING") {
          throw new RegistryConflictError(
            "CONVERSION_LEASE_RECONCILIATION_NOT_ALLOWED",
            "Only an expired ACTIVE lease for a STARTED attempt may be reconciled",
          );
        }
        if (Date.parse(occurredAt) < Date.parse(lease.expiresAt)) {
          throw new RegistryConflictError("CONVERSION_LEASE_NOT_EXPIRED", "Lease has not expired");
        }
        const failure = {
          kind: "TIMEOUT" as const,
          code: "LEASE_EXPIRED_DURING_CONVERSION",
          message: "Conversion lease expired after execution started",
          retryable: false,
        };
        nextRun = {
          ...nextRun,
          status: "FAILED",
          failedAt: occurredAt,
          failure,
          updatedAt: occurredAt,
        };
        nextAttempt = {
          ...nextAttempt,
          status: "LEASE_LOST",
          outcome: "LEASE_LOST",
          endedAt: occurredAt,
          failure: {
            code: failure.code,
            message: failure.message,
            retryable: false,
          },
          reconciliation: {
            code: failure.code,
            evidence: { "x-after-start": true },
          },
        };
        nextLease = {
          ...nextLease,
          status: "EXPIRED",
          expiredAt: occurredAt,
        };
        event = this.event(
          run,
          nextRun,
          "FAILED",
          occurredAt,
          {
            type: "SYSTEM",
            id: actorId,
          },
          undefined,
          undefined,
          failure,
        );
      }

      this.validateTransitionObjects(nextRun, nextAttempt, nextLease, event);
      this.persistTransition(run, nextRun, attempt, nextAttempt, lease, nextLease, event);
      this.database
        .prepare(
          `INSERT INTO conversion_verifier_transitions
           (workspace_id, verifier_id, idempotency_key, request_digest,
            conversion_run_id, event_id, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(workspaceId, actorId, idempotencyKey, requestDigest, run.id, event.id, occurredAt);
      this.database.exec("COMMIT;");
      return { run: nextRun, attempt: nextAttempt, lease: nextLease, event, replayed: false };
    } catch (error) {
      this.database.exec("ROLLBACK;");
      throw error;
    }
  }

  private authorizeReport(
    report: RuntimeReportBase,
    run: ConversionRun,
    lease: ConversionLease,
    attempt: ConversionAttempt,
  ): void {
    const now = this.clock().toISOString();
    if (
      run.workspaceId !== report.workspaceId ||
      lease.workspaceId !== report.workspaceId ||
      attempt.workspaceId !== report.workspaceId ||
      attempt.conversionRunId !== run.id ||
      lease.conversionRunId !== run.id ||
      attempt.conversionLeaseId !== lease.id ||
      lease.conversionAttemptId !== attempt.id ||
      attempt.workerId !== report.workerId ||
      attempt.converter.converterId !== lease.converter.converterId ||
      attempt.converter.version !== lease.converter.version ||
      Date.parse(report.occurredAt) > Date.parse(now) ||
      authorizeRuntimeReport(report, lease, run.status, now) !== "AUTHORIZED"
    ) {
      throw new RegistryConflictError(
        "CONVERSION_REPORT_NOT_AUTHORIZED",
        "Runtime report does not match the active Worker, lease, attempt, token or run status",
      );
    }
  }

  private validateOutput(
    report: ConversionOutputReadyReport,
    grant: StagingOutputUploadGrant,
    run: ConversionRun,
    lease: ConversionLease,
    attempt: ConversionAttempt,
  ): void {
    if (
      grant.workspaceId !== run.workspaceId ||
      grant.conversionRunId !== run.id ||
      grant.conversionAttemptId !== attempt.id ||
      grant.workerId !== lease.workerId ||
      report.output.targetPath !== grant.normalizedTargetPath ||
      report.output.mediaType !== grant.allowedMediaType ||
      report.output.sizeBytes > grant.maximumBytes ||
      Date.parse(report.occurredAt) >= Date.parse(grant.expiresAt)
    ) {
      throw new RegistryConflictError(
        "CONVERSION_OUTPUT_GRANT_MISMATCH",
        "Output evidence does not match the active upload grant",
      );
    }
  }

  private validateDescriptor(run: ConversionRun, descriptor: StagingDocumentDescriptor): void {
    const outputRow = this.database
      .prepare(
        `SELECT document_json FROM conversion_runtime_reports
         WHERE conversion_run_id = ? AND report_type = 'CONVERSION_OUTPUT_READY_REPORT'
         ORDER BY created_at DESC LIMIT 1`,
      )
      .get(run.id) as { document_json: string } | undefined;
    if (!outputRow) {
      throw new RegistryConflictError(
        "CONVERSION_OUTPUT_EVIDENCE_MISSING",
        "Completion requires persisted output-ready evidence",
      );
    }
    const output = JSON.parse(outputRow.document_json) as unknown;
    if (!isConversionOutputReadyReport(output)) {
      throw new RegistryValidationError("Persisted output-ready report is invalid");
    }
    if (
      descriptor.workspaceId !== run.workspaceId ||
      descriptor.sourceId !== run.sourceId ||
      descriptor.rawArtifactId !== run.rawArtifactId ||
      descriptor.conversionRunId !== run.id ||
      descriptor.converter.converterId !== run.converter.converterId ||
      descriptor.converter.version !== run.converter.version ||
      descriptor.outputFormat !== run.requestedOutput.format ||
      descriptor.targetPath !== output.output.targetPath ||
      descriptor.contentHash.value !== output.output.sha256 ||
      descriptor.sizeBytes !== output.output.sizeBytes
    ) {
      throw new RegistryConflictError(
        "CONVERSION_STAGING_DESCRIPTOR_MISMATCH",
        "Staging descriptor does not match the frozen run and output evidence",
      );
    }
  }

  private workerReplay(
    report: RuntimeReportBase,
    reportDigest: string,
  ): ConversionRuntimeTransitionResult | null {
    const previous = this.database
      .prepare(
        `SELECT report_digest, event_id FROM conversion_runtime_reports
         WHERE workspace_id = ? AND worker_id = ? AND idempotency_key = ?`,
      )
      .get(report.workspaceId, report.workerId, report.idempotencyKey) as
      { report_digest: string; event_id: string } | undefined;
    if (!previous) return null;
    if (previous.report_digest !== reportDigest) {
      throw new RegistryConflictError(
        "CONVERSION_REPORT_IDEMPOTENCY_CONFLICT",
        "Runtime report idempotency key was reused with a different report",
      );
    }
    return this.resultForEvent(previous.event_id, true);
  }

  private verifierReplay(
    workspaceId: string,
    verifierId: string,
    idempotencyKey: string,
    requestDigest: string,
  ): ConversionRuntimeTransitionResult | null {
    const previous = this.database
      .prepare(
        `SELECT request_digest, event_id FROM conversion_verifier_transitions
         WHERE workspace_id = ? AND verifier_id = ? AND idempotency_key = ?`,
      )
      .get(workspaceId, verifierId, idempotencyKey) as
      { request_digest: string; event_id: string } | undefined;
    if (!previous) return null;
    if (previous.request_digest !== requestDigest) {
      throw new RegistryConflictError(
        "CONVERSION_VERIFIER_IDEMPOTENCY_CONFLICT",
        "Verifier idempotency key was reused with a different request",
      );
    }
    return this.resultForEvent(previous.event_id, true);
  }

  private resultForEvent(eventId: string, replayed: boolean): ConversionRuntimeTransitionResult {
    const eventRow = this.database
      .prepare("SELECT document_json FROM conversion_execution_events WHERE id = ?")
      .get(eventId) as { document_json: string } | undefined;
    if (!eventRow)
      throw new RegistryError("CONVERSION_EVENT_NOT_FOUND", "Transition event missing");
    const event = parseEvent(eventRow.document_json);
    const run = this.loadRun(event.runId);
    const attempt = this.loadLatestAttempt(run.id);
    const lease = this.loadLease(attempt.conversionLeaseId);
    return { run, attempt, lease, event, replayed };
  }

  private event(
    previous: ConversionRun,
    resulting: ConversionRun,
    eventType: ConversionExecutionEvent["eventType"],
    occurredAt: string,
    actor: ConversionExecutionEvent["actor"],
    message?: string,
    progress?: ConversionExecutionEvent["progress"],
    failure?: ConversionExecutionEvent["failure"],
    completion?: ConversionExecutionEvent["completion"],
    verification?: ConversionExecutionEvent["verification"],
  ): ConversionExecutionEvent {
    const sequence =
      Number(
        (
          this.database
            .prepare(
              "SELECT COALESCE(MAX(sequence), 0) AS sequence FROM conversion_execution_events WHERE run_id = ?",
            )
            .get(previous.id) as { sequence: number }
        ).sequence,
      ) + 1;
    return {
      contractVersion: CONVERSION_EXECUTION_VERSION,
      objectType: "CONVERSION_EXECUTION_EVENT",
      id: this.eventId(),
      runId: previous.id,
      sequence,
      eventType,
      previousStatus: previous.status,
      resultingStatus: resulting.status,
      occurredAt,
      actor,
      ...(message ? { message } : {}),
      ...(progress ? { progress } : {}),
      ...(failure ? { failure } : {}),
      ...(completion ? { completion } : {}),
      ...(verification ? { verification } : {}),
    };
  }

  private validateTransitionObjects(
    run: ConversionRun,
    attempt: ConversionAttempt,
    lease: ConversionLease,
    event: ConversionExecutionEvent,
  ): void {
    if (
      !isConversionRun(run) ||
      !isConversionAttempt(attempt) ||
      !isConversionLease(lease) ||
      !isConversionExecutionEvent(event) ||
      forbiddenConversionExecutionField(run) ||
      forbiddenConversionExecutionField(event)
    ) {
      throw new RegistryValidationError(
        "Runtime transition violates Conversion Execution or Runtime Protocol v1",
      );
    }
  }

  private persistTransition(
    previousRun: ConversionRun,
    nextRun: ConversionRun,
    previousAttempt: ConversionAttempt,
    nextAttempt: ConversionAttempt,
    previousLease: ConversionLease,
    nextLease: ConversionLease,
    event: ConversionExecutionEvent,
  ): void {
    const runResult = this.database
      .prepare(
        `UPDATE conversion_runs SET status = ?, document_json = ?, updated_at = ?, terminal_at = ?
         WHERE id = ? AND status = ?`,
      )
      .run(
        nextRun.status,
        JSON.stringify(nextRun),
        nextRun.updatedAt,
        ["COMPLETED", "FAILED", "CANCELLED"].includes(nextRun.status) ? nextRun.updatedAt : null,
        previousRun.id,
        previousRun.status,
      );
    if (runResult.changes !== 1) {
      throw new RegistryConflictError(
        "CONVERSION_RUN_CONCURRENT_TRANSITION",
        "ConversionRun changed concurrently",
      );
    }
    if (stable(previousAttempt) !== stable(nextAttempt)) {
      const attemptResult = this.database
        .prepare(
          `UPDATE conversion_attempts SET status = ?, document_json = ?, started_at = ?, ended_at = ?
           WHERE id = ? AND status = ?`,
        )
        .run(
          nextAttempt.status,
          JSON.stringify(nextAttempt),
          nextAttempt.startedAt ?? null,
          nextAttempt.endedAt ?? null,
          previousAttempt.id,
          previousAttempt.status,
        );
      if (attemptResult.changes !== 1) {
        throw new RegistryConflictError(
          "CONVERSION_ATTEMPT_CONCURRENT_TRANSITION",
          "ConversionAttempt changed concurrently",
        );
      }
    }
    if (stable(previousLease) !== stable(nextLease)) {
      const closedAt =
        nextLease.releasedAt ?? nextLease.expiredAt ?? nextLease.supersededAt ?? null;
      const leaseResult = this.database
        .prepare(
          `UPDATE conversion_leases SET status = ?, document_json = ?, closed_at = ?
           WHERE id = ? AND status = ? AND generation = ?`,
        )
        .run(
          nextLease.status,
          JSON.stringify(nextLease),
          closedAt,
          previousLease.id,
          previousLease.status,
          previousLease.generation,
        );
      if (leaseResult.changes !== 1) {
        throw new RegistryConflictError(
          "CONVERSION_LEASE_CONCURRENT_TRANSITION",
          "ConversionLease changed concurrently",
        );
      }
    }
    this.database
      .prepare(
        `INSERT INTO conversion_execution_events
         (id, run_id, sequence, event_type, previous_status, resulting_status, document_json, occurred_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        event.id,
        event.runId,
        event.sequence,
        event.eventType,
        event.previousStatus,
        event.resultingStatus,
        JSON.stringify(event),
        event.occurredAt,
      );
  }

  private loadRun(id: string): ConversionRun {
    const row = this.database
      .prepare("SELECT document_json FROM conversion_runs WHERE id = ?")
      .get(id) as { document_json: string } | undefined;
    if (!row) throw new RegistryError("CONVERSION_RUN_NOT_FOUND", `ConversionRun ${id} not found`);
    return parseRun(row.document_json);
  }

  private loadLease(id: string): ConversionLease {
    const row = this.database
      .prepare("SELECT document_json FROM conversion_leases WHERE id = ?")
      .get(id) as { document_json: string } | undefined;
    if (!row)
      throw new RegistryError("CONVERSION_LEASE_NOT_FOUND", `ConversionLease ${id} not found`);
    return parseLease(row.document_json);
  }

  private loadAttempt(id: string): ConversionAttempt {
    const row = this.database
      .prepare("SELECT document_json FROM conversion_attempts WHERE id = ?")
      .get(id) as { document_json: string } | undefined;
    if (!row) {
      throw new RegistryError("CONVERSION_ATTEMPT_NOT_FOUND", `ConversionAttempt ${id} not found`);
    }
    return parseAttempt(row.document_json);
  }

  private loadLatestAttempt(conversionRunId: string): ConversionAttempt {
    const row = this.database
      .prepare(
        `SELECT document_json FROM conversion_attempts
         WHERE conversion_run_id = ? ORDER BY ordinal DESC LIMIT 1`,
      )
      .get(conversionRunId) as { document_json: string } | undefined;
    if (!row)
      throw new RegistryError("CONVERSION_ATTEMPT_NOT_FOUND", "Conversion attempt not found");
    return parseAttempt(row.document_json);
  }

  private loadUploadGrant(id: string): StagingOutputUploadGrant {
    const row = this.database
      .prepare("SELECT document_json FROM conversion_upload_grants WHERE id = ?")
      .get(id) as { document_json: string } | undefined;
    if (!row)
      throw new RegistryError("CONVERSION_UPLOAD_GRANT_NOT_FOUND", "Upload grant not found");
    return parseUploadGrant(row.document_json);
  }
}
