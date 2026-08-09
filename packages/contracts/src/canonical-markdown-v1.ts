import type { ArtifactKind, AuthorityLevel, SourceCategory } from "./schema-v1";

export const CANONICAL_MARKDOWN_VERSION = "1.0" as const;
export const CANONICAL_MARKDOWN_OBJECT_TYPE = "CANONICAL_MARKDOWN_METADATA" as const;

export type CanonicalMarkdownMetadataV1 = {
  schemaVersion: typeof CANONICAL_MARKDOWN_VERSION;
  objectType: typeof CANONICAL_MARKDOWN_OBJECT_TYPE;
  documentId: string;
  workspaceId: string;
  sourceId: string;
  sourceName: string;
  sourceCategory: SourceCategory;
  authorityLevel: AuthorityLevel;
  jurisdictions: string[];
  languages: string[];
  rawArtifactId: string;
  logicalDocumentId: string | null;
  artifactVersion: number;
  artifactKind: ArtifactKind;
  originalName: string;
  canonicalUri: string | null;
  sourceUri: string;
  capturedAt: string;
  publishedAt: string | null;
  conversionRunId: string;
  converterId: string;
  converterVersion: string;
  inputSha256: string;
};

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string" && item.length > 0);
}

export function isCanonicalMarkdownMetadataV1(
  value: unknown,
): value is CanonicalMarkdownMetadataV1 {
  if (!record(value)) return false;
  return (
    value.schemaVersion === CANONICAL_MARKDOWN_VERSION &&
    value.objectType === CANONICAL_MARKDOWN_OBJECT_TYPE &&
    typeof value.documentId === "string" &&
    value.documentId.length > 0 &&
    typeof value.workspaceId === "string" &&
    value.workspaceId.length > 0 &&
    typeof value.sourceId === "string" &&
    value.sourceId.length > 0 &&
    typeof value.sourceName === "string" &&
    value.sourceName.length > 0 &&
    typeof value.sourceCategory === "string" &&
    typeof value.authorityLevel === "string" &&
    stringArray(value.jurisdictions) &&
    stringArray(value.languages) &&
    typeof value.rawArtifactId === "string" &&
    value.rawArtifactId.length > 0 &&
    (value.logicalDocumentId === null || typeof value.logicalDocumentId === "string") &&
    Number.isSafeInteger(value.artifactVersion) &&
    Number(value.artifactVersion) > 0 &&
    typeof value.artifactKind === "string" &&
    typeof value.originalName === "string" &&
    value.originalName.length > 0 &&
    (value.canonicalUri === null || typeof value.canonicalUri === "string") &&
    typeof value.sourceUri === "string" &&
    value.sourceUri.length > 0 &&
    typeof value.capturedAt === "string" &&
    !Number.isNaN(Date.parse(value.capturedAt)) &&
    (value.publishedAt === null ||
      (typeof value.publishedAt === "string" && !Number.isNaN(Date.parse(value.publishedAt)))) &&
    typeof value.conversionRunId === "string" &&
    value.conversionRunId.length > 0 &&
    typeof value.converterId === "string" &&
    value.converterId.length > 0 &&
    typeof value.converterVersion === "string" &&
    value.converterVersion.length > 0 &&
    typeof value.inputSha256 === "string" &&
    /^[a-f0-9]{64}$/.test(value.inputSha256)
  );
}
