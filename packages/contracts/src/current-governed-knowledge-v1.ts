export const CURRENT_GOVERNED_KNOWLEDGE_PROTOCOL_VERSION = "1.0" as const;
export const CURRENT_GOVERNED_KNOWLEDGE_OBJECT_TYPE = "CURRENT_GOVERNED_KNOWLEDGE" as const;

export const KNOWLEDGE_ADMISSIBILITY_REASON_CODES = [
  "CONTENT_NOT_INDEXED",
  "CONTENT_NOT_CURRENT",
  "WORKSPACE_INACTIVE",
  "SOURCE_ARCHIVED",
  "VERIFICATION_MISSING",
  "VERIFICATION_NOT_ACCEPTABLE",
  "CORPUS_NOT_VISIBLE",
  "CHANNEL_GLOBAL_OVERLAY_UNSUPPORTED",
] as const;
export type KnowledgeAdmissibilityReasonCode =
  (typeof KNOWLEDGE_ADMISSIBILITY_REASON_CODES)[number];

/**
 * These states are deliberately independent:
 * CURRENT is Knowledge version selection; VERIFIED is evidence verification;
 * CONSUMER_ADMISSIBLE is a Knowledge-side gate; DELIVERED is downstream transport fact.
 */
export type CurrentGovernedKnowledgeStatesV1 = {
  current: boolean;
  verified: boolean;
  consumerAdmissible: boolean;
  delivered: boolean;
};

export type CurrentGovernedKnowledgeV1 = {
  protocolVersion: typeof CURRENT_GOVERNED_KNOWLEDGE_PROTOCOL_VERSION;
  objectType: typeof CURRENT_GOVERNED_KNOWLEDGE_OBJECT_TYPE;
  workspaceId: string;
  stagingDocumentId: string;
  sourceId: string | null;
  readyPackageId: string | null;
  states: CurrentGovernedKnowledgeStatesV1;
  reasonCodes: readonly KnowledgeAdmissibilityReasonCode[];
};

export const READY_PACKAGE_COMPATIBILITY_V1 = {
  V1: {
    role: "LEGACY_STAGING_RETRIEVAL_ADAPTER",
    currentnessAuthority: false,
    newDeliveryPolicy: "COMPATIBILITY_ONLY",
  },
  V2: {
    role: "CANONICAL_DOWNSTREAM_DELIVERY_ADAPTER",
    currentnessAuthority: false,
    newDeliveryPolicy: "PREFERRED",
  },
} as const;

export const KNOWLEDGE_RETRIEVAL_CORPUS_CAPABILITIES_V1 = {
  LEXICAL: {
    visibleCorpus: "WORKSPACE_PLUS_GLOBAL",
    globalOverlay: "SUPPORTED",
  },
  GRAPH: {
    visibleCorpus: "EXACT_WORKSPACE",
    globalOverlay: "UNSUPPORTED",
  },
  VECTOR: {
    visibleCorpus: "EXACT_WORKSPACE",
    globalOverlay: "UNSUPPORTED",
  },
} as const;

export type KnowledgeRetrievalChannelV1 = keyof typeof KNOWLEDGE_RETRIEVAL_CORPUS_CAPABILITIES_V1;
export type KnowledgeRetrievalCorpusCapabilityV1 =
  (typeof KNOWLEDGE_RETRIEVAL_CORPUS_CAPABILITIES_V1)[KnowledgeRetrievalChannelV1];

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(value);
  return keys.length === expected.length && expected.every((key) => keys.includes(key));
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function isCurrentGovernedKnowledgeV1(value: unknown): value is CurrentGovernedKnowledgeV1 {
  const item = record(value);
  if (
    !item ||
    !exactKeys(item, [
      "protocolVersion",
      "objectType",
      "workspaceId",
      "stagingDocumentId",
      "sourceId",
      "readyPackageId",
      "states",
      "reasonCodes",
    ]) ||
    item.protocolVersion !== CURRENT_GOVERNED_KNOWLEDGE_PROTOCOL_VERSION ||
    item.objectType !== CURRENT_GOVERNED_KNOWLEDGE_OBJECT_TYPE ||
    !nonEmpty(item.workspaceId) ||
    !nonEmpty(item.stagingDocumentId) ||
    (item.sourceId !== null && !nonEmpty(item.sourceId)) ||
    (item.readyPackageId !== null && !nonEmpty(item.readyPackageId)) ||
    !Array.isArray(item.reasonCodes) ||
    item.reasonCodes.some(
      (code) => !(KNOWLEDGE_ADMISSIBILITY_REASON_CODES as readonly unknown[]).includes(code),
    ) ||
    new Set(item.reasonCodes).size !== item.reasonCodes.length
  ) {
    return false;
  }
  const states = record(item.states);
  if (
    !states ||
    !exactKeys(states, ["current", "verified", "consumerAdmissible", "delivered"]) ||
    typeof states.current !== "boolean" ||
    typeof states.verified !== "boolean" ||
    typeof states.consumerAdmissible !== "boolean" ||
    typeof states.delivered !== "boolean"
  ) {
    return false;
  }
  if (
    states.consumerAdmissible &&
    (!states.current || !states.verified || item.reasonCodes.length > 0)
  ) {
    return false;
  }
  if (states.delivered && !states.verified) return false;
  return true;
}

export function assertCurrentGovernedKnowledgeV1(
  value: unknown,
): asserts value is CurrentGovernedKnowledgeV1 {
  if (!isCurrentGovernedKnowledgeV1(value)) {
    throw new TypeError("Invalid CurrentGovernedKnowledgeV1");
  }
}
