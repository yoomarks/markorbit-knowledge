import { NextResponse } from "next/server";
import { RegistryValidationError } from "@markorbit/persistence";
import { SqliteRetrievalRelevanceAuditRepository } from "@markorbit/persistence/retrieval-relevance-audit";
import { apiError } from "@/server/api-errors";
import { getRegistryDatabase } from "@/server/source-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const search = new URL(request.url).searchParams;
    const workspaceId = search.get("workspaceId")?.trim();
    if (!workspaceId) throw new RegistryValidationError("workspaceId query parameter is required");

    const topKRaw = search.get("topK")?.trim();
    let topK: number | undefined;
    if (topKRaw) {
      topK = Number(topKRaw);
      if (!Number.isSafeInteger(topK) || topK <= 0) {
        throw new RegistryValidationError("topK query parameter must be a positive integer");
      }
    }

    const repository = new SqliteRetrievalRelevanceAuditRepository(getRegistryDatabase());
    return NextResponse.json(
      repository.list({
        workspaceId,
        jurisdiction: search.get("jurisdiction")?.trim() || undefined,
        targetId: search.get("targetId")?.trim() || undefined,
        topK,
      }),
    );
  } catch (error) {
    return apiError(error);
  }
}
