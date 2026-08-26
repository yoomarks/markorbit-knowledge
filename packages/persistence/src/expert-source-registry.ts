import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import {
  isExpertQuestionTaskV1,
  isExpertSourceRecordV1,
  type ExpertQuestionState,
  type ExpertQuestionTaskV1,
  type ExpertSourceRecordV1,
} from "@markorbit/contracts";
import { RegistryConflictError, RegistryValidationError } from "./index";

const INITIALIZED_DATABASES = new WeakSet<DatabaseSync>();

const SENT_OR_LATER = new Set<ExpertQuestionState>([
  "SENT",
  "WAITING_RESPONSE",
  "RESPONSE_RECEIVED",
  "NEEDS_FOLLOW_UP",
  "CAPTURED",
  "CLOSED",
]);

const REPLY_ACCEPTING_STATES = new Set<ExpertQuestionState>(["SENT", "WAITING_RESPONSE"]);

const ALLOWED_TRANSITIONS: Readonly<Record<ExpertQuestionState, readonly ExpertQuestionState[]>> = {
  DRAFT: ["DRAFT", "READY_TO_SEND"],
  READY_TO_SEND: ["DRAFT", "READY_TO_SEND", "SENT"],
  SENT: ["SENT", "WAITING_RESPONSE", "RESPONSE_RECEIVED"],
  WAITING_RESPONSE: ["WAITING_RESPONSE", "RESPONSE_RECEIVED"],
  RESPONSE_RECEIVED: ["RESPONSE_RECEIVED", "NEEDS_FOLLOW_UP", "CAPTURED"],
  NEEDS_FOLLOW_UP: ["NEEDS_FOLLOW_UP", "WAITING_RESPONSE", "RESPONSE_RECEIVED", "CAPTURED"],
  CAPTURED: ["CAPTURED", "CLOSED"],
  CLOSED: ["CLOSED"],
};

export function ensureExpertSourceRegistry(database: DatabaseSync): void {
  if (INITIALIZED_DATABASES.has(database)) return;
  database.exec(`
    CREATE TABLE IF NOT EXISTS expert_question_tasks (
      task_id TEXT PRIMARY KEY,
      state TEXT NOT NULL,
      jurisdiction TEXT NOT NULL,
      topic TEXT NOT NULL,
      expert_ref TEXT NOT NULL,
      communication_send_request_ref TEXT UNIQUE,
      communication_thread_ref TEXT,
      question_lock_sha256 TEXT CHECK (
        question_lock_sha256 IS NULL OR length(question_lock_sha256) = 64
      ),
      document_sha256 TEXT NOT NULL CHECK (length(document_sha256) = 64),
      document_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      sent_at TEXT,
      closed_at TEXT
    ) STRICT;

    CREATE INDEX IF NOT EXISTS expert_question_tasks_state_idx
      ON expert_question_tasks(state, created_at ASC, task_id ASC);
    CREATE INDEX IF NOT EXISTS expert_question_tasks_topic_idx
      ON expert_question_tasks(jurisdiction, topic, created_at ASC, task_id ASC);
    CREATE INDEX IF NOT EXISTS expert_question_tasks_thread_idx
      ON expert_question_tasks(communication_thread_ref)
      WHERE communication_thread_ref IS NOT NULL;

    CREATE TABLE IF NOT EXISTS expert_source_records (
      source_record_id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      evidence_key TEXT NOT NULL UNIQUE CHECK (length(evidence_key) = 64),
      replay_payload_sha256 TEXT NOT NULL CHECK (length(replay_payload_sha256) = 64),
      document_sha256 TEXT NOT NULL CHECK (length(document_sha256) = 64),
      document_json TEXT NOT NULL,
      received_at TEXT NOT NULL,
      captured_at TEXT NOT NULL,
      FOREIGN KEY(task_id) REFERENCES expert_question_tasks(task_id)
    ) STRICT;

    CREATE INDEX IF NOT EXISTS expert_source_records_task_idx
      ON expert_source_records(task_id, received_at ASC, source_record_id ASC);
  `);
  INITIALIZED_DATABASES.add(database);
}

function digest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");
}

function sorted(values: readonly string[]): string[] {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function questionLock(value: ExpertQuestionTaskV1): string {
  return digest({
    topic: value.topic,
    jurisdiction: value.jurisdiction,
    question: value.question,
    expertRef: value.expertRef,
    organizationRef: value.organizationRef ?? null,
    requestedBy: value.requestedBy,
    createdAt: value.createdAt,
    accessClassification: value.accessClassification,
  });
}

function evidenceKey(value: ExpertSourceRecordV1): string {
  return digest({
    taskId: value.taskId,
    communicationThreadRef: value.communication.communicationThreadRef,
    messageRefs: sorted(value.communication.messageRefs),
    rawAnswerArtifactRefs: sorted(value.rawAnswerArtifactRefs),
  });
}

function replayPayload(value: ExpertSourceRecordV1): string {
  return digest({
    taskId: value.taskId,
    expertRef: value.expertRef,
    organizationRef: value.organizationRef ?? null,
    jurisdiction: value.jurisdiction,
    topic: value.topic,
    communicationThreadRef: value.communication.communicationThreadRef,
    messageRefs: sorted(value.communication.messageRefs),
    rawAnswerArtifactRefs: sorted(value.rawAnswerArtifactRefs),
    normalizedDerivativeRef: value.normalizedDerivativeRef ?? null,
    attachmentRefs: sorted(value.attachmentRefs),
    receivedAt: value.receivedAt,
    relatedSourceRefs: sorted(value.relatedSourceRefs),
    relatedCaseRefs: sorted(value.relatedCaseRefs),
    provenance: value.provenance,
    accessClassification: value.accessClassification,
  });
}

function parseTask(value: string): ExpertQuestionTaskV1 {
  const parsed = JSON.parse(value) as unknown;
  if (!isExpertQuestionTaskV1(parsed)) {
    throw new RegistryValidationError("Stored Expert question task is invalid");
  }
  return parsed;
}

function parseSourceRecord(value: string): ExpertSourceRecordV1 {
  const parsed = JSON.parse(value) as unknown;
  if (!isExpertSourceRecordV1(parsed)) {
    throw new RegistryValidationError("Stored Expert source record is invalid");
  }
  return parsed;
}

function validateLifecycleShape(value: ExpertQuestionTaskV1): void {
  const sent = SENT_OR_LATER.has(value.state);
  if (sent && (!value.communicationSendRequestRef || !value.sentAt)) {
    throw new RegistryValidationError(
      "Expert task at SENT or later requires communicationSendRequestRef and sentAt",
    );
  }
  if (!sent && value.sentAt) {
    throw new RegistryValidationError("Pre-send Expert task cannot already have sentAt");
  }
  if (value.state === "CLOSED" && !value.closedAt) {
    throw new RegistryValidationError("Closed Expert task requires closedAt");
  }
  if (value.state !== "CLOSED" && value.closedAt) {
    throw new RegistryValidationError("Only a closed Expert task may have closedAt");
  }
}

function validateTransition(from: ExpertQuestionState, to: ExpertQuestionState): void {
  if (!ALLOWED_TRANSITIONS[from].includes(to)) {
    throw new RegistryConflictError(
      "EXPERT_TASK_STATE_TRANSITION_INVALID",
      `Expert task state cannot transition from ${from} to ${to}`,
    );
  }
}

export class SqliteExpertSourceRepository {
  constructor(private readonly database: DatabaseSync) {
    this.database.exec("PRAGMA foreign_keys = ON;");
    ensureExpertSourceRegistry(database);
  }

  saveTask(value: ExpertQuestionTaskV1): ExpertQuestionTaskV1 {
    validateLifecycleShape(value);
    if (!isExpertQuestionTaskV1(value)) {
      throw new RegistryValidationError("Expert question task is invalid");
    }

    const json = JSON.stringify(value);
    const sha256 = digest(value);
    const existing = this.database
      .prepare(
        `SELECT state, communication_send_request_ref, communication_thread_ref,
                question_lock_sha256, document_json
         FROM expert_question_tasks
         WHERE task_id = ?`,
      )
      .get(value.taskId) as
      | {
          state: ExpertQuestionState;
          communication_send_request_ref: string | null;
          communication_thread_ref: string | null;
          question_lock_sha256: string | null;
          document_json: string;
        }
      | undefined;

    if (!existing) {
      const lock = SENT_OR_LATER.has(value.state) ? questionLock(value) : null;
      this.database
        .prepare(
          `INSERT INTO expert_question_tasks(
            task_id, state, jurisdiction, topic, expert_ref,
            communication_send_request_ref, communication_thread_ref,
            question_lock_sha256, document_sha256, document_json,
            created_at, sent_at, closed_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          value.taskId,
          value.state,
          value.jurisdiction,
          value.topic,
          value.expertRef,
          value.communicationSendRequestRef ?? null,
          value.communicationThreadRef ?? null,
          lock,
          sha256,
          json,
          value.createdAt,
          value.sentAt ?? null,
          value.closedAt ?? null,
        );
      return value;
    }

    const previous = parseTask(existing.document_json);
    validateTransition(existing.state, value.state);

    if (existing.question_lock_sha256 && existing.question_lock_sha256 !== questionLock(value)) {
      throw new RegistryConflictError(
        "EXPERT_TASK_QUESTION_LOCKED",
        `Expert task ${value.taskId} question identity is immutable after send`,
      );
    }
    if (
      existing.communication_send_request_ref &&
      existing.communication_send_request_ref !== value.communicationSendRequestRef
    ) {
      throw new RegistryConflictError(
        "EXPERT_TASK_SEND_REQUEST_IMMUTABLE",
        `Expert task ${value.taskId} communication send request reference is immutable`,
      );
    }
    if (
      existing.communication_thread_ref &&
      existing.communication_thread_ref !== value.communicationThreadRef
    ) {
      throw new RegistryConflictError(
        "EXPERT_TASK_THREAD_IMMUTABLE",
        `Expert task ${value.taskId} communication thread reference is immutable once known`,
      );
    }
    if (previous.sentAt && previous.sentAt !== value.sentAt) {
      throw new RegistryConflictError(
        "EXPERT_TASK_SENT_AT_IMMUTABLE",
        `Expert task ${value.taskId} sentAt is immutable once recorded`,
      );
    }
    if (previous.closedAt && previous.closedAt !== value.closedAt) {
      throw new RegistryConflictError(
        "EXPERT_TASK_CLOSED_AT_IMMUTABLE",
        `Expert task ${value.taskId} closedAt is immutable once recorded`,
      );
    }

    const lock =
      existing.question_lock_sha256 ??
      (SENT_OR_LATER.has(value.state) ? questionLock(value) : null);
    this.database
      .prepare(
        `UPDATE expert_question_tasks
         SET state = ?, jurisdiction = ?, topic = ?, expert_ref = ?,
             communication_send_request_ref = ?, communication_thread_ref = ?,
             question_lock_sha256 = ?, document_sha256 = ?, document_json = ?,
             sent_at = ?, closed_at = ?
         WHERE task_id = ?`,
      )
      .run(
        value.state,
        value.jurisdiction,
        value.topic,
        value.expertRef,
        value.communicationSendRequestRef ?? null,
        value.communicationThreadRef ?? null,
        lock,
        sha256,
        json,
        value.sentAt ?? null,
        value.closedAt ?? null,
        value.taskId,
      );
    return value;
  }

  getTask(taskId: string): ExpertQuestionTaskV1 | null {
    const row = this.database
      .prepare(`SELECT document_json FROM expert_question_tasks WHERE task_id = ?`)
      .get(taskId) as { document_json: string } | undefined;
    return row ? parseTask(row.document_json) : null;
  }

  listTasks(
    input: {
      state?: ExpertQuestionState;
      jurisdiction?: string;
      topic?: string;
    } = {},
  ): ExpertQuestionTaskV1[] {
    const clauses: string[] = [];
    const values: string[] = [];
    if (input.state) {
      clauses.push("state = ?");
      values.push(input.state);
    }
    if (input.jurisdiction) {
      clauses.push("jurisdiction = ?");
      values.push(input.jurisdiction);
    }
    if (input.topic) {
      clauses.push("topic = ?");
      values.push(input.topic);
    }
    const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
    const rows = this.database
      .prepare(
        `SELECT document_json
         FROM expert_question_tasks
         ${where}
         ORDER BY created_at ASC, task_id ASC`,
      )
      .all(...values) as { document_json: string }[];
    return rows.map((row) => parseTask(row.document_json));
  }

  saveSourceRecord(value: ExpertSourceRecordV1): ExpertSourceRecordV1 {
    if (!isExpertSourceRecordV1(value)) {
      throw new RegistryValidationError("Expert source record is invalid");
    }
    const task = this.getTask(value.taskId);
    if (!task) {
      throw new RegistryValidationError(
        `Expert source record references missing task ${value.taskId}`,
      );
    }
    if (!REPLY_ACCEPTING_STATES.has(task.state)) {
      throw new RegistryConflictError(
        "EXPERT_SOURCE_TASK_NOT_WAITING_FOR_REPLY",
        `Expert source record task ${value.taskId} is not waiting for a reply`,
      );
    }
    if (!task.communicationThreadRef) {
      throw new RegistryConflictError(
        "EXPERT_SOURCE_TASK_THREAD_NOT_BOUND",
        `Expert source record task ${value.taskId} has no durable Communication thread`,
      );
    }
    if (!task.sentAt || Date.parse(value.receivedAt) < Date.parse(task.sentAt)) {
      throw new RegistryConflictError(
        "EXPERT_SOURCE_RECEIVED_BEFORE_SEND",
        `Expert source record ${value.sourceRecordId} cannot be received before task send`,
      );
    }
    if (
      task.expertRef !== value.expertRef ||
      task.organizationRef !== value.organizationRef ||
      task.jurisdiction !== value.jurisdiction ||
      task.topic !== value.topic ||
      task.accessClassification !== value.accessClassification
    ) {
      throw new RegistryValidationError(
        `Expert source record identity does not match task ${value.taskId}`,
      );
    }
    if (task.communicationThreadRef !== value.communication.communicationThreadRef) {
      throw new RegistryValidationError(
        `Expert source record thread does not match task ${value.taskId}`,
      );
    }

    const key = evidenceKey(value);
    const payloadSha256 = replayPayload(value);
    const json = JSON.stringify(value);
    const sha256 = digest(value);

    const sameEvidence = this.database
      .prepare(
        `SELECT replay_payload_sha256, document_json
         FROM expert_source_records
         WHERE evidence_key = ?`,
      )
      .get(key) as { replay_payload_sha256: string; document_json: string } | undefined;
    if (sameEvidence) {
      if (sameEvidence.replay_payload_sha256 !== payloadSha256) {
        throw new RegistryConflictError(
          "EXPERT_SOURCE_REPLAY_CONFLICT",
          "The same inbound Expert evidence was replayed with different source semantics",
        );
      }
      return parseSourceRecord(sameEvidence.document_json);
    }

    const sameId = this.database
      .prepare(
        `SELECT document_sha256, document_json
         FROM expert_source_records
         WHERE source_record_id = ?`,
      )
      .get(value.sourceRecordId) as { document_sha256: string; document_json: string } | undefined;
    if (sameId) {
      if (sameId.document_sha256 !== sha256 || sameId.document_json !== json) {
        throw new RegistryConflictError(
          "EXPERT_SOURCE_RECORD_IMMUTABLE_CONFLICT",
          `Expert source record ${value.sourceRecordId} already exists with different content`,
        );
      }
      return parseSourceRecord(sameId.document_json);
    }

    this.database
      .prepare(
        `INSERT INTO expert_source_records(
          source_record_id, task_id, evidence_key, replay_payload_sha256,
          document_sha256, document_json, received_at, captured_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        value.sourceRecordId,
        value.taskId,
        key,
        payloadSha256,
        sha256,
        json,
        value.receivedAt,
        value.capturedAt,
      );
    return value;
  }

  getSourceRecord(sourceRecordId: string): ExpertSourceRecordV1 | null {
    const row = this.database
      .prepare(`SELECT document_json FROM expert_source_records WHERE source_record_id = ?`)
      .get(sourceRecordId) as { document_json: string } | undefined;
    return row ? parseSourceRecord(row.document_json) : null;
  }

  listSourceRecordsForTask(taskId: string): ExpertSourceRecordV1[] {
    const rows = this.database
      .prepare(
        `SELECT document_json
         FROM expert_source_records
         WHERE task_id = ?
         ORDER BY received_at ASC, source_record_id ASC`,
      )
      .all(taskId) as { document_json: string }[];
    return rows.map((row) => parseSourceRecord(row.document_json));
  }
}
