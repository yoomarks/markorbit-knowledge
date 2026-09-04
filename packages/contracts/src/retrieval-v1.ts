import type { AuthorityLevel, SourceCategory } from "./schema-v1";

export const RETRIEVAL_PROTOCOL_VERSION = "1.0" as const;
export const RETRIEVAL_INDEX_MODE = "SQLITE_FTS5_BM25" as const;

export type RetrievalDocument = {
  protocolVersion: typeof RETRIEVAL_PROTOCOL_VERSION;
  objectType: "RETRIEVAL_DOCUMENT";
  documentId: string;
  workspaceId: string;
  sourceId: string;
  stagingDocumentId: string;
  readyPackageId: string;
  rawArtifactId: string;
  logicalDocumentId: string | null;
  artifactVersion: number;
  title: string;
  targetPath: string;
  canonicalUri: string | null;
  sourceUri: string;
  sourceName: string;
  sourceCategory: SourceCategory;
  authorityLevel: AuthorityLevel;
  jurisdictions: string[];
  languages: string[];
  capturedAt: string;
  publishedAt: string | null;
  contentSha256: string;
  keywords: string[];
  chunkCount: number;
  indexedAt: string;
  isCurrent: boolean;
};

export type RetrievalChunk = {
  protocolVersion: typeof RETRIEVAL_PROTOCOL_VERSION;
  objectType: "RETRIEVAL_CHUNK";
  chunkId: string;
  documentId: string;
  stagingDocumentId: string;
  artifactVersion: number;
  ordinal: number;
  headingPath: string[];
  text: string;
  contentSha256: string;
};

export type RetrievalSearchRequest = {
  workspaceId: string;
  query: string;
  sourceId?: string;
  jurisdiction?: string;
  language?: string;
  authorityLevel?: AuthorityLevel;
  limit?: number;
  offset?: number;
};

export type RetrievalSearchHit = {
  document: RetrievalDocument;
  chunk: RetrievalChunk;
  score: number;
  snippet: string;
};

export type RetrievalSearchResult = {
  protocolVersion: typeof RETRIEVAL_PROTOCOL_VERSION;
  objectType: "RETRIEVAL_SEARCH_RESULT";
  indexMode: typeof RETRIEVAL_INDEX_MODE;
  query: string;
  items: RetrievalSearchHit[];
  total: number;
};

export type RetrievalDocumentResult = {
  protocolVersion: typeof RETRIEVAL_PROTOCOL_VERSION;
  objectType: "RETRIEVAL_DOCUMENT_RESULT";
  document: RetrievalDocument;
  chunks: RetrievalChunk[];
  canonicalMarkdown: string;
};
