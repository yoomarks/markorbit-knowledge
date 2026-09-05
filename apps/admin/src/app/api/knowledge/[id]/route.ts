import { NextResponse } from "next/server";
import { RegistryError } from "@markorbit/persistence";
import { apiError } from "@/server/api-errors";
import { resolveKnowledgeWorkspaceReadAccess } from "@/server/knowledge-workspace-access";
import {
  getRawArtifactRepository,
  getSourceRepository,
  getStagingContentRepository,
} from "@/server/source-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const { workspaceId } = await resolveKnowledgeWorkspaceReadAccess(request);
    const staging = getStagingContentRepository();
    const record = staging.getDocument(id, workspaceId);
    if (!record)
      throw new RegistryError(
        "KNOWLEDGE_DOCUMENT_NOT_FOUND",
        `Knowledge document ${id} was not found`,
      );

    const descriptor = record.descriptor;
    const source = getSourceRepository().getById(descriptor.sourceId);
    const artifact =
      getRawArtifactRepository().getArtifact(descriptor.rawArtifactId)?.artifact ?? null;
    const content = Buffer.from(staging.readContent(id, workspaceId)).toString("utf8");

    return NextResponse.json({
      id: descriptor.id,
      title: descriptor.title,
      content,
      targetPath: descriptor.targetPath,
      outputFormat: descriptor.outputFormat,
      status: descriptor.status,
      validation: descriptor.validation,
      generatedAt: descriptor.generatedAt,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      source: source
        ? {
            id: source.id,
            name: source.name,
            sourceType: source.sourceType,
            category: source.category,
            authorityLevel: source.authorityLevel,
            jurisdictions: source.jurisdictions,
            languages: source.languages,
            canonicalUri: source.canonicalUri ?? null,
            entrypoints: source.entrypoints,
          }
        : null,
      artifact: artifact
        ? {
            id: artifact.id,
            originalName: artifact.originalName,
            artifactKind: artifact.artifactKind,
            mimeType: artifact.mimeType,
            version: artifact.version,
            sizeBytes: artifact.sizeBytes,
            capturedAt: artifact.capturedAt,
            publishedAt: artifact.publishedAt ?? null,
            canonicalUri: artifact.canonicalUri ?? null,
            sourceUri: artifact.provenance.sourceUri,
            status: artifact.status,
            contentHash: artifact.contentHash ?? artifact.binaryHash,
          }
        : null,
    });
  } catch (error) {
    return apiError(error);
  }
}
