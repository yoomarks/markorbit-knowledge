import type { DocumentChangeKind, DocumentChangeSummary, DocumentSectionChange } from "./change-feed-v1";

export const CHANGE_EVIDENCE_PROTOCOL_VERSION = "1.0" as const;

export const OBJECTIVE_CHANGE_DIMENSIONS = [
  "DOCUMENT_CREATED",
  "CONTENT_CHANGED",
  "SECTION_ADDED",
  "SECTION_REMOVED",
  "SECTION_MODIFIED",
] as const;
export type ObjectiveChangeDimension = (typeof OBJECTIVE_CHANGE_DIMENSIONS)[number];

export type ChangeEvidenceDocumentRef = {
  artifactVersion: number;
  rawArtifactId: string;
  stagingDocumentId: string;
  readyPackageId: string;
  contentSha256: string;
  capturedAt: string;
  sourceUri: string;
};

export type DocumentChangeEvidence = {
  protocolVersion: typeof CHANGE_EVIDENCE_PROTOCOL_VERSION;
  objectType: "DOCUMENT_CHANGE_EVIDENCE";
  id: string;
  eventId: string;
  sequence: number;
  workspaceId: string;
  documentId: string;
  logicalDocumentId: string | null;
  sourceId: string;
  changeKind: DocumentChangeKind;
  observedAt: string;
  before: ChangeEvidenceDocumentRef | null;
  after: ChangeEvidenceDocumentRef;
  dimensions: ObjectiveChangeDimension[];
  summary: DocumentChangeSummary;
  sections: DocumentSectionChange[];
};

export type DocumentChangeEvidenceFeedRequest = {
  workspaceId: string;
  cursor?: string;
  sourceId?: string;
  documentId?: string;
  limit?: number;
};

export type DocumentChangeEvidenceFeedResult = {
  protocolVersion: typeof CHANGE_EVIDENCE_PROTOCOL_VERSION;
  objectType: "DOCUMENT_CHANGE_EVIDENCE_FEED_RESULT";
  items: DocumentChangeEvidence[];
  nextCursor: string | null;
};
