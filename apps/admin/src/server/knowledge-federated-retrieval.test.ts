import { describe, expect, it, vi } from "vitest";
import {
  KNOWLEDGE_FEDERATED_RETRIEVAL_PROTOCOL_VERSION,
  KNOWLEDGE_FEDERATED_RETRIEVAL_QUERY_OBJECT_TYPE,
  type CaseCandidateV1,
  type ExpertSourceRecordV1,
  type ExpertSourceRetrievalResultV1,
  type KnowledgeFederatedRetrievalQueryV1,
  type RetrievalSearchHit,
  type RetrievalSearchResult,
} from "@markorbit/contracts";
import { retrieveKnowledgeFederated } from "./knowledge-federated-retrieval";

function retrievalHit(
  documentId: string,
  sourceUri: string,
  canonicalUri: string | null,
): RetrievalSearchHit {
  return {
    document: {
      protocolVersion: "1.0",
      objectType: "RETRIEVAL_DOCUMENT",
      documentId,
      workspaceId: "workspace:test",
      sourceId: `source:${documentId}`,
      stagingDocumentId: `staging:${documentId}`,
      readyPackageId: `ready:${documentId}`,
      rawArtifactId: `raw:${documentId}`,
      logicalDocumentId: null,
      artifactVersion: 1,
      title: documentId,
      targetPath: `${documentId}.md`,
      canonicalUri,
      sourceUri,
      sourceName: documentId,
      sourceCategory: "OFFICIAL_GUIDANCE",
      authorityLevel: "PRIMARY",
      jurisdictions: ["US"],
      languages: ["en"],
      capturedAt: "2026-08-31T00:00:00.000Z",
      publishedAt: null,
      contentSha256: "a".repeat(64),
      keywords: [],
      chunkCount: 1,
      indexedAt: "2026-08-31T00:01:00.000Z",
      isCurrent: true,
    },
    chunk: {
      protocolVersion: "1.0",
      objectType: "RETRIEVAL_CHUNK",
      chunkId: `chunk:${documentId}`,
      documentId,
      stagingDocumentId: `staging:${documentId}`,
      artifactVersion: 1,
      ordinal: 0,
      headingPath: [],
      text: "assignment evidence",
      contentSha256: "b".repeat(64),
    },
    score: -1.5,
    snippet: "assignment evidence",
  };
}

function expertRecord(): ExpertSourceRecordV1 {
  return {
    protocolVersion: "1.0",
    objectType: "EXPERT_SOURCE_RECORD",
    sourceRecordId: "expert_source_001",
    taskId: "expert_task_001",
    expertRef: "expert:jp:001",
    jurisdiction: "JP",
    topic: "trademark assignment",
    communication: {
      communicationThreadRef: "communication:thread:001",
      messageRefs: ["communication:message:001"],
    },
    rawAnswerArtifactRefs: ["raw:expert:001"],
    normalizedDerivativeRef: "normalized:expert:001",
    attachmentRefs: ["attachment:expert:001"],
    receivedAt: "2026-08-30T00:00:00.000Z",
    capturedAt: "2026-08-30T00:01:00.000Z",
    relatedSourceRefs: ["source:jp-guidance"],
    relatedCaseRefs: ["formal-matter_001"],
    provenance: {
      sourceFamily: "EXPERT",
      originalEvidenceAuthoritative: true,
      normalizedDerivativeIsOriginalEvidence: false,
    },
    accessClassification: "CONFIDENTIAL",
  };
}

function caseCandidate(): CaseCandidateV1 {
  return {
    protocolVersion: "1.0",
    objectType: "CASE_CANDIDATE",
    candidateId: "case-candidate_001",
    sourceSystem: "MARKREG",
    sourceMatterId: "formal-matter_001",
    sourceMatterVersion: 2,
    sourceSnapshotSha256: "c".repeat(64),
    sourceRetrievalRef: "markreg:/v1/formal-matters/formal-matter_001?version=2",
    promotedBy: "operator:test",
    promotedAt: "2026-08-30T00:02:00.000Z",
    accessScope: {
      sourceWorkspaceId: "workspace:test",
      classification: "CONFIDENTIAL",
    },
    idempotencyKey: "case-intake-001",
  };
}

function query(overrides: Partial<KnowledgeFederatedRetrievalQueryV1> = {}): KnowledgeFederatedRetrievalQueryV1 {
  return {
    protocolVersion: KNOWLEDGE_FEDERATED_RETRIEVAL_PROTOCOL_VERSION,
    objectType: KNOWLEDGE_FEDERATED_RETRIEVAL_QUERY_OBJECT_TYPE,
    workspaceId: "workspace:test",
    queryText: "assignment",
    topic: "trademark assignment",
    limitPerFamily: 10,
    ...overrides,
  };
}

describe("retrieveKnowledgeFederated", () => {
  it("preserves four native source families without creating a cross-family score", () => {
    const canonicalSearch = vi.fn((): RetrievalSearchResult => ({
      protocolVersion: "1.0",
      objectType: "RETRIEVAL_SEARCH_RESULT",
      indexMode: "SQLITE_FTS5_BM25",
      query: "assignment",
      items: [
        retrievalHit("web-doc", "https://www.uspto.gov/assignment", null),
        retrievalHit("ai-doc", "ai+markorbit://provider/submissions/001", "ai+markorbit://provider/assignments/001"),
        retrievalHit("local-doc", "file:///vault/manual.md", null),
      ],
      total: 3,
    }));
    const expertSearch = vi.fn(
      (): ExpertSourceRetrievalResultV1 => ({
        protocolVersion: "1.0",
        objectType: "EXPERT_SOURCE_RETRIEVAL_RESULT",
        filters: { topic: "trademark assignment" },
        items: [expertRecord()],
        total: 1,
        limit: 10,
        offset: 0,
      }),
    );
    const caseSearch = vi.fn(() => [caseCandidate()]);

    const result = retrieveKnowledgeFederated(query(), {
      canonical: { search: canonicalSearch },
      expert: { search: expertSearch },
      cases: { search: caseSearch },
      expertTaskIds: ["expert_task_001"],
    });

    expect(result.families.WEB).toHaveLength(1);
    expect(result.families.WEB[0]?.sourceIdentity).toBe("web-doc");
    expect(result.families.AI).toHaveLength(1);
    expect(result.families.AI[0]?.sourceIdentity).toBe("ai-doc");
    expect(result.families.EXPERT[0]).toMatchObject({
      sourceFamily: "EXPERT",
      sourceIdentity: "expert_source_001",
      rawEvidenceRefs: ["raw:expert:001", "attachment:expert:001"],
      derivedEvidenceRefs: ["normalized:expert:001"],
    });
    expect(result.families.CASE[0]).toMatchObject({
      sourceFamily: "CASE",
      sourceIdentity: "case-candidate_001",
      rawEvidenceRefs: ["markreg:/v1/formal-matters/formal-matter_001?version=2"],
    });
    expect(result).not.toHaveProperty("score");
    expect(result).not.toHaveProperty("items");
    expect(expertSearch).toHaveBeenCalledWith(
      expect.objectContaining({ topic: "trademark assignment", limit: 10 }),
      { taskIds: ["expert_task_001"] },
    );
    expect(caseSearch).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "workspace:test", limit: 10 }),
    );
  });

  it("does not query or leak unrequested source families", () => {
    const canonicalSearch = vi.fn();
    const caseSearch = vi.fn();
    const expertSearch = vi.fn(
      (): ExpertSourceRetrievalResultV1 => ({
        protocolVersion: "1.0",
        objectType: "EXPERT_SOURCE_RETRIEVAL_RESULT",
        filters: {},
        items: [expertRecord()],
        total: 1,
        limit: 25,
        offset: 0,
      }),
    );

    const result = retrieveKnowledgeFederated(
      query({ sourceFamilies: ["EXPERT"], queryText: undefined, topic: undefined, limitPerFamily: undefined }),
      {
        canonical: { search: canonicalSearch },
        expert: { search: expertSearch },
        cases: { search: caseSearch },
        expertTaskIds: ["expert_task_001"],
      },
    );

    expect(result.requestedFamilies).toEqual(["EXPERT"]);
    expect(result.families.EXPERT).toHaveLength(1);
    expect(result.families.WEB).toEqual([]);
    expect(result.families.AI).toEqual([]);
    expect(result.families.CASE).toEqual([]);
    expect(canonicalSearch).not.toHaveBeenCalled();
    expect(caseSearch).not.toHaveBeenCalled();
  });
});
