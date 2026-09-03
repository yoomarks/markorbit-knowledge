import { NextResponse } from "next/server";
import { RegistryValidationError } from "@markorbit/persistence";
import { WorkerNotFoundError, type UpdateWorkerInput } from "@markorbit/persistence/workers";
import {
  assertAdminBrowserResourceWorkspace,
  resolveAdminBrowserApiMutationAccess,
  resolveAdminBrowserApiReadAccess,
} from "@/server/admin-browser-api-access";
import { apiError, readJson, requireRecord } from "@/server/api-errors";
import { getWorkerRegistryRepository } from "@/server/source-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const view = getWorkerRegistryRepository().getById(id);
    if (!view) throw new WorkerNotFoundError(id);
    const { workspaceId } = await resolveAdminBrowserApiReadAccess(request, view.worker.workspaceId);
    assertAdminBrowserResourceWorkspace(workspaceId, view.worker.workspaceId);
    return NextResponse.json({ view });
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const existing = getWorkerRegistryRepository().getById(id);
    if (!existing) throw new WorkerNotFoundError(id);
    const { workspaceId } = await resolveAdminBrowserApiMutationAccess(
      request,
      existing.worker.workspaceId,
    );
    assertAdminBrowserResourceWorkspace(workspaceId, existing.worker.workspaceId);
    const body = requireRecord(await readJson(request));
    if (typeof body.expectedUpdatedAt !== "string") {
      throw new RegistryValidationError("expectedUpdatedAt is required");
    }
    const input = { ...body };
    delete input.expectedUpdatedAt;
    delete input.workspaceId;
    const view = getWorkerRegistryRepository().update(
      id,
      input as UpdateWorkerInput,
      body.expectedUpdatedAt,
    );
    return NextResponse.json({ view });
  } catch (error) {
    return apiError(error);
  }
}
