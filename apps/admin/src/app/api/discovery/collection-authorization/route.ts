import { NextResponse } from "next/server";
import { DEFAULT_WORKSPACE, RegistryValidationError } from "@markorbit/persistence";
import { resolveAdminBrowserApiMutationAccess } from "@/server/admin-browser-api-access";
import { apiError, readJson, requireRecord } from "@/server/api-errors";
import { getDiscoveryCollectionService } from "@/server/discovery-collection-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = requireRecord(await readJson(request));
    if (typeof body.candidateId !== "string" || !body.candidateId.trim()) {
      throw new RegistryValidationError("candidateId is required");
    }

    const { principal } = await resolveAdminBrowserApiMutationAccess(request, DEFAULT_WORKSPACE.id);
    const candidateId = body.candidateId.trim();
    const result = getDiscoveryCollectionService().authorizeAndDispatch(candidateId, {
      requestedBy: principal.userId,
    });

    return NextResponse.json({
      candidateId,
      sourceId: result.source.id,
      planId: result.plan.id,
      planStatus: result.plan.status,
      runId: result.run.id,
      jobCount: result.jobs.length,
      replayed: result.replayed,
    });
  } catch (error) {
    return apiError(error);
  }
}
