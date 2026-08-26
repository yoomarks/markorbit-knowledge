import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import type { ExpertQuestionTaskV1, ExpertSourceRecordV1 } from "@markorbit/contracts";
import { SqliteExpertSourceRepository } from "./expert-source-registry";

function task(overrides: Partial<ExpertQuestionTaskV1> = {}): ExpertQuestionTaskV1 {
  return {
    protocolVersion: "1.0",
    objectType: "EXPERT_QUESTION_TASK",
    taskId: "eqt_replay_stage_001",
    topic: "SECTION_8_DECLARATION",
    jurisdiction: "US",
    question: "Which evidence is normally accepted?",
    expertRef: "expert:us:outside-counsel-001",
    organizationRef: "org:outside-firm-001",
    requestedBy: "user:operator-001",
    state: "DRAFT",
    createdAt: "2026-08-25T01:00:00.000Z",
    relatedSourceRefs: [],
    relatedCaseRefs: [],
    accessClassification: "CONFIDENTIAL",
    ...overrides,
  };
}

function sentTask(): ExpertQuestionTaskV1 {
  return task({
    state: "SENT",
    communicationSendRequestRef: "comm:send:replay-stage-001",
    communicationThreadRef: "comm:thread:replay-stage-001",
    sentAt: "2026-08-25T01:05:00.000Z",
  });
}

function source(overrides: Partial<ExpertSourceRecordV1> = {}): ExpertSourceRecordV1 {
  return {
    protocolVersion: "1.0",
    objectType: "EXPERT_SOURCE_RECORD",
    sourceRecordId: "esr_replay_stage_001",
    taskId: "eqt_replay_stage_001",
    expertRef: "expert:us:outside-counsel-001",
    organizationRef: "org:outside-firm-001",
    jurisdiction: "US",
    topic: "SECTION_8_DECLARATION",
    communication: {
      communicationThreadRef: "comm:thread:replay-stage-001",
      messageRefs: ["comm:message:outbound-001", "comm:message:inbound-001"],
    },
    rawAnswerArtifactRefs: ["raw:sha256:replay-stage-001"],
    attachmentRefs: [],
    receivedAt: "2026-08-25T02:00:00.000Z",
    capturedAt: "2026-08-25T02:01:00.000Z",
    relatedSourceRefs: [],
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
  const draft = task();
  repository.saveTask(draft);
  repository.saveTask({ ...draft, state: "READY_TO_SEND" });
  const sent = sentTask();
  repository.saveTask(sent);
  return sent;
}

describe("Expert durable replay lifecycle", () => {
  it("keeps createdAt immutable from initial persistence, including before send", () => {
    const database = new DatabaseSync(":memory:");
    const repository = new SqliteExpertSourceRepository(database);
    const draft = task();
    repository.saveTask(draft);

    expect(() =>
      repository.saveTask({ ...draft, createdAt: "2026-08-25T01:01:00.000Z" }),
    ).toThrowError(/createdAt is immutable once created/u);
    expect(repository.getTask(draft.taskId)).toEqual(draft);
    database.close();
  });

  it("accepts exact evidence replay after capture and close without duplicating evidence", () => {
    const database = new DatabaseSync(":memory:");
    const repository = new SqliteExpertSourceRepository(database);
    const sent = advanceToSent(repository);
    const first = source();
    repository.saveSourceRecord(first);
    const response = repository.saveTask({ ...sent, state: "RESPONSE_RECEIVED" });
    const captured = repository.saveTask({ ...response, state: "CAPTURED" });
    const closed = repository.saveTask({
      ...captured,
      state: "CLOSED",
      closedAt: "2026-08-25T03:00:00.000Z",
    });

    const replay = source({
      sourceRecordId: "esr_replay_stage_retry",
      capturedAt: "2026-08-25T03:05:00.000Z",
    });
    expect(repository.saveSourceRecord(replay)).toEqual(first);
    expect(repository.getTask(sent.taskId)).toEqual(closed);
    expect(repository.listSourceRecordsForTask(sent.taskId)).toEqual([first]);
    database.close();
  });

  it("keeps replay conflicts and unseen evidence fail-closed after close", () => {
    const database = new DatabaseSync(":memory:");
    const repository = new SqliteExpertSourceRepository(database);
    const sent = advanceToSent(repository);
    repository.saveSourceRecord(source());
    const response = repository.saveTask({ ...sent, state: "RESPONSE_RECEIVED" });
    const captured = repository.saveTask({ ...response, state: "CAPTURED" });
    repository.saveTask({
      ...captured,
      state: "CLOSED",
      closedAt: "2026-08-25T03:00:00.000Z",
    });

    expect(() =>
      repository.saveSourceRecord(
        source({
          sourceRecordId: "esr_replay_stage_conflict",
          attachmentRefs: ["comm:attachment:changed"],
        }),
      ),
    ).toThrowError(/same inbound Expert evidence was replayed with different source semantics/u);

    expect(() =>
      repository.saveSourceRecord(
        source({
          sourceRecordId: "esr_replay_stage_new",
          communication: {
            communicationThreadRef: "comm:thread:replay-stage-001",
            messageRefs: ["comm:message:outbound-001", "comm:message:new-002"],
          },
          rawAnswerArtifactRefs: ["raw:sha256:replay-stage-new"],
        }),
      ),
    ).toThrowError(/is not waiting for a reply/u);
    expect(repository.listSourceRecordsForTask(sent.taskId)).toHaveLength(1);
    database.close();
  });
});
