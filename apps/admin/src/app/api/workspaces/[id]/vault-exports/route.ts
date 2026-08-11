import { NextResponse } from "next/server";
import { RegistryValidationError } from "@markorbit/persistence";
import { apiError, readJson, requireRecord } from "@/server/api-errors";
import { getConfiguredVaultExportService } from "@/server/vault-export-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    return NextResponse.json(getConfiguredVaultExportService().overview(id));
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const body = requireRecord(await readJson(request));
    const stagingDocumentId =
      typeof body.stagingDocumentId === "string" ? body.stagingDocumentId.trim() : "";
    if (!stagingDocumentId) {
      throw new RegistryValidationError("stagingDocumentId is required");
    }
    const { id } = await context.params;
    return NextResponse.json({
      run: getConfiguredVaultExportService().submit(id, stagingDocumentId),
    });
  } catch (error) {
    return apiError(error);
  }
}
