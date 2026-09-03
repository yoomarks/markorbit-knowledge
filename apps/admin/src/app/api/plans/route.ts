import { NextResponse } from "next/server";
import {
  ARTIFACT_KINDS,
  COLLECTION_PLAN_STATUSES,
  COLLECTION_PRIORITIES,
  SCHEDULE_MODES,
  type ArtifactKind,
  type CollectionPlanStatus,
  type CollectionPriority,
  type ScheduleMode,
} from "@markorbit/contracts";
import { RegistryValidationError } from "@markorbit/persistence";
import {
  assertCollectionPlanFilterValues,
  type CollectionPlanListFilters,
  type CreateCollectionPlanInput,
} from "@markorbit/persistence/collection-plans";
import {
  resolveAdminBrowserApiMutationAccess,
  resolveAdminBrowserApiReadAccess,
} from "@/server/admin-browser-api-access";
import { apiError, readJson, requireRecord } from "@/server/api-errors";
import { getCollectionPlanRepository } from "@/server/source-registry";

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
    const assertedWorkspaceId = url.searchParams.get("workspaceId") ?? undefined;
    const { workspaceId } = await resolveAdminBrowserApiReadAccess(request, assertedWorkspaceId);
    const filters: CollectionPlanListFilters = {
      q: url.searchParams.get("q") ?? undefined,
      workspaceId,
      sourceId: url.searchParams.get("sourceId") ?? undefined,
      status: enumValue(COLLECTION_PLAN_STATUSES, url.searchParams.get("status"), "status") as
        CollectionPlanStatus | undefined,
      scheduleMode: enumValue(
        SCHEDULE_MODES,
        url.searchParams.get("scheduleMode"),
        "scheduleMode",
      ) as ScheduleMode | undefined,
      priority: enumValue(COLLECTION_PRIORITIES, url.searchParams.get("priority"), "priority") as
        CollectionPriority | undefined,
      connectorId: url.searchParams.get("connectorId") ?? undefined,
      artifactKind: enumValue(
        ARTIFACT_KINDS,
        url.searchParams.get("artifactKind"),
        "artifactKind",
      ) as ArtifactKind | undefined,
      limit: integerValue(url.searchParams.get("limit"), "limit"),
      offset: integerValue(url.searchParams.get("offset"), "offset"),
    };
    assertCollectionPlanFilterValues(filters);
    return NextResponse.json(getCollectionPlanRepository().list(filters));
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
    const plan = getCollectionPlanRepository().create({
      ...(body as CreateCollectionPlanInput),
      workspaceId,
    });
    return NextResponse.json({ plan }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
