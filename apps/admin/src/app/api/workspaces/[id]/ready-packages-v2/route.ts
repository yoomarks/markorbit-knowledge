import { NextResponse } from "next/server";
import { RegistryValidationError } from "@markorbit/persistence";
import {
  resolveAdminBrowserApiMutationAccess,
  resolveAdminBrowserApiReadAccess,
} from "@/server/admin-browser-api-access";
import { apiError, readJson, requireRecord } from "@/server/api-errors";
import { getConfiguredReadyPackageV2Service } from "@/server/ready-package-v2-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

function requestBody(value: unknown): { canonicalDocumentId: string } {
  const body = requireRecord(value);
  if (Object.keys(body).some((key) => key !== "canonicalDocumentId")) {
    throw new RegistryValidationError("ReadyPackage V2 request contains unknown fields");
  }
  if (typeof body.canonicalDocumentId !== "string") {
    throw new RegistryValidationError("canonicalDocumentId is required");
  }
  return { canonicalDocumentId: body.canonicalDocumentId };
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { workspaceId } = await resolveAdminBrowserApiReadAccess(request, id);
    return NextResponse.json(getConfiguredReadyPackageV2Service().overview(workspaceId));
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { workspaceId } = await resolveAdminBrowserApiMutationAccess(request, id);
    const body = requestBody(await readJson(request));
    const result = getConfiguredReadyPackageV2Service().create(
      workspaceId,
      body.canonicalDocumentId,
    );
    return NextResponse.json(result, { status: result.replayed ? 200 : 201 });
  } catch (error) {
    return apiError(error);
  }
}
