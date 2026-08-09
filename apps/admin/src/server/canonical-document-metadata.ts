import {
  CANONICAL_MARKDOWN_OBJECT_TYPE,
  CANONICAL_MARKDOWN_VERSION,
  type CanonicalMarkdownMetadataV1,
  type ConversionRun,
  type RawArtifact,
  type SourceDefinition,
} from "@markorbit/contracts";
import { RegistryConflictError } from "@markorbit/persistence";

export function canonicalDocumentMetadata(
  run: ConversionRun,
  artifact: RawArtifact,
  source: SourceDefinition,
): CanonicalMarkdownMetadataV1 {
  if (
    artifact.workspaceId !== run.workspaceId ||
    artifact.sourceId !== run.sourceId ||
    source.workspaceId !== run.workspaceId ||
    source.id !== run.sourceId ||
    artifact.id !== run.rawArtifactId
  ) {
    throw new RegistryConflictError(
      "CANONICAL_DOCUMENT_PROVENANCE_MISMATCH",
      "Source, RawArtifact and ConversionRun provenance do not match",
    );
  }

  return {
    schemaVersion: CANONICAL_MARKDOWN_VERSION,
    objectType: CANONICAL_MARKDOWN_OBJECT_TYPE,
    documentId: artifact.logicalDocumentId ?? artifact.id,
    workspaceId: run.workspaceId,
    sourceId: source.id,
    sourceName: source.name,
    sourceCategory: source.category,
    authorityLevel: source.authorityLevel,
    jurisdictions: source.jurisdictions,
    languages: source.languages,
    rawArtifactId: artifact.id,
    logicalDocumentId: artifact.logicalDocumentId ?? null,
    artifactVersion: artifact.version,
    artifactKind: artifact.artifactKind,
    originalName: artifact.originalName,
    canonicalUri: artifact.canonicalUri ?? source.canonicalUri ?? null,
    sourceUri: artifact.provenance.sourceUri,
    capturedAt: artifact.capturedAt,
    publishedAt: artifact.publishedAt ?? null,
    conversionRunId: run.id,
    converterId: run.converter.converterId,
    converterVersion: run.converter.version,
    inputSha256: run.input.sha256,
  };
}
