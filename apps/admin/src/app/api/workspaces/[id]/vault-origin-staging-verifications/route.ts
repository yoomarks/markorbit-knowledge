import { NextResponse } from "next/server";
import { RegistryValidationError } from "@markorbit/persistence";
import {
  resolveAdminBrowserApiMutationAccess,
  resolveAdminBrowserApiReadAccess,
} from "@/server/admin-browser-api-access";
import { apiError, readJson, requireRecord } from "@/server/api-errors";
import { getConfiguredVaultOriginStagingVerificationService } from "@/server/vault-origin-staging-verification-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

function requestBody(value: unknown): { vaultStagingDocumentId: string; idempotencyKey: string } {
  const body = requireRecord(value);
  if (
    Object.keys(body).some((key) => key !== "vaultStagingDocumentId" && key !== "idempotencyKey")
  ) {
    throw new RegistryValidationError("Vault-origin verification request contains unknown fields");
  }
  if (typeof body.vaultStagingDocumentId !== "string") {
    throw new RegistryValidationError("vaultStagingDocumentId is required");
  }
  if (typeof body.idempotencyKey !== "string") {
    throw new RegistryValidationError("idempotencyKey is required");
  }
  return {
    vaultStagingDocumentId: body.vaultStagingDocumentId,
    idempotencyKey: body.idempotencyKey,
  };
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { workspaceId } = await resolveAdminBrowserApiReadAccess(request, id);
    return NextResponse.json(
      getConfiguredVaultOriginStagingVerificationService().overview(workspaceId),
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { workspaceId } = await resolveAdminBrowserApiMutationAccess(request, id);
    const body = requestBody(await readJson(request));
    return NextResponse.json(
      getConfiguredVaultOriginStagingVerificationService().verify(
        workspaceId,
        body.vaultStagingDocumentId,
        body.idempotencyKey,
      ),
    );
  } catch (error) {
    return apiError(error);
  }
}
