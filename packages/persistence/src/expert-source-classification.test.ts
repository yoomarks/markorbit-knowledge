import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import type { ExpertQuestionTaskV1 } from "@markorbit/contracts";
import { SqliteExpertSourceRepository } from "./expert-source-registry";

function draftTask(): ExpertQuestionTaskV1 {
  return {
    protocolVersion: "1.0",
    objectType: "EXPERT_QUESTION_TASK",
    taskId: "eqt_us_classification_lock_001",
    topic: "SECTION_8_DECLARATION",
    jurisdiction: "US",
    question: "What evidence is normally accepted for this filing scenario?",
    expertRef: "expert:us:outside-counsel-001",
    organizationRef: "org:outside-firm-001",
    requestedBy: "user:operator-001",
    state: "DRAFT",
    createdAt: "2026-08-25T01:00:00.000Z",
    relatedSourceRefs: [],
    relatedCaseRefs: [],
    accessClassification: "CONFIDENTIAL",
  };
}

describe("Expert task access classification", () => {
  it("allows pre-send classification edits and locks classification after send", () => {
    const database = new DatabaseSync(":memory:");
    const repository = new SqliteExpertSourceRepository(database);
    const draft = draftTask();
    repository.saveTask(draft);

    const reclassified = {
      ...draft,
      accessClassification: "RESTRICTED" as const,
    };
    expect(repository.saveTask(reclassified)).toEqual(reclassified);

    const ready = { ...reclassified, state: "READY_TO_SEND" as const };
    repository.saveTask(ready);
    const sent = {
      ...ready,
      state: "SENT" as const,
      communicationSendRequestRef: "comm:send-request:classification-lock-001",
      communicationThreadRef: "comm:thread:classification-lock-001",
      sentAt: "2026-08-25T01:01:00.000Z",
    };
    repository.saveTask(sent);

    expect(() =>
      repository.saveTask({
        ...sent,
        accessClassification: "INTERNAL",
      }),
    ).toThrowError(/question identity is immutable after send/u);
    expect(repository.getTask(sent.taskId)).toEqual(sent);
    database.close();
  });
});
