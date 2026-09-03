import { NextResponse } from "next/server";
import { RegistryValidationError } from "@markorbit/persistence";
import { SOURCE_COMPATIBILITY_REPROBE_EXECUTION_VERSION } from "@markorbit/persistence/source-compatibility-reprobe-executions";
import { resolveAdminBrowserApiReadAccess } from "@/server/admin-browser-api-access";
import { apiError } from "@/server/api-errors";
import { listCompatibilityReprobeExecutionHistory } from "@/server/source-compatibility-reprobe-execution-history";
import { getRegistryDatabase } from "@/server/source-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
    const assertedWorkspaceId = search.get("workspaceId")?.trim() || undefined;
    const { workspaceId } = await resolveAdminBrowserApiReadAccess(request, assertedWorkspaceId);
    const items = listCompatibilityReprobeExecutionHistory(getRegistryDatabase(), {
      workspaceId,
      jurisdiction: search.get("jurisdiction")?.trim() || undefined,
      targetId: search.get("targetId")?.trim() || undefined,
      status: search.get("status")?.trim() || undefined,
      limit: optionalLimit(search.get("limit")),
    });
    return NextResponse.json({
      version: SOURCE_COMPATIBILITY_REPROBE_EXECUTION_VERSION,
      objectType: "SOURCE_COMPATIBILITY_REPROBE_EXECUTION_LIST",
      workspaceId,
      executionPolicy: "READ_ONLY_HISTORY",
      workerCredentialExposed: false,
      items,
    });
  } catch (error) {
    return apiError(error);
  }
}
