export const EXPERT_SOURCE_PROTOCOL_VERSION = "1.0" as const;
export const EXPERT_QUESTION_TASK_OBJECT_TYPE = "EXPERT_QUESTION_TASK" as const;
export const EXPERT_SOURCE_RECORD_OBJECT_TYPE = "EXPERT_SOURCE_RECORD" as const;

export const EXPERT_QUESTION_STATES = [
  "DRAFT",
  "READY_TO_SEND",
  "SENT",
  "WAITING_RESPONSE",
  "RESPONSE_RECEIVED",
  "NEEDS_FOLLOW_UP",
  "CAPTURED",
  "CLOSED",
] as const;

export const EXPERT_ACCESS_CLASSIFICATIONS = ["INTERNAL", "CONFIDENTIAL", "RESTRICTED"] as const;

export type ExpertQuestionState = (typeof EXPERT_QUESTION_STATES)[number];
export type ExpertAccessClassification = (typeof EXPERT_ACCESS_CLASSIFICATIONS)[number];

/**
 * Opaque reference owned by the shared Communication Capability.
 * Knowledge may correlate by these references but must not reinterpret or
 * reimplement provider transport semantics.
 */
export type ExpertCommunicationCorrelationV1 = {
  communicationThreadRef: string;
  messageRefs: readonly string[];
};

export type ExpertQuestionTaskV1 = {
  protocolVersion: typeof EXPERT_SOURCE_PROTOCOL_VERSION;
  objectType: typeof EXPERT_QUESTION_TASK_OBJECT_TYPE;
  taskId: string;
  topic: string;
  jurisdiction: string;
  question: string;
  expertRef: string;
  organizationRef?: string;
  requestedBy: string;
  /** Stable idempotency/correlation reference owned by shared Communication. */
  communicationSendRequestRef?: string;
  communicationThreadRef?: string;
  state: ExpertQuestionState;
  createdAt: string;
  sentAt?: string;
  closedAt?: string;
  relatedSourceRefs: readonly string[];
  relatedCaseRefs: readonly string[];
  accessClassification: ExpertAccessClassification;
};

export type ExpertSourceRecordV1 = {
  protocolVersion: typeof EXPERT_SOURCE_PROTOCOL_VERSION;
  objectType: typeof EXPERT_SOURCE_RECORD_OBJECT_TYPE;
  sourceRecordId: string;
  taskId: string;
  expertRef: string;
  organizationRef?: string;
  jurisdiction: string;
  topic: string;
  communication: ExpertCommunicationCorrelationV1;
  rawAnswerArtifactRefs: readonly string[];
  normalizedDerivativeRef?: string;
  attachmentRefs: readonly string[];
  receivedAt: string;
  capturedAt: string;
  relatedSourceRefs: readonly string[];
  relatedCaseRefs: readonly string[];
  provenance: {
    sourceFamily: "EXPERT";
    originalEvidenceAuthoritative: true;
    normalizedDerivativeIsOriginalEvidence: false;
  };
  accessClassification: ExpertAccessClassification;
};

const ID = /^[a-z][a-z0-9_:-]{2,255}$/u;
const SENT_OR_LATER = new Set<ExpertQuestionState>([
  "SENT",
  "WAITING_RESPONSE",
  "RESPONSE_RECEIVED",
  "NEEDS_FOLLOW_UP",
  "CAPTURED",
  "CLOSED",
]);
const FORBIDDEN_SEMANTIC_KEYS = new Set([
  "expertScore",
  "authorityScore",
  "recommendedExpert",
  "truthScore",
  "legalTruthVerified",
  "successProbability",
  "recommendation",
]);

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function timestamp(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && !Number.isNaN(Date.parse(value));
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function identifier(value: unknown): value is string {
  return typeof value === "string" && ID.test(value);
}

function refs(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => nonEmpty(item));
}

function uniqueRefs(value: unknown): value is string[] {
  return refs(value) && new Set(value).size === value.length;
}

function optionalNonEmpty(value: unknown): value is string | undefined {
  return value === undefined || nonEmpty(value);
}

function optionalTimestamp(value: unknown): value is string | undefined {
  return value === undefined || timestamp(value);
}

function hasForbiddenSemanticKey(value: Record<string, unknown>): boolean {
  return Object.keys(value).some((key) => FORBIDDEN_SEMANTIC_KEYS.has(key));
}

function onlyAllowedKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  const set = new Set(allowed);
  return Object.keys(value).every((key) => set.has(key));
}

export function isExpertCommunicationCorrelationV1(
  value: unknown,
): value is ExpertCommunicationCorrelationV1 {
  const item = record(value);
  if (!item || !onlyAllowedKeys(item, ["communicationThreadRef", "messageRefs"])) {
    return false;
  }
  return (
    nonEmpty(item.communicationThreadRef) &&
    uniqueRefs(item.messageRefs) &&
    (item.messageRefs as string[]).length > 0
  );
}

export function isExpertQuestionTaskV1(value: unknown): value is ExpertQuestionTaskV1 {
  const item = record(value);
  if (
    !item ||
    hasForbiddenSemanticKey(item) ||
    !onlyAllowedKeys(item, [
      "protocolVersion",
      "objectType",
      "taskId",
      "topic",
      "jurisdiction",
      "question",
      "expertRef",
      "organizationRef",
      "requestedBy",
      "communicationSendRequestRef",
      "communicationThreadRef",
      "state",
      "createdAt",
      "sentAt",
      "closedAt",
      "relatedSourceRefs",
      "relatedCaseRefs",
      "accessClassification",
    ])
  ) {
    return false;
  }
  const stateValid = EXPERT_QUESTION_STATES.includes(item.state as ExpertQuestionState);
  const accessValid = EXPERT_ACCESS_CLASSIFICATIONS.includes(
    item.accessClassification as ExpertAccessClassification,
  );
  if (!stateValid || !accessValid) return false;

  const sentOrLater = SENT_OR_LATER.has(item.state as ExpertQuestionState);
  const lifecycleValid = sentOrLater
    ? nonEmpty(item.communicationSendRequestRef) && timestamp(item.sentAt)
    : item.sentAt === undefined;
  const closureValid =
    item.state === "CLOSED" ? timestamp(item.closedAt) : item.closedAt === undefined;

  return (
    item.protocolVersion === EXPERT_SOURCE_PROTOCOL_VERSION &&
    item.objectType === EXPERT_QUESTION_TASK_OBJECT_TYPE &&
    identifier(item.taskId) &&
    nonEmpty(item.topic) &&
    nonEmpty(item.jurisdiction) &&
    nonEmpty(item.question) &&
    nonEmpty(item.expertRef) &&
    optionalNonEmpty(item.organizationRef) &&
    nonEmpty(item.requestedBy) &&
    optionalNonEmpty(item.communicationSendRequestRef) &&
    optionalNonEmpty(item.communicationThreadRef) &&
    timestamp(item.createdAt) &&
    optionalTimestamp(item.sentAt) &&
    optionalTimestamp(item.closedAt) &&
    refs(item.relatedSourceRefs) &&
    refs(item.relatedCaseRefs) &&
    lifecycleValid &&
    closureValid
  );
}

export function assertExpertQuestionTaskV1(value: unknown): asserts value is ExpertQuestionTaskV1 {
  if (!isExpertQuestionTaskV1(value)) {
    throw new TypeError("Invalid ExpertQuestionTaskV1");
  }
}

export function isExpertSourceRecordV1(value: unknown): value is ExpertSourceRecordV1 {
  const item = record(value);
  if (
    !item ||
    hasForbiddenSemanticKey(item) ||
    !onlyAllowedKeys(item, [
      "protocolVersion",
      "objectType",
      "sourceRecordId",
      "taskId",
      "expertRef",
      "organizationRef",
      "jurisdiction",
      "topic",
      "communication",
      "rawAnswerArtifactRefs",
      "normalizedDerivativeRef",
      "attachmentRefs",
      "receivedAt",
      "capturedAt",
      "relatedSourceRefs",
      "relatedCaseRefs",
      "provenance",
      "accessClassification",
    ])
  ) {
    return false;
  }
  const provenance = record(item.provenance);
  const accessValid = EXPERT_ACCESS_CLASSIFICATIONS.includes(
    item.accessClassification as ExpertAccessClassification,
  );
  return (
    item.protocolVersion === EXPERT_SOURCE_PROTOCOL_VERSION &&
    item.objectType === EXPERT_SOURCE_RECORD_OBJECT_TYPE &&
    identifier(item.sourceRecordId) &&
    identifier(item.taskId) &&
    nonEmpty(item.expertRef) &&
    optionalNonEmpty(item.organizationRef) &&
    nonEmpty(item.jurisdiction) &&
    nonEmpty(item.topic) &&
    isExpertCommunicationCorrelationV1(item.communication) &&
    uniqueRefs(item.rawAnswerArtifactRefs) &&
    (item.rawAnswerArtifactRefs as string[]).length > 0 &&
    optionalNonEmpty(item.normalizedDerivativeRef) &&
    refs(item.attachmentRefs) &&
    timestamp(item.receivedAt) &&
    timestamp(item.capturedAt) &&
    refs(item.relatedSourceRefs) &&
    refs(item.relatedCaseRefs) &&
    provenance !== null &&
    onlyAllowedKeys(provenance, [
      "sourceFamily",
      "originalEvidenceAuthoritative",
      "normalizedDerivativeIsOriginalEvidence",
    ]) &&
    provenance.sourceFamily === "EXPERT" &&
    provenance.originalEvidenceAuthoritative === true &&
    provenance.normalizedDerivativeIsOriginalEvidence === false &&
    accessValid
  );
}

export function assertExpertSourceRecordV1(value: unknown): asserts value is ExpertSourceRecordV1 {
  if (!isExpertSourceRecordV1(value)) {
    throw new TypeError("Invalid ExpertSourceRecordV1");
  }
}
