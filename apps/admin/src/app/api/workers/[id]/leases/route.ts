import { JOB_LEASE_STATUSES, type JobLeaseStatus } from "@markorbit/contracts";
import { RegistryValidationError } from "@markorbit/persistence";
import { WorkerNotFoundError } from "@markorbit/persistence/workers";
import { NextResponse } from "next/server";
import { apiError } from "@/server/api-errors";
import {
  assertOperatorServiceResourceWorkspace,
  resolveOperatorServiceReadAccess,
} from "@/server/operator-service-api-access";
import { getWorkerRegistryRepository } from "@/server/source-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

function integerValue(value: string | null, field: string): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) throw new RegistryValidationError(`${field} must be an integer`);
  return parsed;
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const workers = getWorkerRegistryRepository();
    const view = workers.getById(id);
    if (!view) throw new WorkerNotFoundError(id);
    const principal = resolveOperatorServiceReadAccess(request);
    assertOperatorServiceResourceWorkspace(principal, view.worker.workspaceId);
    const url = new URL(request.url);
    const status = url.searchParams.get("status");
    if (status && !JOB_LEASE_STATUSES.includes(status as JobLeaseStatus)) {
      throw new RegistryValidationError("Unknown lease status filter");
    }
    return NextResponse.json(
      workers.listLeases({
        workerId: id,
        status: (status as JobLeaseStatus | null) ?? undefined,
        limit: integerValue(url.searchParams.get("limit"), "limit"),
        offset: integerValue(url.searchParams.get("offset"), "offset"),
      }),
    );
  } catch (error) {
    return apiError(error);
  }
}
