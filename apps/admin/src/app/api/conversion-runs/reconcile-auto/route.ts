import { NextResponse } from "next/server";
import { RegistryValidationError } from "@markorbit/persistence";
import { apiError, readJson, requireRecord } from "@/server/api-errors";
import { resolveOperatorServiceMutationAccess } from "@/server/operator-service-api-access";
import { reconcileAutomaticConversions } from "@/server/raw-artifact-auto-conversion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = requireRecord(await readJson(request));
    const workspaceId = typeof body.workspaceId === "string" ? body.workspaceId.trim() : "";
    if (!workspaceId) throw new RegistryValidationError("workspaceId is required");
    resolveOperatorServiceMutationAccess(request, workspaceId);

    const limit = body.limit === undefined ? undefined : Number(body.limit);
    if (limit !== undefined && (!Number.isInteger(limit) || limit <= 0 || limit > 100)) {
      throw new RegistryValidationError("limit must be an integer between 1 and 100");
    }

    return NextResponse.json({
      result: reconcileAutomaticConversions(workspaceId, { limit }),
    });
  } catch (error) {
    return apiError(error);
  }
}
