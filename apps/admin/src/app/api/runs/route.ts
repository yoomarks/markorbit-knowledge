import { NextResponse } from "next/server";
import {
  COLLECTION_RUN_STATUSES,
  JOB_TYPES,
  RUN_TRIGGER_TYPES,
  type CollectionRunStatus,
  type ExecutionActor,
  type JobType,
  type RunTriggerType,
} from "@markorbit/contracts";
import { RegistryValidationError } from "@markorbit/persistence";
import {
  assertExecutionRunFilterValues,
  type ExecutionRunListFilters,
} from "@markorbit/persistence/execution-ledger";
import { apiError, readJson, requireRecord } from "@/server/api-errors";
import { getExecutionLedgerRepository } from "@/server/source-registry";

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
  if (!Number.isInteger(parsed)) {
    throw new RegistryValidationError(`${field} must be an integer`);
  }
  return parsed;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const filters: ExecutionRunListFilters = {
      q: url.searchParams.get("q") ?? undefined,
      workspaceId: url.searchParams.get("workspaceId") ?? undefined,
      sourceId: url.searchParams.get("sourceId") ?? undefined,
      planId: url.searchParams.get("planId") ?? undefined,
      connectorId: url.searchParams.get("connectorId") ?? undefined,
      status: enumValue(COLLECTION_RUN_STATUSES, url.searchParams.get("status"), "status") as
        CollectionRunStatus | undefined,
      triggerType: enumValue(
        RUN_TRIGGER_TYPES,
        url.searchParams.get("triggerType"),
        "triggerType",
      ) as RunTriggerType | undefined,
      jobType: enumValue(JOB_TYPES, url.searchParams.get("jobType"), "jobType") as
        JobType | undefined,
      limit: integerValue(url.searchParams.get("limit"), "limit"),
      offset: integerValue(url.searchParams.get("offset"), "offset"),
    };
    assertExecutionRunFilterValues(filters);
    return NextResponse.json(getExecutionLedgerRepository().list(filters));
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = requireRecord(await readJson(request));
    const allowed = new Set(["planId", "requestedBy"]);
    if (Object.keys(body).some((key) => !allowed.has(key))) {
      throw new RegistryValidationError("Unknown manual dispatch field");
    }
    if (typeof body.planId !== "string") {
      throw new RegistryValidationError("planId is required");
    }
    const result = getExecutionLedgerRepository().dispatchManual({
      planId: body.planId,
      requestedBy: body.requestedBy as ExecutionActor | undefined,
      idempotencyKey: request.headers.get("Idempotency-Key") ?? undefined,
    });
    return NextResponse.json(result, { status: result.replayed ? 200 : 201 });
  } catch (error) {
    return apiError(error);
  }
}
