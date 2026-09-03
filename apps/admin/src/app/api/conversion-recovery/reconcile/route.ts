import { NextResponse } from "next/server";
import { RegistryValidationError } from "@markorbit/persistence";
import { apiError, readJson, requireRecord } from "@/server/api-errors";
import { reconcileConversionFailures } from "@/server/conversion-failure-recovery";
import { resolveOperatorServiceMutationAccess } from "@/server/operator-service-api-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = requireRecord(await readJson(request));
    const workspaceId = typeof body.workspaceId === "string" ? body.workspaceId.trim() : "";
    if (!workspaceId) throw new RegistryValidationError("workspaceId is required");
    resolveOperatorServiceMutationAccess(request, workspaceId);
    const limit = body.limit === undefined ? undefined : Number(body.limit);
    const maxRetries = body.maxRetries === undefined ? undefined : Number(body.maxRetries);
    if (limit !== undefined && (!Number.isInteger(limit) || limit <= 0 || limit > 100)) {
      throw new RegistryValidationError("limit must be an integer between 1 and 100");
    }
    if (
      maxRetries !== undefined &&
      (!Number.isInteger(maxRetries) || maxRetries < 0 || maxRetries > 10)
    ) {
      throw new RegistryValidationError("maxRetries must be an integer between 0 and 10");
    }
    return NextResponse.json({
      result: reconcileConversionFailures(workspaceId, { limit, maxRetries }),
    });
  } catch (error) {
    return apiError(error);
  }
}
