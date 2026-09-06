import { NextResponse } from "next/server";
import { apiError } from "@/server/api-errors";
import { getControlPlaneEvidenceSupplyHealthOwnerView } from "@/server/control-plane-evidence-supply-health-owner";
import { authenticateControlPlaneOwnerReadRequest } from "@/server/control-plane-owner-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const assertedWorkspaceId = url.searchParams.get("workspaceId")?.trim() || undefined;
    const principal = authenticateControlPlaneOwnerReadRequest(request, assertedWorkspaceId);
    return NextResponse.json(getControlPlaneEvidenceSupplyHealthOwnerView(principal.workspaceId));
  } catch (error) {
    return apiError(error);
  }
}
