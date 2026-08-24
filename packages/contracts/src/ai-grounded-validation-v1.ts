export const AI_GROUNDED_VALIDATION_PROTOCOL_VERSION = "1.0" as const;
export const AI_GROUNDED_OUTPUT_VALIDATION_RECEIPT_OBJECT_TYPE =
  "AI_GROUNDED_OUTPUT_VALIDATION_RECEIPT" as const;

export const AI_GROUNDED_OUTPUT_VALIDATION_STATUSES = [
  "VALID_GROUNDED",
  "VALID_INSUFFICIENT",
] as const;
export type AiGroundedOutputValidationStatus =
  (typeof AI_GROUNDED_OUTPUT_VALIDATION_STATUSES)[number];

export type AiGroundedOutputValidationReceiptV1 = {
  protocolVersion: typeof AI_GROUNDED_VALIDATION_PROTOCOL_VERSION;
  objectType: typeof AI_GROUNDED_OUTPUT_VALIDATION_RECEIPT_OBJECT_TYPE;
  status: AiGroundedOutputValidationStatus;
  assignmentId: string;
  bindingId: string;
  sourcePackId: string;
  sourcePackRevision: number;
  renderedPromptSha256: string;
  outputSha256: string;
  citationCount: number;
  citedSourceIds: readonly string[];
  unreferencedSourceIds: readonly string[];
  insufficiencyDeclared: boolean;
  legalTruthVerified: false;
  semanticClaimCoverageVerified: false;
};

const SHA256 = /^[a-f0-9]{64}$/u;
const ADK_ID = /^[a-z][a-z0-9_]{2,127}$/u;
const SOURCE_ID = /^src_[0-9A-HJKMNP-TV-Z]{26}$/u;

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(value);
  return keys.length === expected.length && expected.every((key) => keys.includes(key));
}

function sourceIds(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.every((sourceId) => typeof sourceId === "string" && SOURCE_ID.test(sourceId)) &&
    new Set(value).size === value.length
  );
}

export function isAiGroundedOutputValidationReceiptV1(
  value: unknown,
): value is AiGroundedOutputValidationReceiptV1 {
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
      "renderedPromptSha256",
      "outputSha256",
      "citationCount",
      "citedSourceIds",
      "unreferencedSourceIds",
      "insufficiencyDeclared",
      "legalTruthVerified",
      "semanticClaimCoverageVerified",
    ])
  ) {
    return false;
  }
  if (!sourceIds(item.citedSourceIds) || !sourceIds(item.unreferencedSourceIds)) return false;
  const citedSourceIds = item.citedSourceIds as string[];
  const unreferencedSourceIds = item.unreferencedSourceIds as string[];
  if (citedSourceIds.some((sourceId) => unreferencedSourceIds.includes(sourceId))) return false;
  if (
    !Number.isSafeInteger(item.citationCount) ||
    (item.citationCount as number) < citedSourceIds.length
  ) {
    return false;
  }
  const grounded = item.status === "VALID_GROUNDED";
  const insufficient = item.status === "VALID_INSUFFICIENT";
  if (!grounded && !insufficient) return false;
  if (grounded && (item.insufficiencyDeclared !== false || item.citationCount === 0)) return false;
  if (insufficient && item.insufficiencyDeclared !== true) return false;
  return (
    item.protocolVersion === AI_GROUNDED_VALIDATION_PROTOCOL_VERSION &&
    item.objectType === AI_GROUNDED_OUTPUT_VALIDATION_RECEIPT_OBJECT_TYPE &&
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
    typeof item.renderedPromptSha256 === "string" &&
    SHA256.test(item.renderedPromptSha256) &&
    typeof item.outputSha256 === "string" &&
    SHA256.test(item.outputSha256) &&
    item.legalTruthVerified === false &&
    item.semanticClaimCoverageVerified === false
  );
}

export function assertAiGroundedOutputValidationReceiptV1(
  value: unknown,
): asserts value is AiGroundedOutputValidationReceiptV1 {
  if (!isAiGroundedOutputValidationReceiptV1(value)) {
    throw new TypeError("Invalid AiGroundedOutputValidationReceiptV1");
  }
}
