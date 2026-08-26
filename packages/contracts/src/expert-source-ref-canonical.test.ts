import { describe, expect, it } from "vitest";
import {
  isExpertCommunicationCorrelationV1,
  isExpertQuestionTaskV1,
  isExpertSourceRecordV1,
  type ExpertQuestionTaskV1,
  type ExpertSourceRecordV1,
} from "./expert-source-v1";

const task: ExpertQuestionTaskV1 = {
  protocolVersion: "1.0",
  objectType: "EXPERT_QUESTION_TASK",
  taskId: "eqt_us_ref_canonical_001",
  topic: "SECTION_8_DECLARATION",
  jurisdiction: "US",
  question: "What evidence is normally accepted?",
  expertRef: "expert:us:outside-counsel-001",
  requestedBy: "user:operator-001",
  communicationSendRequestRef: "comm:send-request:001",
  communicationThreadRef: "comm:thread:001",
  state: "SENT",
  createdAt: "2026-08-25T01:00:00.000Z",
  sentAt: "2026-08-25T01:01:00.000Z",
  relatedSourceRefs: [],
  relatedCaseRefs: [],
  accessClassification: "CONFIDENTIAL",
};

const source: ExpertSourceRecordV1 = {
  protocolVersion: "1.0",
  objectType: "EXPERT_SOURCE_RECORD",
  sourceRecordId: "esr_us_ref_canonical_001",
  taskId: task.taskId,
  expertRef: task.expertRef,
  jurisdiction: task.jurisdiction,
  topic: task.topic,
  communication: {
    communicationThreadRef: "comm:thread:001",
    messageRefs: ["comm:message:outbound-001", "comm:message:inbound-001"],
  },
  rawAnswerArtifactRefs: ["raw:sha256:answer-001"],
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
};

describe("Expert evidence identity refs", () => {
  it("rejects surrounding whitespace in Communication correlation refs", () => {
    expect(
      isExpertCommunicationCorrelationV1({
        communicationThreadRef: " comm:thread:001",
        messageRefs: ["comm:message:inbound-001"],
      }),
    ).toBe(false);
    expect(
      isExpertCommunicationCorrelationV1({
        communicationThreadRef: "comm:thread:001",
        messageRefs: ["comm:message:inbound-001 "],
      }),
    ).toBe(false);
  });

  it("rejects surrounding whitespace in task Communication refs", () => {
    expect(
      isExpertQuestionTaskV1({
        ...task,
        communicationSendRequestRef: " comm:send-request:001",
      }),
    ).toBe(false);
    expect(
      isExpertQuestionTaskV1({
        ...task,
        communicationThreadRef: "comm:thread:001 ",
      }),
    ).toBe(false);
  });

  it("rejects surrounding whitespace in raw answer evidence refs", () => {
    expect(
      isExpertSourceRecordV1({
        ...source,
        rawAnswerArtifactRefs: [" raw:sha256:answer-001"],
      }),
    ).toBe(false);
  });
});
