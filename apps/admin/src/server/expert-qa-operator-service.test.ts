import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import type { ExpertSourceRecordV1 } from "@markorbit/contracts";
import { SqliteExpertSourceRepository } from "@markorbit/persistence/expert-sources";
import {
  ExpertQaOperatorService,
  UnavailableExpertQuestionSender,
  type ExpertQuestionSendIntent,
  type ExpertQuestionSender,
} from "./expert-qa-operator-service";

class FakeSender implements ExpertQuestionSender {
  readonly intents: ExpertQuestionSendIntent[] = [];

  async sendQuestion(intent: ExpertQuestionSendIntent) {
    this.intents.push(intent);
    return {
      communicationSendRequestRef: `comm:send:${intent.idempotencyKey}`,
      communicationThreadRef: "comm:thread:expert-001",
      sentAt: "2026-08-25T02:00:00.000Z",
    };
  }
}

class SenderWithoutThread implements ExpertQuestionSender {
  async sendQuestion(intent: ExpertQuestionSendIntent) {
    return {
      communicationSendRequestRef: `comm:send:${intent.idempotencyKey}`,
      sentAt: "2026-08-25T02:00:00.000Z",
    };
  }
}

function service(sender: ExpertQuestionSender = new FakeSender()) {
  const database = new DatabaseSync(":memory:");
  const repository = new SqliteExpertSourceRepository(database);
  return { database, repository, service: new ExpertQaOperatorService(repository, sender) };
}

function draft(operator: ExpertQaOperatorService) {
  return operator.createDraft(
    {
      topic: "SECTION_8_DECLARATION",
      jurisdiction: "US",
      question: "Which evidence is normally accepted for this filing scenario?",
      expertRef: "expert:us:outside-counsel-001",
      organizationRef: "org:outside-firm-001",
      requestedBy: "user:operator-001",
      relatedSourceRefs: ["source:uspto:section8"],
    },
    new Date("2026-08-25T01:00:00.000Z"),
  );
}

function reply(taskId: string): ExpertSourceRecordV1 {
  return {
    protocolVersion: "1.0",
    objectType: "EXPERT_SOURCE_RECORD",
    sourceRecordId: "esr_operator_flow_001",
    taskId,
    expertRef: "expert:us:outside-counsel-001",
    organizationRef: "org:outside-firm-001",
    jurisdiction: "US",
    topic: "SECTION_8_DECLARATION",
    communication: {
      communicationThreadRef: "comm:thread:expert-001",
      messageRefs: ["comm:message:outbound-001", "comm:message:inbound-001"],
    },
    rawAnswerArtifactRefs: ["raw:sha256:expert-answer-001"],
    attachmentRefs: ["comm:attachment:expert-001"],
    receivedAt: "2026-08-25T03:00:00.000Z",
    capturedAt: "2026-08-25T03:01:00.000Z",
    relatedSourceRefs: ["source:uspto:section8"],
    relatedCaseRefs: [],
    provenance: {
      sourceFamily: "EXPERT",
      originalEvidenceAuthoritative: true,
      normalizedDerivativeIsOriginalEvidence: false,
    },
    accessClassification: "CONFIDENTIAL",
  };
}

describe("ExpertQaOperatorService", () => {
  it("creates a durable draft and exposes operator status", () => {
    const fixture = service();
    const created = draft(fixture.service);

    expect(fixture.service.getView(created.taskId).status).toBe("DRAFT");
    expect(fixture.service.listViews()).toHaveLength(1);
    fixture.database.close();
  });

  it("moves ready tasks through a sender using task identity as the idempotency intent", async () => {
    const sender = new FakeSender();
    const fixture = service(sender);
    const created = draft(fixture.service);
    fixture.service.markReady(created.taskId);

    const waiting = await fixture.service.sendReady(created.taskId);

    expect(waiting.state).toBe("WAITING_RESPONSE");
    expect(waiting.communicationSendRequestRef).toBe(`comm:send:${created.taskId}`);
    expect(sender.intents).toHaveLength(1);
    expect(sender.intents[0]?.idempotencyKey).toBe(created.taskId);
    expect(fixture.service.getView(created.taskId).status).toBe("WAITING");
    fixture.database.close();
  });

  it("fails closed when shared Communication is unavailable and never marks the task sent", async () => {
    const fixture = service(new UnavailableExpertQuestionSender());
    const created = draft(fixture.service);
    fixture.service.markReady(created.taskId);

    await expect(fixture.service.sendReady(created.taskId)).rejects.toMatchObject({
      code: "EXPERT_COMMUNICATION_CAPABILITY_NOT_CONFIGURED",
    });
    expect(fixture.repository.getTask(created.taskId)?.state).toBe("READY_TO_SEND");
    fixture.database.close();
  });

  it("records reply evidence, exposes attachments, captures and closes without ranking", async () => {
    const fixture = service();
    const created = draft(fixture.service);
    fixture.service.markReady(created.taskId);
    await fixture.service.sendReady(created.taskId);

    const replied = fixture.service.recordReply(reply(created.taskId));
    expect(replied.state).toBe("RESPONSE_RECEIVED");
    const view = fixture.service.getView(created.taskId);
    expect(view.status).toBe("REPLIED");
    expect(view.replies[0]?.attachmentRefs).toEqual(["comm:attachment:expert-001"]);
    expect(Object.keys(view.task)).not.toContain("expertScore");

    fixture.service.capture(created.taskId);
    const closed = fixture.service.close(created.taskId, new Date("2026-08-25T04:00:00.000Z"));
    expect(closed.state).toBe("CLOSED");
    expect(fixture.service.getView(created.taskId).status).toBe("CLOSED");
    fixture.database.close();
  });

  it("rejects a reply when the send receipt did not establish a durable Communication thread", async () => {
    const fixture = service(new SenderWithoutThread());
    const created = draft(fixture.service);
    fixture.service.markReady(created.taskId);
    await fixture.service.sendReady(created.taskId);

    expect(() => fixture.service.recordReply(reply(created.taskId))).toThrowError(
      expect.objectContaining({ code: "EXPERT_TASK_COMMUNICATION_THREAD_NOT_BOUND" }),
    );
    expect(fixture.repository.getTask(created.taskId)?.state).toBe("WAITING_RESPONSE");
    expect(fixture.repository.listSourceRecordsForTask(created.taskId)).toHaveLength(0);
    fixture.database.close();
  });

  it("rejects reply evidence from a different Communication thread", async () => {
    const fixture = service();
    const created = draft(fixture.service);
    fixture.service.markReady(created.taskId);
    await fixture.service.sendReady(created.taskId);
    const mismatched = reply(created.taskId);
    mismatched.communication = {
      ...mismatched.communication,
      communicationThreadRef: "comm:thread:unrelated-999",
    };

    expect(() => fixture.service.recordReply(mismatched)).toThrowError(
      expect.objectContaining({ code: "EXPERT_REPLY_THREAD_MISMATCH" }),
    );
    expect(fixture.repository.getTask(created.taskId)?.state).toBe("WAITING_RESPONSE");
    expect(fixture.repository.listSourceRecordsForTask(created.taskId)).toHaveLength(0);
    fixture.database.close();
  });

  it("rejects reply evidence whose expert identity or task scope differs", async () => {
    const fixture = service();
    const created = draft(fixture.service);
    fixture.service.markReady(created.taskId);
    await fixture.service.sendReady(created.taskId);
    const mismatched = { ...reply(created.taskId), expertRef: "expert:us:other-counsel-999" };

    expect(() => fixture.service.recordReply(mismatched)).toThrowError(
      expect.objectContaining({ code: "EXPERT_REPLY_TASK_BINDING_MISMATCH" }),
    );
    expect(fixture.repository.getTask(created.taskId)?.state).toBe("WAITING_RESPONSE");
    expect(fixture.repository.listSourceRecordsForTask(created.taskId)).toHaveLength(0);
    fixture.database.close();
  });

  it("rejects reply evidence without a shared Communication message reference", async () => {
    const fixture = service();
    const created = draft(fixture.service);
    fixture.service.markReady(created.taskId);
    await fixture.service.sendReady(created.taskId);
    const missingMessage = reply(created.taskId);
    missingMessage.communication = { ...missingMessage.communication, messageRefs: [] };

    expect(() => fixture.service.recordReply(missingMessage)).toThrow(
      "Expert reply must reference at least one Communication message",
    );
    expect(fixture.repository.getTask(created.taskId)?.state).toBe("WAITING_RESPONSE");
    expect(fixture.repository.listSourceRecordsForTask(created.taskId)).toHaveLength(0);
    fixture.database.close();
  });

  it("creates follow-up as a separate immutable question task on the same thread", async () => {
    const fixture = service();
    const created = draft(fixture.service);
    fixture.service.markReady(created.taskId);
    await fixture.service.sendReady(created.taskId);
    fixture.service.recordReply(reply(created.taskId));

    const followUp = fixture.service.createFollowUp(
      created.taskId,
      "Would the answer change for a digitally delivered specimen?",
      "user:operator-001",
      new Date("2026-08-25T03:30:00.000Z"),
    );

    expect(followUp.taskId).not.toBe(created.taskId);
    expect(followUp.state).toBe("DRAFT");
    expect(followUp.communicationThreadRef).toBe("comm:thread:expert-001");
    expect(followUp.question).toContain("digitally delivered specimen");
    expect(fixture.repository.getTask(created.taskId)?.state).toBe("CAPTURED");
    fixture.database.close();
  });
});
