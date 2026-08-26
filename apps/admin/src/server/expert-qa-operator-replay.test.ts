import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import type { ExpertSourceRecordV1 } from "@markorbit/contracts";
import { SqliteExpertSourceRepository } from "@markorbit/persistence/expert-sources";
import {
  ExpertQaOperatorService,
  type ExpertQuestionSendIntent,
  type ExpertQuestionSender,
} from "./expert-qa-operator-service";

class Sender implements ExpertQuestionSender {
  async sendQuestion(intent: ExpertQuestionSendIntent) {
    return {
      communicationSendRequestRef: `comm:send:${intent.idempotencyKey}`,
      communicationThreadRef: "comm:thread:operator-replay",
      sentAt: "2026-08-25T02:00:00.000Z",
    };
  }
}

function reply(taskId: string, overrides: Partial<ExpertSourceRecordV1> = {}): ExpertSourceRecordV1 {
  return {
    protocolVersion: "1.0",
    objectType: "EXPERT_SOURCE_RECORD",
    sourceRecordId: "esr_operator_replay_001",
    taskId,
    expertRef: "expert:us:outside-counsel-001",
    organizationRef: "org:outside-firm-001",
    jurisdiction: "US",
    topic: "SECTION_8_DECLARATION",
    communication: {
      communicationThreadRef: "comm:thread:operator-replay",
      messageRefs: ["comm:message:outbound-001", "comm:message:inbound-001"],
    },
    rawAnswerArtifactRefs: ["raw:sha256:operator-replay-001"],
    attachmentRefs: [],
    receivedAt: "2026-08-25T03:00:00.000Z",
    capturedAt: "2026-08-25T03:01:00.000Z",
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

async function fixture() {
  const database = new DatabaseSync(":memory:");
  const repository = new SqliteExpertSourceRepository(database);
  const service = new ExpertQaOperatorService(repository, new Sender());
  const draft = service.createDraft(
    {
      topic: "SECTION_8_DECLARATION",
      jurisdiction: "US",
      question: "Which evidence is normally accepted?",
      expertRef: "expert:us:outside-counsel-001",
      organizationRef: "org:outside-firm-001",
      requestedBy: "user:operator-001",
    },
    new Date("2026-08-25T01:00:00.000Z"),
  );
  service.markReady(draft.taskId);
  await service.sendReady(draft.taskId);
  return { database, repository, service, taskId: draft.taskId };
}

describe("ExpertQaOperatorService replay", () => {
  it("treats exact reply redelivery as idempotent after task advancement", async () => {
    const current = await fixture();
    const inbound = reply(current.taskId);
    expect(current.service.recordReply(inbound).state).toBe("RESPONSE_RECEIVED");
    expect(current.service.recordReply(inbound).state).toBe("RESPONSE_RECEIVED");

    current.service.capture(current.taskId);
    current.service.close(current.taskId, new Date("2026-08-25T04:00:00.000Z"));
    expect(current.service.recordReply(inbound).state).toBe("CLOSED");
    expect(current.repository.listSourceRecordsForTask(current.taskId)).toHaveLength(1);
    current.database.close();
  });

  it("does not let a new reply bypass lifecycle gates after closure", async () => {
    const current = await fixture();
    current.service.recordReply(reply(current.taskId));
    current.service.capture(current.taskId);
    current.service.close(current.taskId, new Date("2026-08-25T04:00:00.000Z"));

    const unseen = reply(current.taskId, {
      sourceRecordId: "esr_operator_replay_new",
      communication: {
        communicationThreadRef: "comm:thread:operator-replay",
        messageRefs: ["comm:message:outbound-001", "comm:message:inbound-new"],
      },
      rawAnswerArtifactRefs: ["raw:sha256:operator-replay-new"],
    });
    expect(() => current.service.recordReply(unseen)).toThrowError(/is not waiting for a reply/u);
    expect(current.repository.listSourceRecordsForTask(current.taskId)).toHaveLength(1);
    current.database.close();
  });
});
