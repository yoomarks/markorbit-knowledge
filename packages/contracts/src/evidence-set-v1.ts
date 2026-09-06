import {
  AUTHORITY_LEVELS,
  SOURCE_CATEGORIES,
  type AuthorityLevel,
  type SourceCategory,
} from "./schema-v1";
import { ARTIFACT_STATUSES, type ArtifactStatus } from "./vocabularies";

export const EVIDENCE_SET_CONTRACT_VERSION = "1.0" as const;
export const EVIDENCE_SET_EXPORT_VERSION = "1.0" as const;
export const EVIDENCE_SET_ORDERING = "EXPLICIT" as const;

export type EvidenceSetCreatorV1 = {
  userId: string;
  membershipId: string;
  role: string;
};

export type EvidenceSetMemberV1 = {
  ordinal: number;
  documentId: string;
  stagingDocumentId: string;
  readyPackageId: string;
  rawArtifactId: string;
  logicalDocumentId: string | null;
  artifactVersion: number;
  sourceId: string;
  sourceName: string;
  sourceCategory: SourceCategory;
  authorityLevel: AuthorityLevel;
  jurisdictions: string[];
  languages: string[];
  canonicalUri: string | null;
  sourceUri: string;
  capturedAt: string;
  publishedAt: string | null;
  stagingContentSha256: string;
  rawBinarySha256: string;
  rawContentSha256: string | null;
  rawArtifactStatus: ArtifactStatus;
};

export type EvidenceSetV1 = {
  schemaVersion: typeof EVIDENCE_SET_CONTRACT_VERSION;
  contractVersion: typeof EVIDENCE_SET_CONTRACT_VERSION;
  objectType: "EVIDENCE_SET";
  evidenceSetId: string;
  revision: 1;
  workspaceId: string;
  title: string;
  note: string | null;
  ordering: typeof EVIDENCE_SET_ORDERING;
  members: EvidenceSetMemberV1[];
  digest: string;
  creator: EvidenceSetCreatorV1;
  createdAt: string;
};

export type EvidenceSetExportV1 = {
  schemaVersion: typeof EVIDENCE_SET_EXPORT_VERSION;
  contractVersion: typeof EVIDENCE_SET_EXPORT_VERSION;
  objectType: "EVIDENCE_SET_EXPORT";
  evidenceSetId: string;
  revision: 1;
  workspaceId: string;
  title: string;
  digest: string;
  ordering: typeof EVIDENCE_SET_ORDERING;
  members: EvidenceSetMemberV1[];
  createdAt: string;
};

export const EVIDENCE_SET_MEMBER_DRIFT_STATES = [
  "CURRENT",
  "NEWER_VERSION_AVAILABLE",
  "SOURCE_MISSING",
  "SOURCE_ARCHIVED",
  "RAW_ARTIFACT_MISSING",
  "RAW_ARTIFACT_ARCHIVED",
  "CURRENT_DOCUMENT_UNRESOLVED",
] as const;
export type EvidenceSetMemberDriftState = (typeof EVIDENCE_SET_MEMBER_DRIFT_STATES)[number];

export type EvidenceSetMemberDriftV1 = {
  ordinal: number;
  stagingDocumentId: string;
  documentId: string;
  frozenArtifactVersion: number;
  currentArtifactVersion: number | null;
  currentStagingDocumentId: string | null;
  state: EvidenceSetMemberDriftState;
};

export type EvidenceSetDriftReportV1 = {
  schemaVersion: typeof EVIDENCE_SET_CONTRACT_VERSION;
  contractVersion: typeof EVIDENCE_SET_CONTRACT_VERSION;
  objectType: "EVIDENCE_SET_DRIFT_REPORT";
  evidenceSetId: string;
  revision: 1;
  workspaceId: string;
  setDigest: string;
  changedCount: number;
  members: EvidenceSetMemberDriftV1[];
  observedAt: string;
};

const SHA256 = /^[a-f0-9]{64}$/u;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exact(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every((key) => actual.includes(key));
}

function timestamp(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function nullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function stringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

export function isEvidenceSetMemberV1(value: unknown): value is EvidenceSetMemberV1 {
  if (!record(value)) return false;
  const keys = [
    "ordinal",
    "documentId",
    "stagingDocumentId",
    "readyPackageId",
    "rawArtifactId",
    "logicalDocumentId",
    "artifactVersion",
    "sourceId",
    "sourceName",
    "sourceCategory",
    "authorityLevel",
    "jurisdictions",
    "languages",
    "canonicalUri",
    "sourceUri",
    "capturedAt",
    "publishedAt",
    "stagingContentSha256",
    "rawBinarySha256",
    "rawContentSha256",
    "rawArtifactStatus",
  ] as const;
  return (
    exact(value, keys) &&
    Number.isSafeInteger(value.ordinal) &&
    Number(value.ordinal) > 0 &&
    Number.isSafeInteger(value.artifactVersion) &&
    Number(value.artifactVersion) > 0 &&
    nonEmpty(value.documentId) &&
    nonEmpty(value.stagingDocumentId) &&
    nonEmpty(value.readyPackageId) &&
    nonEmpty(value.rawArtifactId) &&
    (value.logicalDocumentId === null || nonEmpty(value.logicalDocumentId)) &&
    nonEmpty(value.sourceId) &&
    nonEmpty(value.sourceName) &&
    typeof value.sourceCategory === "string" &&
    SOURCE_CATEGORIES.includes(value.sourceCategory as SourceCategory) &&
    typeof value.authorityLevel === "string" &&
    AUTHORITY_LEVELS.includes(value.authorityLevel as AuthorityLevel) &&
    stringArray(value.jurisdictions) &&
    stringArray(value.languages) &&
    nullableString(value.canonicalUri) &&
    nonEmpty(value.sourceUri) &&
    timestamp(value.capturedAt) &&
    (value.publishedAt === null || timestamp(value.publishedAt)) &&
    typeof value.stagingContentSha256 === "string" &&
    SHA256.test(value.stagingContentSha256) &&
    typeof value.rawBinarySha256 === "string" &&
    SHA256.test(value.rawBinarySha256) &&
    (value.rawContentSha256 === null ||
      (typeof value.rawContentSha256 === "string" && SHA256.test(value.rawContentSha256))) &&
    typeof value.rawArtifactStatus === "string" &&
    ARTIFACT_STATUSES.includes(value.rawArtifactStatus as ArtifactStatus)
  );
}

export function isEvidenceSetV1(value: unknown): value is EvidenceSetV1 {
  if (!record(value) || !record(value.creator) || !Array.isArray(value.members)) return false;
  return (
    exact(value, [
      "schemaVersion",
      "contractVersion",
      "objectType",
      "evidenceSetId",
      "revision",
      "workspaceId",
      "title",
      "note",
      "ordering",
      "members",
      "digest",
      "creator",
      "createdAt",
    ]) &&
    exact(value.creator, ["userId", "membershipId", "role"]) &&
    value.schemaVersion === EVIDENCE_SET_CONTRACT_VERSION &&
    value.contractVersion === EVIDENCE_SET_CONTRACT_VERSION &&
    value.objectType === "EVIDENCE_SET" &&
    nonEmpty(value.evidenceSetId) &&
    value.revision === 1 &&
    nonEmpty(value.workspaceId) &&
    nonEmpty(value.title) &&
    (value.note === null || typeof value.note === "string") &&
    value.ordering === EVIDENCE_SET_ORDERING &&
    value.members.length > 0 &&
    value.members.every(isEvidenceSetMemberV1) &&
    value.members.every((member, index) => member.ordinal === index + 1) &&
    typeof value.digest === "string" &&
    SHA256.test(value.digest) &&
    nonEmpty(value.creator.userId) &&
    nonEmpty(value.creator.membershipId) &&
    nonEmpty(value.creator.role) &&
    timestamp(value.createdAt)
  );
}

export function evidenceSetExportV1(value: EvidenceSetV1): EvidenceSetExportV1 {
  if (!isEvidenceSetV1(value)) throw new TypeError("Invalid EvidenceSetV1");
  return {
    schemaVersion: EVIDENCE_SET_EXPORT_VERSION,
    contractVersion: EVIDENCE_SET_EXPORT_VERSION,
    objectType: "EVIDENCE_SET_EXPORT",
    evidenceSetId: value.evidenceSetId,
    revision: value.revision,
    workspaceId: value.workspaceId,
    title: value.title,
    digest: value.digest,
    ordering: value.ordering,
    members: value.members,
    createdAt: value.createdAt,
  };
}
