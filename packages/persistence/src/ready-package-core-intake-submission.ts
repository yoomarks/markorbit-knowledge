import { randomBytes } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import type { CoreIntakeResult } from "@markorbit/contracts";
import {
  RegistryConflictError,
  RegistryError,
  RegistryValidationError,
  initializeRegistry,
} from "./index";

const MIGRATION_ID = "0020_ready_package_core_intake_submissions";
const SHA256 = /^[a-f0-9]{64}$/;
const CORE_WORKSPACE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CORE_INTAKE_STATUSES = new Set<CoreIntakeResult["status"]>([
  "RECEIVED",
  "ACCEPTED",
  "REJECTED",
]);

export type ReadyPackageCoreIntakeSubmissionResultEvidence = {
  intakeId: string;
  status: CoreIntakeResult["status"];
  recordedAt: string;
};

export type ReadyPackageCoreIntakeSubmission = {
  submissionId: string;
  workspaceId: string;
  readyPackageId: string;
  expectedDigest: string;
  idempotencyKey: string;
  submittedAt: string;
  coreWorkspaceId?: string;
  state: "PENDING" | "RESULT_RECORDED";
  transportResult?: ReadyPackageCoreIntakeSubmissionResultEvidence;
  result?: ReadyPackageCoreIntakeSubmissionResultEvidence;
  createdAt: string;
  updatedAt: string;
};

export type PrepareReadyPackageCoreIntakeSubmissionInput = {
  workspaceId: string;
  readyPackageId: string;
  expectedDigest: string;
  coreWorkspaceId?: string;
};

export type PrepareReadyPackageCoreIntakeSubmissionResult = {
  submission: ReadyPackageCoreIntakeSubmission;
  replayed: boolean;
};

export interface ReadyPackageCoreIntakeSubmissionRepository {
  prepare(
    input: PrepareReadyPackageCoreIntakeSubmissionInput,
  ): PrepareReadyPackageCoreIntakeSubmissionResult;
  recordTransportResult(
    submissionId: string,
    workspaceId: string,
    result: CoreIntakeResult,
  ): ReadyPackageCoreIntakeSubmission;
  recordResult(
    submissionId: string,
    workspaceId: string,
    result: CoreIntakeResult,
  ): ReadyPackageCoreIntakeSubmission;
  list(readyPackageId: string, workspaceId: string): ReadyPackageCoreIntakeSubmission[];
}

function submissionId(now = Date.now()): string {
  return `cis_${now.toString(36)}${randomBytes(10).toString("hex")}`;
}

function validateScope(input: PrepareReadyPackageCoreIntakeSubmissionInput): void {
  if (!input.workspaceId?.trim()) throw new RegistryValidationError("workspaceId is required");
  if (!input.readyPackageId?.trim())
    throw new RegistryValidationError("readyPackageId is required");
  if (!SHA256.test(input.expectedDigest)) {
    throw new RegistryValidationError("expectedDigest must be a SHA-256 digest");
  }
  if (input.coreWorkspaceId !== undefined && !CORE_WORKSPACE_ID.test(input.coreWorkspaceId)) {
    throw new RegistryValidationError("coreWorkspaceId must be a canonical UUID");
  }
}

function validateCoreIntakeResult(result: CoreIntakeResult): void {
  if (
    !result ||
    typeof result !== "object" ||
    typeof result.intakeId !== "string" ||
    !result.intakeId.trim() ||
    typeof result.readyPackageId !== "string" ||
    !result.readyPackageId.trim() ||
    !CORE_INTAKE_STATUSES.has(result.status)
  ) {
    throw new RegistryValidationError("Core intake result is invalid");
  }
}

function validateResultEvidence(
  evidence: ReadyPackageCoreIntakeSubmissionResultEvidence | undefined,
  message: string,
): asserts evidence is ReadyPackageCoreIntakeSubmissionResultEvidence {
  if (
    !evidence ||
    typeof evidence.intakeId !== "string" ||
    !evidence.intakeId.trim() ||
    !CORE_INTAKE_STATUSES.has(evidence.status) ||
    Number.isNaN(Date.parse(evidence.recordedAt))
  ) {
    throw new RegistryValidationError(message);
  }
}

function matchesResult(
  evidence: ReadyPackageCoreIntakeSubmissionResultEvidence | undefined,
  result: CoreIntakeResult,
): boolean {
  return evidence?.intakeId === result.intakeId && evidence.status === result.status;
}

function parseSubmission(value: string): ReadyPackageCoreIntakeSubmission {
  const parsed = JSON.parse(value) as ReadyPackageCoreIntakeSubmission;
  if (
    !parsed ||
    typeof parsed !== "object" ||
    typeof parsed.submissionId !== "string" ||
    !parsed.submissionId.trim() ||
    typeof parsed.workspaceId !== "string" ||
    !parsed.workspaceId.trim() ||
    typeof parsed.readyPackageId !== "string" ||
    !parsed.readyPackageId.trim() ||
    !SHA256.test(parsed.expectedDigest) ||
    typeof parsed.idempotencyKey !== "string" ||
    !parsed.idempotencyKey.trim() ||
    Number.isNaN(Date.parse(parsed.submittedAt)) ||
    (parsed.coreWorkspaceId !== undefined && !CORE_WORKSPACE_ID.test(parsed.coreWorkspaceId)) ||
    (parsed.state !== "PENDING" && parsed.state !== "RESULT_RECORDED") ||
    Number.isNaN(Date.parse(parsed.createdAt)) ||
    Number.isNaN(Date.parse(parsed.updatedAt))
  ) {
    throw new RegistryValidationError("Persisted Core intake submission is invalid");
  }
  if (parsed.transportResult !== undefined) {
    validateResultEvidence(
      parsed.transportResult,
      "Persisted Core intake transport result is invalid",
    );
  }
  if (parsed.state === "RESULT_RECORDED") {
    validateResultEvidence(parsed.result, "Persisted Core intake submission result is invalid");
    if (
      parsed.transportResult &&
      (parsed.transportResult.intakeId !== parsed.result.intakeId ||
        parsed.transportResult.status !== parsed.result.status)
    ) {
      throw new RegistryValidationError(
        "Persisted Core intake transport and submission results do not match",
      );
    }
  } else if (parsed.result !== undefined) {
    throw new RegistryValidationError("Pending Core intake submission cannot contain a result");
  }
  return parsed;
}

function ensureReadyPackageCoreIntakeSubmissionRegistry(database: DatabaseSync): void {
  initializeRegistry(database);
  if (database.prepare("SELECT id FROM schema_migrations WHERE id = ?").get(MIGRATION_ID)) return;
  database.exec("BEGIN IMMEDIATE;");
  try {
    database.exec(`
      CREATE TABLE IF NOT EXISTS ready_package_core_intake_submissions (
        workspace_id TEXT NOT NULL,
        submission_id TEXT NOT NULL,
        ready_package_id TEXT NOT NULL,
        expected_digest TEXT NOT NULL,
        idempotency_key TEXT NOT NULL,
        state TEXT NOT NULL CHECK (state IN ('PENDING','RESULT_RECORDED')),
        document_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (workspace_id, submission_id),
        UNIQUE (workspace_id, idempotency_key),
        FOREIGN KEY (ready_package_id) REFERENCES ready_packages(id)
      ) STRICT;

      CREATE INDEX IF NOT EXISTS idx_ready_package_core_intake_submissions_package
        ON ready_package_core_intake_submissions(
          workspace_id,
          ready_package_id,
          created_at DESC
        );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_ready_package_core_intake_submissions_pending
        ON ready_package_core_intake_submissions(workspace_id, ready_package_id)
        WHERE state = 'PENDING';
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

export class SqliteReadyPackageCoreIntakeSubmissionRepository implements ReadyPackageCoreIntakeSubmissionRepository {
  constructor(
    private readonly database: DatabaseSync,
    private readonly clock: () => Date = () => new Date(),
    private readonly idFactory: () => string = () => submissionId(),
  ) {
    ensureReadyPackageCoreIntakeSubmissionRegistry(database);
  }

  prepare(
    input: PrepareReadyPackageCoreIntakeSubmissionInput,
  ): PrepareReadyPackageCoreIntakeSubmissionResult {
    validateScope(input);
    this.database.exec("BEGIN IMMEDIATE;");
    try {
      const pending = this.database
        .prepare(
          `SELECT document_json FROM ready_package_core_intake_submissions
           WHERE workspace_id = ? AND ready_package_id = ? AND state = 'PENDING'
           ORDER BY created_at DESC, rowid DESC
           LIMIT 1`,
        )
        .get(input.workspaceId, input.readyPackageId) as { document_json: string } | undefined;
      if (pending) {
        const submission = parseSubmission(pending.document_json);
        if (submission.expectedDigest !== input.expectedDigest) {
          throw new RegistryConflictError(
            "CORE_INTAKE_PENDING_SUBMISSION_DIGEST_MISMATCH",
            "Pending Core intake submission belongs to different ReadyPackage evidence",
          );
        }
        if (
          input.coreWorkspaceId !== undefined &&
          submission.coreWorkspaceId !== undefined &&
          input.coreWorkspaceId !== submission.coreWorkspaceId
        ) {
          throw new RegistryConflictError(
            "CORE_INTAKE_PENDING_WORKSPACE_BINDING_MISMATCH",
            "Pending Core intake submission is frozen to another Core workspace",
          );
        }
        this.database.exec("COMMIT;");
        return { submission, replayed: true };
      }

      const createdAt = this.clock().toISOString();
      const id = this.idFactory();
      if (!id?.trim()) throw new RegistryValidationError("Core intake submission ID is invalid");
      const submission: ReadyPackageCoreIntakeSubmission = {
        submissionId: id,
        workspaceId: input.workspaceId,
        readyPackageId: input.readyPackageId,
        expectedDigest: input.expectedDigest,
        idempotencyKey: `core-intake:${id}`,
        submittedAt: createdAt,
        ...(input.coreWorkspaceId ? { coreWorkspaceId: input.coreWorkspaceId } : {}),
        state: "PENDING",
        createdAt,
        updatedAt: createdAt,
      };
      this.database
        .prepare(
          `INSERT INTO ready_package_core_intake_submissions
           (workspace_id, submission_id, ready_package_id, expected_digest, idempotency_key,
            state, document_json, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          submission.workspaceId,
          submission.submissionId,
          submission.readyPackageId,
          submission.expectedDigest,
          submission.idempotencyKey,
          submission.state,
          JSON.stringify(submission),
          submission.createdAt,
          submission.updatedAt,
        );
      this.database.exec("COMMIT;");
      return { submission, replayed: false };
    } catch (error) {
      this.database.exec("ROLLBACK;");
      throw error;
    }
  }

  recordTransportResult(
    submissionIdValue: string,
    workspaceId: string,
    result: CoreIntakeResult,
  ): ReadyPackageCoreIntakeSubmission {
    if (!submissionIdValue?.trim()) throw new RegistryValidationError("submissionId is required");
    if (!workspaceId?.trim()) throw new RegistryValidationError("workspaceId is required");
    validateCoreIntakeResult(result);

    this.database.exec("BEGIN IMMEDIATE;");
    try {
      const current = this.require(submissionIdValue, workspaceId);
      if (current.readyPackageId !== result.readyPackageId) {
        throw new RegistryConflictError(
          "CORE_INTAKE_SUBMISSION_RESULT_PACKAGE_MISMATCH",
          "Core intake result belongs to another ReadyPackage",
        );
      }
      if (current.state === "RESULT_RECORDED") {
        if (!matchesResult(current.result, result)) {
          throw new RegistryConflictError(
            "CORE_INTAKE_SUBMISSION_RESULT_CONFLICT",
            "Core intake submission already recorded a different result",
          );
        }
        this.database.exec("COMMIT;");
        return current;
      }
      if (current.transportResult) {
        if (!matchesResult(current.transportResult, result)) {
          throw new RegistryConflictError(
            "CORE_INTAKE_SUBMISSION_TRANSPORT_RESULT_CONFLICT",
            "Core intake submission already persisted a different transport result",
          );
        }
        this.database.exec("COMMIT;");
        return current;
      }

      const recordedAt = this.clock().toISOString();
      const next: ReadyPackageCoreIntakeSubmission = {
        ...current,
        transportResult: {
          intakeId: result.intakeId,
          status: result.status,
          recordedAt,
        },
        updatedAt: recordedAt,
      };
      this.database
        .prepare(
          `UPDATE ready_package_core_intake_submissions
           SET document_json = ?, updated_at = ?
           WHERE workspace_id = ? AND submission_id = ? AND state = 'PENDING'`,
        )
        .run(JSON.stringify(next), recordedAt, workspaceId, submissionIdValue);
      this.database.exec("COMMIT;");
      return next;
    } catch (error) {
      this.database.exec("ROLLBACK;");
      throw error;
    }
  }

  recordResult(
    submissionIdValue: string,
    workspaceId: string,
    result: CoreIntakeResult,
  ): ReadyPackageCoreIntakeSubmission {
    if (!submissionIdValue?.trim()) throw new RegistryValidationError("submissionId is required");
    if (!workspaceId?.trim()) throw new RegistryValidationError("workspaceId is required");
    validateCoreIntakeResult(result);

    this.database.exec("BEGIN IMMEDIATE;");
    try {
      const current = this.require(submissionIdValue, workspaceId);
      if (current.readyPackageId !== result.readyPackageId) {
        throw new RegistryConflictError(
          "CORE_INTAKE_SUBMISSION_RESULT_PACKAGE_MISMATCH",
          "Core intake result belongs to another ReadyPackage",
        );
      }
      if (current.transportResult && !matchesResult(current.transportResult, result)) {
        throw new RegistryConflictError(
          "CORE_INTAKE_SUBMISSION_TRANSPORT_RESULT_CONFLICT",
          "Core intake submission transport result differs from the result being finalized",
        );
      }
      if (current.state === "RESULT_RECORDED") {
        if (!matchesResult(current.result, result)) {
          throw new RegistryConflictError(
            "CORE_INTAKE_SUBMISSION_RESULT_CONFLICT",
            "Core intake submission already recorded a different result",
          );
        }
        this.database.exec("COMMIT;");
        return current;
      }

      const recordedAt = this.clock().toISOString();
      const next: ReadyPackageCoreIntakeSubmission = {
        ...current,
        state: "RESULT_RECORDED",
        result: {
          intakeId: result.intakeId,
          status: result.status,
          recordedAt,
        },
        updatedAt: recordedAt,
      };
      this.database
        .prepare(
          `UPDATE ready_package_core_intake_submissions
           SET state = 'RESULT_RECORDED', document_json = ?, updated_at = ?
           WHERE workspace_id = ? AND submission_id = ? AND state = 'PENDING'`,
        )
        .run(JSON.stringify(next), recordedAt, workspaceId, submissionIdValue);
      this.database.exec("COMMIT;");
      return next;
    } catch (error) {
      this.database.exec("ROLLBACK;");
      throw error;
    }
  }

  list(readyPackageId: string, workspaceId: string): ReadyPackageCoreIntakeSubmission[] {
    if (!readyPackageId?.trim()) throw new RegistryValidationError("readyPackageId is required");
    if (!workspaceId?.trim()) throw new RegistryValidationError("workspaceId is required");
    return this.database
      .prepare(
        `SELECT document_json FROM ready_package_core_intake_submissions
         WHERE workspace_id = ? AND ready_package_id = ?
         ORDER BY created_at DESC, rowid DESC`,
      )
      .all(workspaceId, readyPackageId)
      .map((row) => parseSubmission(String((row as { document_json: string }).document_json)));
  }

  private require(
    submissionIdValue: string,
    workspaceId: string,
  ): ReadyPackageCoreIntakeSubmission {
    const row = this.database
      .prepare(
        `SELECT document_json FROM ready_package_core_intake_submissions
         WHERE workspace_id = ? AND submission_id = ?`,
      )
      .get(workspaceId, submissionIdValue) as { document_json: string } | undefined;
    if (!row) {
      throw new RegistryError(
        "CORE_INTAKE_SUBMISSION_NOT_FOUND",
        `Core intake submission ${submissionIdValue} was not found`,
      );
    }
    return parseSubmission(row.document_json);
  }
}
