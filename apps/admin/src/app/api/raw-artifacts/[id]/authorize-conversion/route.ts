import { NextResponse } from "next/server";
import { RegistryValidationError } from "@markorbit/persistence";
import { apiError, readJson, requireRecord } from "@/server/api-errors";
import { authorizeRawArtifactForConversion } from "@/server/raw-artifact-conversion-authorization";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  try {
    const body = requireRecord(await readJson(request));
    const workspaceId = typeof body.workspaceId === "string" ? body.workspaceId.trim() : "";
    if (!workspaceId) throw new RegistryValidationError("workspaceId is required");
    const { id } = await context.params;
    return NextResponse.json({ result: authorizeRawArtifactForConversion(id, workspaceId) });
  } catch (error) {
    return apiError(error);
  }
}
