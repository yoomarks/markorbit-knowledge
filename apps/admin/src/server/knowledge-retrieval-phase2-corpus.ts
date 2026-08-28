export type RetrievalCorpusEvidenceKindV1 = "LIVE_ACCEPTED" | "DURABLE_REPLAY_FIXTURE";

export type RetrievalCorpusEvidenceV1 = {
  evidenceRef: string;
  sourceFamily: "OFFICIAL_WEB" | "EXPERT" | "CASE";
  evidenceKind: RetrievalCorpusEvidenceKindV1;
  repositoryRef: string;
  canonicalUri?: string;
  workflowRunId?: number;
  workflowArtifactId?: number;
  workflowArtifactDigest?: string;
  documentId?: string;
  documentContentSha256?: string;
  chunks?: ReadonlyArray<{
    chunkId: string;
    chunkContentSha256: string;
    indexedAt: string;
  }>;
};

export const KNOWLEDGE_RETRIEVAL_PHASE2_CORPUS_V1 = {
  schemaVersion: "1.0",
  corpusId: "knowledge-retrieval-multisource-phase2",
  corpusVersion: "2026-08-28.1",
  acceptedKnowledgeMainSha: "d3a264255e5c45fc0ef6b548916d1bf57425fd9f",
  evidence: [
    {
      evidenceRef: "official-web:uspto-fee-schedule:phase2-559",
      sourceFamily: "OFFICIAL_WEB",
      evidenceKind: "LIVE_ACCEPTED",
      repositoryRef: "yoomarks/markorbit-knowledge#559",
      canonicalUri:
        "https://www.uspto.gov/learning-and-resources/fees-and-payment/uspto-fee-schedule",
      workflowRunId: 33141319142,
      workflowArtifactId: 9674079242,
      workflowArtifactDigest:
        "sha256:f28e668224e0fff0a8b1cbca306939ac960e1493c094ebb0a8a2d88bd643fbfd",
      documentId: "art_01M139E6ANZXHGEWBVW35PME4K",
      documentContentSha256: "ce172f292949649024744be64aa283ffba840550f3159733b15813e13452314e",
      chunks: [
        {
          chunkId: "rch_186dc86dc9b2d2f609445c6683bceac6",
          chunkContentSha256: "186dc86dc9b2d2f609445c6683bceac698e4a221bf33d0c6d3991b480bb6601e",
          indexedAt: "2026-08-28T04:18:22.805Z",
        },
      ],
    },
    {
      evidenceRef: "official-web:uspto-fee-temporal:phase2-559",
      sourceFamily: "OFFICIAL_WEB",
      evidenceKind: "LIVE_ACCEPTED",
      repositoryRef: "yoomarks/markorbit-knowledge#559",
      canonicalUri:
        "https://www.uspto.gov/trademarks/fees-payment-information/summary-2025-trademark-fee-changes",
      workflowRunId: 33141319142,
      workflowArtifactId: 9674079242,
      workflowArtifactDigest:
        "sha256:f28e668224e0fff0a8b1cbca306939ac960e1493c094ebb0a8a2d88bd643fbfd",
      documentId: "art_01M139ED672D4XQZVC46SK4377",
      documentContentSha256: "b993c19c9acb47a7ff5b0295269fee187219d9e2b273c456e46e42522edd1eb2",
      chunks: [
        {
          chunkId: "rch_0690b135ca8d2ad8625cf5a080fcfcf2",
          chunkContentSha256: "0690b135ca8d2ad8625cf5a080fcfcf2e0988f582a8a0d07cd610b55dd5934e0",
          indexedAt: "2026-08-28T04:18:29.782Z",
        },
        {
          chunkId: "rch_d046a12a21945953e850803c202dd6c3",
          chunkContentSha256: "d046a12a21945953e850803c202dd6c3bffd7ddd06b7b5cc5d8e0ace90cbee2a",
          indexedAt: "2026-08-28T04:18:29.782Z",
        },
      ],
    },
    {
      evidenceRef: "official-web:uspto-fee-applicability:phase2-559",
      sourceFamily: "OFFICIAL_WEB",
      evidenceKind: "LIVE_ACCEPTED",
      repositoryRef: "yoomarks/markorbit-knowledge#559",
      canonicalUri: "https://www.uspto.gov/trademarks/trademark-fee-information",
      workflowRunId: 33141319142,
      workflowArtifactId: 9674079242,
      workflowArtifactDigest:
        "sha256:f28e668224e0fff0a8b1cbca306939ac960e1493c094ebb0a8a2d88bd643fbfd",
      documentId: "art_01M139ENHCJJK65BCQ786BKAZ4",
      documentContentSha256: "eb0341c84179a46ab1cc2852b8924e9bf530b333cd8b3c62d67e84c53c5c1fbe",
      chunks: [
        {
          chunkId: "rch_f3f366e8a5bd59b838d5c6b9cd46ae49",
          chunkContentSha256: "f3f366e8a5bd59b838d5c6b9cd46ae492ce2578d2236eefa6c64784fafc8f742",
          indexedAt: "2026-08-28T04:18:38.334Z",
        },
      ],
    },
    {
      evidenceRef: "expert:communication-reply-importer:replay-fixture-v1",
      sourceFamily: "EXPERT",
      evidenceKind: "DURABLE_REPLAY_FIXTURE",
      repositoryRef:
        "apps/admin/src/server/expert-communication-reply-importer.test.ts#same-thread-inbound-evidence",
    },
    {
      evidenceRef: "case:markreg-live-acceptance:test-replay-fixture-v1",
      sourceFamily: "CASE",
      evidenceKind: "DURABLE_REPLAY_FIXTURE",
      repositoryRef:
        "apps/admin/src/server/case-live-acceptance-service.test.ts#full-TEST-path-real-service-composition",
    },
  ] satisfies RetrievalCorpusEvidenceV1[],
} as const;
