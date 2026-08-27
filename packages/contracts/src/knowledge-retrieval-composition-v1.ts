import {
  isContentObjectRefV1,
  type ContentEdgeV1,
  type ContentObjectRefV1,
} from "./content-relationship-v1";

export const KNOWLEDGE_RETRIEVAL_COMPOSITION_PROTOCOL_VERSION = "1.0" as const;
export const KNOWLEDGE_VECTOR_MODES = ["DISABLED", "OPTIONAL", "REQUIRED"] as const;
export type KnowledgeVectorModeV1 = (typeof KNOWLEDGE_VECTOR_MODES)[number];

export type KnowledgeRetrievalCompositionQueryV1 = {
  protocolVersion: typeof KNOWLEDGE_RETRIEVAL_COMPOSITION_PROTOCOL_VERSION;
  objectType: "KNOWLEDGE_RETRIEVAL_COMPOSITION_QUERY";
  workspaceId: string;
  queryText: string;
  graphSeed?: ContentObjectRefV1;
  lexicalLimit?: number;
  graphLimit?: number;
  vectorLimit?: number;
  vectorMode?: KnowledgeVectorModeV1;
};

export type KnowledgeLexicalEvidenceV1 = {
  channel: "LEXICAL";
  position: number;
  indexMode: string;
  score: number;
  snippet: string;
  headingPath: string[];
};

export type KnowledgeGraphEvidenceV1 = {
  channel: "GRAPH";
  position: number;
  seed: ContentObjectRefV1;
  direction: "OUTGOING" | "INCOMING";
  edge: ContentEdgeV1;
};

export type KnowledgeVectorMetricV1 = "SIMILARITY_HIGHER_IS_BETTER" | "DISTANCE_LOWER_IS_BETTER";

export type KnowledgeVectorProviderDescriptorV1 = {
  providerId: string;
  modelId: string;
  indexId: string;
  metric: KnowledgeVectorMetricV1;
};

export type KnowledgeVectorEvidenceV1 = {
  channel: "VECTOR";
  position: number;
  provider: KnowledgeVectorProviderDescriptorV1;
  value: number;
};

export type KnowledgeRetrievalEvidenceV1 =
  KnowledgeLexicalEvidenceV1 | KnowledgeGraphEvidenceV1 | KnowledgeVectorEvidenceV1;

export type KnowledgeRetrievalCompositionItemV1 = {
  content: ContentObjectRefV1;
  evidence: KnowledgeRetrievalEvidenceV1[];
};

export type KnowledgeRetrievalChannelStatusV1 = {
  lexical: { available: true; count: number };
  graph: {
    available: boolean;
    count: number;
    reason?: "NO_GRAPH_SEED";
  };
  vector: {
    available: boolean;
    count: number;
    reason?: "DISABLED" | "PROVIDER_UNAVAILABLE";
    provider?: KnowledgeVectorProviderDescriptorV1;
  };
};

export type KnowledgeRetrievalCompositionResultV1 = {
  protocolVersion: typeof KNOWLEDGE_RETRIEVAL_COMPOSITION_PROTOCOL_VERSION;
  objectType: "KNOWLEDGE_RETRIEVAL_COMPOSITION_RESULT";
  workspaceId: string;
  queryText: string;
  channels: KnowledgeRetrievalChannelStatusV1;
  items: KnowledgeRetrievalCompositionItemV1[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function canonicalString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value === value.trim();
}

function positiveLimit(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0 && Number(value) <= 200;
}

export function isKnowledgeRetrievalCompositionQueryV1(
  value: unknown,
): value is KnowledgeRetrievalCompositionQueryV1 {
  if (!isRecord(value)) return false;
  if (
    value.protocolVersion !== KNOWLEDGE_RETRIEVAL_COMPOSITION_PROTOCOL_VERSION ||
    value.objectType !== "KNOWLEDGE_RETRIEVAL_COMPOSITION_QUERY" ||
    !canonicalString(value.workspaceId) ||
    !canonicalString(value.queryText)
  ) {
    return false;
  }
  if (
    value.graphSeed !== undefined &&
    (!isContentObjectRefV1(value.graphSeed) || value.graphSeed.workspaceId !== value.workspaceId)
  ) {
    return false;
  }
  if (value.lexicalLimit !== undefined && !positiveLimit(value.lexicalLimit)) return false;
  if (value.graphLimit !== undefined && !positiveLimit(value.graphLimit)) return false;
  if (value.vectorLimit !== undefined && !positiveLimit(value.vectorLimit)) return false;
  if (
    value.vectorMode !== undefined &&
    !(KNOWLEDGE_VECTOR_MODES as readonly unknown[]).includes(value.vectorMode)
  ) {
    return false;
  }
  return true;
}
