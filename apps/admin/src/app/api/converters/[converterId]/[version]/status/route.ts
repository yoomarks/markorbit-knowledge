import { NextResponse } from "next/server";
import { CONVERTER_STATUSES, type ConverterStatus } from "@markorbit/contracts";
import { RegistryValidationError } from "@markorbit/persistence";
import { resolveAdminBrowserApiMutationAccess } from "@/server/admin-browser-api-access";
import { apiError, readJson, requireRecord } from "@/server/api-errors";
import { getConverterRegistryRepository } from "@/server/source-registry";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ converterId: string; version: string }> };
export async function POST(request: Request, context: Context) {
  try {
    await resolveAdminBrowserApiMutationAccess(request);
    const body = requireRecord(await readJson(request));
    if (!CONVERTER_STATUSES.includes(body.status as ConverterStatus))
      throw new RegistryValidationError("Unknown converter status");
    const { converterId, version } = await context.params;
    return NextResponse.json({
      record: getConverterRegistryRepository().updateManifestStatus(
        converterId,
        version,
        body.status as ConverterStatus,
      ),
    });
  } catch (error) {
    return apiError(error);
  }
}
