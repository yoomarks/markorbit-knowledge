import { NextResponse } from "next/server";
import { RegistryValidationError } from "@markorbit/persistence";
import { apiError } from "@/server/api-errors";
import { resolveOperatorServiceReadAccess } from "@/server/operator-service-api-access";
import { getDocumentChangeFeedRepository } from "@/server/source-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const search = new URL(request.url).searchParams;
    const workspaceId = search.get("workspaceId")?.trim();
    if (!workspaceId) throw new RegistryValidationError("workspaceId query parameter is required");
    resolveOperatorServiceReadAccess(request, workspaceId);

    const limitRaw = search.get("limit")?.trim();
    let limit: number | undefined;
    if (limitRaw) {
      limit = Number(limitRaw);
      if (!Number.isSafeInteger(limit) || limit <= 0) {
        throw new RegistryValidationError("limit query parameter must be a positive integer");
      }
    }

    const result = getDocumentChangeFeedRepository().feed({
      workspaceId,
      cursor: search.get("cursor")?.trim() || undefined,
      sourceId: search.get("sourceId")?.trim() || undefined,
      documentId: search.get("documentId")?.trim() || undefined,
      limit,
    });
    return NextResponse.json(result);
  } catch (error) {
    return apiError(error);
  }
}
