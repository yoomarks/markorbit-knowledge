import { createHash, randomBytes } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import {
  READY_PACKAGE_V2_DELIVERY_PROTOCOL_VERSION,
  READY_PACKAGE_V2_DELIVERY_REQUEST_OBJECT_TYPE,
  READY_PACKAGE_V2_DELIVERY_TARGET_SERVICE,
  assertReadyPackageV2DeliveryRequestV1,
  assertReadyPackageV2DeliveryResultV1,
  serializeReadyPackageContentExportV2,
  serializeReadyPackageV2DeliveryRequestV1,
  type ReadyPackageContentExportV2,
  type ReadyPackageV2,
  type ReadyPackageV2DeliveryRequestV1,
  type ReadyPackageV2DeliveryResultV1,
} from "@markorbit/contracts";
import {
  RegistryConflictError,
  RegistryError,
  RegistryValidationError,
  initializeRegistry,
} from "./index";
import { ensureReadyPackageV2Registry } from "./ready-package-v2-registry";

const MIGRATION_ID = "0030_ready_package_v2_delivery_submissions";
const SHA256 = /^[a-f0-9]{64}$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const MAX_LIMIT = 100;

export type ReadyPackageV2DeliveryResultEvidence = ReadyPackageV2DeliveryResultV1 & {
  recordedAt: string;
};

export type ReadyPackageV2DeliverySubmission = {
  submissionId: string;
  workspaceId: string;
  readyPackageId: string;
  readyPackageDigest: string;
  coreWorkspaceId: string;
  idempotencyKey: string;
  requestJson: string;
  requestSha256: string;
  contentExportSha256: string;
  state: "PENDING" | "RESULT_RECORDED";
  transportAttempts: number;
  lastTransportAttemptedAt?: string;
  transportResult?: ReadyPackageV2DeliveryResultEvidence;
  result?: ReadyPackageV2DeliveryResultEvidence;
  createdAt: string;
  updatedAt: string;
};

export type PrepareReadyPackageV2DeliveryInput = {
  workspaceId: string;
  readyPackage: ReadyPackageV2;
  coreWorkspaceId: string;
  contentExport: ReadyPackageContentExportV2;
};

export type PrepareReadyPackageV2DeliveryResult = {
  submission: ReadyPackageV2DeliverySubmission;
  replayed: boolean;
};

export interface ReadyPackageV2DeliverySubmissionRepository {
  getByReadyPackage(
    workspaceId: string,
    readyPackageId: string,
  ): ReadyPackageV2DeliverySubmission | null;
  prepare(input: PrepareReadyPackageV2DeliveryInput): PrepareReadyPackageV2DeliveryResult;
  markTransportAttempt(workspaceId: string, submissionId: string): ReadyPackageV2DeliverySubmission;
  recordTransportResult(
    workspaceId: string,
    submissionId: string,
    result: ReadyPackageV2DeliveryResultV1,
  ): ReadyPackageV2DeliverySubmission;
  recordResult(
    workspaceId: string,
    submissionId: string,
    result: ReadyPackageV2DeliveryResultV1,
  ): ReadyPackageV2DeliverySubmission;
  list(workspaceId: string, limit?: number): ReadyPackageV2DeliverySubmission[];
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function deliveryId(now = Date.now()): string {
  return `rvd_${now.toString(36)}${randomBytes(10).toString("hex")}`;
}

function required(value: string, field: string): string {
  const normalized = value?.trim();
  if (!normalized) throw new RegistryValidationError(`${field} is required`);
  return normalized;
}

function coreWorkspaceId(value: string): string {
  const normalized = required(value, "coreWorkspaceId").toLowerCase();
  if (!UUID.test(normalized)) {
    throw new RegistryValidationError("coreWorkspaceId must be a canonical UUID");
  }
  return normalized;
}

function limit(value = 20): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RegistryValidationError("limit must be a positive integer");
  }
  return Math.min(value, MAX_LIMIT);
}

function sameResult(
  left: ReadyPackageV2DeliveryResultEvidence | undefined,
  right: ReadyPackageV2DeliveryResultV1,
): boolean {
  return (
    left?.protocolVersion === right.protocolVersion &&
    left.objectType === right.objectType &&
    left.deliveryId === right.deliveryId &&
    left.readyPackageId === right.readyPackageId &&
    left.status === right.status &&
    left.requestSha256 === right.requestSha256
  );
}

function validateResultEvidence(
  value: ReadyPackageV2DeliveryResultEvidence | undefined,
): asserts value is ReadyPackageV2DeliveryResultEvidence {
  if (!value || Number.isNaN(Date.parse(value.recordedAt))) {
    throw new RegistryConflictError(
      "READY_PACKAGE_V2_DELIVERY_RESULT_EVIDENCE_INVALID",
      "Persisted ReadyPackage V2 delivery result evidence is invalid",
    );
  }
  const result: ReadyPackageV2DeliveryResultV1 = {
    protocolVersion: value.protocolVersion,
    objectType: value.objectType,
    deliveryId: value.deliveryId,
    readyPackageId: value.readyPackageId,
    status: value.status,
    requestSha256: value.requestSha256,
  };
  assertReadyPackageV2DeliveryResultV1(result);
}

function parseSubmission(value: string): ReadyPackageV2DeliverySubmission {
  const parsed = JSON.parse(value) as ReadyPackageV2DeliverySubmission;
  if (
    !parsed ||
    typeof parsed !== "object" ||
    !parsed.submissionId?.startsWith("rvd_") ||
    !parsed.workspaceId?.startsWith("wsp_") ||
    !parsed.readyPackageId?.startsWith("rdp_") ||
    !SHA256.test(parsed.readyPackageDigest) ||
    !UUID.test(parsed.coreWorkspaceId) ||
    typeof parsed.idempotencyKey !== "string" ||
    parsed.idempotencyKey !== `ready-package-v2-delivery:${parsed.submissionId}` ||
    typeof parsed.requestJson !== "string" ||
    !parsed.requestJson.trim() ||
    !SHA256.test(parsed.requestSha256) ||
    sha256(parsed.requestJson) !== parsed.requestSha256 ||
    !SHA256.test(parsed.contentExportSha256) ||
    (parsed.state !== "PENDING" && parsed.state !== "RESULT_RECORDED") ||
    !Number.isSafeInteger(parsed.transportAttempts) ||
    parsed.transportAttempts < 0 ||
    (parsed.lastTransportAttemptedAt !== undefined &&
      Number.isNaN(Date.parse(parsed.lastTransportAttemptedAt))) ||
    Number.isNaN(Date.parse(parsed.createdAt)) ||
    Number.isNaN(Date.parse(parsed.updatedAt))
  ) {
    throw new RegistryConflictError(
      "READY_PACKAGE_V2_DELIVERY_PERSISTED_STATE_INVALID",
      "Persisted ReadyPackage V2 delivery submission is invalid",
    );
  }
  const request = JSON.parse(parsed.requestJson) as unknown;
  assertReadyPackageV2DeliveryRequestV1(request);
  if (
    request.deliveryId !== parsed.submissionId ||
    request.readyPackageId !== parsed.readyPackageId ||
    request.knowledgeWorkspaceId !== parsed.workspaceId ||
    request.target.workspaceId.toLowerCase() !== parsed.coreWorkspaceId.toLowerCase() ||
    request.readyPackageDigest !== parsed.readyPackageDigest ||
    request.contentExportSha256 !== parsed.contentExportSha256 ||
    request.submittedAt !== parsed.createdAt
  ) {
    throw new RegistryConflictError(
      "READY_PACKAGE_V2_DELIVERY_FROZEN_REQUEST_MISMATCH",
      "Persisted ReadyPackage V2 delivery request does not match submission metadata",
    );
  }
  if (parsed.transportResult !== undefined) {
    validateResultEvidence(parsed.transportResult);
    if (
      parsed.transportResult.deliveryId !== parsed.submissionId ||
      parsed.transportResult.readyPackageId !== parsed.readyPackageId ||
      parsed.transportResult.requestSha256 !== parsed.requestSha256
    ) {
      throw new RegistryConflictError(
        "READY_PACKAGE_V2_DELIVERY_TRANSPORT_RESULT_MISMATCH",
        "Persisted transport result does not match the frozen request",
      );
    }
  }
  if (parsed.state === "RESULT_RECORDED") {
    validateResultEvidence(parsed.result);
    if (!sameResult(parsed.transportResult, parsed.result)) {
      throw new RegistryConflictError(
        "READY_PACKAGE_V2_DELIVERY_FINAL_RESULT_MISMATCH",
        "Persisted final result does not match the durable transport result",
      );
    }
  } else if (parsed.result !== undefined) {
    throw new RegistryConflictError(
      "READY_PACKAGE_V2_DELIVERY_PENDING_RESULT_INVALID",
      "Pending ReadyPackage V2 delivery cannot contain a final result",
    );
  }
  return parsed;
}

export function ensureReadyPackageV2DeliverySubmissionRegistry(database: DatabaseSync): void {
  initializeRegistry(database);
  ensureReadyPackageV2Registry(database);
  if (database.prepare("SELECT id FROM schema_migrations WHERE id = ?").get(MIGRATION_ID)) return;
  database.exec("BEGIN IMMEDIATE;");
  try {
    database.exec(`
      CREATE TABLE IF NOT EXISTS ready_package_v2_delivery_submissions (
        workspace_id TEXT NOT NULL,
        submission_id TEXT NOT NULL,
        ready_package_id TEXT NOT NULL,
        ready_package_digest TEXT NOT NULL,
        core_workspace_id TEXT NOT NULL,
        request_sha256 TEXT NOT NULL,
        content_export_sha256 TEXT NOT NULL,
        state TEXT NOT NULL CHECK (state IN ('PENDING','RESULT_RECORDED')),
        document_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (workspace_id, submission_id),
        UNIQUE (workspace_id, ready_package_id),
        FOREIGN KEY (ready_package_id) REFERENCES ready_packages_v2(id)
      ) STRICT;

      CREATE INDEX IF NOT EXISTS idx_ready_package_v2_delivery_workspace_created
        ON ready_package_v2_delivery_submissions(workspace_id, created_at DESC, submission_id DESC);
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

export class SqliteReadyPackageV2DeliverySubmissionRepository implements ReadyPackageV2DeliverySubmissionRepository {
  constructor(
    private readonly database: DatabaseSync,
    private readonly clock: () => Date = () => new Date(),
    private readonly idFactory: () => string = () => deliveryId(),
  ) {
    ensureReadyPackageV2DeliverySubmissionRegistry(database);
  }

  getByReadyPackage(
    workspaceIdValue: string,
    readyPackageIdValue: string,
  ): ReadyPackageV2DeliverySubmission | null {
    const workspaceId = required(workspaceIdValue, "workspaceId");
    const readyPackageId = required(readyPackageIdValue, "readyPackageId");
    const row = this.database
      .prepare(
        `SELECT document_json FROM ready_package_v2_delivery_submissions
         WHERE workspace_id = ? AND ready_package_id = ?`,
      )
      .get(workspaceId, readyPackageId) as { document_json: string } | undefined;
    return row ? parseSubmission(row.document_json) : null;
  }

  prepare(input: PrepareReadyPackageV2DeliveryInput): PrepareReadyPackageV2DeliveryResult {
    const workspaceId = required(input.workspaceId, "workspaceId");
    const targetCoreWorkspaceId = coreWorkspaceId(input.coreWorkspaceId);
    const readyPackage = input.readyPackage;
    if (
      readyPackage.workspaceId !== workspaceId ||
      readyPackage.status !== "VERIFIED" ||
      readyPackage.contractVersion !== "2.0"
    ) {
      throw new RegistryConflictError(
        "READY_PACKAGE_V2_DELIVERY_PACKAGE_INVALID",
        "Delivery preparation requires a VERIFIED ReadyPackage V2 in the same Workspace",
      );
    }
    if (
      input.contentExport.readyPackageId !== readyPackage.id ||
      input.contentExport.knowledgeWorkspaceId !== workspaceId ||
      input.contentExport.readyPackageDigest !== readyPackage.evidence.digest
    ) {
      throw new RegistryConflictError(
        "READY_PACKAGE_V2_DELIVERY_EXPORT_MISMATCH",
        "Content Export V2 does not match the ReadyPackage V2 being prepared",
      );
    }

    const existing = this.getByReadyPackage(workspaceId, readyPackage.id);
    const contentExportJson = serializeReadyPackageContentExportV2(input.contentExport);
    const contentExportSha256 = sha256(contentExportJson);
    if (existing) {
      if (
        existing.readyPackageDigest !== readyPackage.evidence.digest ||
        existing.coreWorkspaceId !== targetCoreWorkspaceId ||
        existing.contentExportSha256 !== contentExportSha256
      ) {
        throw new RegistryConflictError(
          "READY_PACKAGE_V2_DELIVERY_ALREADY_FROZEN",
          "ReadyPackage V2 delivery is already frozen with different immutable evidence",
        );
      }
      return { submission: existing, replayed: true };
    }

    const readyPackageRow = this.database
      .prepare("SELECT id FROM ready_packages_v2 WHERE workspace_id = ? AND id = ?")
      .get(workspaceId, readyPackage.id);
    if (!readyPackageRow) {
      throw new RegistryError(
        "READY_PACKAGE_V2_NOT_FOUND",
        `ReadyPackage V2 ${readyPackage.id} was not found`,
      );
    }

    const createdAt = this.clock().toISOString();
    const id = this.idFactory();
    if (!id?.startsWith("rvd_")) {
      throw new RegistryValidationError("ReadyPackage V2 delivery ID is invalid");
    }
    const canonicalExport = JSON.parse(contentExportJson) as ReadyPackageContentExportV2;
    const request: ReadyPackageV2DeliveryRequestV1 = {
      protocolVersion: READY_PACKAGE_V2_DELIVERY_PROTOCOL_VERSION,
      objectType: READY_PACKAGE_V2_DELIVERY_REQUEST_OBJECT_TYPE,
      deliveryId: id,
      readyPackageId: readyPackage.id,
      knowledgeWorkspaceId: workspaceId,
      target: {
        service: READY_PACKAGE_V2_DELIVERY_TARGET_SERVICE,
        workspaceId: targetCoreWorkspaceId,
      },
      readyPackageDigest: readyPackage.evidence.digest,
      contentExportSha256,
      contentExport: canonicalExport,
      submittedAt: createdAt,
    };
    assertReadyPackageV2DeliveryRequestV1(request);
    const requestJson = serializeReadyPackageV2DeliveryRequestV1(request);
    const submission: ReadyPackageV2DeliverySubmission = {
      submissionId: id,
      workspaceId,
      readyPackageId: readyPackage.id,
      readyPackageDigest: readyPackage.evidence.digest,
      coreWorkspaceId: targetCoreWorkspaceId,
      idempotencyKey: `ready-package-v2-delivery:${id}`,
      requestJson,
      requestSha256: sha256(requestJson),
      contentExportSha256,
      state: "PENDING",
      transportAttempts: 0,
      createdAt,
      updatedAt: createdAt,
    };

    this.database
      .prepare(
        `INSERT INTO ready_package_v2_delivery_submissions
         (workspace_id, submission_id, ready_package_id, ready_package_digest, core_workspace_id,
          request_sha256, content_export_sha256, state, document_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        submission.workspaceId,
        submission.submissionId,
        submission.readyPackageId,
        submission.readyPackageDigest,
        submission.coreWorkspaceId,
        submission.requestSha256,
        submission.contentExportSha256,
        submission.state,
        JSON.stringify(submission),
        submission.createdAt,
        submission.updatedAt,
      );
    return { submission, replayed: false };
  }

  markTransportAttempt(
    workspaceIdValue: string,
    submissionIdValue: string,
  ): ReadyPackageV2DeliverySubmission {
    const submission = this.requireSubmission(workspaceIdValue, submissionIdValue);
    if (submission.state === "RESULT_RECORDED" || submission.transportResult) return submission;
    const updatedAt = this.clock().toISOString();
    const updated: ReadyPackageV2DeliverySubmission = {
      ...submission,
      transportAttempts: submission.transportAttempts + 1,
      lastTransportAttemptedAt: updatedAt,
      updatedAt,
    };
    this.persist(updated);
    return updated;
  }

  recordTransportResult(
    workspaceIdValue: string,
    submissionIdValue: string,
    result: ReadyPackageV2DeliveryResultV1,
  ): ReadyPackageV2DeliverySubmission {
    assertReadyPackageV2DeliveryResultV1(result);
    const submission = this.requireSubmission(workspaceIdValue, submissionIdValue);
    this.assertResultMatchesSubmission(submission, result);
    if (submission.transportResult) {
      if (!sameResult(submission.transportResult, result)) {
        throw new RegistryConflictError(
          "READY_PACKAGE_V2_DELIVERY_TRANSPORT_RESULT_CONFLICT",
          "A different transport result is already durable for this delivery",
        );
      }
      return submission;
    }
    const recordedAt = this.clock().toISOString();
    const updated: ReadyPackageV2DeliverySubmission = {
      ...submission,
      transportResult: { ...result, recordedAt },
      updatedAt: recordedAt,
    };
    this.persist(updated);
    return updated;
  }

  recordResult(
    workspaceIdValue: string,
    submissionIdValue: string,
    result: ReadyPackageV2DeliveryResultV1,
  ): ReadyPackageV2DeliverySubmission {
    assertReadyPackageV2DeliveryResultV1(result);
    const submission = this.requireSubmission(workspaceIdValue, submissionIdValue);
    this.assertResultMatchesSubmission(submission, result);
    if (submission.state === "RESULT_RECORDED") {
      if (!sameResult(submission.result, result)) {
        throw new RegistryConflictError(
          "READY_PACKAGE_V2_DELIVERY_RESULT_CONFLICT",
          "A different final result is already durable for this delivery",
        );
      }
      return submission;
    }
    if (!sameResult(submission.transportResult, result)) {
      throw new RegistryConflictError(
        "READY_PACKAGE_V2_DELIVERY_TRANSPORT_RESULT_REQUIRED",
        "Finalization requires the exact durable transport result",
      );
    }
    const recordedAt = this.clock().toISOString();
    const updated: ReadyPackageV2DeliverySubmission = {
      ...submission,
      state: "RESULT_RECORDED",
      result: { ...result, recordedAt },
      updatedAt: recordedAt,
    };
    this.persist(updated);
    return updated;
  }

  list(workspaceIdValue: string, limitValue = 20): ReadyPackageV2DeliverySubmission[] {
    const workspaceId = required(workspaceIdValue, "workspaceId");
    const rows = this.database
      .prepare(
        `SELECT document_json FROM ready_package_v2_delivery_submissions
         WHERE workspace_id = ? ORDER BY created_at DESC, submission_id DESC LIMIT ?`,
      )
      .all(workspaceId, limit(limitValue)) as Array<{ document_json: string }>;
    return rows.map((row) => parseSubmission(row.document_json));
  }

  private requireSubmission(
    workspaceIdValue: string,
    submissionIdValue: string,
  ): ReadyPackageV2DeliverySubmission {
    const workspaceId = required(workspaceIdValue, "workspaceId");
    const submissionId = required(submissionIdValue, "submissionId");
    const row = this.database
      .prepare(
        `SELECT document_json FROM ready_package_v2_delivery_submissions
         WHERE workspace_id = ? AND submission_id = ?`,
      )
      .get(workspaceId, submissionId) as { document_json: string } | undefined;
    if (!row) {
      throw new RegistryError(
        "READY_PACKAGE_V2_DELIVERY_NOT_FOUND",
        `ReadyPackage V2 delivery ${submissionId} was not found`,
      );
    }
    return parseSubmission(row.document_json);
  }

  private assertResultMatchesSubmission(
    submission: ReadyPackageV2DeliverySubmission,
    result: ReadyPackageV2DeliveryResultV1,
  ): void {
    if (
      result.deliveryId !== submission.submissionId ||
      result.readyPackageId !== submission.readyPackageId ||
      result.requestSha256 !== submission.requestSha256
    ) {
      throw new RegistryConflictError(
        "READY_PACKAGE_V2_DELIVERY_RESULT_MISMATCH",
        "Delivery result does not match the frozen request",
      );
    }
  }

  private persist(submission: ReadyPackageV2DeliverySubmission): void {
    parseSubmission(JSON.stringify(submission));
    this.database
      .prepare(
        `UPDATE ready_package_v2_delivery_submissions
         SET state = ?, document_json = ?, updated_at = ?
         WHERE workspace_id = ? AND submission_id = ?`,
      )
      .run(
        submission.state,
        JSON.stringify(submission),
        submission.updatedAt,
        submission.workspaceId,
        submission.submissionId,
      );
  }
}
