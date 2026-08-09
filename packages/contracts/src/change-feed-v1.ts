export const CHANGE_FEED_PROTOCOL_VERSION = "1.0" as const;

export const DOCUMENT_CHANGE_KINDS = ["CREATED", "UPDATED", "UNCHANGED"] as const;
export type DocumentChangeKind = (typeof DOCUMENT_CHANGE_KINDS)[number];

export const SECTION_CHANGE_KINDS = ["ADDED", "REMOVED", "MODIFIED"] as const;
export type SectionChangeKind = (typeof SECTION_CHANGE_KINDS)[number];

export type DocumentChangeSummary = {
  addedSections: number;
  removedSections: number;
  modifiedSections: number;
  changedSections: number;
};

export type DocumentChangeEvent = {
  protocolVersion: typeof CHANGE_FEED_PROTOCOL_VERSION;
  objectType: "DOCUMENT_CHANGE_EVENT";
  id: string;
  sequence: number;
  workspaceId: string;
  documentId: string;
  logicalDocumentId: string | null;
  sourceId: string;
  changeKind: DocumentChangeKind;
  fromVersion: number | null;
  toVersion: number;
  fromStagingDocumentId: string | null;
  toStagingDocumentId: string;
  fromContentSha256: string | null;
  toContentSha256: string;
  summary: DocumentChangeSummary;
  observedAt: string;
};

export type DocumentSectionChange = {
  ordinal: number;
  changeKind: SectionChangeKind;
  headingPath: string[];
  beforeChunkIds: string[];
  afterChunkIds: string[];
  beforeContentSha256: string | null;
  afterContentSha256: string | null;
  beforeText: string | null;
  afterText: string | null;
};

export type DocumentVersionDiff = {
  protocolVersion: typeof CHANGE_FEED_PROTOCOL_VERSION;
  objectType: "DOCUMENT_VERSION_DIFF";
  workspaceId: string;
  documentId: string;
  logicalDocumentId: string | null;
  sourceId: string;
  changeKind: DocumentChangeKind;
  fromVersion: number | null;
  toVersion: number;
  fromContentSha256: string | null;
  toContentSha256: string;
  summary: DocumentChangeSummary;
  sections: DocumentSectionChange[];
};

export type DocumentChangeFeedRequest = {
  workspaceId: string;
  cursor?: string;
  sourceId?: string;
  documentId?: string;
  limit?: number;
};

export type DocumentChangeFeedResult = {
  protocolVersion: typeof CHANGE_FEED_PROTOCOL_VERSION;
  objectType: "DOCUMENT_CHANGE_FEED_RESULT";
  items: DocumentChangeEvent[];
  nextCursor: string | null;
};
