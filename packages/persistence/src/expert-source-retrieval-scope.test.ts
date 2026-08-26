import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import type { ExpertQuestionTaskV1, ExpertSourceRecordV1 } from "@markorbit/contracts";
import { SqliteExpertSourceRepository } from "./expert-source-registry";
import { SqliteExpertSourceRetrievalRepository } from "./expert-source-retrieval";

function persist(repository: SqliteExpertSourceRepository, suffix: string, receivedAt: string) {
  const taskId = `eqt_${suffix}`;
  const draft: ExpertQuestionTaskV1 = {
    protocolVersion: "1.0",
    objectType: "EXPERT_QUESTION_TASK",
    taskId,
    topic: "TOPIC",
    jurisdiction: "US",
    question: `Question ${suffix}`,
    expertRef: `expert:${suffix}`,
    requestedBy: "user:test",
    state: "DRAFT",
    createdAt: "2026-08-26T00:00:00.000Z",
    relatedSourceRefs: [],
    relatedCaseRefs: [],
    accessClassification: "CONFIDENTIAL",
  };
  repository.saveTask(draft);
  repository.saveTask({ ...draft, state: "READY_TO_SEND" });
  const sent = repository.saveTask({
    ...draft,
    state: "SENT",
    communicationSendRequestRef: `comm:send:${suffix}`,
    communicationThreadRef: `comm:thread:${suffix}`,
    sentAt: "2026-08-26T00:30:00.000Z",
  });
  const record: ExpertSourceRecordV1 = {
    protocolVersion: "1.0",
    objectType: "EXPERT_SOURCE_RECORD",
    sourceRecordId: `esr_${suffix}`,
    taskId,
    expertRef: sent.expertRef,
    jurisdiction: sent.jurisdiction,
    topic: sent.topic,
    communication: {
      communicationThreadRef: sent.communicationThreadRef!,
      messageRefs: [`comm:message:${suffix}`],
    },
    rawAnswerArtifactRefs: [`raw:${suffix}`],
    attachmentRefs: [],
    receivedAt,
    capturedAt: receivedAt,
    relatedSourceRefs: [],
    relatedCaseRefs: [],
    provenance: {
      sourceFamily: "EXPERT",
      originalEvidenceAuthoritative: true,
      normalizedDerivativeIsOriginalEvidence: false,
    },
    accessClassification: "CONFIDENTIAL",
  };
  return repository.saveSourceRecord(record);
}

describe("Expert source retrieval authorization scope", () => {
  it("filters by authorized task before total and pagination are computed", () => {
    const database = new DatabaseSync(":memory:");
    const writer = new SqliteExpertSourceRepository(database);
    const allowedOld = persist(writer, "allowed_old", "2026-08-26T01:00:00.000Z");
    persist(writer, "other_new", "2026-08-26T03:00:00.000Z");
    const allowedNew = persist(writer, "allowed_new", "2026-08-26T02:00:00.000Z");

    const retrieval = new SqliteExpertSourceRetrievalRepository(database);
    const scoped = retrieval.search(
      { limit: 1, offset: 0 },
      { taskIds: [allowedOld.taskId, allowedNew.taskId] },
    );
    expect(scoped.total).toBe(2);
    expect(scoped.items).toEqual([allowedNew]);

    const secondPage = retrieval.search(
      { limit: 1, offset: 1 },
      { taskIds: [allowedOld.taskId, allowedNew.taskId] },
    );
    expect(secondPage.total).toBe(2);
    expect(secondPage.items).toEqual([allowedOld]);

    const empty = retrieval.search({}, { taskIds: [] });
    expect(empty.total).toBe(0);
    expect(empty.items).toEqual([]);
    database.close();
  });
});
