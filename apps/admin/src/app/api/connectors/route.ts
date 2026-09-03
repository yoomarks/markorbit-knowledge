import { NextResponse } from "next/server";
import {
  ARTIFACT_KINDS,
  CONNECTOR_CAPABILITIES,
  CONNECTOR_RUNTIMES,
  CONNECTOR_STATUSES,
  JOB_TYPES,
  SOURCE_TYPES,
  type ArtifactKind,
  type ConnectorCapability,
  type ConnectorRuntime,
  type ConnectorStatus,
  type JobType,
  type SourceType,
} from "@markorbit/contracts";
import { RegistryValidationError } from "@markorbit/persistence";
import {
  assertConnectorFilterValue,
  type ConnectorListFilters,
  type CreateConnectorManifestInput,
} from "@markorbit/persistence/connectors";
import {
  resolveAdminBrowserApiMutationAccess,
  resolveAdminBrowserApiReadAccess,
} from "@/server/admin-browser-api-access";
import { apiError, readJson, requireRecord } from "@/server/api-errors";
import { getConnectorRepository } from "@/server/source-registry";

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
    await resolveAdminBrowserApiReadAccess(request);
    const url = new URL(request.url);
    const filters: ConnectorListFilters = {
      q: url.searchParams.get("q") ?? undefined,
      runtime: enumValue(CONNECTOR_RUNTIMES, url.searchParams.get("runtime"), "runtime") as
        ConnectorRuntime | undefined,
      status: enumValue(CONNECTOR_STATUSES, url.searchParams.get("status"), "status") as
        ConnectorStatus | undefined,
      sourceType: enumValue(SOURCE_TYPES, url.searchParams.get("sourceType"), "sourceType") as
        SourceType | undefined,
      capability: enumValue(
        CONNECTOR_CAPABILITIES,
        url.searchParams.get("capability"),
        "capability",
      ) as ConnectorCapability | undefined,
      jobType: enumValue(JOB_TYPES, url.searchParams.get("jobType"), "jobType") as
        JobType | undefined,
      artifactKind: enumValue(
        ARTIFACT_KINDS,
        url.searchParams.get("artifactKind"),
        "artifactKind",
      ) as ArtifactKind | undefined,
      limit: integerValue(url.searchParams.get("limit"), "limit"),
      offset: integerValue(url.searchParams.get("offset"), "offset"),
    };
    assertConnectorFilterValue(filters);
    return NextResponse.json(getConnectorRepository().list(filters));
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    await resolveAdminBrowserApiMutationAccess(request);
    const body = requireRecord(await readJson(request));
    const connector = getConnectorRepository().create(body as CreateConnectorManifestInput);
    return NextResponse.json({ connector }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
