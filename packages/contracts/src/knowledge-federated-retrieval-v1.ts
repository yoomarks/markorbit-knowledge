import type { CaseCandidateV1 } from "./case-candidate-v1";
import type { ExpertSourceRecordV1 } from "./expert-source-v1";
import type { RetrievalSearchHit } from "./retrieval-v1";

export const KNOWLEDGE_FEDERATED_RETRIEVAL_PROTOCOL_VERSION = "1.0" as const;
export const KNOWLEDGE_FEDERATED_RETRIEVAL_QUERY_OBJECT_TYPE =
  "KNOWLEDGE_FEDERATED_RETRIEVAL_QUERY" as const;
export const KNOWLEDGE_FEDERATED_RETRIEVAL_RESULT_OBJECT_TYPE =
  "KNOWLEDGE_FEDERATED_RETRIEVAL_RESULT" as const;

export const KNOWLEDGE_SOURCE_FAMILIES = ["WEB", "AI", "EXPERT", "CASE"] as const;
export type KnowledgeSourceFamily = (typeof KNOWLEDGE_SOURCE_FAMILIES)[number];

export type KnowledgeFederatedRetrievalQueryV1 = {
  protocolVersion: typeof KNOWLEDGE_FEDERATED_RETRIEVAL_PROTOCOL_VERSION;
  objectType: typeof KNOWLEDGE_FEDERATED_RETRIEVAL_QUERY_OBJECT_TYPE;
  workspaceId: string;
  sourceFamilies?: readonly KnowledgeSourceFamily[];
  queryText?: string;
  jurisdiction?: string;
  topic?: string;
  relatedSourceRef?: string;
  relatedCaseRef?: string;
  caseCandidateId?: string;
  sourceMatterId?: string;
  limitPerFamily?: number;
};

export type KnowledgeFederatedSourceDescriptorV1 = {
  sourceFamily: KnowledgeSourceFamily;
  sourceIdentity: string;
  rawEvidenceRefs: readonly string[];
  derivedEvidenceRefs: readonly string[];
  relatedSourceRefs: readonly string[];
  relatedCaseRefs: readonly string[];
};

export type KnowledgeFederatedCanonicalHitV1 = KnowledgeFederatedSourceDescriptorV1 & {
  sourceFamily: "WEB" | "AI";
  hit: RetrievalSearchHit;
};

export type KnowledgeFederatedExpertHitV1 = KnowledgeFederatedSourceDescriptorV1 & {
  sourceFamily: "EXPERT";
  record: ExpertSourceRecordV1;
};

export type KnowledgeFederatedCaseHitV1 = KnowledgeFederatedSourceDescriptorV1 & {
  sourceFamily: "CASE";
  candidate: CaseCandidateV1;
};

/**
 * Results remain grouped by native source family. There is intentionally no
 * cross-family score because lexical BM25, expert evidence metadata and Case
 * promotion metadata are not comparable ranking signals.
 */
export type KnowledgeFederatedRetrievalResultV1 = {
  protocolVersion: typeof KNOWLEDGE_FEDERATED_RETRIEVAL_PROTOCOL_VERSION;
  objectType: typeof KNOWLEDGE_FEDERATED_RETRIEVAL_RESULT_OBJECT_TYPE;
  workspaceId: string;
  requestedFamilies: readonly KnowledgeSourceFamily[];
  families: {
    WEB: readonly KnowledgeFederatedCanonicalHitV1[];
    AI: readonly KnowledgeFederatedCanonicalHitV1[];
    EXPERT: readonly KnowledgeFederatedExpertHitV1[];
    CASE: readonly KnowledgeFederatedCaseHitV1[];
  };
};

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function optionalText(value: unknown): boolean {
  return value === undefined || (typeof value === "string" && value.trim().length > 0);
}

export function isKnowledgeFederatedRetrievalQueryV1(
  value: unknown,
): value is KnowledgeFederatedRetrievalQueryV1 {
  const item = record(value);
  if (!item) return false;
  const allowed = new Set([
    "protocolVersion",
    "objectType",
    "workspaceId",
    "sourceFamilies",
    "queryText",
    "jurisdiction",
    "topic",
    "relatedSourceRef",
    "relatedCaseRef",
    "caseCandidateId",
    "sourceMatterId",
    "limitPerFamily",
  ]);
  if (Object.keys(item).some((key) => !allowed.has(key))) return false;
  if (
    item.protocolVersion !== KNOWLEDGE_FEDERATED_RETRIEVAL_PROTOCOL_VERSION ||
    item.objectType !== KNOWLEDGE_FEDERATED_RETRIEVAL_QUERY_OBJECT_TYPE ||
    typeof item.workspaceId !== "string" ||
    item.workspaceId.trim().length === 0
  ) {
    return false;
  }
  if (
    !optionalText(item.queryText) ||
    !optionalText(item.jurisdiction) ||
    !optionalText(item.topic) ||
    !optionalText(item.relatedSourceRef) ||
    !optionalText(item.relatedCaseRef) ||
    !optionalText(item.caseCandidateId) ||
    !optionalText(item.sourceMatterId)
  ) {
    return false;
  }
  if (item.sourceFamilies !== undefined) {
    if (
      !Array.isArray(item.sourceFamilies) ||
      item.sourceFamilies.length === 0 ||
      item.sourceFamilies.some(
        (family) => !KNOWLEDGE_SOURCE_FAMILIES.includes(family as KnowledgeSourceFamily),
      ) ||
      new Set(item.sourceFamilies).size !== item.sourceFamilies.length
    ) {
      return false;
    }
  }
  if (
    item.limitPerFamily !== undefined &&
    (!Number.isSafeInteger(item.limitPerFamily) || item.limitPerFamily < 1 || item.limitPerFamily > 100)
  ) {
    return false;
  }
  return true;
}
