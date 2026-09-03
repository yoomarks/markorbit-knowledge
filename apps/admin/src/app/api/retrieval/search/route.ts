import { NextResponse } from "next/server";
import { AUTHORITY_LEVELS, type AuthorityLevel } from "@markorbit/contracts";
import { RegistryValidationError } from "@markorbit/persistence";
import { apiError } from "@/server/api-errors";
import { resolveOperatorServiceReadAccess } from "@/server/operator-service-api-access";
import { getRetrievalIndexRepository } from "@/server/source-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const search = new URL(request.url).searchParams;
    const assertedWorkspaceId = search.get("workspaceId")?.trim();
    const query = search.get("q")?.trim();
    if (!assertedWorkspaceId) {
      throw new RegistryValidationError("workspaceId query parameter is required");
    }
    if (!query) throw new RegistryValidationError("q query parameter is required");
    const principal = resolveOperatorServiceReadAccess(request, assertedWorkspaceId);

    const authorityRaw = search.get("authorityLevel")?.trim();
    let authorityLevel: AuthorityLevel | undefined;
    if (authorityRaw) {
      if (!AUTHORITY_LEVELS.includes(authorityRaw as AuthorityLevel)) {
        throw new RegistryValidationError("authorityLevel query parameter is invalid");
      }
      authorityLevel = authorityRaw as AuthorityLevel;
    }

    const limitRaw = search.get("limit")?.trim();
    let limit: number | undefined;
    if (limitRaw) {
      limit = Number(limitRaw);
      if (!Number.isSafeInteger(limit) || limit <= 0) {
        throw new RegistryValidationError("limit query parameter must be a positive integer");
      }
    }

    const result = getRetrievalIndexRepository().search({
      workspaceId: principal.workspaceId,
      query,
      sourceId: search.get("sourceId")?.trim() || undefined,
      jurisdiction: search.get("jurisdiction")?.trim() || undefined,
      language: search.get("language")?.trim() || undefined,
      authorityLevel,
      limit,
    });
    return NextResponse.json(result);
  } catch (error) {
    return apiError(error);
  }
}
