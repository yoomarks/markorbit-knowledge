import {
  KNOWLEDGE_FEDERATED_RETRIEVAL_PROTOCOL_VERSION,
  KNOWLEDGE_FEDERATED_RETRIEVAL_RESULT_OBJECT_TYPE,
  KNOWLEDGE_SOURCE_FAMILIES,
  type ExpertSourceRetrievalRequestV1,
  type ExpertSourceRetrievalResultV1,
  type KnowledgeFederatedCanonicalHitV1,
  type KnowledgeFederatedCaseHitV1,
  type KnowledgeFederatedExpertHitV1,
  type KnowledgeFederatedRetrievalQueryV1,
  type KnowledgeFederatedRetrievalResultV1,
  type KnowledgeSourceFamily,
  type RetrievalSearchRequest,
  type RetrievalSearchResult,
} from "@markorbit/contracts";
import type {
  KnowledgeFederatedCaseReader,
  KnowledgeFederatedCaseSearchV1,
} from "./knowledge-federated-case-reader";

export type KnowledgeFederatedCanonicalReader = {
  search(input: RetrievalSearchRequest): RetrievalSearchResult;
};

export type KnowledgeFederatedExpertReader = {
  search(
    input?: ExpertSourceRetrievalRequestV1,
    scope?: { taskIds?: readonly string[] },
  ): ExpertSourceRetrievalResultV1;
};

export type KnowledgeFederatedRetrievalDependencies = {
  canonical: KnowledgeFederatedCanonicalReader;
  expert: KnowledgeFederatedExpertReader;
  cases: Pick<KnowledgeFederatedCaseReader, "search">;
  expertTaskIds: readonly string[];
};

function requestedFamilies(input: KnowledgeFederatedRetrievalQueryV1): KnowledgeSourceFamily[] {
  return input.sourceFamilies ? [...input.sourceFamilies] : [...KNOWLEDGE_SOURCE_FAMILIES];
}

function hasFamily(families: readonly KnowledgeSourceFamily[], family: KnowledgeSourceFamily): boolean {
  return families.includes(family);
}

function canonicalFamily(sourceUri: string, canonicalUri: string | null): "WEB" | "AI" | null {
  const uris = [sourceUri, canonicalUri].filter((value): value is string => Boolean(value));
  if (uris.some((uri) => uri.startsWith("ai+markorbit:"))) return "AI";
  if (uris.some((uri) => /^https?:\/\//iu.test(uri))) return "WEB";
  return null;
}

function canonicalHits(
  input: KnowledgeFederatedRetrievalQueryV1,
  families: readonly KnowledgeSourceFamily[],
  reader: KnowledgeFederatedCanonicalReader,
  limit: number,
): { WEB: KnowledgeFederatedCanonicalHitV1[]; AI: KnowledgeFederatedCanonicalHitV1[] } {
  const result = { WEB: [] as KnowledgeFederatedCanonicalHitV1[], AI: [] as KnowledgeFederatedCanonicalHitV1[] };
  const queryText = input.queryText?.trim();
  if (!queryText || (!hasFamily(families, "WEB") && !hasFamily(families, "AI"))) return result;

  const search = reader.search({
    workspaceId: input.workspaceId,
    query: queryText,
    ...(input.jurisdiction ? { jurisdiction: input.jurisdiction } : {}),
    limit: Math.min(100, Math.max(limit * 4, limit)),
  });

  for (const hit of search.items) {
    const family = canonicalFamily(hit.document.sourceUri, hit.document.canonicalUri);
    if (!family || !hasFamily(families, family) || result[family].length >= limit) continue;
    result[family].push({
      sourceFamily: family,
      sourceIdentity: hit.document.documentId,
      rawEvidenceRefs: [hit.document.rawArtifactId],
      derivedEvidenceRefs: [hit.document.stagingDocumentId, hit.document.readyPackageId],
      relatedSourceRefs: [],
      relatedCaseRefs: [],
      hit,
    });
  }
  return result;
}

function expertHits(
  input: KnowledgeFederatedRetrievalQueryV1,
  families: readonly KnowledgeSourceFamily[],
  reader: KnowledgeFederatedExpertReader,
  expertTaskIds: readonly string[],
  limit: number,
): KnowledgeFederatedExpertHitV1[] {
  if (!hasFamily(families, "EXPERT")) return [];
  const query: ExpertSourceRetrievalRequestV1 = {
    ...(input.jurisdiction ? { jurisdiction: input.jurisdiction } : {}),
    ...(input.topic ? { topic: input.topic } : {}),
    ...(input.relatedSourceRef ? { relatedSourceRef: input.relatedSourceRef } : {}),
    ...(input.relatedCaseRef ? { relatedCaseRef: input.relatedCaseRef } : {}),
    limit,
  };
  return reader.search(query, { taskIds: expertTaskIds }).items.map((record) => ({
    sourceFamily: "EXPERT" as const,
    sourceIdentity: record.sourceRecordId,
    rawEvidenceRefs: [...record.rawAnswerArtifactRefs, ...record.attachmentRefs],
    derivedEvidenceRefs: record.normalizedDerivativeRef ? [record.normalizedDerivativeRef] : [],
    relatedSourceRefs: [...record.relatedSourceRefs],
    relatedCaseRefs: [...record.relatedCaseRefs],
    record,
  }));
}

function caseHits(
  input: KnowledgeFederatedRetrievalQueryV1,
  families: readonly KnowledgeSourceFamily[],
  reader: Pick<KnowledgeFederatedCaseReader, "search">,
  limit: number,
): KnowledgeFederatedCaseHitV1[] {
  if (!hasFamily(families, "CASE")) return [];
  const query: KnowledgeFederatedCaseSearchV1 = {
    workspaceId: input.workspaceId,
    ...(input.caseCandidateId ? { candidateId: input.caseCandidateId } : {}),
    ...(input.sourceMatterId ? { sourceMatterId: input.sourceMatterId } : {}),
    limit,
  };
  return reader.search(query).map((candidate) => ({
    sourceFamily: "CASE" as const,
    sourceIdentity: candidate.candidateId,
    rawEvidenceRefs: [candidate.sourceRetrievalRef],
    derivedEvidenceRefs: [],
    relatedSourceRefs: [],
    relatedCaseRefs: [candidate.sourceMatterId],
    candidate,
  }));
}

export function retrieveKnowledgeFederated(
  input: KnowledgeFederatedRetrievalQueryV1,
  dependencies: KnowledgeFederatedRetrievalDependencies,
): KnowledgeFederatedRetrievalResultV1 {
  const families = requestedFamilies(input);
  const limit = input.limitPerFamily ?? 25;
  const canonical = canonicalHits(input, families, dependencies.canonical, limit);

  return {
    protocolVersion: KNOWLEDGE_FEDERATED_RETRIEVAL_PROTOCOL_VERSION,
    objectType: KNOWLEDGE_FEDERATED_RETRIEVAL_RESULT_OBJECT_TYPE,
    workspaceId: input.workspaceId,
    requestedFamilies: families,
    families: {
      WEB: canonical.WEB,
      AI: canonical.AI,
      EXPERT: expertHits(input, families, dependencies.expert, dependencies.expertTaskIds, limit),
      CASE: caseHits(input, families, dependencies.cases, limit),
    },
  };
}
