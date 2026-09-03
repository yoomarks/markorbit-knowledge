import { NextResponse } from "next/server";
import { RegistryValidationError } from "@markorbit/persistence";
import {
  resolveAdminBrowserApiMutationAccess,
  resolveAdminBrowserApiReadAccess,
} from "@/server/admin-browser-api-access";
import { apiError, readJson, requireRecord } from "@/server/api-errors";
import { getConfiguredVaultImportExecutionService } from "@/server/vault-import-execution-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

function requestBody(value: unknown): { importIntentId: string } {
  const body = requireRecord(value);
  if (Object.keys(body).some((key) => key !== "importIntentId")) {
    throw new RegistryValidationError("Vault import execution request contains unknown fields");
  }
  if (typeof body.importIntentId !== "string") {
    throw new RegistryValidationError("importIntentId is required");
  }
  return { importIntentId: body.importIntentId };
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { workspaceId } = await resolveAdminBrowserApiReadAccess(request, id);
    return NextResponse.json(getConfiguredVaultImportExecutionService().overview(workspaceId));
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { workspaceId } = await resolveAdminBrowserApiMutationAccess(request, id);
    const body = requestBody(await readJson(request));
    const execution = getConfiguredVaultImportExecutionService().execute(
      workspaceId,
      body.importIntentId,
    );
    return NextResponse.json({ execution }, { status: execution.state === "PENDING" ? 202 : 200 });
  } catch (error) {
    return apiError(error);
  }
}
