import { NextResponse } from "next/server";
import { RegistryError } from "@markorbit/persistence";
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
    const repository = new SqliteEvidenceSetRegistryRepository(getRegistryDatabase());
    const evidenceSet = repository.getById(workspaceId, id);
    if (!evidenceSet) {
      throw new RegistryError("EVIDENCE_SET_NOT_FOUND", `Evidence Set ${id} was not found`);
    }
    return NextResponse.json({ evidenceSet, drift: repository.drift(workspaceId, id) });
  } catch (error) {
    return apiError(error);
  }
}
