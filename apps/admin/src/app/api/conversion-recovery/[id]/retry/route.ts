import { NextResponse } from "next/server";
import { RegistryValidationError } from "@markorbit/persistence";
import { apiError, readJson, requireRecord } from "@/server/api-errors";
import { retryConversionRecoveryCaseNow } from "@/server/conversion-failure-recovery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = requireRecord(await readJson(request));
    const workspaceId = typeof body.workspaceId === "string" ? body.workspaceId.trim() : "";
    const actorId = typeof body.actorId === "string" ? body.actorId.trim() : "";
    if (!workspaceId) throw new RegistryValidationError("workspaceId is required");
    if (!actorId) throw new RegistryValidationError("actorId is required");
    return NextResponse.json(
      retryConversionRecoveryCaseNow(id, {
        workspaceId,
        actorId,
      }),
    );
  } catch (error) {
    return apiError(error);
  }
}
