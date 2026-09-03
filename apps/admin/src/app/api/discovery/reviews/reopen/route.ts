import { NextResponse } from "next/server";
import { DEFAULT_WORKSPACE, RegistryValidationError } from "@markorbit/persistence";
import { resolveAdminBrowserApiMutationAccess } from "@/server/admin-browser-api-access";
import { apiError, readJson, requireRecord } from "@/server/api-errors";
import { getDiscoveryWorkflowService } from "@/server/discovery-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Recovery is an explicit operator action. It never reopens accepted candidates.
export async function POST(request: Request) {
  try {
    const { principal } = await resolveAdminBrowserApiMutationAccess(request, DEFAULT_WORKSPACE.id);
    const body = requireRecord(await readJson(request));
    if (typeof body.candidateId !== "string" || !body.candidateId.trim()) {
      throw new RegistryValidationError("candidateId must be a non-empty string");
    }
    if (body.note !== undefined && typeof body.note !== "string") {
      throw new RegistryValidationError("note must be a string");
    }

    const candidateId = body.candidateId.trim();
    const result = getDiscoveryWorkflowService().reopen(candidateId, {
      reviewer: principal.userId,
      note: typeof body.note === "string" && body.note.trim() ? body.note.trim() : undefined,
    });

    return NextResponse.json({
      candidateId,
      status: result.candidate.candidate.status,
      candidate: result.candidate,
    });
  } catch (error) {
    return apiError(error);
  }
}
