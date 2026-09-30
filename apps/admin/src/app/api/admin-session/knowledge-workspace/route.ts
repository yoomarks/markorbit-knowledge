import { NextResponse } from "next/server";
import { apiError } from "@/server/api-errors";
import { provisionAdminBrowserKnowledgeWorkspace } from "@/server/admin-browser-workspace-provisioning";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const result = await provisionAdminBrowserKnowledgeWorkspace(request);
    return NextResponse.json(
      {
        workspaceId: result.workspace.id,
        created: result.created,
      },
      { status: result.created ? 201 : 200 },
    );
  } catch (error) {
    return apiError(error);
  }
}
