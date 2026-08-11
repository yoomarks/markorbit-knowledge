import { NextResponse } from "next/server";
import { RegistryValidationError } from "@markorbit/persistence";
import { apiError, readJson, requireRecord } from "@/server/api-errors";
import { getConfiguredCanonicalDownstreamPromotionService } from "@/server/canonical-downstream-promotion-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

function requestBody(value: unknown): { vaultStagingDocumentId: string } {
  const body = requireRecord(value);
  if (Object.keys(body).some((key) => key !== "vaultStagingDocumentId")) {
    throw new RegistryValidationError("Canonical promotion request contains unknown fields");
  }
  if (typeof body.vaultStagingDocumentId !== "string") {
    throw new RegistryValidationError("vaultStagingDocumentId is required");
  }
  return { vaultStagingDocumentId: body.vaultStagingDocumentId };
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    return NextResponse.json(getConfiguredCanonicalDownstreamPromotionService().overview(id));
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = requestBody(await readJson(request));
    const result = getConfiguredCanonicalDownstreamPromotionService().promote(
      id,
      body.vaultStagingDocumentId,
    );
    return NextResponse.json(result, { status: result.replayed ? 200 : 201 });
  } catch (error) {
    return apiError(error);
  }
}
