import { DatabaseSync } from "node:sqlite";
import type { ReadyPackageV2DeliveryResultV1 } from "@markorbit/contracts";
import { RegistryConflictError, RegistryValidationError, initializeRegistry } from "./index";

const MIGRATION_ID = "0031_ready_package_v2_delivery_audit_events";
const SHA256 = /^[a-f0-9]{64}$/u;
const ISSUE_CODE = /^[A-Z0-9_]{3,128}$/u;
const MAX_LIMIT = 200;

export const READY_PACKAGE_V2_DELIVERY_AUDIT_EVENT_TYPES = [
  "PREPARED",
  "TRANSPORT_ATTEMPT_STARTED",
  "TRANSPORT_OUTCOME_UNKNOWN",
  "TRANSPORT_RESULT_RECORDED",
  "FINALIZED",
] as const;

export type ReadyPackageV2DeliveryAuditEventType =
  (typeof READY_PACKAGE_V2_DELIVERY_AUDIT_EVENT_TYPES)[number];

export type ReadyPackageV2DeliveryAuditEvent = {
  workspaceId: string;
  submissionId: string;
  readyPackageId: string;
  sequence: number;
  type: ReadyPackageV2DeliveryAuditEventType;
  requestSha256: string;
  recordedAt: string;
  attemptNumber?: number;
  issueCode?: string;
  httpStatus?: number;
  resultStatus?: ReadyPackageV2DeliveryResultV1["status"];
};

export type AppendReadyPackageV2DeliveryAuditEventInput = Omit<
  ReadyPackageV2DeliveryAuditEvent,
  "sequence"
>;

function required(value: string, field: string): string {
  const normalized = value?.trim();
  if (!normalized) throw new RegistryValidationError(`${field} is required`);
  return normalized;
}

function limit(value = 50): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RegistryValidationError("limit must be a positive integer");
  }
  return Math.min(value, MAX_LIMIT);
}

function isTimestamp(value: string): boolean {
  return !Number.isNaN(Date.parse(value));
}

function assertOptionalShape(event: ReadyPackageV2DeliveryAuditEvent): void {
  const hasAttempt = event.attemptNumber !== undefined;
  const hasIssue = event.issueCode !== undefined;
  const hasHttp = event.httpStatus !== undefined;
  const hasResult = event.resultStatus !== undefined;

  if (event.type === "PREPARED") {
    if (hasAttempt || hasIssue || hasHttp || hasResult) {
      throw new RegistryConflictError(
        "READY_PACKAGE_V2_DELIVERY_AUDIT_EVENT_INVALID",
        "PREPARED audit evidence cannot contain transport/result metadata",
      );
    }
    return;
  }

  if (!hasAttempt || !Number.isSafeInteger(event.attemptNumber) || event.attemptNumber! <= 0) {
    throw new RegistryConflictError(
      "READY_PACKAGE_V2_DELIVERY_AUDIT_EVENT_INVALID",
      "Transport/finalization audit evidence requires a positive attempt number",
    );
  }

  if (event.type === "TRANSPORT_OUTCOME_UNKNOWN") {
    if (
      !hasIssue ||
      !ISSUE_CODE.test(event.issueCode!) ||
      !hasHttp ||
      !Number.isSafeInteger(event.httpStatus) ||
      event.httpStatus! < 400 ||
      event.httpStatus! > 599 ||
      hasResult
    ) {
      throw new RegistryConflictError(
        "READY_PACKAGE_V2_DELIVERY_AUDIT_EVENT_INVALID",
        "Unknown-outcome audit evidence requires only bounded issueCode/httpStatus metadata",
      );
    }
    return;
  }

  if (hasIssue || hasHttp) {
    throw new RegistryConflictError(
      "READY_PACKAGE_V2_DELIVERY_AUDIT_EVENT_INVALID",
      "Only unknown-outcome audit evidence may contain issueCode/httpStatus",
    );
  }

  if (event.type === "TRANSPORT_ATTEMPT_STARTED") {
    if (hasResult) {
      throw new RegistryConflictError(
        "READY_PACKAGE_V2_DELIVERY_AUDIT_EVENT_INVALID",
        "Attempt-start audit evidence cannot contain a result status",
      );
    }
    return;
  }

  if (!hasResult || !["RECEIVED", "ACCEPTED", "REJECTED"].includes(event.resultStatus!)) {
    throw new RegistryConflictError(
      "READY_PACKAGE_V2_DELIVERY_AUDIT_EVENT_INVALID",
      "Result/finalization audit evidence requires a protocol result status",
    );
  }
}

export function assertReadyPackageV2DeliveryAuditEvent(
  event: ReadyPackageV2DeliveryAuditEvent,
): void {
  if (
    !event.workspaceId?.startsWith("wsp_") ||
    !event.submissionId?.startsWith("rvd_") ||
    !event.readyPackageId?.startsWith("rdp_") ||
    !Number.isSafeInteger(event.sequence) ||
    event.sequence <= 0 ||
    !READY_PACKAGE_V2_DELIVERY_AUDIT_EVENT_TYPES.includes(event.type) ||
    !SHA256.test(event.requestSha256) ||
    !isTimestamp(event.recordedAt)
  ) {
    throw new RegistryConflictError(
      "READY_PACKAGE_V2_DELIVERY_AUDIT_EVENT_INVALID",
      "Persisted ReadyPackage V2 delivery audit event is invalid",
    );
  }
  assertOptionalShape(event);
}

export function ensureReadyPackageV2DeliveryAuditRegistry(database: DatabaseSync): void {
  initializeRegistry(database);
  if (database.prepare("SELECT id FROM schema_migrations WHERE id = ?").get(MIGRATION_ID)) return;

  database.exec("BEGIN IMMEDIATE;");
  try {
    database.exec(`
      CREATE TABLE IF NOT EXISTS ready_package_v2_delivery_audit_events (
        workspace_id TEXT NOT NULL,
        submission_id TEXT NOT NULL,
        ready_package_id TEXT NOT NULL,
        sequence INTEGER NOT NULL CHECK (sequence > 0),
        event_type TEXT NOT NULL CHECK (
          event_type IN (
            'PREPARED',
            'TRANSPORT_ATTEMPT_STARTED',
            'TRANSPORT_OUTCOME_UNKNOWN',
            'TRANSPORT_RESULT_RECORDED',
            'FINALIZED'
          )
        ),
        request_sha256 TEXT NOT NULL,
        recorded_at TEXT NOT NULL,
        attempt_number INTEGER,
        issue_code TEXT,
        http_status INTEGER,
        result_status TEXT,
        PRIMARY KEY (workspace_id, submission_id, sequence),
        FOREIGN KEY (workspace_id, submission_id)
          REFERENCES ready_package_v2_delivery_submissions(workspace_id, submission_id)
      ) STRICT;

      CREATE UNIQUE INDEX IF NOT EXISTS idx_ready_package_v2_delivery_audit_attempt_type
        ON ready_package_v2_delivery_audit_events(
          workspace_id,
          submission_id,
          event_type,
          attempt_number
        )
        WHERE attempt_number IS NOT NULL;

      CREATE INDEX IF NOT EXISTS idx_ready_package_v2_delivery_audit_submission
        ON ready_package_v2_delivery_audit_events(workspace_id, submission_id, sequence);
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

export function appendReadyPackageV2DeliveryAuditEvent(
  database: DatabaseSync,
  input: AppendReadyPackageV2DeliveryAuditEventInput,
): ReadyPackageV2DeliveryAuditEvent {
  const workspaceId = required(input.workspaceId, "workspaceId");
  const submissionId = required(input.submissionId, "submissionId");
  const readyPackageId = required(input.readyPackageId, "readyPackageId");
  const next = database
    .prepare(
      `SELECT COALESCE(MAX(sequence), 0) + 1 AS sequence
       FROM ready_package_v2_delivery_audit_events
       WHERE workspace_id = ? AND submission_id = ?`,
    )
    .get(workspaceId, submissionId) as { sequence: number };
  const event: ReadyPackageV2DeliveryAuditEvent = {
    ...input,
    workspaceId,
    submissionId,
    readyPackageId,
    sequence: Number(next.sequence),
  };
  assertReadyPackageV2DeliveryAuditEvent(event);

  database
    .prepare(
      `INSERT INTO ready_package_v2_delivery_audit_events
       (workspace_id, submission_id, ready_package_id, sequence, event_type,
        request_sha256, recorded_at, attempt_number, issue_code, http_status, result_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      event.workspaceId,
      event.submissionId,
      event.readyPackageId,
      event.sequence,
      event.type,
      event.requestSha256,
      event.recordedAt,
      event.attemptNumber ?? null,
      event.issueCode ?? null,
      event.httpStatus ?? null,
      event.resultStatus ?? null,
    );
  return event;
}

function fromRow(row: {
  workspace_id: string;
  submission_id: string;
  ready_package_id: string;
  sequence: number;
  event_type: ReadyPackageV2DeliveryAuditEventType;
  request_sha256: string;
  recorded_at: string;
  attempt_number: number | null;
  issue_code: string | null;
  http_status: number | null;
  result_status: ReadyPackageV2DeliveryResultV1["status"] | null;
}): ReadyPackageV2DeliveryAuditEvent {
  const event: ReadyPackageV2DeliveryAuditEvent = {
    workspaceId: row.workspace_id,
    submissionId: row.submission_id,
    readyPackageId: row.ready_package_id,
    sequence: Number(row.sequence),
    type: row.event_type,
    requestSha256: row.request_sha256,
    recordedAt: row.recorded_at,
    ...(row.attempt_number === null ? {} : { attemptNumber: Number(row.attempt_number) }),
    ...(row.issue_code === null ? {} : { issueCode: row.issue_code }),
    ...(row.http_status === null ? {} : { httpStatus: Number(row.http_status) }),
    ...(row.result_status === null ? {} : { resultStatus: row.result_status }),
  };
  assertReadyPackageV2DeliveryAuditEvent(event);
  return event;
}

export function listReadyPackageV2DeliveryAuditEvents(
  database: DatabaseSync,
  workspaceIdValue: string,
  submissionIdValue: string,
  limitValue = 50,
): ReadyPackageV2DeliveryAuditEvent[] {
  const workspaceId = required(workspaceIdValue, "workspaceId");
  const submissionId = required(submissionIdValue, "submissionId");
  const rows = database
    .prepare(
      `SELECT * FROM (
         SELECT workspace_id, submission_id, ready_package_id, sequence, event_type,
                request_sha256, recorded_at, attempt_number, issue_code, http_status, result_status
         FROM ready_package_v2_delivery_audit_events
         WHERE workspace_id = ? AND submission_id = ?
         ORDER BY sequence DESC
         LIMIT ?
       ) ORDER BY sequence ASC`,
    )
    .all(workspaceId, submissionId, limit(limitValue)) as Array<{
    workspace_id: string;
    submission_id: string;
    ready_package_id: string;
    sequence: number;
    event_type: ReadyPackageV2DeliveryAuditEventType;
    request_sha256: string;
    recorded_at: string;
    attempt_number: number | null;
    issue_code: string | null;
    http_status: number | null;
    result_status: ReadyPackageV2DeliveryResultV1["status"] | null;
  }>;
  return rows.map(fromRow);
}
