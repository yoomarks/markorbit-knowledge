import { NextResponse } from "next/server";
import { RegistryValidationError } from "@markorbit/persistence";
import { FOUNDATIONAL_ACTION_EXECUTION_PROTOCOL_VERSION } from "@markorbit/worker-runtime/foundational-action-execution";
import { resolveAdminBrowserApiReadAccess } from "@/server/admin-browser-api-access";
import { apiError } from "@/server/api-errors";
import { listFoundationalActionExecutions } from "@/server/foundational-action-executions";
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
    const items = listFoundationalActionExecutions(getRegistryDatabase(), {
      workspaceId,
      jurisdiction: search.get("jurisdiction")?.trim() || undefined,
      targetId: search.get("targetId")?.trim() || undefined,
      executedByActorId: search.get("executedByActorId")?.trim() || undefined,
      limit: optionalLimit(search.get("limit")),
    });
    return NextResponse.json({
      protocolVersion: FOUNDATIONAL_ACTION_EXECUTION_PROTOCOL_VERSION,
      objectType: "FOUNDATIONAL_ACTION_EXECUTION_LIST",
      workspaceId,
      executionPolicy: "EXPLICIT_APPROVED_COLLECTION_INTENT_ONLY",
      items,
    });
  } catch (error) {
    return apiError(error);
  }
}
