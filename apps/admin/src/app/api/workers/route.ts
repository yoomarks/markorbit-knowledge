import { NextResponse } from "next/server";
import {
  JOB_TYPES,
  WORKER_DESIRED_STATES,
  WORKER_STATUSES,
  type JobType,
  type WorkerDesiredState,
  type WorkerStatus,
} from "@markorbit/contracts";
import { RegistryValidationError } from "@markorbit/persistence";
import {
  assertWorkerListFilters,
  type CreateWorkerInput,
  type WorkerListFilters,
} from "@markorbit/persistence/workers";
import {
  resolveAdminBrowserApiMutationAccess,
  resolveAdminBrowserApiReadAccess,
} from "@/server/admin-browser-api-access";
import { apiError, readJson, requireRecord } from "@/server/api-errors";
import { getWorkerRegistryRepository } from "@/server/source-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function enumValue<T extends readonly string[]>(
  values: T,
  value: string | null,
  field: string,
): T[number] | undefined {
  if (!value) return undefined;
  if (!values.includes(value as T[number])) {
    throw new RegistryValidationError(`Unknown ${field} filter`);
  }
  return value as T[number];
}

function integerValue(value: string | null, field: string): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) throw new RegistryValidationError(`${field} must be an integer`);
  return parsed;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const assertedWorkspaceId = url.searchParams.get("workspaceId") ?? undefined;
    const { workspaceId } = await resolveAdminBrowserApiReadAccess(request, assertedWorkspaceId);
    const filters: WorkerListFilters = {
      q: url.searchParams.get("q") ?? undefined,
      workspaceId,
      desiredState: enumValue(
        WORKER_DESIRED_STATES,
        url.searchParams.get("desiredState"),
        "desiredState",
      ) as WorkerDesiredState | undefined,
      effectiveStatus: enumValue(
        WORKER_STATUSES,
        url.searchParams.get("effectiveStatus"),
        "effectiveStatus",
      ) as WorkerStatus | undefined,
      runtimeId: url.searchParams.get("runtimeId") ?? undefined,
      connectorId: url.searchParams.get("connectorId") ?? undefined,
      jobType: enumValue(JOB_TYPES, url.searchParams.get("jobType"), "jobType") as
        JobType | undefined,
      label: url.searchParams.get("label") ?? undefined,
      limit: integerValue(url.searchParams.get("limit"), "limit"),
      offset: integerValue(url.searchParams.get("offset"), "offset"),
    };
    assertWorkerListFilters(filters);
    return NextResponse.json(getWorkerRegistryRepository().list(filters));
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
    const result = getWorkerRegistryRepository().create({
      ...(body as CreateWorkerInput),
      workspaceId,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
