import { NextResponse } from "next/server";
import { RegistryValidationError } from "@markorbit/persistence";
import { apiError } from "@/server/api-errors";
import { listFoundationalConversionRecovery } from "@/server/foundational-conversion-recovery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const workspaceId = url.searchParams.get("workspaceId")?.trim() ?? "";
    const jurisdiction = url.searchParams.get("jurisdiction")?.trim() ?? "";
    const targetId = url.searchParams.get("targetId")?.trim() ?? "";
    if (!workspaceId) throw new RegistryValidationError("workspaceId is required");
    if (!jurisdiction) throw new RegistryValidationError("jurisdiction is required");
    if (!targetId) throw new RegistryValidationError("targetId is required");

    return NextResponse.json(
      listFoundationalConversionRecovery({ workspaceId, jurisdiction, targetId }),
    );
  } catch (error) {
    return apiError(error);
  }
}
