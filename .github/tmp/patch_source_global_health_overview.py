from pathlib import Path

health_path = Path("apps/admin/src/server/source-collection-health.ts")
text = health_path.read_text()
text = text.replace(
'''export type SourceCollectionHealth = {
  state: SourceCollectionHealthState;
''',
'''export type SourceCollectionFailure = {
  attemptId: string;
  jobId: string;
  jobAttempt: number;
  code: string;
  message: string;
  retryable: boolean;
  occurredAt: string;
};

export type SourceCollectionHealth = {
  state: SourceCollectionHealthState;
''', 1)
text = text.replace(
'''  staleSince: string | null;
  attentionRequired: boolean;
  alerts: SourceCollectionAlert[];
};
''',
'''  staleSince: string | null;
  latestFailure: SourceCollectionFailure | null;
  attentionRequired: boolean;
  alerts: SourceCollectionAlert[];
};

export type SourceCollectionHealthOverview = {
  scopeSources: number;
  sourcesRequiringAttention: number;
  totalAlerts: number;
  overdueCollections: number;
  failureStreaks: number;
  schedulerErrors: number;
  failingSources: number;
  retryingSources: number;
};
''', 1)
text = text.replace(
'''    staleSince: null,
    attentionRequired: false,
''',
'''    staleSince: null,
    latestFailure: null,
    attentionRequired: false,
''', 1)
text = text.replace(
'''    staleSince: null,
    attentionRequired: false,
    alerts: [],
  };
}

function tableExists''',
'''    staleSince: null,
    latestFailure: null,
    attentionRequired: false,
    alerts: [],
  };
}

function tableExists''', 1)

anchor = '''function loadLatestSuccessfulRuns(
'''
addition = '''function parseLatestFailure(value: string): SourceCollectionFailure | null {
  try {
    const attempt = JSON.parse(value) as Record<string, unknown>;
    const failure = attempt.failure;
    if (typeof failure !== "object" || failure === null || Array.isArray(failure)) return null;
    const record = failure as Record<string, unknown>;
    if (
      typeof attempt.id !== "string" ||
      typeof attempt.jobId !== "string" ||
      typeof attempt.jobAttempt !== "number" ||
      !Number.isInteger(attempt.jobAttempt) ||
      typeof record.code !== "string" ||
      typeof record.message !== "string" ||
      typeof record.retryable !== "boolean" ||
      typeof record.occurredAt !== "string"
    ) {
      return null;
    }
    return {
      attemptId: attempt.id,
      jobId: attempt.jobId,
      jobAttempt: attempt.jobAttempt,
      code: record.code,
      message: record.message,
      retryable: record.retryable,
      occurredAt: record.occurredAt,
    };
  } catch {
    return null;
  }
}

function loadLatestExecutionFailures(
  database: DatabaseSync,
  sourceIds: string[],
): Map<string, SourceCollectionFailure> {
  if (sourceIds.length === 0 || !tableExists(database, "execution_attempts")) return new Map();
  const placeholders = sourceIds.map(() => "?").join(", ");
  const rows = database
    .prepare(
      `WITH ranked AS (
         SELECT j.source_id AS sourceId, a.document_json AS attemptJson,
                ROW_NUMBER() OVER (
                  PARTITION BY j.source_id
                  ORDER BY COALESCE(a.completed_at, a.updated_at) DESC, a.id DESC
                ) AS row_number
         FROM execution_attempts a
         JOIN jobs j ON j.id = a.job_id
         WHERE j.source_id IN (${placeholders}) AND a.status = 'FAILED'
       )
       SELECT sourceId, attemptJson FROM ranked WHERE row_number = 1`,
    )
    .all(...(sourceIds as SQLInputValue[])) as Array<{ sourceId: string; attemptJson: string }>;
  const failures = new Map<string, SourceCollectionFailure>();
  for (const row of rows) {
    const failure = parseLatestFailure(row.attemptJson);
    if (failure) failures.set(row.sourceId, failure);
  }
  return failures;
}

'''
if text.count(anchor) != 1:
    raise SystemExit(f"health latest run anchor count={text.count(anchor)}")
text = text.replace(anchor, addition + anchor, 1)

old = '''  const latestSuccessfulRuns = loadLatestSuccessfulRuns(database, ids);
  const planContexts = loadPlanContexts(database, ids);
  return Object.fromEntries(
'''
new = '''  const latestSuccessfulRuns = loadLatestSuccessfulRuns(database, ids);
  const latestFailures = loadLatestExecutionFailures(database, ids);
  const planContexts = loadPlanContexts(database, ids);
  return Object.fromEntries(
'''
if text.count(old) != 1:
    raise SystemExit(f"health return anchor count={text.count(old)}")
text = text.replace(old, new, 1)
old = '''        enrichHealthWithOperations(
          health,
          planContexts.get(id),
          latestSuccessfulRuns.get(id) ?? health.latestSuccessAt,
          observedAt,
        ),
'''
new = '''        {
          ...enrichHealthWithOperations(
            health,
            planContexts.get(id),
            latestSuccessfulRuns.get(id) ?? health.latestSuccessAt,
            observedAt,
          ),
          latestFailure: latestFailures.get(id) ?? null,
        },
'''
if text.count(old) != 1:
    raise SystemExit(f"health map anchor count={text.count(old)}")
text = text.replace(old, new, 1)

text += '''\nexport function listSourceCollectionHealthBatched(\n  database: DatabaseSync,\n  sourceIds: string[],\n  historyLimit = HISTORY_LIMIT,\n  observedAt: Date = new Date(),\n): Record<string, SourceCollectionHealth> {\n  const ids = [...new Set(sourceIds.map((id) => id.trim()).filter(Boolean))];\n  const result: Record<string, SourceCollectionHealth> = {};\n  for (let offset = 0; offset < ids.length; offset += MAX_SOURCES) {\n    Object.assign(\n      result,\n      listSourceCollectionHealth(database, ids.slice(offset, offset + MAX_SOURCES), historyLimit, observedAt),\n    );\n  }\n  return result;\n}\n\nexport function sourceCollectionHealthRequiresAttention(health: SourceCollectionHealth): boolean {\n  return health.attentionRequired || health.state === "FAILING";\n}\n\nexport function summarizeSourceCollectionHealthOverview(\n  healthBySource: Record<string, SourceCollectionHealth>,\n): SourceCollectionHealthOverview {\n  const values = Object.values(healthBySource);\n  return {\n    scopeSources: values.length,\n    sourcesRequiringAttention: values.filter(sourceCollectionHealthRequiresAttention).length,\n    totalAlerts: values.reduce((sum, health) => sum + health.alerts.length, 0),\n    overdueCollections: values.filter((health) =>\n      health.alerts.some((alert) => alert.code === "COLLECTION_OVERDUE"),\n    ).length,\n    failureStreaks: values.filter((health) =>\n      health.alerts.some((alert) => alert.code === "FAILURE_STREAK"),\n    ).length,\n    schedulerErrors: values.filter((health) =>\n      health.alerts.some((alert) => alert.code === "SCHEDULER_ERROR"),\n    ).length,\n    failingSources: values.filter((health) => health.state === "FAILING").length,\n    retryingSources: values.filter((health) => health.state === "RETRYING").length,\n  };\n}\n'''
health_path.write_text(text)

route_path = Path("apps/admin/src/app/api/sources/route.ts")
text = route_path.read_text()
text = text.replace(
'''import { listSourceCollectionHealth } from "@/server/source-collection-health";
''',
'''import {
  listSourceCollectionHealth,
  listSourceCollectionHealthBatched,
  sourceCollectionHealthRequiresAttention,
  summarizeSourceCollectionHealthOverview,
} from "@/server/source-collection-health";
''', 1)
old = '''function listWithoutLegacySystemSources(filters: SourceListFilters): SourceListResult {
  const repository = getSourceRepository();
'''
new = '''type SourceListContext = {
  result: SourceListResult;
  scopeSources: SourceDefinition[];
};

function listMatchingSources(filters: SourceListFilters, hideLegacySystem: boolean): SourceDefinition[] {
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
'''
if text.count(old) != 1:
    raise SystemExit(f"route list anchor count={text.count(old)}")
text = text.replace(old, new, 1)
old = '''  return {
    items: items.slice(requestedOffset, requestedOffset + requestedLimit),
    total: items.length,
    limit: requestedLimit,
    offset: requestedOffset,
    summary: { ...summary, total: items.length },
  };
}

function withLatestAssessments(result: SourceListResult) {
'''
new = '''  return {
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
'''
if text.count(old) != 1:
    raise SystemExit(f"route return anchor count={text.count(old)}")
text = text.replace(old, new, 1)
old = '''  const healthValues = Object.values(collectionHealth);
  return {
    ...result,
    collectionHealth,
    collectionAlertSummary: {
      sourcesRequiringAttention: healthValues.filter((health) => health.attentionRequired).length,
      totalAlerts: healthValues.reduce((sum, health) => sum + health.alerts.length, 0),
      overdueCollections: healthValues.filter((health) =>
        health.alerts.some((alert) => alert.code === "COLLECTION_OVERDUE"),
      ).length,
      failureStreaks: healthValues.filter((health) =>
        health.alerts.some((alert) => alert.code === "FAILURE_STREAK"),
      ).length,
      schedulerErrors: healthValues.filter((health) =>
        health.alerts.some((alert) => alert.code === "SCHEDULER_ERROR"),
      ).length,
    },
'''
new = '''  const scopeHealth = listSourceCollectionHealthBatched(
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
      const leftCritical = left.health.alerts.some((alert) => alert.severity === "CRITICAL") ? 1 : 0;
      const rightCritical = right.health.alerts.some((alert) => alert.severity === "CRITICAL") ? 1 : 0;
      if (leftCritical !== rightCritical) return rightCritical - leftCritical;
      if (left.health.state !== right.health.state) {
        if (left.health.state === "FAILING") return -1;
        if (right.health.state === "FAILING") return 1;
      }
      return Date.parse(right.health.lastFailureAt ?? "1970-01-01T00:00:00Z") -
        Date.parse(left.health.lastFailureAt ?? "1970-01-01T00:00:00Z");
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
'''
if text.count(old) != 1:
    raise SystemExit(f"route alert summary anchor count={text.count(old)}")
text = text.replace(old, new, 1)
old = '''    const result =
      url.searchParams.get("hideLegacySystem") === "true"
        ? listWithoutLegacySystemSources(filters)
        : getSourceRepository().list(filters);
    return NextResponse.json(withLatestAssessments(result));
'''
new = '''    const hideLegacySystem = url.searchParams.get("hideLegacySystem") === "true";
    const context = hideLegacySystem
      ? listWithoutLegacySystemSources(filters)
      : {
          result: getSourceRepository().list(filters),
          scopeSources: listMatchingSources(filters, false),
        };
    return NextResponse.json(withLatestAssessments(context.result, context.scopeSources));
'''
if text.count(old) != 1:
    raise SystemExit(f"route GET anchor count={text.count(old)}")
route_path.write_text(text)

ui_path = Path("apps/admin/src/components/sources/source-list.tsx")
text = ui_path.read_text()
text = text.replace(
'''type CollectionHealthSummary = {
  state: CollectionHealthState;
''',
'''type CollectionFailure = {
  attemptId: string;
  jobId: string;
  jobAttempt: number;
  code: string;
  message: string;
  retryable: boolean;
  occurredAt: string;
};

type CollectionHealthSummary = {
  state: CollectionHealthState;
''', 1)
text = text.replace(
'''  staleSince: string | null;
  attentionRequired: boolean;
''',
'''  staleSince: string | null;
  latestFailure: CollectionFailure | null;
  attentionRequired: boolean;
''', 1)
text = text.replace(
'''type CollectionAlertSummary = {
  sourcesRequiringAttention: number;
''',
'''type CollectionAlertSummary = {
  scopeSources: number;
  sourcesRequiringAttention: number;
''', 1)
text = text.replace(
'''  schedulerErrors: number;
};

type SourceListPayload''',
'''  schedulerErrors: number;
  failingSources: number;
  retryingSources: number;
};

type CollectionAttentionSource = {
  sourceId: string;
  sourceName: string;
  state: CollectionHealthState;
  lastFailureAt: string | null;
  latestFailure: CollectionFailure | null;
  alerts: CollectionHealthAlert[];
};

type SourceListPayload''', 1)
text = text.replace(
'''  collectionAlertSummary?: CollectionAlertSummary;
};
''',
'''  collectionAlertSummary?: CollectionAlertSummary;
  collectionAttentionSources?: CollectionAttentionSource[];
};
''', 1)
text = text.replace(
'''    schedulerErrors: zh ? "调度异常" : "Scheduler errors",
  };
''',
'''    schedulerErrors: zh ? "调度异常" : "Scheduler errors",
    failing: zh ? "失败中" : "Failing",
    retrying: zh ? "重试中" : "Retrying",
    scope: zh ? "当前筛选范围" : "Filtered scope",
    latestFailure: zh ? "最近失败" : "Latest failure",
  };
''', 1)
text = text.replace(
'''              <p className="mt-1 text-xs text-amber-800">
                {zh
                  ? `当前页 · ${result.collectionAlertSummary.totalAlerts} 条告警`
                  : `Current page · ${result.collectionAlertSummary.totalAlerts} alerts`}
              </p>
''',
'''              <p className="mt-1 text-xs text-amber-800">
                {copy.scope} · {result.collectionAlertSummary.scopeSources} {copy.records} ·{" "}
                {result.collectionAlertSummary.totalAlerts} {zh ? "条告警" : "alerts"}
              </p>
''', 1)
text = text.replace(
'''            <span className="rounded-full bg-white/70 px-2.5 py-1">
              {copy.schedulerErrors} {result.collectionAlertSummary.schedulerErrors}
            </span>
          </div>
        </div>
''',
'''            <span className="rounded-full bg-white/70 px-2.5 py-1">
              {copy.schedulerErrors} {result.collectionAlertSummary.schedulerErrors}
            </span>
            <span className="rounded-full bg-white/70 px-2.5 py-1">
              {copy.failing} {result.collectionAlertSummary.failingSources}
            </span>
            <span className="rounded-full bg-white/70 px-2.5 py-1">
              {copy.retrying} {result.collectionAlertSummary.retryingSources}
            </span>
          </div>
          {result.collectionAttentionSources?.length ? (
            <div className="grid gap-2 border-t border-amber-200 pt-3 sm:grid-cols-2 xl:grid-cols-4">
              {result.collectionAttentionSources.map((item) => (
                <Link
                  key={item.sourceId}
                  href={`/sources/${item.sourceId}`}
                  className="rounded-xl border border-amber-200 bg-white/70 px-3 py-2 hover:bg-white"
                >
                  <p className="truncate text-xs font-semibold text-amber-950">{item.sourceName}</p>
                  <p className="mt-1 truncate text-[10px] text-amber-800">
                    {item.latestFailure
                      ? `${item.latestFailure.code}: ${item.latestFailure.message}`
                      : item.alerts[0]?.message ?? collectionHealthLabel(item.state, zh)}
                  </p>
                </Link>
              ))}
            </div>
          ) : null}
        </div>
''', 1)
# Change alert container from flex to block because it now contains a second row.
text = text.replace(
'''        <div className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
''',
'''        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
''', 1)
# Close nested flex before attention source grid.
needle = '''          </div>
          {result.collectionAttentionSources?.length ? (
'''
replacement = '''          </div>
          </div>
          {result.collectionAttentionSources?.length ? (
'''
if text.count(needle) != 1:
    raise SystemExit(f"ui nested flex close anchor count={text.count(needle)}")
text = text.replace(needle, replacement, 1)
# Show latest failure inline per current page source.
old = '''                          {collectionHealth.alerts?.length ? (
                            <div className="mt-1.5 flex max-w-[220px] flex-wrap gap-1">
'''
new = '''                          {collectionHealth.latestFailure ? (
                            <p
                              className="mt-1 max-w-[240px] truncate text-[10px] text-rose-600"
                              title={`${collectionHealth.latestFailure.code}: ${collectionHealth.latestFailure.message}`}
                            >
                              {copy.latestFailure}: {collectionHealth.latestFailure.code}
                            </p>
                          ) : null}
                          {collectionHealth.alerts?.length ? (
                            <div className="mt-1.5 flex max-w-[220px] flex-wrap gap-1">
'''
if text.count(old) != 1:
    raise SystemExit(f"ui current health anchor count={text.count(old)}")
text = text.replace(old, new, 1)
ui_path.write_text(text)

# Add focused tests for batched scale aggregation and persisted latest failure details.
test_path = Path("apps/admin/src/server/__tests__/source-collection-health.test.ts")
test = test_path.read_text()
test = test.replace(
'''import { ensureExecutionLedger } from "@markorbit/persistence/execution-ledger";
''',
'''import { ensureWorkerExecutionRegistry } from "@markorbit/persistence/controlled-worker-execution";
import { ensureExecutionLedger } from "@markorbit/persistence/execution-ledger";
''', 1)
test = test.replace(
'''  listSourceCollectionHealth,
  summarizeSourceCollectionHealth,
''',
'''  listSourceCollectionHealth,
  listSourceCollectionHealthBatched,
  summarizeSourceCollectionHealth,
  summarizeSourceCollectionHealthOverview,
''', 1)
insert = '''
  it("aggregates operational health beyond the 100-source query boundary", () => {
    const database = new DatabaseSync(":memory:");
    try {
      ensureExecutionLedger(database);
      const sourceIds = Array.from({ length: 205 }, (_, index) => `src_scale_${index + 1}`);
      const health = listSourceCollectionHealthBatched(
        database,
        sourceIds,
        20,
        new Date("2026-08-15T12:00:00.000Z"),
      );
      expect(Object.keys(health)).toHaveLength(205);
      const overview = summarizeSourceCollectionHealthOverview(health);
      expect(overview).toEqual({
        scopeSources: 205,
        sourcesRequiringAttention: 0,
        totalAlerts: 0,
        overdueCollections: 0,
        failureStreaks: 0,
        schedulerErrors: 0,
        failingSources: 0,
        retryingSources: 0,
      });
    } finally {
      database.close();
    }
  });

  it("exposes the latest persisted worker failure for operator diagnosis", () => {
    const database = new DatabaseSync(":memory:");
    try {
      ensureWorkerExecutionRegistry(database);
      database.exec("PRAGMA foreign_keys = OFF;");
      const sourceId = "src_failure_detail";
      insertRun(database, {
        id: "run_failure_detail",
        sourceId,
        planId: "pln_failure_detail",
        status: "FAILED",
        createdAt: "2026-08-15T12:00:00.000Z",
        updatedAt: "2026-08-15T12:00:10.000Z",
      });
      database.prepare(`
        INSERT INTO jobs (
          id, run_id, workspace_id, source_id, plan_id, connector_id,
          connector_version, job_type, status, attempt, available_at,
          document_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        "job_failure_detail",
        "run_failure_detail",
        WORKSPACE_ID,
        sourceId,
        "pln_failure_detail",
        "crawl4ai-web",
        "1.0.0",
        "WEB_CRAWL",
        "FAILED",
        1,
        "2026-08-15T12:00:00.000Z",
        "{}",
        "2026-08-15T12:00:00.000Z",
        "2026-08-15T12:00:09.000Z",
      );
      database.prepare(`
        INSERT INTO execution_attempts (
          id, workspace_id, run_id, job_id, job_attempt, lease_id, worker_id,
          status, executor_id, executor_version, executor_mode, document_json,
          started_at, completed_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        "exa_failure_detail",
        WORKSPACE_ID,
        "run_failure_detail",
        "job_failure_detail",
        1,
        "lease_failure_detail",
        "worker_failure_detail",
        "FAILED",
        "crawl4ai-python",
        "1.0.0",
        "PRODUCTION",
        JSON.stringify({
          id: "exa_failure_detail",
          jobId: "job_failure_detail",
          jobAttempt: 1,
          failure: {
            code: "CRAWL4AI_TIMEOUT",
            message: "Collector exceeded the governed timeout",
            retryable: true,
            occurredAt: "2026-08-15T12:00:08.000Z",
          },
        }),
        "2026-08-15T12:00:01.000Z",
        "2026-08-15T12:00:08.000Z",
        "2026-08-15T12:00:08.000Z",
      );

      const health = listSourceCollectionHealth(database, [sourceId])[sourceId]!;
      expect(health.latestFailure).toEqual({
        attemptId: "exa_failure_detail",
        jobId: "job_failure_detail",
        jobAttempt: 1,
        code: "CRAWL4AI_TIMEOUT",
        message: "Collector exceeded the governed timeout",
        retryable: true,
        occurredAt: "2026-08-15T12:00:08.000Z",
      });
      expect(summarizeSourceCollectionHealthOverview({ [sourceId]: health })).toMatchObject({
        scopeSources: 1,
        sourcesRequiringAttention: 1,
        failingSources: 1,
      });
    } finally {
      database.close();
    }
  });
'''
anchor = '\n});\n'
pos = test.rfind(anchor)
if pos < 0:
    raise SystemExit("test describe end anchor missing")
test = test[:pos] + insert + test[pos:]
test_path.write_text(test)
