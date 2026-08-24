import {
  isAiKnowledgeAssignmentV1,
  type AiKnowledgeAssignmentV1,
} from "./ai-distilled-knowledge-v1";

export const AI_SOURCE_PACK_PROTOCOL_VERSION = "1.0" as const;
export const AI_SOURCE_PACK_OBJECT_TYPE = "AI_SOURCE_PACK" as const;
export const AI_ASSIGNMENT_SOURCE_BINDING_OBJECT_TYPE =
  "AI_ASSIGNMENT_SOURCE_BINDING" as const;

export const AI_SOURCE_AUTHORITIES = ["OFFICIAL_PRIMARY", "OFFICIAL_SECONDARY"] as const;
export type AiSourceAuthority = (typeof AI_SOURCE_AUTHORITIES)[number];

export const AI_SOURCE_ROLES = [
  "STATUTE",
  "REGULATION",
  "OFFICIAL_MANUAL",
  "OFFICIAL_FEE_SCHEDULE",
  "OFFICIAL_FORM",
  "OFFICIAL_DECISION",
  "OFFICIAL_GUIDANCE",
  "OTHER_OFFICIAL",
] as const;
export type AiSourceRole = (typeof AI_SOURCE_ROLES)[number];

export type AiSourceSnapshotRefV1 = {
  sourceId: string;
  artifactId: string;
  canonicalUri: string;
  publisher: string;
  jurisdiction: string;
  authority: AiSourceAuthority;
  role: AiSourceRole;
  capturedAt: string;
  contentSha256: string;
  publishedAt?: string;
  effectiveAt?: string;
};

export type AiSourcePackV1 = {
  protocolVersion: typeof AI_SOURCE_PACK_PROTOCOL_VERSION;
  objectType: typeof AI_SOURCE_PACK_OBJECT_TYPE;
  sourcePackId: string;
  revision: number;
  jurisdiction: string;
  domain: string;
  topic: string;
  name: string;
  sourcePolicy: "OFFICIAL_ONLY";
  sources: readonly AiSourceSnapshotRefV1[];
  createdAt: string;
  changeReason: string;
  legalTruthVerified: false;
};

export type AiAssignmentSourceBindingV1 = {
  protocolVersion: typeof AI_SOURCE_PACK_PROTOCOL_VERSION;
  objectType: typeof AI_ASSIGNMENT_SOURCE_BINDING_OBJECT_TYPE;
  bindingId: string;
  assignmentId: string;
  instructionSetId: string;
  instructionSetRevision: number;
  sourcePackId: string;
  sourcePackRevision: number;
  groundingPolicy: "STRICT_OFFICIAL_SOURCE_PACK";
  requireCitations: true;
  allowExternalSources: false;
  allowUncitedFactualClaims: false;
  legalTruthVerified: false;
  executionAuthorityGranted: false;
  createdAt: string;
};

const SHA256 = /^[a-f0-9]{64}$/u;
const ADK_ID = /^[a-z][a-z0-9_]{2,127}$/u;
const ULID = "[0-9A-HJKMNP-TV-Z]{26}";
const SOURCE_ID = new RegExp(`^src_${ULID}$`);
const ARTIFACT_ID = new RegExp(`^art_${ULID}$`);

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

function uri(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z][A-Za-z0-9+.-]*:/u.test(value);
}

function enumValue(values: readonly string[], value: unknown): value is string {
  return typeof value === "string" && values.includes(value);
}

export function isAiSourceSnapshotRefV1(
  value: unknown,
): value is AiSourceSnapshotRefV1 {
  const item = record(value);
  if (!item) return false;
  const expected = [
    "sourceId",
    "artifactId",
    "canonicalUri",
    "publisher",
    "jurisdiction",
    "authority",
    "role",
    "capturedAt",
    "contentSha256",
  ];
  if ("publishedAt" in item) expected.push("publishedAt");
  if ("effectiveAt" in item) expected.push("effectiveAt");
  if (!exactKeys(item, expected)) return false;
  return (
    typeof item.sourceId === "string" &&
    SOURCE_ID.test(item.sourceId) &&
    typeof item.artifactId === "string" &&
    ARTIFACT_ID.test(item.artifactId) &&
    uri(item.canonicalUri) &&
    nonEmpty(item.publisher) &&
    nonEmpty(item.jurisdiction) &&
    enumValue(AI_SOURCE_AUTHORITIES, item.authority) &&
    enumValue(AI_SOURCE_ROLES, item.role) &&
    timestamp(item.capturedAt) &&
    typeof item.contentSha256 === "string" &&
    SHA256.test(item.contentSha256) &&
    (item.publishedAt === undefined || timestamp(item.publishedAt)) &&
    (item.effectiveAt === undefined || timestamp(item.effectiveAt))
  );
}

export function assertAiSourceSnapshotRefV1(
  value: unknown,
): asserts value is AiSourceSnapshotRefV1 {
  if (!isAiSourceSnapshotRefV1(value)) throw new TypeError("Invalid AiSourceSnapshotRefV1");
}

export function isAiSourcePackV1(value: unknown): value is AiSourcePackV1 {
  const item = record(value);
  if (
    !item ||
    !exactKeys(item, [
      "protocolVersion",
      "objectType",
      "sourcePackId",
      "revision",
      "jurisdiction",
      "domain",
      "topic",
      "name",
      "sourcePolicy",
      "sources",
      "createdAt",
      "changeReason",
      "legalTruthVerified",
    ])
  ) {
    return false;
  }
  if (!Array.isArray(item.sources) || item.sources.length === 0) return false;
  if (!item.sources.every(isAiSourceSnapshotRefV1)) return false;
  const sources = item.sources as AiSourceSnapshotRefV1[];
  if (new Set(sources.map((source) => source.sourceId)).size !== sources.length) {
    return false;
  }
  if (new Set(sources.map((source) => source.artifactId)).size !== sources.length) {
    return false;
  }
  if (!sources.every((source) => source.jurisdiction === item.jurisdiction)) return false;
  return (
    item.protocolVersion === AI_SOURCE_PACK_PROTOCOL_VERSION &&
    item.objectType === AI_SOURCE_PACK_OBJECT_TYPE &&
    typeof item.sourcePackId === "string" &&
    item.sourcePackId.startsWith("asp_") &&
    ADK_ID.test(item.sourcePackId) &&
    Number.isSafeInteger(item.revision) &&
    (item.revision as number) > 0 &&
    nonEmpty(item.jurisdiction) &&
    nonEmpty(item.domain) &&
    nonEmpty(item.topic) &&
    nonEmpty(item.name) &&
    item.sourcePolicy === "OFFICIAL_ONLY" &&
    timestamp(item.createdAt) &&
    nonEmpty(item.changeReason) &&
    item.legalTruthVerified === false
  );
}

export function assertAiSourcePackV1(value: unknown): asserts value is AiSourcePackV1 {
  if (!isAiSourcePackV1(value)) throw new TypeError("Invalid AiSourcePackV1");
}

export function isAiAssignmentSourceBindingV1(
  value: unknown,
): value is AiAssignmentSourceBindingV1 {
  const item = record(value);
  if (
    !item ||
    !exactKeys(item, [
      "protocolVersion",
      "objectType",
      "bindingId",
      "assignmentId",
      "instructionSetId",
      "instructionSetRevision",
      "sourcePackId",
      "sourcePackRevision",
      "groundingPolicy",
      "requireCitations",
      "allowExternalSources",
      "allowUncitedFactualClaims",
      "legalTruthVerified",
      "executionAuthorityGranted",
      "createdAt",
    ])
  ) {
    return false;
  }
  return (
    item.protocolVersion === AI_SOURCE_PACK_PROTOCOL_VERSION &&
    item.objectType === AI_ASSIGNMENT_SOURCE_BINDING_OBJECT_TYPE &&
    typeof item.bindingId === "string" &&
    item.bindingId.startsWith("asb_") &&
    ADK_ID.test(item.bindingId) &&
    typeof item.assignmentId === "string" &&
    item.assignmentId.startsWith("kas_") &&
    ADK_ID.test(item.assignmentId) &&
    typeof item.instructionSetId === "string" &&
    item.instructionSetId.startsWith("kis_") &&
    ADK_ID.test(item.instructionSetId) &&
    Number.isSafeInteger(item.instructionSetRevision) &&
    (item.instructionSetRevision as number) > 0 &&
    typeof item.sourcePackId === "string" &&
    item.sourcePackId.startsWith("asp_") &&
    ADK_ID.test(item.sourcePackId) &&
    Number.isSafeInteger(item.sourcePackRevision) &&
    (item.sourcePackRevision as number) > 0 &&
    item.groundingPolicy === "STRICT_OFFICIAL_SOURCE_PACK" &&
    item.requireCitations === true &&
    item.allowExternalSources === false &&
    item.allowUncitedFactualClaims === false &&
    item.legalTruthVerified === false &&
    item.executionAuthorityGranted === false &&
    timestamp(item.createdAt)
  );
}

export function assertAiAssignmentSourceBindingV1(
  value: unknown,
): asserts value is AiAssignmentSourceBindingV1 {
  if (!isAiAssignmentSourceBindingV1(value)) {
    throw new TypeError("Invalid AiAssignmentSourceBindingV1");
  }
}

export function assertAiAssignmentSourceBindingContext(
  binding: unknown,
  assignment: unknown,
  sourcePack: unknown,
): asserts binding is AiAssignmentSourceBindingV1 {
  assertAiAssignmentSourceBindingV1(binding);
  if (!isAiKnowledgeAssignmentV1(assignment)) {
    throw new TypeError("Invalid AiKnowledgeAssignmentV1");
  }
  assertAiSourcePackV1(sourcePack);
  const typedAssignment = assignment as AiKnowledgeAssignmentV1;
  if (binding.assignmentId !== typedAssignment.assignmentId) {
    throw new TypeError("AI source binding assignment identity mismatch");
  }
  if (
    binding.instructionSetId !== typedAssignment.instructionSetId ||
    binding.instructionSetRevision !== typedAssignment.instructionSetRevision
  ) {
    throw new TypeError("AI source binding instruction-set identity mismatch");
  }
  if (
    binding.sourcePackId !== sourcePack.sourcePackId ||
    binding.sourcePackRevision !== sourcePack.revision
  ) {
    throw new TypeError("AI source binding source-pack identity mismatch");
  }
  if (
    sourcePack.jurisdiction !== typedAssignment.jurisdiction ||
    sourcePack.domain !== typedAssignment.domain
  ) {
    throw new TypeError("AI source pack scope does not match assignment scope");
  }
}
