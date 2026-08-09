export const DOCUMENT_INDEX_VERSION = "1.0" as const;
export const DOCUMENT_INDEX_OBJECT_TYPE = "DOCUMENT_INDEX" as const;
export const RETRIEVAL_CHUNK_OBJECT_TYPE = "RETRIEVAL_CHUNK" as const;

export const LANGUAGE_HINT_BASES = [
  "DECLARED_SINGLE",
  "SCRIPT_HEURISTIC",
  "UNDETERMINED",
] as const;
export type LanguageHintBasis = (typeof LANGUAGE_HINT_BASES)[number];

export type DocumentContentStatistics = {
  characterCount: number;
  wordCount: number;
  lineCount: number;
  headingCount: number;
  linkCount: number;
};

export type RetrievalChunkV1 = {
  protocolVersion: typeof DOCUMENT_INDEX_VERSION;
  objectType: typeof RETRIEVAL_CHUNK_OBJECT_TYPE;
  id: string;
  documentIndexId: string;
  stagingDocumentId: string;
  workspaceId: string;
  sourceId: string;
  ordinal: number;
  headingPath: string[];
  startLine: number;
  endLine: number;
  text: string;
  contentSha256: string;
  characterCount: number;
  wordCount: number;
  keywords: string[];
};

export type DocumentIndexV1 = {
  protocolVersion: typeof DOCUMENT_INDEX_VERSION;
  objectType: typeof DOCUMENT_INDEX_OBJECT_TYPE;
  id: string;
  workspaceId: string;
  stagingDocumentId: string;
  documentId: string;
  sourceId: string;
  rawArtifactId: string;
  conversionRunId: string;
  contentSha256: string;
  declaredLanguages: string[];
  languageHint: {
    code: string | null;
    basis: LanguageHintBasis;
  };
  statistics: DocumentContentStatistics;
  keywords: string[];
  chunking: {
    strategy: "MARKDOWN_SECTION_V1";
    maxCharacters: number;
  };
  chunks: RetrievalChunkV1[];
  embedding: {
    status: "NOT_GENERATED";
  };
};

const INDEX_ID = /^dix_[a-f0-9]{40}$/;
const CHUNK_ID = /^chk_[a-f0-9]{40}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const STAGING_ID = /^std_[0-9A-HJKMNP-TV-Z]{26}$/;
const WORKSPACE_ID = /^wsp_[0-9A-HJKMNP-TV-Z]{26}$/;
const SOURCE_ID = /^src_[0-9A-HJKMNP-TV-Z]{26}$/;
const ARTIFACT_ID = /^art_[0-9A-HJKMNP-TV-Z]{26}$/;
const CONVERSION_RUN_ID = /^cvr_[0-9A-HJKMNP-TV-Z]{26}$/;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function only(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const allowed = new Set(keys);
  return Object.keys(value).every((key) => allowed.has(key));
}

function required(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return keys.every((key) => Object.prototype.hasOwnProperty.call(value, key));
}

function nonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function positiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0;
}

function stringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.every((item) => typeof item === "string" && item.length > 0) &&
    new Set(value).size === value.length
  );
}

function isStatistics(value: unknown): value is DocumentContentStatistics {
  if (!record(value)) return false;
  const keys = ["characterCount", "wordCount", "lineCount", "headingCount", "linkCount"];
  return (
    required(value, keys) &&
    only(value, keys) &&
    nonNegativeInteger(value.characterCount) &&
    nonNegativeInteger(value.wordCount) &&
    positiveInteger(value.lineCount) &&
    nonNegativeInteger(value.headingCount) &&
    nonNegativeInteger(value.linkCount)
  );
}

export function isRetrievalChunkV1(value: unknown): value is RetrievalChunkV1 {
  if (!record(value)) return false;
  const keys = [
    "protocolVersion",
    "objectType",
    "id",
    "documentIndexId",
    "stagingDocumentId",
    "workspaceId",
    "sourceId",
    "ordinal",
    "headingPath",
    "startLine",
    "endLine",
    "text",
    "contentSha256",
    "characterCount",
    "wordCount",
    "keywords",
  ];
  return (
    required(value, keys) &&
    only(value, keys) &&
    value.protocolVersion === DOCUMENT_INDEX_VERSION &&
    value.objectType === RETRIEVAL_CHUNK_OBJECT_TYPE &&
    typeof value.id === "string" &&
    CHUNK_ID.test(value.id) &&
    typeof value.documentIndexId === "string" &&
    INDEX_ID.test(value.documentIndexId) &&
    typeof value.stagingDocumentId === "string" &&
    STAGING_ID.test(value.stagingDocumentId) &&
    typeof value.workspaceId === "string" &&
    WORKSPACE_ID.test(value.workspaceId) &&
    typeof value.sourceId === "string" &&
    SOURCE_ID.test(value.sourceId) &&
    nonNegativeInteger(value.ordinal) &&
    stringArray(value.headingPath) &&
    positiveInteger(value.startLine) &&
    positiveInteger(value.endLine) &&
    Number(value.endLine) >= Number(value.startLine) &&
    typeof value.text === "string" &&
    value.text.trim().length > 0 &&
    typeof value.contentSha256 === "string" &&
    SHA256.test(value.contentSha256) &&
    positiveInteger(value.characterCount) &&
    nonNegativeInteger(value.wordCount) &&
    stringArray(value.keywords)
  );
}

export function isDocumentIndexV1(value: unknown): value is DocumentIndexV1 {
  if (!record(value)) return false;
  const keys = [
    "protocolVersion",
    "objectType",
    "id",
    "workspaceId",
    "stagingDocumentId",
    "documentId",
    "sourceId",
    "rawArtifactId",
    "conversionRunId",
    "contentSha256",
    "declaredLanguages",
    "languageHint",
    "statistics",
    "keywords",
    "chunking",
    "chunks",
    "embedding",
  ];
  if (
    !required(value, keys) ||
    !only(value, keys) ||
    !record(value.languageHint) ||
    !record(value.chunking) ||
    !record(value.embedding)
  ) {
    return false;
  }
  return (
    value.protocolVersion === DOCUMENT_INDEX_VERSION &&
    value.objectType === DOCUMENT_INDEX_OBJECT_TYPE &&
    typeof value.id === "string" &&
    INDEX_ID.test(value.id) &&
    typeof value.workspaceId === "string" &&
    WORKSPACE_ID.test(value.workspaceId) &&
    typeof value.stagingDocumentId === "string" &&
    STAGING_ID.test(value.stagingDocumentId) &&
    typeof value.documentId === "string" &&
    value.documentId.length > 0 &&
    value.documentId.length <= 240 &&
    typeof value.sourceId === "string" &&
    SOURCE_ID.test(value.sourceId) &&
    typeof value.rawArtifactId === "string" &&
    ARTIFACT_ID.test(value.rawArtifactId) &&
    typeof value.conversionRunId === "string" &&
    CONVERSION_RUN_ID.test(value.conversionRunId) &&
    typeof value.contentSha256 === "string" &&
    SHA256.test(value.contentSha256) &&
    stringArray(value.declaredLanguages) &&
    only(value.languageHint, ["code", "basis"]) &&
    (value.languageHint.code === null ||
      (typeof value.languageHint.code === "string" && value.languageHint.code.length > 0)) &&
    typeof value.languageHint.basis === "string" &&
    LANGUAGE_HINT_BASES.includes(value.languageHint.basis as LanguageHintBasis) &&
    isStatistics(value.statistics) &&
    stringArray(value.keywords) &&
    only(value.chunking, ["strategy", "maxCharacters"]) &&
    value.chunking.strategy === "MARKDOWN_SECTION_V1" &&
    positiveInteger(value.chunking.maxCharacters) &&
    Array.isArray(value.chunks) &&
    value.chunks.length > 0 &&
    value.chunks.every(isRetrievalChunkV1) &&
    value.chunks.every(
      (chunk, index) =>
        chunk.documentIndexId === value.id &&
        chunk.stagingDocumentId === value.stagingDocumentId &&
        chunk.workspaceId === value.workspaceId &&
        chunk.sourceId === value.sourceId &&
        chunk.ordinal === index,
    ) &&
    only(value.embedding, ["status"]) &&
    value.embedding.status === "NOT_GENERATED"
  );
}
