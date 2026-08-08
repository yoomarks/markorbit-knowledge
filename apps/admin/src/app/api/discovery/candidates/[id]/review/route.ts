import { NextResponse } from "next/server";
import { RegistryValidationError } from "@markorbit/persistence";
import { apiError, readJson, requireRecord } from "@/server/api-errors";
import { getDiscoveryWorkflowService } from "@/server/discovery-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = requireRecord(await readJson(request));
    if (body.decision !== "ACCEPTED" && body.decision !== "REJECTED") {
      throw new RegistryValidationError("decision must be ACCEPTED or REJECTED");
    }
    if (body.note !== undefined && typeof body.note !== "string") {
      throw new RegistryValidationError("note must be a string");
    }
    if (body.reviewer !== undefined && typeof body.reviewer !== "string") {
      throw new RegistryValidationError("reviewer must be a string");
    }

    const result = getDiscoveryWorkflowService().review(id, {
      decision: body.decision,
      note: typeof body.note === "string" ? body.note : undefined,
      reviewer: typeof body.reviewer === "string" ? body.reviewer : "admin-console",
    });
    return NextResponse.json(result);
  } catch (error) {
    return apiError(error);
  }
}
