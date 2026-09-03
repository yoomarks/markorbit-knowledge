import { NextResponse } from "next/server";
import { RegistryNotFoundError, RegistryValidationError } from "@markorbit/persistence";
import {
  assertAdminBrowserResourceWorkspace,
  resolveAdminBrowserApiMutationAccess,
} from "@/server/admin-browser-api-access";
import { apiError, readJson, requireRecord } from "@/server/api-errors";
import { getSourceRepository } from "@/server/source-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const existing = getSourceRepository().getById(id);
    if (!existing) throw new RegistryNotFoundError(id);
    const { principal } = await resolveAdminBrowserApiMutationAccess(request, existing.workspaceId);
    assertAdminBrowserResourceWorkspace(principal, existing.workspaceId);

    const body = requireRecord(await readJson(request));
    if (typeof body.expectedUpdatedAt !== "string") {
      throw new RegistryValidationError("expectedUpdatedAt is required");
    }
    const source = getSourceRepository().archive(id, body.expectedUpdatedAt);
    return NextResponse.json({ source });
  } catch (error) {
    return apiError(error);
  }
}
