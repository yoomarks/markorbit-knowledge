import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import type { ExpertQuestionTaskV1 } from "@markorbit/contracts";
import { SqliteExpertSourceRepository } from "@markorbit/persistence/expert-sources";
import { CoreExpertReplyImporter } from "./expert-communication-reply-importer";

const workspaceId = "workspace:expert-live-shape";
const expertRef = "expert:live-shape";
const authorization = "x".repeat(40);
const configJson = JSON.stringify({
  workspaces: {
    [workspaceId]: {
      accountRef: "account:expert-mailbox",
      sender: { address: "knowledge@example.test" },
      recipients: {
        [expertRef]: { address: "expert@example.test" },
      },
    },
  },
});

const databases: DatabaseSync[] = [];

function repository(): SqliteExpertSourceRepository {
  const database = new DatabaseSync(":memory:");
  databases.push(database);
  return new SqliteExpertSourceRepository(database);
}

function waiting(repository: SqliteExpertSourceRepository): ExpertQuestionTaskV1 {
  const draft: ExpertQuestionTaskV1 = {
    protocolVersion: "1.0",
    objectType: "EXPERT_QUESTION_TASK",
    taskId: "eqt_live_shape_001",
    topic: "K_EXP_004",
    jurisdiction: "US",
    question: "Please reply.",
    expertRef,
    requestedBy: "user:operator",
    state: "DRAFT",
    createdAt: "2026-09-02T09:48:00.000Z",
    relatedSourceRefs: [],
    relatedCaseRefs: [],
    accessClassification: "CONFIDENTIAL",
  };
  repository.saveTask(draft);
  repository.saveTask({ ...draft, state: "READY_TO_SEND" });
  const sent = repository.saveTask({
    ...draft,
    state: "SENT",
    communicationSendRequestRef: "commsend_live_shape_001",
    communicationThreadRef: "commthread_live_shape_001",
    sentAt: "2026-09-02T09:48:50.060Z",
  });
  return repository.saveTask({ ...sent, state: "WAITING_RESPONSE" });
}

function resolution() {
  return {
    schemaVersion: 1,
    workspaceId,
    accountRef: "account:expert-mailbox",
    threadRef: "commthread_live_shape_001",
    messages: [
      {
        schemaVersion: 1,
        messageId: "commmsg_outbound_live_shape_001",
        accountRef: "account:expert-mailbox",
        threadRef: "commthread_live_shape_001",
        channel: "EMAIL",
        direction: "OUTBOUND",
        participants: [
          { role: "SENDER", address: "knowledge@example.test" },
          { role: "TO", address: "expert@example.test" },
        ],
        attachments: [],
        occurredAt: "2026-09-02T09:48:50.060Z",
        providerObservation: {
          provider: "GMAIL",
          providerMessageId: "provider-outbound-001",
          providerThreadId: "provider-thread-001",
          observedAt: "2026-09-02T09:48:50.060Z",
        },
      },
      {
        schemaVersion: 1,
        messageId: "commmsg_inbound_live_shape_001",
        accountRef: "account:expert-mailbox",
        threadRef: "commthread_live_shape_001",
        channel: "EMAIL",
        direction: "INBOUND",
        participants: [
          { role: "SENDER", address: "expert@example.test" },
          { role: "TO", address: "knowledge@example.test" },
        ],
        attachments: [],
        occurredAt: "2026-09-02T09:52:44.000Z",
        providerObservation: {
          provider: "GMAIL",
          providerMessageId: "provider-inbound-001",
          providerThreadId: "provider-thread-001",
          observedAt: "2026-09-02T10:04:08.457Z",
        },
        exactEvidence: {
          schemaVersion: 1,
          evidenceRef: "commevidence_live_shape_001",
          sha256: "a".repeat(64),
          mediaType: "message/rfc822",
          sizeBytes: 14894,
          observedAt: "2026-09-02T10:04:08.457Z",
          provider: "GMAIL",
          providerMessageId: "provider-inbound-001",
          headers: [],
          metadata: {},
        },
      },
    ],
  };
}

afterEach(() => {
  while (databases.length) databases.pop()?.close();
});

describe("CoreExpertReplyImporter live Core thread shape", () => {
  it("accepts a legal outbound without exact evidence and requires exact evidence on inbound", async () => {
    const repo = repository();
    const task = waiting(repo);
    const importer = new CoreExpertReplyImporter(repo, {
      workspaceId,
      coreUrl: "https://core.example.test",
      authorization,
      configJson,
      now: () => new Date("2026-09-02T10:05:00.000Z"),
      fetchImpl: async () => Response.json(resolution()),
    });

    const first = await importer.importReply(task.taskId);
    expect(first.task.state).toBe("RESPONSE_RECEIVED");
    expect(first.sourceRecord.communication.messageRefs).toEqual([
      "commmsg_inbound_live_shape_001",
    ]);
    expect(first.sourceRecord.rawAnswerArtifactRefs).toEqual([
      "commevidence_live_shape_001",
    ]);

    const replay = await importer.importReply(task.taskId);
    expect(replay.sourceRecord).toEqual(first.sourceRecord);
    expect(repo.listSourceRecordsForTask(task.taskId)).toEqual([first.sourceRecord]);
  });
});
