import { describe, expect, it } from "vitest";
import {
  assertExpertQuestionTaskV1,
  assertExpertSourceRecordV1,
  isExpertCommunicationCorrelationV1,
  isExpertQuestionTaskV1,
  isExpertSourceRecordV1,
  type ExpertQuestionTaskV1,
  type ExpertSourceRecordV1,
} from "./expert-source-v1";

const task: ExpertQuestionTaskV1 = {
  protocolVersion: "1.0",
  objectType: "EXPERT_QUESTION_TASK",
  taskId: "eqt_us_section8_001",
  topic: "SECTION_8_DECLARATION",
  jurisdiction: "US",
  question: "What evidence is normally accepted for this filing scenario?",
  expertRef: "expert:us:outside-counsel-001",
  organizationRef: "org:outside-firm-001",
  requestedBy: "user:operator-001",
  communicationSendRequestRef: "comm:send-request:001",
  communicationThreadRef: "comm:thread:001",
  state: "WAITING_RESPONSE",
  createdAt: "2026-08-25T01:00:00.000Z",
  sentAt: "2026-08-25T01:01:00.000Z",
  relatedSourceRefs: ["source:uspto:section8"],
  relatedCaseRefs: [],
  accessClassification: "CONFIDENTIAL",
};

const record: ExpertSourceRecordV1 = {
  protocolVersion: "1.0",
  objectType: "EXPERT_SOURCE_RECORD",
  sourceRecordId: "esr_us_section8_001",
  taskId: task.taskId,
  expertRef: task.expertRef,
  organizationRef: task.organizationRef,
  jurisdiction: task.jurisdiction,
  topic: task.topic,
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
};

describe("Expert source V1 contracts", () => {
  it("accepts a governed question task and durable Expert source record", () => {
    expect(isExpertQuestionTaskV1(task)).toBe(true);
    expect(isExpertSourceRecordV1(record)).toBe(true);
    expect(() => assertExpertQuestionTaskV1(task)).not.toThrow();
    expect(() => assertExpertSourceRecordV1(record)).not.toThrow();
  });

  it("supports multiple correlated reply messages and attachments without scoring the expert", () => {
    const followUp: ExpertSourceRecordV1 = {
      ...record,
      communication: {
        communicationThreadRef: "comm:thread:001",
        messageRefs: [
          "comm:message:outbound-001",
          "comm:message:inbound-001",
          "comm:message:outbound-002",
          "comm:message:inbound-002",
        ],
      },
      rawAnswerArtifactRefs: ["raw:sha256:answer-001", "raw:sha256:answer-002"],
      attachmentRefs: ["comm:attachment:001", "comm:attachment:002"],
    };

    expect(isExpertSourceRecordV1(followUp)).toBe(true);
    expect(Object.keys(followUp)).not.toContain("expertScore");
    expect(Object.keys(followUp)).not.toContain("truthScore");
  });

  it("requires at least one correlated Communication message for Expert evidence", () => {
    const withoutMessages = {
      ...record,
      communication: {
        ...record.communication,
        messageRefs: [],
      },
    };

    expect(
      isExpertCommunicationCorrelationV1({
        communicationThreadRef: "comm:thread:001",
        messageRefs: [],
      }),
    ).toBe(false);
    expect(isExpertSourceRecordV1(withoutMessages)).toBe(false);
    expect(() => assertExpertSourceRecordV1(withoutMessages)).toThrow(
      "Invalid ExpertSourceRecordV1",
    );
  });

  it("rejects duplicate evidence identity references", () => {
    const duplicateMessage = "comm:message:inbound-001";
    expect(
      isExpertCommunicationCorrelationV1({
        communicationThreadRef: "comm:thread:001",
        messageRefs: [duplicateMessage, duplicateMessage],
      }),
    ).toBe(false);
    expect(
      isExpertSourceRecordV1({
        ...record,
        communication: {
          ...record.communication,
          messageRefs: [...record.communication.messageRefs, duplicateMessage],
        },
      }),
    ).toBe(false);
    expect(
      isExpertSourceRecordV1({
        ...record,
        rawAnswerArtifactRefs: ["raw:sha256:answer-001", "raw:sha256:answer-001"],
      }),
    ).toBe(false);
  });

  it("rejects Brain-style scoring or truth fields", () => {
    expect(isExpertQuestionTaskV1({ ...task, expertScore: 0.98 })).toBe(false);
    expect(isExpertSourceRecordV1({ ...record, truthScore: 1 })).toBe(false);
    expect(isExpertSourceRecordV1({ ...record, legalTruthVerified: true })).toBe(false);
  });

  it("requires durable send correlation for sent states", () => {
    expect(isExpertQuestionTaskV1({ ...task, communicationSendRequestRef: undefined })).toBe(false);
    expect(isExpertQuestionTaskV1({ ...task, sentAt: undefined })).toBe(false);
    expect(
      isExpertQuestionTaskV1({
        ...task,
        state: "READY_TO_SEND",
        sentAt: undefined,
      }),
    ).toBe(true);
    expect(
      isExpertQuestionTaskV1({
        ...task,
        state: "READY_TO_SEND",
        sentAt: undefined,
        communicationSendRequestRef: undefined,
      }),
    ).toBe(true);
  });

  it("requires original answer evidence and fail-closes malformed lifecycle fields", () => {
    expect(isExpertSourceRecordV1({ ...record, rawAnswerArtifactRefs: [] })).toBe(false);
    expect(isExpertQuestionTaskV1({ ...task, state: "AUTO_APPROVED" })).toBe(false);
    expect(isExpertQuestionTaskV1({ ...task, createdAt: "not-a-date" })).toBe(false);
    expect(isExpertQuestionTaskV1({ ...task, state: "CLOSED", closedAt: undefined })).toBe(false);
    expect(() => assertExpertSourceRecordV1({ ...record, rawAnswerArtifactRefs: [] })).toThrow(
      "Invalid ExpertSourceRecordV1",
    );
  });
});
