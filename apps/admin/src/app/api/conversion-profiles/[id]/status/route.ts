import { NextResponse } from "next/server";
import { CONVERSION_PROFILE_STATUSES, type ConversionProfileStatus } from "@markorbit/contracts";
import { RegistryValidationError } from "@markorbit/persistence";
import { ConversionProfileNotFoundError } from "@markorbit/persistence/converters";
import {
  assertAdminBrowserResourceWorkspace,
  resolveAdminBrowserApiMutationAccess,
} from "@/server/admin-browser-api-access";
import { apiError, readJson, requireRecord } from "@/server/api-errors";
import { getConverterRegistryRepository } from "@/server/source-registry";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
export async function POST(request: Request, context: Context) {
  try {
    const { id } = await context.params;
    const existing = getConverterRegistryRepository().getProfile(id);
    if (!existing) throw new ConversionProfileNotFoundError(id);
    const { principal } = await resolveAdminBrowserApiMutationAccess(request, existing.workspaceId);
    assertAdminBrowserResourceWorkspace(principal, existing.workspaceId);
    const body = requireRecord(await readJson(request));
    if (
      !CONVERSION_PROFILE_STATUSES.includes(body.status as ConversionProfileStatus) ||
      typeof body.expectedUpdatedAt !== "string"
    )
      throw new RegistryValidationError("status and expectedUpdatedAt are required");
    return NextResponse.json({
      profile: getConverterRegistryRepository().updateProfileStatus(
        id,
        body.status as ConversionProfileStatus,
        body.expectedUpdatedAt,
      ),
    });
  } catch (error) {
    return apiError(error);
  }
}
