import { NextResponse } from "next/server";
import { SqliteEvidenceSetRegistryRepository } from "@markorbit/persistence/evidence-sets";
import { resolveAdminBrowserApiReadAccess } from "@/server/admin-browser-api-access";
import { apiError } from "@/server/api-errors";
import { requiredKnowledgeWorkspaceId } from "@/server/knowledge-workspace-access";
import { getRegistryDatabase } from "@/server/source-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const { workspaceId } = await resolveAdminBrowserApiReadAccess(
      request,
      requiredKnowledgeWorkspaceId(request),
    );
    const exported = new SqliteEvidenceSetRegistryRepository(getRegistryDatabase()).exportById(
      workspaceId,
      id,
    );
    return NextResponse.json(exported, {
      headers: {
        "Cache-Control": "no-store",
        "Content-Disposition": `attachment; filename="${id}-evidence-set-v1.json"`,
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
