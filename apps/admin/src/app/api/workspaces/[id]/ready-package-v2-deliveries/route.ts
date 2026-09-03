import { NextResponse } from "next/server";
import { RegistryValidationError } from "@markorbit/persistence";
import {
  resolveAdminBrowserApiMutationAccess,
  resolveAdminBrowserApiReadAccess,
} from "@/server/admin-browser-api-access";
import { apiError, readJson, requireRecord } from "@/server/api-errors";
import {
  getConfiguredReadyPackageV2DeliveryService,
  readyPackageV2DeliverySubmissionView,
} from "@/server/ready-package-v2-delivery-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };
type Action = "PREPARE" | "SUBMIT";

function requestBody(value: unknown): { action: Action; readyPackageId: string } {
  const body = requireRecord(value);
  if (Object.keys(body).some((key) => key !== "action" && key !== "readyPackageId")) {
    throw new RegistryValidationError("ReadyPackage V2 delivery request contains unknown fields");
  }
  if (body.action !== "PREPARE" && body.action !== "SUBMIT") {
    throw new RegistryValidationError("action must be PREPARE or SUBMIT");
  }
  if (typeof body.readyPackageId !== "string" || !body.readyPackageId.trim()) {
    throw new RegistryValidationError("readyPackageId is required");
  }
  return { action: body.action, readyPackageId: body.readyPackageId };
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { workspaceId } = await resolveAdminBrowserApiReadAccess(request, id);
    return NextResponse.json(getConfiguredReadyPackageV2DeliveryService().overview(workspaceId));
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { workspaceId } = await resolveAdminBrowserApiMutationAccess(request, id);
    const body = requestBody(await readJson(request));
    const service = getConfiguredReadyPackageV2DeliveryService();
    const result =
      body.action === "PREPARE"
        ? service.prepare(workspaceId, body.readyPackageId)
        : await service.submit(workspaceId, body.readyPackageId);
    return NextResponse.json(
      {
        submission: readyPackageV2DeliverySubmissionView(result.submission),
        replayed: result.replayed,
        transportUsed: result.transportUsed,
      },
      { status: body.action === "PREPARE" && !result.replayed ? 201 : 200 },
    );
  } catch (error) {
    return apiError(error);
  }
}
