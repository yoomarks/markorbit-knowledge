import { NextResponse } from "next/server";
import {
  CANONICAL_MARKDOWN_OBJECT_TYPE,
  CANONICAL_MARKDOWN_VERSION,
  type CanonicalMarkdownMetadataV1,
} from "@markorbit/contracts";
import {
  RegistryConflictError,
  RegistryError,
  RegistryValidationError,
} from "@markorbit/persistence";
import { apiError, bearerCredential } from "@/server/api-errors";
import {
  getConversionRunLedgerRepository,
  getRawArtifactRepository,
  getSourceRepository,
  getWorkerRegistryRepository,
} from "@/server/source-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  try {
    const credential = bearerCredential(request);
    const workerId = new URL(request.url).searchParams.get("workerId")?.trim();
    if (!workerId) throw new RegistryValidationError("workerId query parameter is required");
    const worker = getWorkerRegistryRepository().verifyCredential(workerId, credential);
    const { id } = await context.params;
    const record = getConversionRunLedgerRepository().getById(id, worker.workspaceId);
    if (!record)
      throw new RegistryError("CONVERSION_RUN_NOT_FOUND", `ConversionRun ${id} was not found`);
    if (record.run.workspaceId !== worker.workspaceId) {
      throw new RegistryConflictError(
        "CONVERSION_RUN_WORKSPACE_MISMATCH",
        "ConversionRun belongs to another Workspace",
      );
    }
    const artifactRecord = getRawArtifactRepository().getArtifact(record.run.rawArtifactId);
    if (!artifactRecord) {
      throw new RegistryError(
        "RAW_ARTIFACT_NOT_FOUND",
        `RawArtifact ${record.run.rawArtifactId} was not found`,
      );
    }
    const artifact = artifactRecord.artifact;
    const source = getSourceRepository().getById(record.run.sourceId);
    if (!source) {
      throw new RegistryError("SOURCE_NOT_FOUND", `Source ${record.run.sourceId} was not found`);
    }
    if (
      artifact.workspaceId !== record.run.workspaceId ||
      artifact.sourceId !== record.run.sourceId ||
      source.workspaceId !== record.run.workspaceId
    ) {
      throw new RegistryConflictError(
        "CANONICAL_DOCUMENT_PROVENANCE_MISMATCH",
        "Source, RawArtifact and ConversionRun provenance do not match",
      );
    }

    const documentMetadata = {
      schemaVersion: CANONICAL_MARKDOWN_VERSION,
      objectType: CANONICAL_MARKDOWN_OBJECT_TYPE,
      documentId: artifact.logicalDocumentId ?? artifact.id,
      workspaceId: record.run.workspaceId,
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
      conversionRunId: record.run.id,
      converterId: record.run.converter.converterId,
      converterVersion: record.run.converter.version,
      inputSha256: record.run.input.sha256,
    } satisfies CanonicalMarkdownMetadataV1;

    return NextResponse.json({
      workspaceId: record.run.workspaceId,
      conversionRunId: record.run.id,
      sourceId: record.run.sourceId,
      rawArtifactId: record.run.rawArtifactId,
      documentMetadata,
    });
  } catch (error) {
    return apiError(error);
  }
}
