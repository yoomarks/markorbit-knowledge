import { createHash, randomBytes } from "node:crypto";
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

export type ReadyPackageCoreContentResult = {
  intakeId: string;
  readyPackageId: string;
  status: "ACCEPTED";
  exportSha256: string;
};

export type ReadyPackageCoreContentResultEvidence = ReadyPackageCoreContentResult & {
  recordedAt: string;
};

export type ReadyPackageCoreContentDelivery = {
  state: "PENDING" | "RESULT_RECORDED";
  coreIntakeId: string;
  requestJson: string;
  requestSha256: string;
  transportResult?: ReadyPackageCoreContentResultEvidence;
  result?: ReadyPackageCoreContentResultEvidence;
  preparedAt: string;
  updatedAt: string;
};

export type PrepareReadyPackageCoreContentDeliveryInput = {
  coreIntakeId: string;
  requestJson: string;
  requestSha256: string;
};

export type PrepareReadyPackageCoreContentDeliveryResult = {
  submission: ReadyPackageCoreIntakeSubmission;
  delivery: ReadyPackageCoreContentDelivery;
  replayed: boolean;
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
  contentDelivery?: ReadyPackageCoreContentDelivery;
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

export interface ReadyPackageCoreContentDeliveryRepository extends ReadyPackageCoreIntakeSubmissionRepository {
  prepareContentDelivery(
    submissionId: string,
    workspaceId: string,
    input: PrepareReadyPackageCoreContentDeliveryInput,
  ): PrepareReadyPackageCoreContentDeliveryResult;
  recordContentTransportResult(
    submissionId: string,
    workspaceId: string,
    result: ReadyPackageCoreContentResult,
  ): ReadyPackageCoreIntakeSubmission;
  recordContentResult(
    submissionId: string,
    workspaceId: string,
    result: ReadyPackageCoreContentResult,
  ): ReadyPackageCoreIntakeSubmission;
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

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function validateCoreContentResult(result: ReadyPackageCoreContentResult): void {
  if (
    !result ||
    typeof result !== "object" ||
    typeof result.intakeId !== "string" ||
    !result.intakeId.trim() ||
    typeof result.readyPackageId !== "string" ||
    !result.readyPackageId.trim() ||
    result.status !== "ACCEPTED" ||
    !SHA256.test(result.exportSha256)
  ) {
    throw new RegistryValidationError("Core content result is invalid");
  }
}

function validateCoreContentResultEvidence(
  evidence: ReadyPackageCoreContentResultEvidence | undefined,
  message: string,
): asserts evidence is ReadyPackageCoreContentResultEvidence {
  if (!evidence || Number.isNaN(Date.parse(evidence.recordedAt))) {
    throw new RegistryValidationError(message);
  }
  validateCoreContentResult(evidence);
}

function matchesCoreContentResult(
  evidence: ReadyPackageCoreContentResultEvidence | undefined,
  result: ReadyPackageCoreContentResult,
): boolean {
  return (
    evidence?.intakeId === result.intakeId &&
    evidence.readyPackageId === result.readyPackageId &&
    evidence.status === result.status &&
    evidence.exportSha256 === result.exportSha256
  );
}

function validateContentDelivery(
  delivery: ReadyPackageCoreContentDelivery,
  submission: ReadyPackageCoreIntakeSubmission,
): void {
  if (
    (delivery.state !== "PENDING" && delivery.state !== "RESULT_RECORDED") ||
    typeof delivery.coreIntakeId !== "string" ||
    !delivery.coreIntakeId.trim() ||
    typeof delivery.requestJson !== "string" ||
    !delivery.requestJson.trim() ||
    !SHA256.test(delivery.requestSha256) ||
    sha256(delivery.requestJson) !== delivery.requestSha256 ||
    Number.isNaN(Date.parse(delivery.preparedAt)) ||
    Number.isNaN(Date.parse(delivery.updatedAt))
  ) {
    throw new RegistryValidationError("Persisted Core content delivery is invalid");
  }
  try {
    JSON.parse(delivery.requestJson);
  } catch {
    throw new RegistryValidationError("Persisted Core content request JSON is invalid");
  }
  if (delivery.transportResult !== undefined) {
    validateCoreContentResultEvidence(
      delivery.transportResult,
      "Persisted Core content transport result is invalid",
    );
    if (
      delivery.transportResult.intakeId !== delivery.coreIntakeId ||
      delivery.transportResult.readyPackageId !== submission.readyPackageId ||
      delivery.transportResult.exportSha256 !== delivery.requestSha256
    ) {
      throw new RegistryValidationError(
        "Persisted Core content transport result does not match its frozen request",
      );
    }
  }
  if (delivery.state === "RESULT_RECORDED") {
    validateCoreContentResultEvidence(delivery.result, "Persisted Core content result is invalid");
    if (
      delivery.result.intakeId !== delivery.coreIntakeId ||
      delivery.result.readyPackageId !== submission.readyPackageId ||
      delivery.result.exportSha256 !== delivery.requestSha256 ||
      (delivery.transportResult &&
        !matchesCoreContentResult(delivery.transportResult, delivery.result))
    ) {
      throw new RegistryValidationError(
        "Persisted Core content result does not match its frozen request",
      );
    }
  } else if (delivery.result !== undefined) {
    throw new RegistryValidationError("Pending Core content delivery cannot contain a result");
  }
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
  if (parsed.contentDelivery !== undefined) {
    validateContentDelivery(parsed.contentDelivery, parsed);
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

export class SqliteReadyPackageCoreIntakeSubmissionRepository implements ReadyPackageCoreContentDeliveryRepository {
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

  prepareContentDelivery(
    submissionIdValue: string,
    workspaceId: string,
    input: PrepareReadyPackageCoreContentDeliveryInput,
  ): PrepareReadyPackageCoreContentDeliveryResult {
    if (!submissionIdValue?.trim()) throw new RegistryValidationError("submissionId is required");
    if (!workspaceId?.trim()) throw new RegistryValidationError("workspaceId is required");
    if (!input.coreIntakeId?.trim()) throw new RegistryValidationError("coreIntakeId is required");
    if (!input.requestJson?.trim()) throw new RegistryValidationError("requestJson is required");
    if (!SHA256.test(input.requestSha256) || sha256(input.requestJson) !== input.requestSha256) {
      throw new RegistryValidationError("requestSha256 must match the frozen content request JSON");
    }

    this.database.exec("BEGIN IMMEDIATE;");
    try {
      const current = this.require(submissionIdValue, workspaceId);
      if (current.state !== "RESULT_RECORDED" || !current.result) {
        throw new RegistryConflictError(
          "CORE_CONTENT_INTAKE_RESULT_NOT_RECORDED",
          "Core intake must be durably finalized before content delivery can start",
        );
      }
      if (current.result.status === "REJECTED") {
        throw new RegistryConflictError(
          "CORE_CONTENT_INTAKE_REJECTED",
          "Rejected Core intake cannot receive ReadyPackage content",
        );
      }
      if (current.result.intakeId !== input.coreIntakeId) {
        throw new RegistryConflictError(
          "CORE_CONTENT_INTAKE_ID_MISMATCH",
          "Core content delivery must target the intake frozen on the submission",
        );
      }
      if (current.contentDelivery) {
        const delivery = current.contentDelivery;
        if (
          delivery.coreIntakeId !== input.coreIntakeId ||
          delivery.requestSha256 !== input.requestSha256 ||
          delivery.requestJson !== input.requestJson
        ) {
          throw new RegistryConflictError(
            "CORE_CONTENT_PENDING_REQUEST_MISMATCH",
            "Core content delivery is already frozen to another request",
          );
        }
        this.database.exec("COMMIT;");
        return { submission: current, delivery, replayed: true };
      }

      const preparedAt = this.clock().toISOString();
      const delivery: ReadyPackageCoreContentDelivery = {
        state: "PENDING",
        coreIntakeId: input.coreIntakeId,
        requestJson: input.requestJson,
        requestSha256: input.requestSha256,
        preparedAt,
        updatedAt: preparedAt,
      };
      const next: ReadyPackageCoreIntakeSubmission = {
        ...current,
        contentDelivery: delivery,
        updatedAt: preparedAt,
      };
      this.database
        .prepare(
          `UPDATE ready_package_core_intake_submissions
           SET document_json = ?, updated_at = ?
           WHERE workspace_id = ? AND submission_id = ?`,
        )
        .run(JSON.stringify(next), preparedAt, workspaceId, submissionIdValue);
      this.database.exec("COMMIT;");
      return { submission: next, delivery, replayed: false };
    } catch (error) {
      this.database.exec("ROLLBACK;");
      throw error;
    }
  }

  recordContentTransportResult(
    submissionIdValue: string,
    workspaceId: string,
    result: ReadyPackageCoreContentResult,
  ): ReadyPackageCoreIntakeSubmission {
    if (!submissionIdValue?.trim()) throw new RegistryValidationError("submissionId is required");
    if (!workspaceId?.trim()) throw new RegistryValidationError("workspaceId is required");
    validateCoreContentResult(result);

    this.database.exec("BEGIN IMMEDIATE;");
    try {
      const current = this.require(submissionIdValue, workspaceId);
      const delivery = current.contentDelivery;
      if (!delivery) {
        throw new RegistryConflictError(
          "CORE_CONTENT_DELIVERY_NOT_PREPARED",
          "Core content delivery must be frozen before a transport result is recorded",
        );
      }
      if (
        result.intakeId !== delivery.coreIntakeId ||
        result.readyPackageId !== current.readyPackageId ||
        result.exportSha256 !== delivery.requestSha256
      ) {
        throw new RegistryConflictError(
          "CORE_CONTENT_TRANSPORT_RESULT_MISMATCH",
          "Core content transport result does not match the frozen content request",
        );
      }
      if (delivery.state === "RESULT_RECORDED") {
        if (!matchesCoreContentResult(delivery.result, result)) {
          throw new RegistryConflictError(
            "CORE_CONTENT_RESULT_CONFLICT",
            "Core content delivery already recorded a different result",
          );
        }
        this.database.exec("COMMIT;");
        return current;
      }
      if (delivery.transportResult) {
        if (!matchesCoreContentResult(delivery.transportResult, result)) {
          throw new RegistryConflictError(
            "CORE_CONTENT_TRANSPORT_RESULT_CONFLICT",
            "Core content delivery already persisted a different transport result",
          );
        }
        this.database.exec("COMMIT;");
        return current;
      }

      const recordedAt = this.clock().toISOString();
      const nextDelivery: ReadyPackageCoreContentDelivery = {
        ...delivery,
        transportResult: { ...result, recordedAt },
        updatedAt: recordedAt,
      };
      const next: ReadyPackageCoreIntakeSubmission = {
        ...current,
        contentDelivery: nextDelivery,
        updatedAt: recordedAt,
      };
      this.database
        .prepare(
          `UPDATE ready_package_core_intake_submissions
           SET document_json = ?, updated_at = ?
           WHERE workspace_id = ? AND submission_id = ?`,
        )
        .run(JSON.stringify(next), recordedAt, workspaceId, submissionIdValue);
      this.database.exec("COMMIT;");
      return next;
    } catch (error) {
      this.database.exec("ROLLBACK;");
      throw error;
    }
  }

  recordContentResult(
    submissionIdValue: string,
    workspaceId: string,
    result: ReadyPackageCoreContentResult,
  ): ReadyPackageCoreIntakeSubmission {
    if (!submissionIdValue?.trim()) throw new RegistryValidationError("submissionId is required");
    if (!workspaceId?.trim()) throw new RegistryValidationError("workspaceId is required");
    validateCoreContentResult(result);

    this.database.exec("BEGIN IMMEDIATE;");
    try {
      const current = this.require(submissionIdValue, workspaceId);
      const delivery = current.contentDelivery;
      if (!delivery) {
        throw new RegistryConflictError(
          "CORE_CONTENT_DELIVERY_NOT_PREPARED",
          "Core content delivery must be frozen before it can be finalized",
        );
      }
      if (
        result.intakeId !== delivery.coreIntakeId ||
        result.readyPackageId !== current.readyPackageId ||
        result.exportSha256 !== delivery.requestSha256
      ) {
        throw new RegistryConflictError(
          "CORE_CONTENT_RESULT_MISMATCH",
          "Core content result does not match the frozen content request",
        );
      }
      if (delivery.state === "RESULT_RECORDED") {
        if (!matchesCoreContentResult(delivery.result, result)) {
          throw new RegistryConflictError(
            "CORE_CONTENT_RESULT_CONFLICT",
            "Core content delivery already recorded a different result",
          );
        }
        this.database.exec("COMMIT;");
        return current;
      }
      if (
        !delivery.transportResult ||
        !matchesCoreContentResult(delivery.transportResult, result)
      ) {
        throw new RegistryConflictError(
          "CORE_CONTENT_TRANSPORT_RESULT_REQUIRED",
          "Core content transport result must be durably persisted before local finalization",
        );
      }

      const recordedAt = this.clock().toISOString();
      const nextDelivery: ReadyPackageCoreContentDelivery = {
        ...delivery,
        state: "RESULT_RECORDED",
        result: { ...result, recordedAt },
        updatedAt: recordedAt,
      };
      const next: ReadyPackageCoreIntakeSubmission = {
        ...current,
        contentDelivery: nextDelivery,
        updatedAt: recordedAt,
      };
      this.database
        .prepare(
          `UPDATE ready_package_core_intake_submissions
           SET document_json = ?, updated_at = ?
           WHERE workspace_id = ? AND submission_id = ?`,
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
