import type { ExpertSourceRecordV1 } from "./expert-source-v1";

export const EXPERT_SOURCE_RETRIEVAL_PROTOCOL_VERSION = "1.0" as const;
export const EXPERT_SOURCE_RETRIEVAL_RESULT_OBJECT_TYPE = "EXPERT_SOURCE_RETRIEVAL_RESULT" as const;

export type ExpertSourceRetrievalRequestV1 = {
  jurisdiction?: string;
  topic?: string;
  expertRef?: string;
  organizationRef?: string;
  receivedFrom?: string;
  receivedTo?: string;
  relatedSourceRef?: string;
  relatedCaseRef?: string;
  limit?: number;
  offset?: number;
};

export type ExpertSourceRetrievalResultV1 = {
  protocolVersion: typeof EXPERT_SOURCE_RETRIEVAL_PROTOCOL_VERSION;
  objectType: typeof EXPERT_SOURCE_RETRIEVAL_RESULT_OBJECT_TYPE;
  filters: Omit<ExpertSourceRetrievalRequestV1, "limit" | "offset">;
  items: ExpertSourceRecordV1[];
  total: number;
  limit: number;
  offset: number;
};
