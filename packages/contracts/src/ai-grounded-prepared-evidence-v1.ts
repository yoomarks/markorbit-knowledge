import type { AiGroundedExecutionSourceReceiptV1 } from "./ai-grounded-execution-v1";

export const AI_GROUNDED_PREPARED_EVIDENCE_PROTOCOL_VERSION = "1.0" as const;
export const AI_GROUNDED_PREPARED_EVIDENCE_OBJECT_TYPE =
  "AI_GROUNDED_PREPARED_EXECUTION_EVIDENCE" as const;

export type AiGroundedPreparedPromptArtifactLinkV1 = {
  artifactId: string;
  workspaceId: string;
  sourceId: string;
  contentSha256: string;
  sizeBytes: number;
  canonicalUri: string;
  sourceUri: string;
};

export type AiGroundedPreparedExecutionEvidenceV1 = {
  protocolVersion: typeof AI_GROUNDED_PREPARED_EVIDENCE_PROTOCOL_VERSION;
  objectType: typeof AI_GROUNDED_PREPARED_EVIDENCE_OBJECT_TYPE;
  executionInputSha256: string;
  assignmentId: string;
  bindingId: string;
  sourcePackId: string;
  sourcePackRevision: number;
  rendererVersion: string;
  renderedPromptSha256: string;
  sourceReceiptsSha256: string;
  sourceReceipts: readonly AiGroundedExecutionSourceReceiptV1[];
  promptArtifact: AiGroundedPreparedPromptArtifactLinkV1;
  canonicalPreparedAt: string;
  persistedAt: string;
  providerCallAuthorized: false;
  providerCallExecuted: false;
  externalBrowsingAllowed: false;
  legalTruthVerified: false;
  executionAuthorityGranted: false;
};

const SHA256 = /^[a-f0-9]{64}$/u;
const ADK_ID = /^[a-z][a-z0-9_]{2,127}$/u;
const CROCKFORD = "[0-9A-HJKMNP-TV-Z]{26}";
const ARTIFACT_ID = new RegExp(`^art_${CROCKFORD}$`, "u");
const WORKSPACE_ID = new RegExp(`^wsp_${CROCKFORD}$`, "u");
const SOURCE_ID = new RegExp(`^src_${CROCKFORD}$`, "u");

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(value);
  return keys.length === expected.length && expected.every((key) => keys.includes(key));
}

function rfc3339(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function uri(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z][A-Za-z0-9+.-]*:/u.test(value);
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
      typeof item.canonicalUri === "string" &&
      /^https?:\/\//u.test(item.canonicalUri) &&
      typeof item.mediaType === "string" &&
      item.mediaType.length > 0 &&
      typeof item.contentSha256 === "string" &&
      SHA256.test(item.contentSha256) &&
      Number.isSafeInteger(item.sizeBytes) &&
      (item.sizeBytes as number) > 0,
  );
}

function promptArtifactLink(value: unknown): value is AiGroundedPreparedPromptArtifactLinkV1 {
  const item = record(value);
  return Boolean(
    item &&
      exactKeys(item, [
        "artifactId",
        "workspaceId",
        "sourceId",
        "contentSha256",
        "sizeBytes",
        "canonicalUri",
        "sourceUri",
      ]) &&
      typeof item.artifactId === "string" &&
      ARTIFACT_ID.test(item.artifactId) &&
      typeof item.workspaceId === "string" &&
      WORKSPACE_ID.test(item.workspaceId) &&
      typeof item.sourceId === "string" &&
      SOURCE_ID.test(item.sourceId) &&
      typeof item.contentSha256 === "string" &&
      SHA256.test(item.contentSha256) &&
      Number.isSafeInteger(item.sizeBytes) &&
      (item.sizeBytes as number) > 0 &&
      uri(item.canonicalUri) &&
      uri(item.sourceUri),
  );
}

export function isAiGroundedPreparedExecutionEvidenceV1(
  value: unknown,
): value is AiGroundedPreparedExecutionEvidenceV1 {
  const item = record(value);
  if (
    !item ||
    !exactKeys(item, [
      "protocolVersion",
      "objectType",
      "executionInputSha256",
      "assignmentId",
      "bindingId",
      "sourcePackId",
      "sourcePackRevision",
      "rendererVersion",
      "renderedPromptSha256",
      "sourceReceiptsSha256",
      "sourceReceipts",
      "promptArtifact",
      "canonicalPreparedAt",
      "persistedAt",
      "providerCallAuthorized",
      "providerCallExecuted",
      "externalBrowsingAllowed",
      "legalTruthVerified",
      "executionAuthorityGranted",
    ]) ||
    !Array.isArray(item.sourceReceipts) ||
    item.sourceReceipts.length === 0 ||
    !item.sourceReceipts.every(sourceReceipt) ||
    !promptArtifactLink(item.promptArtifact)
  ) {
    return false;
  }
  const receipts = item.sourceReceipts as AiGroundedExecutionSourceReceiptV1[];
  return (
    new Set(receipts.map((entry) => entry.sourceId)).size === receipts.length &&
    new Set(receipts.map((entry) => entry.artifactId)).size === receipts.length &&
    item.protocolVersion === AI_GROUNDED_PREPARED_EVIDENCE_PROTOCOL_VERSION &&
    item.objectType === AI_GROUNDED_PREPARED_EVIDENCE_OBJECT_TYPE &&
    typeof item.executionInputSha256 === "string" &&
    SHA256.test(item.executionInputSha256) &&
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
    rfc3339(item.canonicalPreparedAt) &&
    rfc3339(item.persistedAt) &&
    item.providerCallAuthorized === false &&
    item.providerCallExecuted === false &&
    item.externalBrowsingAllowed === false &&
    item.legalTruthVerified === false &&
    item.executionAuthorityGranted === false
  );
}

export function assertAiGroundedPreparedExecutionEvidenceV1(
  value: unknown,
): asserts value is AiGroundedPreparedExecutionEvidenceV1 {
  if (!isAiGroundedPreparedExecutionEvidenceV1(value)) {
    throw new TypeError("Invalid AiGroundedPreparedExecutionEvidenceV1");
  }
}
