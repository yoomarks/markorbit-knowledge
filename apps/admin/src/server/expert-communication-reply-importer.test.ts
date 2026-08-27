import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import type { ExpertQuestionTaskV1 } from "@markorbit/contracts";
import { SqliteExpertSourceRepository } from "@markorbit/persistence/expert-sources";
import { CoreExpertReplyImporter } from "./expert-communication-reply-importer";

const workspaceId = "workspace:expert-test";
const expertRef = "expert:us:outside-counsel-001";
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
const authorization = "x".repeat(40);

function draft(): ExpertQuestionTaskV1 {
  return {
    protocolVersion: "1.0",
    objectType: "EXPERT_QUESTION_TASK",
    taskId: "eqt_us_expert_reply_001",
    topic: "SECTION_8_DECLARATION",
    jurisdiction: "US",
    question: "What evidence is normally accepted?",
    expertRef,
    organizationRef: "org:outside-firm-001",
    requestedBy: "user:operator-001",
    state: "DRAFT",
    createdAt: "2026-08-27T05:00:00.000Z",
    relatedSourceRefs: ["source:uspto:section8"],
    relatedCaseRefs: ["case:001"],
    accessClassification: "CONFIDENTIAL",
  };
}

function waiting(repository: SqliteExpertSourceRepository): ExpertQuestionTaskV1 {
  const initial = draft();
  repository.saveTask(initial);
  repository.saveTask({ ...initial, state: "READY_TO_SEND" });
  const sent: ExpertQuestionTaskV1 = {
    ...initial,
    state: "SENT",
    communicationSendRequestRef: "commsend_001",
    communicationThreadRef: "commthread_001",
    sentAt: "2026-08-27T05:01:00.000Z",
  };
  repository.saveTask(sent);
  return repository.saveTask({ ...sent, state: "WAITING_RESPONSE" });
}

function resolution(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    workspaceId,
    accountRef: "account:expert-mailbox",
    threadRef: "commthread_001",
    messages: [
      {
        schemaVersion: 1,
        messageId: "commmsg_inbound_001",
        accountRef: "account:expert-mailbox",
        threadRef: "commthread_001",
        channel: "EMAIL",
        direction: "INBOUND",
        participants: [
          { role: "SENDER", address: "expert@example.test" },
          { role: "TO", address: "knowledge@example.test" },
        ],
        textBody: "The declaration should be supported by current use evidence.",
        attachments: [],
        occurredAt: "2026-08-27T05:15:00.000Z",
        providerObservation: {
          provider: "TEST_PROVIDER",
          providerMessageId: "provider-message-001",
          providerThreadId: "provider-thread-001",
          observedAt: "2026-08-27T05:15:05.000Z",
        },
        ...overrides,
      },
    ],
  };
}

const databases: DatabaseSync[] = [];
function repository(): SqliteExpertSourceRepository {
  const database = new DatabaseSync(":memory:");
  databases.push(database);
  return new SqliteExpertSourceRepository(database);
}

afterEach(() => {
  while (databases.length) databases.pop()?.close();
});

describe("CoreExpertReplyImporter", () => {
  it("imports same-thread inbound evidence, preserves lineage, and replays idempotently", async () => {
    const repo = repository();
    const task = waiting(repo);
    const requests: Request[] = [];
    const importer = new CoreExpertReplyImporter(repo, {
      workspaceId,
      coreUrl: "https://core.example.test",
      authorization,
      configJson,
      now: () => new Date("2026-08-27T05:20:00.000Z"),
      fetchImpl: async (input, init) => {
        requests.push(new Request(input, init));
        return Response.json(resolution());
      },
    });

    const first = await importer.importReply(task.taskId);
    expect(first.task.state).toBe("RESPONSE_RECEIVED");
    expect(first.sourceRecord.communication).toEqual({
      communicationThreadRef: "commthread_001",
      messageRefs: ["commmsg_inbound_001"],
    });
    expect(first.sourceRecord.rawAnswerArtifactRefs).toEqual([
      "markorbit-core:managed-communication-message:commmsg_inbound_001",
    ]);
    expect(first.sourceRecord.relatedSourceRefs).toEqual(task.relatedSourceRefs);
    expect(first.sourceRecord.relatedCaseRefs).toEqual(task.relatedCaseRefs);
    expect(first.sourceRecord.accessClassification).toBe("CONFIDENTIAL");

    const replay = await importer.importReply(task.taskId);
    expect(replay.sourceRecord).toEqual(first.sourceRecord);
    expect(repo.listSourceRecordsForTask(task.taskId)).toEqual([first.sourceRecord]);
    expect(requests).toHaveLength(2);
    expect(requests[0]?.url).toBe(
      "https://core.example.test/internal/v1/managed-communication/thread-resolutions",
    );
    expect(await requests[0]?.json()).toEqual({
      accountRef: "account:expert-mailbox",
      threadRef: "commthread_001",
    });
  });

  it("preserves attachment references only when Core retains original checksums", async () => {
    const repo = repository();
    const task = waiting(repo);
    const importer = new CoreExpertReplyImporter(repo, {
      workspaceId,
      coreUrl: "https://core.example.test",
      authorization,
      configJson,
      now: () => new Date("2026-08-27T05:20:00.000Z"),
      fetchImpl: async () =>
        Response.json(
          resolution({
            attachments: [
              {
                attachmentRef: "commatt_001",
                fileName: "evidence.pdf",
                mediaType: "application/pdf",
                sizeBytes: 120,
                sha256: "a".repeat(64),
              },
            ],
          }),
        ),
    });

    const imported = await importer.importReply(task.taskId);
    expect(imported.sourceRecord.attachmentRefs).toEqual(["commatt_001"]);
  });

  it("fails closed on sender mismatch without moving task state or persisting evidence", async () => {
    const repo = repository();
    const task = waiting(repo);
    const importer = new CoreExpertReplyImporter(repo, {
      workspaceId,
      coreUrl: "https://core.example.test",
      authorization,
      configJson,
      now: () => new Date("2026-08-27T05:20:00.000Z"),
      fetchImpl: async () =>
        Response.json(
          resolution({
            participants: [
              { role: "SENDER", address: "other@example.test" },
              { role: "TO", address: "knowledge@example.test" },
            ],
          }),
        ),
    });

    await expect(importer.importReply(task.taskId)).rejects.toMatchObject({
      code: "EXPERT_REPLY_SENDER_MISMATCH",
    });
    expect(repo.getTask(task.taskId)?.state).toBe("WAITING_RESPONSE");
    expect(repo.listSourceRecordsForTask(task.taskId)).toEqual([]);
  });

  it("does not treat outbound-only thread evidence as an Expert reply", async () => {
    const repo = repository();
    const task = waiting(repo);
    const importer = new CoreExpertReplyImporter(repo, {
      workspaceId,
      coreUrl: "https://core.example.test",
      authorization,
      configJson,
      now: () => new Date("2026-08-27T05:20:00.000Z"),
      fetchImpl: async () => Response.json(resolution({ direction: "OUTBOUND" })),
    });

    await expect(importer.importReply(task.taskId)).rejects.toMatchObject({
      code: "EXPERT_REPLY_NOT_OBSERVED",
    });
    expect(repo.getTask(task.taskId)?.state).toBe("WAITING_RESPONSE");
    expect(repo.listSourceRecordsForTask(task.taskId)).toEqual([]);
  });
});
