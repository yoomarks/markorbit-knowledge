import { NextResponse } from "next/server";
import { WorkerNotFoundError } from "@markorbit/persistence/workers";
import {
  assertAdminBrowserResourceWorkspace,
  resolveAdminBrowserApiMutationAccess,
} from "@/server/admin-browser-api-access";
import { apiError } from "@/server/api-errors";
import { getWorkerRegistryRepository } from "@/server/source-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const existing = getWorkerRegistryRepository().getById(id);
    if (!existing) throw new WorkerNotFoundError(id);
    const { workspaceId } = await resolveAdminBrowserApiMutationAccess(
      request,
      existing.worker.workspaceId,
    );
    assertAdminBrowserResourceWorkspace(workspaceId, existing.worker.workspaceId);
    return NextResponse.json(getWorkerRegistryRepository().rotateCredential(id));
  } catch (error) {
    return apiError(error);
  }
}
