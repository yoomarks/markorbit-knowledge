import { NextResponse } from "next/server";
import { RegistryError, RegistryValidationError } from "@markorbit/persistence";
import { apiError } from "@/server/api-errors";
import { resolveOperatorServiceReadAccess } from "@/server/operator-service-api-access";
import { getRetrievalIndexRepository, getStagingContentRepository } from "@/server/source-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  try {
    const search = new URL(request.url).searchParams;
    const assertedWorkspaceId = search.get("workspaceId")?.trim();
    if (!assertedWorkspaceId) {
      throw new RegistryValidationError("workspaceId query parameter is required");
    }
    const principal = resolveOperatorServiceReadAccess(request, assertedWorkspaceId);
    const workspaceId = principal.workspaceId;
    const versionRaw = search.get("version")?.trim();
    let artifactVersion: number | undefined;
    if (versionRaw) {
      artifactVersion = Number(versionRaw);
      if (!Number.isSafeInteger(artifactVersion) || artifactVersion <= 0) {
        throw new RegistryValidationError("version query parameter must be a positive integer");
      }
    }

    const { id } = await context.params;
    const retrieval = getRetrievalIndexRepository();
    const document = retrieval.getDocument(workspaceId, id, artifactVersion);
    if (!document) {
      throw new RegistryError(
        "RETRIEVAL_DOCUMENT_NOT_FOUND",
        `Retrieval document ${id} was not found`,
      );
    }
    const bytes = getStagingContentRepository().readContent(
      document.stagingDocumentId,
      workspaceId,
    );
    const canonicalMarkdown = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    const result = retrieval.documentResult(workspaceId, id, canonicalMarkdown, artifactVersion);
    if (!result) {
      throw new RegistryError(
        "RETRIEVAL_DOCUMENT_NOT_FOUND",
        `Retrieval document ${id} was not found`,
      );
    }
    return NextResponse.json(result);
  } catch (error) {
    return apiError(error);
  }
}
