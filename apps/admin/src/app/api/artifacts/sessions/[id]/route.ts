import { NextResponse } from "next/server";
import { ArtifactSessionNotFoundError } from "@markorbit/persistence/raw-artifacts";
import {
  assertAdminBrowserResourceWorkspace,
  resolveAdminBrowserApiReadAccess,
} from "@/server/admin-browser-api-access";
import { apiError } from "@/server/api-errors";
import { getRawArtifactRepository } from "@/server/source-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const record = getRawArtifactRepository().getSession(id);
    if (!record) throw new ArtifactSessionNotFoundError(id);
    const { principal } = await resolveAdminBrowserApiReadAccess(
      request,
      record.session.workspaceId,
    );
    assertAdminBrowserResourceWorkspace(principal, record.session.workspaceId);
    return NextResponse.json({ record });
  } catch (error) {
    return apiError(error);
  }
}
