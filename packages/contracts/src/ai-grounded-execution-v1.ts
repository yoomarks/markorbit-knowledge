export const AI_GROUNDED_EXECUTION_PROTOCOL_VERSION = "1.0" as const;
export const AI_GROUNDED_EXECUTION_ENVELOPE_OBJECT_TYPE = "AI_GROUNDED_EXECUTION_ENVELOPE" as const;
export const AI_GROUNDED_EXECUTION_STATUS = "PREPARED" as const;

export type AiGroundedExecutionSourceReceiptV1 = {
  sourceId: string;
  artifactId: string;
  canonicalUri: string;
  mediaType: string;
  contentSha256: string;
  sizeBytes: number;
};

export type AiGroundedExecutionEnvelopeV1 = {
  protocolVersion: typeof AI_GROUNDED_EXECUTION_PROTOCOL_VERSION;
  objectType: typeof AI_GROUNDED_EXECUTION_ENVELOPE_OBJECT_TYPE;
  status: typeof AI_GROUNDED_EXECUTION_STATUS;
  assignmentId: string;
  bindingId: string;
  sourcePackId: string;
  sourcePackRevision: number;
  rendererVersion: string;
  renderedPromptSha256: string;
  sourceReceiptsSha256: string;
  executionInputSha256: string;
  sourceReceipts: readonly AiGroundedExecutionSourceReceiptV1[];
  preparedAt: string;
  providerCallAuthorized: false;
  providerCallExecuted: false;
  externalBrowsingAllowed: false;
  legalTruthVerified: false;
  executionAuthorityGranted: false;
};

const SHA256 = /^[a-f0-9]{64}$/u;
const ADK_ID = /^[a-z][a-z0-9_]{2,127}$/u;
const SOURCE_ID = /^src_[0-9A-HJKMNP-TV-Z]{26}$/u;
const ARTIFACT_ID = /^art_[0-9A-HJKMNP-TV-Z]{26}$/u;

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(value);
  return keys.length === expected.length && expected.every((key) => keys.includes(key));
}

function absoluteHttpUri(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function sourceReceipt(value: unknown): value is AiGroundedExecutionSourceReceiptV1 {
  const item = record(value);
  return Boolean(
    item &&
      exactKeys(item, [
        "sourceId",
        "artifactId",
        "canonicalUri",
        "mediaType",
        "contentSha256",
        "sizeBytes",
      ]) &&
      typeof item.sourceId === "string" &&
      SOURCE_ID.test(item.sourceId) &&
      typeof item.artifactId === "string" &&
      ARTIFACT_ID.test(item.artifactId) &&
      absoluteHttpUri(item.canonicalUri) &&
      typeof item.mediaType === "string" &&
      item.mediaType.length > 0 &&
      typeof item.contentSha256 === "string" &&
      SHA256.test(item.contentSha256) &&
      Number.isSafeInteger(item.sizeBytes) &&
      (item.sizeBytes as number) > 0,
  );
}

function sourceReceipts(value: unknown): value is AiGroundedExecutionSourceReceiptV1[] {
  if (!Array.isArray(value) || value.length === 0 || !value.every(sourceReceipt)) return false;
  const sourceIds = value.map((item) => item.sourceId);
  const artifactIds = value.map((item) => item.artifactId);
  return new Set(sourceIds).size === sourceIds.length && new Set(artifactIds).size === artifactIds.length;
}

export function isAiGroundedExecutionEnvelopeV1(
  value: unknown,
): value is AiGroundedExecutionEnvelopeV1 {
  const item = record(value);
  if (
    !item ||
    !exactKeys(item, [
      "protocolVersion",
      "objectType",
      "status",
      "assignmentId",
      "bindingId",
      "sourcePackId",
      "sourcePackRevision",
      "rendererVersion",
      "renderedPromptSha256",
      "sourceReceiptsSha256",
      "executionInputSha256",
      "sourceReceipts",
      "preparedAt",
      "providerCallAuthorized",
      "providerCallExecuted",
      "externalBrowsingAllowed",
      "legalTruthVerified",
      "executionAuthorityGranted",
    ]) ||
    !sourceReceipts(item.sourceReceipts)
  ) {
    return false;
  }
  return (
    item.protocolVersion === AI_GROUNDED_EXECUTION_PROTOCOL_VERSION &&
    item.objectType === AI_GROUNDED_EXECUTION_ENVELOPE_OBJECT_TYPE &&
    item.status === AI_GROUNDED_EXECUTION_STATUS &&
    typeof item.assignmentId === "string" &&
    item.assignmentId.startsWith("kas_") &&
    ADK_ID.test(item.assignmentId) &&
    typeof item.bindingId === "string" &&
    item.bindingId.startsWith("asb_") &&
    ADK_ID.test(item.bindingId) &&
    typeof item.sourcePackId === "string" &&
    item.sourcePackId.startsWith("asp_") &&
    ADK_ID.test(item.sourcePackId) &&
    Number.isSafeInteger(item.sourcePackRevision) &&
    (item.sourcePackRevision as number) > 0 &&
    typeof item.rendererVersion === "string" &&
    /^\d+\.\d+\.\d+$/u.test(item.rendererVersion) &&
    typeof item.renderedPromptSha256 === "string" &&
    SHA256.test(item.renderedPromptSha256) &&
    typeof item.sourceReceiptsSha256 === "string" &&
    SHA256.test(item.sourceReceiptsSha256) &&
    typeof item.executionInputSha256 === "string" &&
    SHA256.test(item.executionInputSha256) &&
    typeof item.preparedAt === "string" &&
    Number.isFinite(Date.parse(item.preparedAt)) &&
    item.providerCallAuthorized === false &&
    item.providerCallExecuted === false &&
    item.externalBrowsingAllowed === false &&
    item.legalTruthVerified === false &&
    item.executionAuthorityGranted === false
  );
}

export function assertAiGroundedExecutionEnvelopeV1(
  value: unknown,
): asserts value is AiGroundedExecutionEnvelopeV1 {
  if (!isAiGroundedExecutionEnvelopeV1(value)) {
    throw new TypeError("Invalid AiGroundedExecutionEnvelopeV1");
  }
}
