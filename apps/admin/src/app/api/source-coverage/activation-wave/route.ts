import { NextResponse } from "next/server";
import { DEFAULT_WORKSPACE, RegistryValidationError } from "@markorbit/persistence";
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

function workspaceIdFromUrl(request: Request): string {
  return new URL(request.url).searchParams.get("workspaceId")?.trim() || DEFAULT_WORKSPACE.id;
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
        ? DEFAULT_WORKSPACE.id
        : typeof body.workspaceId === "string" && body.workspaceId.trim()
          ? body.workspaceId.trim()
          : null;
    if (!assertedWorkspaceId) {
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
