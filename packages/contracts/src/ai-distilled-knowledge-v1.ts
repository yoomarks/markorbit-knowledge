export const AI_DISTILLED_KNOWLEDGE_PROTOCOL_VERSION = "1.0" as const;
export const AI_KNOWLEDGE_ASSIGNMENT_OBJECT_TYPE = "AI_KNOWLEDGE_ASSIGNMENT" as const;
export const AI_RESEARCH_SUBMISSION_OBJECT_TYPE = "AI_RESEARCH_SUBMISSION" as const;
export const AI_DISTILLED_KNOWLEDGE_ARTIFACT_OBJECT_TYPE =
  "AI_DISTILLED_KNOWLEDGE_ARTIFACT" as const;

export const AI_KNOWLEDGE_PROVIDERS = [
  "DEEPSEEK",
  "OPENAI",
  "KIMI",
  "CLAUDE",
  "GEMINI",
] as const;

export type AiKnowledgeProvider = (typeof AI_KNOWLEDGE_PROVIDERS)[number];

export type AiKnowledgeAssignmentV1 = {
  protocolVersion: typeof AI_DISTILLED_KNOWLEDGE_PROTOCOL_VERSION;
  objectType: typeof AI_KNOWLEDGE_ASSIGNMENT_OBJECT_TYPE;
  assignmentId: string;
  jurisdiction: string;
  domain: string;
  topic: string;
  title: string;
  instructionSetId: string;
  instructionSetRevision: number;
  language: string;
  prompt: string;
  createdAt: string;
};

export type AiResearchSubmissionV1 = {
  protocolVersion: typeof AI_DISTILLED_KNOWLEDGE_PROTOCOL_VERSION;
  objectType: typeof AI_RESEARCH_SUBMISSION_OBJECT_TYPE;
  submissionId: string;
  assignmentId: string;
  provider: AiKnowledgeProvider;
  model: string;
  requestedAt: string;
  completedAt: string;
  promptSha256: string;
  rawResponseSha256: string;
  markdownSha256: string;
  markdownSizeBytes: number;
  providerRequestId?: string;
};

export type AiDistilledKnowledgeArtifactV1 = {
  protocolVersion: typeof AI_DISTILLED_KNOWLEDGE_PROTOCOL_VERSION;
  objectType: typeof AI_DISTILLED_KNOWLEDGE_ARTIFACT_OBJECT_TYPE;
  artifactId: string;
  assignmentId: string;
  submissionId: string;
  provider: AiKnowledgeProvider;
  model: string;
  instructionSetId: string;
  instructionSetRevision: number;
  provenance: {
    sourceKind: "SYNTHETIC_AI";
    legalTruthVerified: false;
    rawResponseSha256: string;
    promptSha256: string;
  };
  content: {
    mediaType: "text/markdown";
    encoding: "utf-8";
    sha256: string;
    sizeBytes: number;
    contentAddressedRef: string;
    content: string;
  };
  createdAt: string;
};

const SHA256 = /^[a-f0-9]{64}$/u;
const ID = /^[a-z][a-z0-9_]{2,127}$/u;

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(value);
  return keys.length === expected.length && expected.every((key) => keys.includes(key));
}

function timestamp(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function isAiKnowledgeAssignmentV1(value: unknown): value is AiKnowledgeAssignmentV1 {
  const item = record(value);
  if (
    !item ||
    !exactKeys(item, [
      "protocolVersion",
      "objectType",
      "assignmentId",
      "jurisdiction",
      "domain",
      "topic",
      "title",
      "instructionSetId",
      "instructionSetRevision",
      "language",
      "prompt",
      "createdAt",
    ])
  ) {
    return false;
  }
  return (
    item.protocolVersion === AI_DISTILLED_KNOWLEDGE_PROTOCOL_VERSION &&
    item.objectType === AI_KNOWLEDGE_ASSIGNMENT_OBJECT_TYPE &&
    typeof item.assignmentId === "string" &&
    item.assignmentId.startsWith("kas_") &&
    ID.test(item.assignmentId) &&
    nonEmpty(item.jurisdiction) &&
    nonEmpty(item.domain) &&
    nonEmpty(item.topic) &&
    nonEmpty(item.title) &&
    typeof item.instructionSetId === "string" &&
    item.instructionSetId.startsWith("kis_") &&
    ID.test(item.instructionSetId) &&
    Number.isSafeInteger(item.instructionSetRevision) &&
    (item.instructionSetRevision as number) > 0 &&
    nonEmpty(item.language) &&
    nonEmpty(item.prompt) &&
    timestamp(item.createdAt)
  );
}

export function assertAiKnowledgeAssignmentV1(
  value: unknown,
): asserts value is AiKnowledgeAssignmentV1 {
  if (!isAiKnowledgeAssignmentV1(value)) {
    throw new TypeError("Invalid AiKnowledgeAssignmentV1");
  }
}

export function isAiResearchSubmissionV1(value: unknown): value is AiResearchSubmissionV1 {
  const item = record(value);
  if (!item) return false;
  const expected = [
    "protocolVersion",
    "objectType",
    "submissionId",
    "assignmentId",
    "provider",
    "model",
    "requestedAt",
    "completedAt",
    "promptSha256",
    "rawResponseSha256",
    "markdownSha256",
    "markdownSizeBytes",
  ];
  if ("providerRequestId" in item) expected.push("providerRequestId");
  if (!exactKeys(item, expected)) return false;
  return (
    item.protocolVersion === AI_DISTILLED_KNOWLEDGE_PROTOCOL_VERSION &&
    item.objectType === AI_RESEARCH_SUBMISSION_OBJECT_TYPE &&
    typeof item.submissionId === "string" &&
    item.submissionId.startsWith("ars_") &&
    ID.test(item.submissionId) &&
    typeof item.assignmentId === "string" &&
    item.assignmentId.startsWith("kas_") &&
    ID.test(item.assignmentId) &&
    typeof item.provider === "string" &&
    (AI_KNOWLEDGE_PROVIDERS as readonly string[]).includes(item.provider) &&
    nonEmpty(item.model) &&
    timestamp(item.requestedAt) &&
    timestamp(item.completedAt) &&
    typeof item.promptSha256 === "string" &&
    SHA256.test(item.promptSha256) &&
    typeof item.rawResponseSha256 === "string" &&
    SHA256.test(item.rawResponseSha256) &&
    typeof item.markdownSha256 === "string" &&
    SHA256.test(item.markdownSha256) &&
    Number.isSafeInteger(item.markdownSizeBytes) &&
    (item.markdownSizeBytes as number) >= 0 &&
    (item.providerRequestId === undefined || nonEmpty(item.providerRequestId))
  );
}
