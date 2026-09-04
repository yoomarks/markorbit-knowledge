import { NextResponse } from "next/server";
import { RegistryError, RegistryValidationError } from "@markorbit/persistence";
import {
  assertAdminBrowserResourceWorkspace,
  resolveAdminBrowserApiReadAccess,
} from "@/server/admin-browser-api-access";
import { apiError } from "@/server/api-errors";
import { getProducerCoreReliabilityDeliveryDetail } from "@/server/producer-core-reliability-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ submissionId: string }> };

export async function GET(request: Request, context: RouteContext) {
  try {
    const url = new URL(request.url);
    const assertedWorkspaceId = url.searchParams.get("workspaceId")?.trim();
    if (!assertedWorkspaceId) {
      throw new RegistryValidationError("workspaceId query parameter is required");
    }
    const asOf = url.searchParams.get("to")?.trim();
    if (!asOf || Number.isNaN(Date.parse(asOf))) {
      throw new RegistryValidationError("to query parameter must be an ISO timestamp");
    }

    const { principal, workspaceId } = await resolveAdminBrowserApiReadAccess(
      request,
      assertedWorkspaceId,
    );
    const { submissionId } = await context.params;
    if (!submissionId.startsWith("rvd_")) {
      throw new RegistryValidationError("submissionId must be a ReadyPackage V2 delivery id");
    }

    const detail = getProducerCoreReliabilityDeliveryDetail(workspaceId, submissionId, asOf);
    if (!detail) {
      throw new RegistryError(
        "READY_PACKAGE_V2_DELIVERY_NOT_FOUND",
        `ReadyPackage V2 delivery ${submissionId} was not found before ${asOf}`,
      );
    }
    assertAdminBrowserResourceWorkspace(principal, detail.workspaceId);
    return NextResponse.json(detail);
  } catch (error) {
    return apiError(error);
  }
}
