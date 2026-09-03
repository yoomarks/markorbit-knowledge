import { NextResponse } from "next/server";
import { RegistryValidationError } from "@markorbit/persistence";
import {
  resolveAdminBrowserApiMutationAccess,
  resolveAdminBrowserApiReadAccess,
} from "@/server/admin-browser-api-access";
import { apiError, readJson, requireRecord } from "@/server/api-errors";
import { getConfiguredVaultImportIntentService } from "@/server/vault-import-intent-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

function requestBody(value: unknown) {
  const body = requireRecord(value);
  const allowed = new Set(["inspectionRunId", "vaultRelativePath", "reviewNote"]);
  if (Object.keys(body).some((key) => !allowed.has(key))) {
    throw new RegistryValidationError("Vault import intent request contains unknown fields");
  }
  if (typeof body.inspectionRunId !== "string" || typeof body.vaultRelativePath !== "string") {
    throw new RegistryValidationError("inspectionRunId and vaultRelativePath are required strings");
  }
  if (body.reviewNote !== undefined && typeof body.reviewNote !== "string") {
    throw new RegistryValidationError("reviewNote must be a string when provided");
  }
  return {
    inspectionRunId: body.inspectionRunId,
    vaultRelativePath: body.vaultRelativePath,
    ...(body.reviewNote !== undefined ? { reviewNote: body.reviewNote } : {}),
  };
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { workspaceId } = await resolveAdminBrowserApiReadAccess(request, id);
    return NextResponse.json(getConfiguredVaultImportIntentService().overview(workspaceId));
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { workspaceId } = await resolveAdminBrowserApiMutationAccess(request, id);
    const result = getConfiguredVaultImportIntentService().review(
      workspaceId,
      requestBody(await readJson(request)),
    );
    return NextResponse.json(result, { status: result.replayed ? 200 : 201 });
  } catch (error) {
    return apiError(error);
  }
}
