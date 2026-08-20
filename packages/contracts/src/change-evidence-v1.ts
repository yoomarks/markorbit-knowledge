import type {
  DocumentChangeKind,
  DocumentChangeSummary,
  DocumentSectionChange,
} from "./change-feed-v1";
import type { ArtifactKind } from "./schema-v1";

export const CHANGE_EVIDENCE_PROTOCOL_VERSION = "1.1" as const;

export const OBJECTIVE_CHANGE_DIMENSIONS = [
  "DOCUMENT_CREATED",
  "CONTENT_CHANGED",
  "RAW_ARTIFACT_BINARY_CHANGED",
  "METADATA_CHANGED",
  "LINK_ADDED",
  "LINK_REMOVED",
  "SECTION_ADDED",
  "SECTION_REMOVED",
  "SECTION_MODIFIED",
  "STRUCTURE_CHANGED",
] as const;
export type ObjectiveChangeDimension = (typeof OBJECTIVE_CHANGE_DIMENSIONS)[number];

export const CHANGE_EVIDENCE_METADATA_FIELDS = [
  "title",
  "targetPath",
  "canonicalUri",
  "sourceUri",
  "sourceName",
  "sourceCategory",
  "authorityLevel",
  "jurisdictions",
  "languages",
  "publishedAt",
] as const;
export type ChangeEvidenceMetadataField = (typeof CHANGE_EVIDENCE_METADATA_FIELDS)[number];

export type ChangeEvidenceDocumentRef = {
  artifactVersion: number;
  rawArtifactId: string;
  stagingDocumentId: string;
  readyPackageId: string;
  contentSha256: string;
  capturedAt: string;
  sourceUri: string;
};

export type ChangeEvidenceRawArtifactRef = {
  artifactId: string;
  artifactKind: ArtifactKind;
  mimeType: string;
  originalName: string;
  binarySha256: string;
  contentSha256: string | null;
  sizeBytes: number;
  capturedAt: string;
  publishedAt: string | null;
  sourceUri: string;
  canonicalUri: string | null;
};

export type ChangeEvidenceRawArtifactDiff = {
  before: ChangeEvidenceRawArtifactRef | null;
  after: ChangeEvidenceRawArtifactRef | null;
};

export type ChangeEvidenceMetadataValue = string | string[] | null;

export type ChangeEvidenceMetadataChange = {
  field: ChangeEvidenceMetadataField;
  before: ChangeEvidenceMetadataValue;
  after: ChangeEvidenceMetadataValue;
};

export type ChangeEvidenceLinkDiff = {
  added: string[];
  removed: string[];
};

export type ChangeEvidenceCoverage = {
  documentMetadata: true;
  canonicalText: true;
  canonicalLinks: true;
  sectionStructure: true;
  rawArtifactBinary: boolean;
  linkedAttachments: false;
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
  rawArtifacts: ChangeEvidenceRawArtifactDiff;
  dimensions: ObjectiveChangeDimension[];
  summary: DocumentChangeSummary;
  sections: DocumentSectionChange[];
  metadataChanges: ChangeEvidenceMetadataChange[];
  links: ChangeEvidenceLinkDiff;
  coverage: ChangeEvidenceCoverage;
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
