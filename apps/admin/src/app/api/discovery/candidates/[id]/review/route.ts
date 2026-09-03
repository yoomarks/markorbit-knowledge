import { NextResponse } from "next/server";
import { DEFAULT_WORKSPACE, RegistryValidationError } from "@markorbit/persistence";
import { resolveAdminBrowserApiMutationAccess } from "@/server/admin-browser-api-access";
import { apiError, readJson, requireRecord } from "@/server/api-errors";
import { getDiscoveryWorkflowService } from "@/server/discovery-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  try {
    const { principal } = await resolveAdminBrowserApiMutationAccess(request, DEFAULT_WORKSPACE.id);
    const { id } = await context.params;
    const body = requireRecord(await readJson(request));
    if (body.decision !== "ACCEPTED" && body.decision !== "REJECTED") {
      throw new RegistryValidationError("decision must be ACCEPTED or REJECTED");
    }
    if (body.note !== undefined && typeof body.note !== "string") {
      throw new RegistryValidationError("note must be a string");
    }

    const result = getDiscoveryWorkflowService().review(id, {
      decision: body.decision,
      note: typeof body.note === "string" ? body.note : undefined,
      reviewer: principal.userId,
    });
    return NextResponse.json(result);
  } catch (error) {
    return apiError(error);
  }
}
