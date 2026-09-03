import { NextResponse } from "next/server";
import { RegistryValidationError } from "@markorbit/persistence";
import { resolveAdminBrowserApiReadAccess } from "@/server/admin-browser-api-access";
import { apiError } from "@/server/api-errors";
import { listFoundationalConversionRecovery } from "@/server/foundational-conversion-recovery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const assertedWorkspaceId = url.searchParams.get("workspaceId")?.trim() || undefined;
    const { workspaceId } = await resolveAdminBrowserApiReadAccess(request, assertedWorkspaceId);
    const jurisdiction = url.searchParams.get("jurisdiction")?.trim() ?? "";
    const targetId = url.searchParams.get("targetId")?.trim() ?? "";
    if (!jurisdiction) throw new RegistryValidationError("jurisdiction is required");
    if (!targetId) throw new RegistryValidationError("targetId is required");

    return NextResponse.json(
      listFoundationalConversionRecovery({ workspaceId, jurisdiction, targetId }),
    );
  } catch (error) {
    return apiError(error);
  }
}
