import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import type { ExpertQuestionTaskV1, ExpertSourceRecordV1 } from "@markorbit/contracts";
import { SqliteExpertSourceRepository } from "./expert-source-registry";

function draftTask(overrides: Partial<ExpertQuestionTaskV1> = {}): ExpertQuestionTaskV1 {
  return {
    protocolVersion: "1.0",
    objectType: "EXPERT_QUESTION_TASK",
    taskId: "eqt_us_section8_001",
    topic: "SECTION_8_DECLARATION",
    jurisdiction: "US",
    question: "What evidence is normally accepted for this filing scenario?",
    expertRef: "expert:us:outside-counsel-001",
    organizationRef: "org:outside-firm-001",
    requestedBy: "user:operator-001",
    state: "DRAFT",
    createdAt: "2026-08-25T01:00:00.000Z",
    relatedSourceRefs: ["source:uspto:section8"],
    relatedCaseRefs: [],
    accessClassification: "CONFIDENTIAL",
    ...overrides,
  };
}

function sentTask(overrides: Partial<ExpertQuestionTaskV1> = {}): ExpertQuestionTaskV1 {
  return draftTask({
    state: "SENT",
    communicationSendRequestRef: "comm:send-request:001",
    communicationThreadRef: "comm:thread:001",
    sentAt: "2026-08-25T01:01:00.000Z",
    ...overrides,
  });
}

function sourceRecord(overrides: Partial<ExpertSourceRecordV1> = {}): ExpertSourceRecordV1 {
  return {
    protocolVersion: "1.0",
    objectType: "EXPERT_SOURCE_RECORD",
    sourceRecordId: "esr_us_section8_001",
    taskId: "eqt_us_section8_001",
    expertRef: "expert:us:outside-counsel-001",
    organizationRef: "org:outside-firm-001",
    jurisdiction: "US",
    topic: "SECTION_8_DECLARATION",
    communication: {
      communicationThreadRef: "comm:thread:001",
      messageRefs: ["comm:message:outbound-001", "comm:message:inbound-001"],
    },
    rawAnswerArtifactRefs: ["raw:sha256:answer-001"],
    normalizedDerivativeRef: "derivative:expert-answer:001",
    attachmentRefs: ["comm:attachment:001"],
    receivedAt: "2026-08-25T02:00:00.000Z",
    capturedAt: "2026-08-25T02:01:00.000Z",
    relatedSourceRefs: ["source:uspto:section8"],
    relatedCaseRefs: [],
    provenance: {
      sourceFamily: "EXPERT",
      originalEvidenceAuthoritative: true,
      normalizedDerivativeIsOriginalEvidence: false,
    },
    accessClassification: "CONFIDENTIAL",
    ...overrides,
  };
}

function advanceToSent(repository: SqliteExpertSourceRepository): ExpertQuestionTaskV1 {
  const draft = draftTask();
  repository.saveTask(draft);
  repository.saveTask({ ...draft, state: "READY_TO_SEND" });
  const sent = sentTask();
  repository.saveTask(sent);
  return sent;
}

describe("SqliteExpertSourceRepository", () => {
  it("persists task lifecycle state across repository restart", () => {
    const database = new DatabaseSync(":memory:");
    const first = new SqliteExpertSourceRepository(database);
    const sent = advanceToSent(first);

    const restarted = new SqliteExpertSourceRepository(database);
    expect(restarted.getTask(sent.taskId)).toEqual(sent);
    expect(restarted.listTasks({ state: "SENT", jurisdiction: "US" })).toEqual([sent]);
    database.close();
  });

  it("allows question editing before send and locks the exact question identity after send", () => {
    const database = new DatabaseSync(":memory:");
    const repository = new SqliteExpertSourceRepository(database);
    const firstDraft = draftTask();
    repository.saveTask(firstDraft);

    const revisedDraft = {
      ...firstDraft,
      question: "Which specimens are normally accepted for this filing scenario?",
    };
    repository.saveTask(revisedDraft);
    repository.saveTask({ ...revisedDraft, state: "READY_TO_SEND" });
    const sent = sentTask({ question: revisedDraft.question });
    repository.saveTask(sent);

    expect(() => repository.saveTask({ ...sent, question: "Mutated after send" })).toThrowError(
      /question identity is immutable after send/u,
    );
    expect(() =>
      repository.saveTask({
        ...sent,
        communicationSendRequestRef: "comm:send-request:changed",
      }),
    ).toThrowError(/send request reference is immutable/u);
    expect(() =>
      repository.saveTask({
        ...sent,
        state: "READY_TO_SEND",
        sentAt: undefined,
      }),
    ).toThrow();
    database.close();
  });

  it("locks the terminal closedAt audit timestamp once recorded", () => {
    const database = new DatabaseSync(":memory:");
    const repository = new SqliteExpertSourceRepository(database);
    const sent = advanceToSent(repository);
    const responseReceived = { ...sent, state: "RESPONSE_RECEIVED" as const };
    repository.saveTask(responseReceived);
    const captured = { ...responseReceived, state: "CAPTURED" as const };
    repository.saveTask(captured);
    const closed = {
      ...captured,
      state: "CLOSED" as const,
      closedAt: "2026-08-25T03:00:00.000Z",
    };
    repository.saveTask(closed);

    expect(() =>
      repository.saveTask({
        ...closed,
        closedAt: "2026-08-25T04:00:00.000Z",
      }),
    ).toThrowError(/closedAt is immutable once recorded/u);
    expect(repository.getTask(closed.taskId)).toEqual(closed);
    database.close();
  });

  it("requires durable send correlation before entering a sent state", () => {
    const database = new DatabaseSync(":memory:");
    const repository = new SqliteExpertSourceRepository(database);

    expect(() => repository.saveTask(draftTask({ state: "SENT" }))).toThrowError(
      /requires communicationSendRequestRef and sentAt/u,
    );
    database.close();
  });

  it("deduplicates replayed inbound evidence even if capture identity and capture time change", () => {
    const database = new DatabaseSync(":memory:");
    const repository = new SqliteExpertSourceRepository(database);
    advanceToSent(repository);
    const first = sourceRecord();
    expect(repository.saveSourceRecord(first)).toEqual(first);

    const replay = sourceRecord({
      sourceRecordId: "esr_us_section8_replay",
      capturedAt: "2026-08-25T02:05:00.000Z",
    });
    expect(repository.saveSourceRecord(replay)).toEqual(first);
    expect(repository.listSourceRecordsForTask(first.taskId)).toEqual([first]);
    database.close();
  });

  it("rejects duplicate refs that could mutate replay evidence identity", () => {
    const database = new DatabaseSync(":memory:");
    const repository = new SqliteExpertSourceRepository(database);
    advanceToSent(repository);

    expect(() =>
      repository.saveSourceRecord(
        sourceRecord({
          communication: {
            communicationThreadRef: "comm:thread:001",
            messageRefs: ["comm:message:inbound-001", "comm:message:inbound-001"],
          },
        }),
      ),
    ).toThrowError(/Expert source record is invalid/u);
    expect(() =>
      repository.saveSourceRecord(
        sourceRecord({
          rawAnswerArtifactRefs: ["raw:sha256:answer-001", "raw:sha256:answer-001"],
        }),
      ),
    ).toThrowError(/Expert source record is invalid/u);
    expect(repository.listSourceRecordsForTask("eqt_us_section8_001")).toHaveLength(0);
    database.close();
  });

  it("rejects reply evidence received before the task was sent", () => {
    const database = new DatabaseSync(":memory:");
    const repository = new SqliteExpertSourceRepository(database);
    advanceToSent(repository);

    expect(() =>
      repository.saveSourceRecord(
        sourceRecord({
          receivedAt: "2026-08-25T01:00:30.000Z",
          capturedAt: "2026-08-25T01:00:45.000Z",
        }),
      ),
    ).toThrowError(/cannot be received before task send/u);
    expect(repository.listSourceRecordsForTask("eqt_us_section8_001")).toHaveLength(0);
    database.close();
  });

  it("requires captured evidence to inherit the task access classification", () => {
    const database = new DatabaseSync(":memory:");
    const repository = new SqliteExpertSourceRepository(database);
    advanceToSent(repository);

    expect(() =>
      repository.saveSourceRecord(
        sourceRecord({
          accessClassification: "INTERNAL",
        }),
      ),
    ).toThrowError(/identity does not match task/u);
    expect(repository.listSourceRecordsForTask("eqt_us_section8_001")).toHaveLength(0);
    database.close();
  });

  it("fails closed when the same inbound evidence is replayed with changed semantics", () => {
    const database = new DatabaseSync(":memory:");
    const repository = new SqliteExpertSourceRepository(database);
    advanceToSent(repository);
    repository.saveSourceRecord(sourceRecord());

    expect(() =>
      repository.saveSourceRecord(
        sourceRecord({
          sourceRecordId: "esr_us_section8_conflict",
          attachmentRefs: ["comm:attachment:different"],
        }),
      ),
    ).toThrowError(/same inbound Expert evidence was replayed with different source semantics/u);
    database.close();
  });

  it("supports multiple follow-up messages in one Expert task without overwriting original evidence", () => {
    const database = new DatabaseSync(":memory:");
    const repository = new SqliteExpertSourceRepository(database);
    const sent = advanceToSent(repository);
    repository.saveTask({ ...sent, state: "WAITING_RESPONSE" });
    repository.saveTask({ ...sent, state: "RESPONSE_RECEIVED" });
    repository.saveTask({ ...sent, state: "NEEDS_FOLLOW_UP" });
    repository.saveTask({ ...sent, state: "WAITING_RESPONSE" });

    const first = sourceRecord();
    const followUp = sourceRecord({
      sourceRecordId: "esr_us_section8_002",
      communication: {
        communicationThreadRef: "comm:thread:001",
        messageRefs: [
          "comm:message:outbound-001",
          "comm:message:inbound-001",
          "comm:message:outbound-002",
          "comm:message:inbound-002",
        ],
      },
      rawAnswerArtifactRefs: ["raw:sha256:answer-002"],
      normalizedDerivativeRef: "derivative:expert-answer:002",
      attachmentRefs: ["comm:attachment:002"],
      receivedAt: "2026-08-25T03:00:00.000Z",
      capturedAt: "2026-08-25T03:01:00.000Z",
    });

    repository.saveSourceRecord(first);
    repository.saveSourceRecord(followUp);
    expect(repository.listSourceRecordsForTask(first.taskId)).toEqual([first, followUp]);
    database.close();
  });

  it("rejects reply evidence before the task reaches a reply-accepting state", () => {
    const database = new DatabaseSync(":memory:");
    const repository = new SqliteExpertSourceRepository(database);
    repository.saveTask(draftTask());

    expect(() => repository.saveSourceRecord(sourceRecord())).toThrowError(
      /is not waiting for a reply/u,
    );
    expect(repository.listSourceRecordsForTask("eqt_us_section8_001")).toHaveLength(0);
    database.close();
  });

  it("rejects reply evidence when the sent task has no durable Communication thread", () => {
    const database = new DatabaseSync(":memory:");
    const repository = new SqliteExpertSourceRepository(database);
    const draft = draftTask();
    repository.saveTask(draft);
    repository.saveTask({ ...draft, state: "READY_TO_SEND" });
    repository.saveTask(
      sentTask({
        communicationThreadRef: undefined,
      }),
    );

    expect(() => repository.saveSourceRecord(sourceRecord())).toThrowError(
      /has no durable Communication thread/u,
    );
    expect(repository.listSourceRecordsForTask("eqt_us_section8_001")).toHaveLength(0);
    database.close();
  });

  it("rejects source records that do not match the durable task or known thread", () => {
    const database = new DatabaseSync(":memory:");
    const repository = new SqliteExpertSourceRepository(database);
    advanceToSent(repository);

    expect(() =>
      repository.saveSourceRecord(
        sourceRecord({
          expertRef: "expert:us:different",
        }),
      ),
    ).toThrowError(/identity does not match task/u);
    expect(() =>
      repository.saveSourceRecord(
        sourceRecord({
          communication: {
            communicationThreadRef: "comm:thread:different",
            messageRefs: ["comm:message:inbound-001"],
          },
        }),
      ),
    ).toThrowError(/thread does not match task/u);
    expect(() =>
      repository.saveSourceRecord(
        sourceRecord({
          sourceRecordId: "esr_missing_task",
          taskId: "eqt_missing_task",
        }),
      ),
    ).toThrowError(/references missing task/u);
    database.close();
  });
});
