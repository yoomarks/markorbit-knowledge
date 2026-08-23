import { describe, expect, it } from "vitest";
import {
  AI_DISTILLED_KNOWLEDGE_PROTOCOL_VERSION,
  AI_KNOWLEDGE_ASSIGNMENT_OBJECT_TYPE,
  isAiKnowledgeAssignmentV1,
  isAiResearchSubmissionV1,
} from "./ai-distilled-knowledge-v1";

const assignment = {
  protocolVersion: AI_DISTILLED_KNOWLEDGE_PROTOCOL_VERSION,
  objectType: AI_KNOWLEDGE_ASSIGNMENT_OBJECT_TYPE,
  assignmentId: "kas_us_trademark_section8",
  jurisdiction: "US",
  domain: "TRADEMARK",
  topic: "DECLARATION_OF_USE",
  title: "United States Trademark Declaration of Use",
  instructionSetId: "kis_trademark_procedure",
  instructionSetRevision: 1,
  language: "zh-CN",
  prompt: "Write a comprehensive Markdown research memo about U.S. trademark declarations of use.",
  createdAt: "2026-08-23T03:00:00.000Z",
} as const;

describe("AI distilled knowledge contracts", () => {
  it("accepts one exact versioned knowledge assignment", () => {
    expect(isAiKnowledgeAssignmentV1(assignment)).toBe(true);
  });

  it("fails closed when an assignment carries undeclared fields", () => {
    expect(isAiKnowledgeAssignmentV1({ ...assignment, legalTruthVerified: true })).toBe(false);
  });

  it("accepts a provider submission with frozen content hashes", () => {
    expect(
      isAiResearchSubmissionV1({
        protocolVersion: "1.0",
        objectType: "AI_RESEARCH_SUBMISSION",
        submissionId: "ars_1234567890abcdef1234567890abcdef",
        assignmentId: assignment.assignmentId,
        provider: "DEEPSEEK",
        model: "deepseek-chat",
        requestedAt: "2026-08-23T03:00:01.000Z",
        completedAt: "2026-08-23T03:00:03.000Z",
        promptSha256: "a".repeat(64),
        rawResponseSha256: "b".repeat(64),
        markdownSha256: "c".repeat(64),
        markdownSizeBytes: 1024,
        providerRequestId: "req_123",
      }),
    ).toBe(true);
  });
});
