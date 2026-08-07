import { NextResponse } from "next/server";
import { RegistryValidationError } from "@markorbit/persistence";
import { JOB_LEASE_STATUSES, type JobLeaseStatus } from "@markorbit/contracts";
import { apiError } from "@/server/api-errors";
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
    const url = new URL(request.url);
    const status = url.searchParams.get("status");
    if (status && !JOB_LEASE_STATUSES.includes(status as JobLeaseStatus)) {
      throw new RegistryValidationError("Unknown lease status filter");
    }
    return NextResponse.json(
      getWorkerRegistryRepository().listLeases({
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
