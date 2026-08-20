import { NextResponse } from "next/server";
import { RegistryValidationError } from "@markorbit/persistence";
import { SqliteDocumentChangeEvidenceRepository } from "@markorbit/persistence/document-change-evidence";
import { apiError } from "@/server/api-errors";
import { getRegistryDatabase } from "@/server/source-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function positiveLimit(value: string | null): number | undefined {
  const normalized = value?.trim();
  if (!normalized) return undefined;
  const limit = Number(normalized);
  if (!Number.isSafeInteger(limit) || limit <= 0) {
    throw new RegistryValidationError("limit query parameter must be a positive integer");
  }
  return limit;
}

export async function GET(request: Request) {
  try {
    const search = new URL(request.url).searchParams;
    const workspaceId = search.get("workspaceId")?.trim();
    if (!workspaceId) throw new RegistryValidationError("workspaceId query parameter is required");

    const result = new SqliteDocumentChangeEvidenceRepository(getRegistryDatabase()).feed({
      workspaceId,
      cursor: search.get("cursor")?.trim() || undefined,
      sourceId: search.get("sourceId")?.trim() || undefined,
      documentId: search.get("documentId")?.trim() || undefined,
      limit: positiveLimit(search.get("limit")),
    });
    return NextResponse.json(result);
  } catch (error) {
    return apiError(error);
  }
}
