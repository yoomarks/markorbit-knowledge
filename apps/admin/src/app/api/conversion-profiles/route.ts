import { NextResponse } from "next/server";
import { CONVERSION_PROFILE_STATUSES, type ConversionProfileStatus } from "@markorbit/contracts";
import { RegistryValidationError } from "@markorbit/persistence";
import type { CreateConversionProfileInput } from "@markorbit/persistence/converters";
import {
  resolveAdminBrowserApiMutationAccess,
  resolveAdminBrowserApiReadAccess,
} from "@/server/admin-browser-api-access";
import { apiError, readJson, requireRecord } from "@/server/api-errors";
import { getConverterRegistryRepository } from "@/server/source-registry";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
function integer(value: string | null, fallback: number) {
  const parsed = value ? Number(value) : fallback;
  if (!Number.isInteger(parsed)) throw new RegistryValidationError("Pagination must be integer");
  return parsed;
}
export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const assertedWorkspaceId = params.get("workspaceId") ?? undefined;
    const { workspaceId } = await resolveAdminBrowserApiReadAccess(request, assertedWorkspaceId);
    const status = params.get("status") ?? undefined;
    if (status && !CONVERSION_PROFILE_STATUSES.includes(status as ConversionProfileStatus))
      throw new RegistryValidationError("Unknown profile status");
    return NextResponse.json(
      getConverterRegistryRepository().listProfiles({
        workspaceId,
        sourceId: params.get("sourceId") ?? undefined,
        converterId: params.get("converterId") ?? undefined,
        status: status as ConversionProfileStatus | undefined,
        q: params.get("q") ?? undefined,
        limit: integer(params.get("limit"), 25),
        offset: integer(params.get("offset"), 0),
      }),
    );
  } catch (error) {
    return apiError(error);
  }
}
export async function POST(request: Request) {
  try {
    const body = requireRecord(await readJson(request));
    const assertedWorkspaceId = typeof body.workspaceId === "string" ? body.workspaceId : undefined;
    const { workspaceId } = await resolveAdminBrowserApiMutationAccess(
      request,
      assertedWorkspaceId,
    );
    return NextResponse.json(
      {
        profile: getConverterRegistryRepository().createProfile({
          ...(body as CreateConversionProfileInput),
          workspaceId,
        }),
      },
      { status: 201 },
    );
  } catch (error) {
    return apiError(error);
  }
}
