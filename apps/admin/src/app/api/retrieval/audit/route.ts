import { NextResponse } from "next/server";
import { RegistryValidationError } from "@markorbit/persistence";
import { SqliteRetrievalQualityAuditRepository } from "@markorbit/persistence/retrieval-quality-audit";
import { apiError } from "@/server/api-errors";
import { getRegistryDatabase } from "@/server/source-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const search = new URL(request.url).searchParams;
    const workspaceId = search.get("workspaceId")?.trim();
    if (!workspaceId) throw new RegistryValidationError("workspaceId query parameter is required");

    const includeHistoricalRaw = search.get("includeHistorical")?.trim();
    if (includeHistoricalRaw && !["true", "false"].includes(includeHistoricalRaw)) {
      throw new RegistryValidationError("includeHistorical query parameter must be true or false");
    }

    const repository = new SqliteRetrievalQualityAuditRepository(getRegistryDatabase());
    return NextResponse.json(
      repository.list({
        workspaceId,
        sourceId: search.get("sourceId")?.trim() || undefined,
        jurisdiction: search.get("jurisdiction")?.trim() || undefined,
        includeHistorical: includeHistoricalRaw === "true",
      }),
    );
  } catch (error) {
    return apiError(error);
  }
}
