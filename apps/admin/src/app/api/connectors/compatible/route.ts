import { NextResponse } from "next/server";
import { SOURCE_TYPES, type SourceType } from "@markorbit/contracts";
import { RegistryValidationError } from "@markorbit/persistence";
import { resolveAdminBrowserApiReadAccess } from "@/server/admin-browser-api-access";
import { apiError } from "@/server/api-errors";
import { getConnectorRepository } from "@/server/source-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await resolveAdminBrowserApiReadAccess(request);
    const sourceType = new URL(request.url).searchParams.get("sourceType");
    if (!sourceType || !SOURCE_TYPES.includes(sourceType as SourceType)) {
      throw new RegistryValidationError("A valid sourceType is required");
    }
    return NextResponse.json({
      sourceType,
      items: getConnectorRepository().compatible(sourceType as SourceType),
      runtimeHealthEvidence: "NOT_EVALUATED",
    });
  } catch (error) {
    return apiError(error);
  }
}
