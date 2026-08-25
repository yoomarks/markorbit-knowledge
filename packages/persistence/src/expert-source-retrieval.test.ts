import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import type { ExpertQuestionTaskV1, ExpertSourceRecordV1 } from "@markorbit/contracts";
import { SqliteExpertSourceRepository } from "./expert-source-registry";
import { SqliteExpertSourceRetrievalRepository } from "./expert-source-retrieval";

function persistExpertSource(
  repository: SqliteExpertSourceRepository,
  input: {
    suffix: string;
    jurisdiction: string;
    topic: string;
    expertRef: string;
    organizationRef?: string;
    receivedAt: string;
    relatedSourceRefs?: string[];
    relatedCaseRefs?: string[];
  },
): ExpertSourceRecordV1 {
  const taskId = `eqt_${input.suffix}`;
  const base: ExpertQuestionTaskV1 = {
    protocolVersion: "1.0",
    objectType: "EXPERT_QUESTION_TASK",
    taskId,
    topic: input.topic,
    jurisdiction: input.jurisdiction,
    question: `Question ${input.suffix}`,
    expertRef: input.expertRef,
    ...(input.organizationRef ? { organizationRef: input.organizationRef } : {}),
    requestedBy: "user:test",
    state: "DRAFT",
    createdAt: "2026-08-25T00:00:00.000Z",
    relatedSourceRefs: input.relatedSourceRefs ?? [],
    relatedCaseRefs: input.relatedCaseRefs ?? [],
    accessClassification: "CONFIDENTIAL",
  };
  repository.saveTask(base);
  repository.saveTask({ ...base, state: "READY_TO_SEND" });
  repository.saveTask({
    ...base,
    state: "SENT",
    communicationSendRequestRef: `comm:send:${input.suffix}`,
    communicationThreadRef: `comm:thread:${input.suffix}`,
    sentAt: "2026-08-25T00:30:00.000Z",
  });

  const record: ExpertSourceRecordV1 = {
    protocolVersion: "1.0",
    objectType: "EXPERT_SOURCE_RECORD",
    sourceRecordId: `esr_${input.suffix}`,
    taskId,
    expertRef: input.expertRef,
    ...(input.organizationRef ? { organizationRef: input.organizationRef } : {}),
    jurisdiction: input.jurisdiction,
    topic: input.topic,
    communication: {
      communicationThreadRef: `comm:thread:${input.suffix}`,
      messageRefs: [`comm:message:${input.suffix}`],
    },
    rawAnswerArtifactRefs: [`raw:answer:${input.suffix}`],
    attachmentRefs: [],
    receivedAt: input.receivedAt,
    capturedAt: input.receivedAt,
    relatedSourceRefs: input.relatedSourceRefs ?? [],
    relatedCaseRefs: input.relatedCaseRefs ?? [],
    provenance: {
      sourceFamily: "EXPERT",
      originalEvidenceAuthoritative: true,
      normalizedDerivativeIsOriginalEvidence: false,
    },
    accessClassification: "CONFIDENTIAL",
  };
  return repository.saveSourceRecord(record);
}

describe("SqliteExpertSourceRetrievalRepository", () => {
  it("filters by jurisdiction, topic, expert and organization while preserving provenance", () => {
    const database = new DatabaseSync(":memory:");
    const writer = new SqliteExpertSourceRepository(database);
    const expected = persistExpertSource(writer, {
      suffix: "us_section8",
      jurisdiction: "US",
      topic: "SECTION_8",
      expertRef: "expert:us:001",
      organizationRef: "org:firm:001",
      receivedAt: "2026-08-25T03:00:00.000Z",
    });
    persistExpertSource(writer, {
      suffix: "au_renewal",
      jurisdiction: "AU",
      topic: "RENEWAL",
      expertRef: "expert:au:001",
      organizationRef: "org:firm:002",
      receivedAt: "2026-08-25T04:00:00.000Z",
    });

    const retrieval = new SqliteExpertSourceRetrievalRepository(database);
    const result = retrieval.search({
      jurisdiction: "US",
      topic: "SECTION_8",
      expertRef: "expert:us:001",
      organizationRef: "org:firm:001",
    });

    expect(result.total).toBe(1);
    expect(result.items).toEqual([expected]);
    expect(result.items[0]?.provenance).toEqual({
      sourceFamily: "EXPERT",
      originalEvidenceAuthoritative: true,
      normalizedDerivativeIsOriginalEvidence: false,
    });
    database.close();
  });

  it("filters by received window and related source/case refs", () => {
    const database = new DatabaseSync(":memory:");
    const writer = new SqliteExpertSourceRepository(database);
    const expected = persistExpertSource(writer, {
      suffix: "ca_case",
      jurisdiction: "CA",
      topic: "EXAMINATION",
      expertRef: "expert:ca:001",
      receivedAt: "2026-08-25T05:00:00.000Z",
      relatedSourceRefs: ["source:cipo:manual"],
      relatedCaseRefs: ["case:litemove:2384163"],
    });
    persistExpertSource(writer, {
      suffix: "ca_other",
      jurisdiction: "CA",
      topic: "EXAMINATION",
      expertRef: "expert:ca:002",
      receivedAt: "2026-08-25T07:00:00.000Z",
      relatedSourceRefs: ["source:cipo:manual"],
      relatedCaseRefs: ["case:other"],
    });

    const retrieval = new SqliteExpertSourceRetrievalRepository(database);
    const result = retrieval.search({
      receivedFrom: "2026-08-25T04:30:00Z",
      receivedTo: "2026-08-25T05:30:00Z",
      relatedSourceRef: "source:cipo:manual",
      relatedCaseRef: "case:litemove:2384163",
    });

    expect(result.total).toBe(1);
    expect(result.items).toEqual([expected]);
    expect(result.filters.receivedFrom).toBe("2026-08-25T04:30:00.000Z");
    expect(result.filters.receivedTo).toBe("2026-08-25T05:30:00.000Z");
    database.close();
  });

  it("returns newest records first and paginates deterministically", () => {
    const database = new DatabaseSync(":memory:");
    const writer = new SqliteExpertSourceRepository(database);
    persistExpertSource(writer, {
      suffix: "one",
      jurisdiction: "US",
      topic: "TOPIC",
      expertRef: "expert:one",
      receivedAt: "2026-08-25T01:00:00.000Z",
    });
    const second = persistExpertSource(writer, {
      suffix: "two",
      jurisdiction: "US",
      topic: "TOPIC",
      expertRef: "expert:two",
      receivedAt: "2026-08-25T02:00:00.000Z",
    });
    const third = persistExpertSource(writer, {
      suffix: "three",
      jurisdiction: "US",
      topic: "TOPIC",
      expertRef: "expert:three",
      receivedAt: "2026-08-25T03:00:00.000Z",
    });

    const retrieval = new SqliteExpertSourceRetrievalRepository(database);
    expect(retrieval.search({ jurisdiction: "US", limit: 2 }).items).toEqual([third, second]);
    expect(retrieval.search({ jurisdiction: "US", limit: 1, offset: 1 }).items).toEqual([
      second,
    ]);
    database.close();
  });

  it("rejects invalid pagination and reversed date windows", () => {
    const database = new DatabaseSync(":memory:");
    const retrieval = new SqliteExpertSourceRetrievalRepository(database);

    expect(() => retrieval.search({ limit: 0 })).toThrowError(/positive integer/u);
    expect(() => retrieval.search({ limit: 101 })).toThrowError(/must not exceed 100/u);
    expect(() => retrieval.search({ offset: -1 })).toThrowError(/non-negative integer/u);
    expect(() =>
      retrieval.search({
        receivedFrom: "2026-08-26T00:00:00Z",
        receivedTo: "2026-08-25T00:00:00Z",
      }),
    ).toThrowError(/receivedFrom must not be after receivedTo/u);
    database.close();
  });
});
