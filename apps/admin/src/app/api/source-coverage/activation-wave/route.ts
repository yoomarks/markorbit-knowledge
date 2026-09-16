import { NextResponse } from "next/server";
import { RegistryValidationError } from "@markorbit/persistence";
import {
  resolveAdminBrowserApiMutationAccess,
  resolveAdminBrowserApiReadAccess,
} from "@/server/admin-browser-api-access";
import { apiError, readJson, requireRecord } from "@/server/api-errors";
import {
  getRepresentativeActivationPreview,
  queueRepresentativeActivationWave,
} from "@/server/representative-source-activation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function workspaceIdFromUrl(request: Request): string | undefined {
  return new URL(request.url).searchParams.get("workspaceId")?.trim() || undefined;
}

export async function GET(request: Request) {
  try {
    const { workspaceId } = await resolveAdminBrowserApiReadAccess(
      request,
      workspaceIdFromUrl(request),
    );
    return NextResponse.json(getRepresentativeActivationPreview(workspaceId));
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = requireRecord(await readJson(request));
    const assertedWorkspaceId =
      body.workspaceId === undefined
        ? undefined
        : typeof body.workspaceId === "string" && body.workspaceId.trim()
          ? body.workspaceId.trim()
          : null;
    if (assertedWorkspaceId === null) {
      throw new RegistryValidationError("workspaceId must be a non-empty string");
    }
    const { workspaceId } = await resolveAdminBrowserApiMutationAccess(
      request,
      assertedWorkspaceId,
    );
    const result = queueRepresentativeActivationWave(workspaceId);
    return NextResponse.json(result, { status: result.intake.queued > 0 ? 201 : 200 });
  } catch (error) {
    return apiError(error);
  }
}
