import { NextResponse } from "next/server";
import { resolveAdminBrowserApiReadAccess } from "@/server/admin-browser-api-access";
import { apiError } from "@/server/api-errors";
import { getRegistryDatabase } from "@/server/source-registry";
import { readWebAcquisitionCampaignProgress } from "@/server/web-acquisition-campaign-progress";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ campaignId: string }> }) {
  try {
    const search = new URL(request.url).searchParams;
    const assertedWorkspaceId = search.get("workspaceId")?.trim() || undefined;
    const { workspaceId } = await resolveAdminBrowserApiReadAccess(request, assertedWorkspaceId);
    const { campaignId } = await context.params;
    return NextResponse.json(
      readWebAcquisitionCampaignProgress(getRegistryDatabase(), { workspaceId, campaignId }),
    );
  } catch (error) {
    return apiError(error);
  }
}
