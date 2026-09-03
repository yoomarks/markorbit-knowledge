import { NextResponse } from "next/server";
import { RegistryValidationError } from "@markorbit/persistence";
import { resolveAdminBrowserApiReadAccess } from "@/server/admin-browser-api-access";
import { apiError } from "@/server/api-errors";
import { buildFoundationalRemediationQueueSnapshot } from "@/server/foundational-remediation-queue";
import { getRegistryDatabase } from "@/server/source-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function topKParam(value: string | null): number | undefined {
  const normalized = value?.trim();
  if (!normalized) return undefined;
  const parsed = Number(normalized);
  if (!Number.isSafeInteger(parsed) || parsed <= 0 || parsed > 20) {
    throw new RegistryValidationError("topK query parameter must be an integer between 1 and 20");
  }
  return parsed;
}

export async function GET(request: Request) {
  try {
    const search = new URL(request.url).searchParams;
    const assertedWorkspaceId = search.get("workspaceId")?.trim() || undefined;
    const { workspaceId } = await resolveAdminBrowserApiReadAccess(request, assertedWorkspaceId);
    const jurisdiction = search.get("jurisdiction")?.trim();
    if (!jurisdiction) {
      throw new RegistryValidationError("jurisdiction query parameter is required");
    }

    return NextResponse.json(
      buildFoundationalRemediationQueueSnapshot(getRegistryDatabase(), {
        workspaceId,
        jurisdiction,
        targetId: search.get("targetId")?.trim() || undefined,
        topK: topKParam(search.get("topK")),
      }),
    );
  } catch (error) {
    return apiError(error);
  }
}
