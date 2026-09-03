import { NextResponse } from "next/server";
import { RegistryValidationError } from "@markorbit/persistence";
import { resolveAdminBrowserApiReadAccess } from "@/server/admin-browser-api-access";
import { apiError } from "@/server/api-errors";
import { listFoundationalCollectionOutcomes } from "@/server/foundational-collection-outcomes";
import { getRegistryDatabase } from "@/server/source-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function required(value: string | null, field: string): string {
  const normalized = value?.trim() ?? "";
  if (!normalized) throw new RegistryValidationError(`${field} query parameter is required`);
  return normalized;
}

function optionalLimit(value: string | null): number | undefined {
  if (!value?.trim()) return undefined;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0 || parsed > 100) {
    throw new RegistryValidationError("limit must be an integer between 1 and 100");
  }
  return parsed;
}

export async function GET(request: Request) {
  try {
    const search = new URL(request.url).searchParams;
    const assertedWorkspaceId = required(search.get("workspaceId"), "workspaceId");
    const { workspaceId } = await resolveAdminBrowserApiReadAccess(request, assertedWorkspaceId);
    const result = listFoundationalCollectionOutcomes(getRegistryDatabase(), {
      workspaceId,
      jurisdiction: required(search.get("jurisdiction"), "jurisdiction"),
      targetId: search.get("targetId")?.trim() || undefined,
      limit: optionalLimit(search.get("limit")),
    });
    return NextResponse.json(result);
  } catch (error) {
    return apiError(error);
  }
}
