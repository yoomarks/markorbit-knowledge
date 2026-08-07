import { NextResponse } from "next/server";
import {
  AUTHORITY_LEVELS,
  SOURCE_CATEGORIES,
  SOURCE_STATUSES,
  SOURCE_TYPES,
  type AuthorityLevel,
  type SourceCategory,
  type SourceStatus,
  type SourceType,
} from "@markorbit/contracts";
import {
  RegistryValidationError,
  assertSourceFilterValue,
  type CreateSourceInput,
  type SourceListFilters,
} from "@markorbit/persistence";
import { apiError, readJson, requireRecord } from "@/server/api-errors";
import { getSourceRepository } from "@/server/source-registry";

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
    const filters: SourceListFilters = {
      q: url.searchParams.get("q") ?? undefined,
      workspaceId: url.searchParams.get("workspaceId") ?? undefined,
      sourceType: enumValue(SOURCE_TYPES, url.searchParams.get("sourceType"), "sourceType") as
        SourceType | undefined,
      category: enumValue(SOURCE_CATEGORIES, url.searchParams.get("category"), "category") as
        SourceCategory | undefined,
      authorityLevel: enumValue(
        AUTHORITY_LEVELS,
        url.searchParams.get("authorityLevel"),
        "authorityLevel",
      ) as AuthorityLevel | undefined,
      status: enumValue(SOURCE_STATUSES, url.searchParams.get("status"), "status") as
        SourceStatus | undefined,
      jurisdiction: url.searchParams.get("jurisdiction") ?? undefined,
      language: url.searchParams.get("language") ?? undefined,
      tag: url.searchParams.get("tag") ?? undefined,
      connectorId: url.searchParams.get("connectorId") ?? undefined,
      limit: integerValue(url.searchParams.get("limit"), "limit"),
      offset: integerValue(url.searchParams.get("offset"), "offset"),
    };
    assertSourceFilterValue(filters);
    return NextResponse.json(getSourceRepository().list(filters));
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = requireRecord(await readJson(request));
    const source = getSourceRepository().create(body as CreateSourceInput);
    return NextResponse.json({ source }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
