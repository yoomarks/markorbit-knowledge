import { NextResponse } from "next/server";
import {
  AUTHORITY_LEVELS,
  SOURCE_CATEGORIES,
  SOURCE_STATUSES,
  SOURCE_TYPES,
  type AuthorityLevel,
  type SourceCategory,
  type SourceDefinition,
  type SourceStatus,
  type SourceType,
} from "@markorbit/contracts";
import {
  DEFAULT_WORKSPACE,
  RegistryValidationError,
  assertSourceFilterValue,
  type CreateSourceInput,
  type SourceListFilters,
  type SourceListResult,
} from "@markorbit/persistence";
import { resolveAdminBrowserApiReadAccess } from "@/server/admin-browser-api-access";
import { apiError, readJson, requireRecord } from "@/server/api-errors";
import {
  listSourceCollectionHealth,
  listSourceCollectionHealthBatched,
  sourceCollectionHealthRequiresAttention,
  summarizeSourceCollectionHealthOverview,
} from "@/server/source-collection-health";
import {
  getRegistryDatabase,
  getSourceAssessmentRepository,
  getSourceRepository,
} from "@/server/source-registry";

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

function isLegacySystemSource(source: SourceDefinition): boolean {
  return source.sourceType === "MANUAL_UPLOAD" && source.slug === "manual-uploads";
}

type SourceListContext = {
  result: SourceListResult;
  scopeSources: SourceDefinition[];
};

function listMatchingSources(
  filters: SourceListFilters,
  hideLegacySystem: boolean,
): SourceDefinition[] {
  const repository = getSourceRepository();
  const baseFilters = { ...filters };
  delete baseFilters.limit;
  delete baseFilters.offset;
  const items: SourceDefinition[] = [];
  let scanOffset = 0;
  while (true) {
    const page = repository.list({ ...baseFilters, limit: 100, offset: scanOffset });
    items.push(
      ...page.items.filter((source) => !hideLegacySystem || !isLegacySystemSource(source)),
    );
    scanOffset += page.items.length;
    if (page.items.length === 0 || scanOffset >= page.total) break;
  }
  return items;
}

function listWithoutLegacySystemSources(filters: SourceListFilters): SourceListContext {
  const repository = getSourceRepository();
  const requestedLimit = filters.limit ?? 25;
  const requestedOffset = filters.offset ?? 0;
  const baseFilters = { ...filters };
  delete baseFilters.limit;
  delete baseFilters.offset;

  const items: SourceDefinition[] = [];
  let scanOffset = 0;
  while (true) {
    const page = repository.list({ ...baseFilters, limit: 100, offset: scanOffset });
    items.push(...page.items.filter((source) => !isLegacySystemSource(source)));
    scanOffset += page.items.length;
    if (page.items.length === 0 || scanOffset >= page.total) break;
  }

  const summary = Object.fromEntries(SOURCE_STATUSES.map((status) => [status, 0])) as Record<
    SourceStatus,
    number
  >;
  for (const source of items) summary[source.status] += 1;

  return {
    result: {
      items: items.slice(requestedOffset, requestedOffset + requestedLimit),
      total: items.length,
      limit: requestedLimit,
      offset: requestedOffset,
      summary: { ...summary, total: items.length },
    },
    scopeSources: items,
  };
}

function withLatestAssessments(result: SourceListResult, scopeSources: SourceDefinition[]) {
  const latest = getSourceAssessmentRepository().listLatestForSources(
    result.items.map((source) => source.id),
  );
  const collectionHealth = listSourceCollectionHealth(
    getRegistryDatabase(),
    result.items.map((source) => source.id),
  );
  const scopeHealth = listSourceCollectionHealthBatched(
    getRegistryDatabase(),
    scopeSources.map((source) => source.id),
  );
  const collectionAlertSummary = summarizeSourceCollectionHealthOverview(scopeHealth);
  const collectionAttentionSources = scopeSources
    .map((source) => ({ source, health: scopeHealth[source.id] }))
    .filter(
      (record): record is { source: SourceDefinition; health: NonNullable<typeof record.health> } =>
        Boolean(record.health && sourceCollectionHealthRequiresAttention(record.health)),
    )
    .sort((left, right) => {
      const leftCritical = left.health.alerts.some((alert) => alert.severity === "CRITICAL")
        ? 1
        : 0;
      const rightCritical = right.health.alerts.some((alert) => alert.severity === "CRITICAL")
        ? 1
        : 0;
      if (leftCritical !== rightCritical) return rightCritical - leftCritical;
      if (left.health.state !== right.health.state) {
        if (left.health.state === "FAILING") return -1;
        if (right.health.state === "FAILING") return 1;
      }
      return (
        Date.parse(right.health.lastFailureAt ?? "1970-01-01T00:00:00Z") -
        Date.parse(left.health.lastFailureAt ?? "1970-01-01T00:00:00Z")
      );
    })
    .slice(0, 8)
    .map(({ source, health }) => ({
      sourceId: source.id,
      sourceName: source.name,
      state: health.state,
      lastFailureAt: health.lastFailureAt,
      latestFailure: health.latestFailure,
      alerts: health.alerts,
    }));
  return {
    ...result,
    collectionHealth,
    collectionAlertSummary,
    collectionAttentionSources,
    assessments: Object.fromEntries(
      latest.map((record) => [
        record.sourceId,
        {
          assessmentId: record.id,
          assessedAt: record.assessedAt,
          sourceValue: record.response.sourceValue,
        },
      ]),
    ),
  };
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const assertedWorkspaceId =
      url.searchParams.get("workspaceId")?.trim() || DEFAULT_WORKSPACE.id;
    const { workspaceId } = await resolveAdminBrowserApiReadAccess(
      request,
      assertedWorkspaceId,
    );
    const filters: SourceListFilters = {
      q: url.searchParams.get("q") ?? undefined,
      workspaceId,
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
    const hideLegacySystem = url.searchParams.get("hideLegacySystem") === "true";
    const context = hideLegacySystem
      ? listWithoutLegacySystemSources(filters)
      : {
          result: getSourceRepository().list(filters),
          scopeSources: listMatchingSources(filters, false),
        };
    return NextResponse.json(withLatestAssessments(context.result, context.scopeSources));
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
