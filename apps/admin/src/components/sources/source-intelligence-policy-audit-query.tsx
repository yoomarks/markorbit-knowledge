"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Download, Filter, RefreshCw, Search } from "lucide-react";
import type {
  SourceDefinition,
  SourceIntelligencePolicyAuditAction,
  SourceIntelligencePolicyAuditEventV2,
  SourceIntelligencePolicyAuditQueryResultV2,
  SourceIntelligencePolicyAuditScope,
} from "@markorbit/contracts";
import type { SourceListResult } from "@markorbit/persistence";

const SOURCE_LIMIT = 100;

type FilterState = {
  scope: "" | SourceIntelligencePolicyAuditScope;
  action: "" | SourceIntelligencePolicyAuditAction;
  actorLabel: string;
  sourceId: string;
  cohortId: string;
  occurredFrom: string;
  occurredTo: string;
  pageSize: number;
};

const initialFilters: FilterState = {
  scope: "",
  action: "",
  actorLabel: "",
  sourceId: "",
  cohortId: "",
  occurredFrom: "",
  occurredTo: "",
  pageSize: 25,
};

const actions: SourceIntelligencePolicyAuditAction[] = [
  "GLOBAL_POLICY_CHANGED",
  "COHORT_CREATED",
  "COHORT_UPDATED",
  "MEMBERSHIP_ADDED",
  "MEMBERSHIP_REMOVED",
  "SNAPSHOT_BACKFILL",
];

const actionLabel: Record<SourceIntelligencePolicyAuditAction, string> = {
  GLOBAL_POLICY_CHANGED: "Global policy changed",
  COHORT_CREATED: "Cohort created",
  COHORT_UPDATED: "Cohort updated",
  MEMBERSHIP_ADDED: "Membership added",
  MEMBERSHIP_REMOVED: "Membership removed",
  SNAPSHOT_BACKFILL: "Snapshot backfill",
};

function dateParam(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function buildParams(filters: FilterState, cursor: string | null, format?: "json" | "csv") {
  const params = new URLSearchParams({ protocolVersion: "2.0" });
  if (filters.scope) params.set("scopes", filters.scope);
  if (filters.action) params.set("actions", filters.action);
  if (filters.actorLabel.trim()) params.set("actorLabels", filters.actorLabel.trim());
  if (filters.sourceId) params.set("sourceIds", filters.sourceId);
  if (filters.cohortId.trim()) params.set("cohortIds", filters.cohortId.trim());
  const from = dateParam(filters.occurredFrom);
  const to = dateParam(filters.occurredTo);
  if (from) params.set("occurredFromInclusive", from);
  if (to) params.set("occurredToExclusive", to);
  if (format) {
    params.set("format", format);
  } else {
    params.set("pageSize", String(filters.pageSize));
    if (cursor) params.set("cursor", cursor);
  }
  return params;
}

async function readSources(signal?: AbortSignal): Promise<Record<string, SourceDefinition>> {
  const response = await fetch(`/api/sources?limit=${SOURCE_LIMIT}&offset=0`, { signal });
  const body = (await response.json()) as SourceListResult | { error?: { message?: string } };
  if (!response.ok) {
    const message = "error" in body ? body.error?.message : undefined;
    throw new Error(message ?? "无法读取 Sources");
  }
  const items = (body as SourceListResult).items;
  return Object.fromEntries(items.map((source) => [source.id, source]));
}

async function readQuery(
  filters: FilterState,
  cursor: string | null,
  signal?: AbortSignal,
): Promise<SourceIntelligencePolicyAuditQueryResultV2> {
  const params = buildParams(filters, cursor);
  const response = await fetch(
    `/api/source-intelligence/reviews/policy-audit/query?${params.toString()}`,
    { signal },
  );
  const body = (await response.json()) as {
    policyAuditQuery?: SourceIntelligencePolicyAuditQueryResultV2;
    error?: { message?: string };
  };
  if (!response.ok || !body.policyAuditQuery) {
    throw new Error(body.error?.message ?? "无法读取 D2.16 audit query");
  }
  return body.policyAuditQuery;
}

function eventIdentity(event: SourceIntelligencePolicyAuditEventV2): string {
  if (event.scope === "GLOBAL_POLICY") return event.policyId ?? "Global policy";
  if (event.scope === "COHORT") return event.cohortId ?? "Cohort";
  return `${event.cohortId ?? "Cohort"} / ${event.sourceId ?? "Source"}`;
}

export function SourceIntelligencePolicyAuditQuery() {
  const [draft, setDraft] = useState<FilterState>(initialFilters);
  const [applied, setApplied] = useState<FilterState>(initialFilters);
  const [sources, setSources] = useState<Record<string, SourceDefinition>>({});
  const [result, setResult] = useState<SourceIntelligencePolicyAuditQueryResultV2 | null>(null);
  const [pageCursors, setPageCursors] = useState<(string | null)[]>([null]);
  const [pageIndex, setPageIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (filters: FilterState, cursor: string | null) => {
    setLoading(true);
    setError(null);
    try {
      setResult(await readQuery(filters, cursor));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "无法读取 D2.16 audit query");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([
      readSources(controller.signal),
      readQuery(initialFilters, null, controller.signal),
    ])
      .then(([nextSources, nextResult]) => {
        setSources(nextSources);
        setResult(nextResult);
        setError(null);
      })
      .catch((requestError: unknown) => {
        if (requestError instanceof DOMException && requestError.name === "AbortError") return;
        setError(
          requestError instanceof Error ? requestError.message : "无法读取 D2.16 audit query",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  const applyFilters = useCallback(() => {
    setApplied(draft);
    setPageCursors([null]);
    setPageIndex(0);
    void load(draft, null);
  }, [draft, load]);

  const nextPage = useCallback(() => {
    if (!result?.page.nextCursor) return;
    const nextCursor = result.page.nextCursor;
    const nextIndex = pageIndex + 1;
    setPageCursors((current) => [...current.slice(0, nextIndex), nextCursor]);
    setPageIndex(nextIndex);
    void load(applied, nextCursor);
  }, [applied, load, pageIndex, result]);

  const previousPage = useCallback(() => {
    if (pageIndex === 0) return;
    const nextIndex = pageIndex - 1;
    const cursor = pageCursors[nextIndex] ?? null;
    setPageIndex(nextIndex);
    void load(applied, cursor);
  }, [applied, load, pageCursors, pageIndex]);

  const exportUrls = useMemo(() => {
    const json = buildParams(applied, null, "json");
    const csv = buildParams(applied, null, "csv");
    return {
      json: `/api/source-intelligence/reviews/policy-audit/export?${json.toString()}`,
      csv: `/api/source-intelligence/reviews/policy-audit/export?${csv.toString()}`,
    };
  }, [applied]);

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="flex flex-col gap-4 border-b border-slate-200 p-5 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Search size={19} className="text-cyan-700" aria-hidden="true" />
            <h2 className="font-semibold text-slate-950">D2.16 · Audit Query &amp; Export</h2>
          </div>
          <p className="mt-1 max-w-4xl text-sm leading-6 text-slate-500">
            在 D2.15 append-only audit 上按 Scope、Action、记录的 operator label、Source、Cohort
            与时间范围做确定性查询，并分页导出 JSON / CSV。所有筛选只匹配已存储字段，不推断受影响
            Source，也不会触发任何 workflow action。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href={exportUrls.json}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-3.5 py-2 text-sm font-medium text-slate-700"
          >
            <Download size={15} aria-hidden="true" /> JSON
          </a>
          <a
            href={exportUrls.csv}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-3.5 py-2 text-sm font-medium text-slate-700"
          >
            <Download size={15} aria-hidden="true" /> CSV
          </a>
        </div>
      </div>

      <div className="border-b border-slate-200 bg-slate-50/70 p-5">
        <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          <Filter size={14} aria-hidden="true" /> Explicit stored-field filters
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <select
            value={draft.scope}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                scope: event.target.value as FilterState["scope"],
              }))
            }
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            <option value="">全部 Scope</option>
            <option value="GLOBAL_POLICY">Global policy</option>
            <option value="COHORT">Cohort</option>
            <option value="MEMBERSHIP">Membership</option>
          </select>
          <select
            value={draft.action}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                action: event.target.value as FilterState["action"],
              }))
            }
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            <option value="">全部 Action</option>
            {actions.map((action) => (
              <option key={action} value={action}>
                {actionLabel[action]}
              </option>
            ))}
          </select>
          <input
            value={draft.actorLabel}
            onChange={(event) =>
              setDraft((current) => ({ ...current, actorLabel: event.target.value }))
            }
            placeholder="Operator label（精确匹配）"
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
          />
          <select
            value={draft.sourceId}
            onChange={(event) =>
              setDraft((current) => ({ ...current, sourceId: event.target.value }))
            }
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
          >
            <option value="">全部 Source event</option>
            {Object.values(sources).map((source) => (
              <option key={source.id} value={source.id}>
                {source.name}
              </option>
            ))}
          </select>
          <input
            value={draft.cohortId}
            onChange={(event) =>
              setDraft((current) => ({ ...current, cohortId: event.target.value }))
            }
            placeholder="Cohort ID（精确匹配）"
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
          />
          <input
            type="datetime-local"
            value={draft.occurredFrom}
            onChange={(event) =>
              setDraft((current) => ({ ...current, occurredFrom: event.target.value }))
            }
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
            aria-label="起始时间（含）"
          />
          <input
            type="datetime-local"
            value={draft.occurredTo}
            onChange={(event) =>
              setDraft((current) => ({ ...current, occurredTo: event.target.value }))
            }
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
            aria-label="结束时间（不含）"
          />
          <div className="flex gap-2">
            <select
              value={draft.pageSize}
              onChange={(event) =>
                setDraft((current) => ({ ...current, pageSize: Number(event.target.value) }))
              }
              className="min-w-24 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              <option value={25}>25 / 页</option>
              <option value={50}>50 / 页</option>
              <option value={100}>100 / 页</option>
            </select>
            <button
              type="button"
              onClick={applyFilters}
              disabled={loading}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-slate-950 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} aria-hidden="true" />
              查询
            </button>
          </div>
        </div>
        <p className="mt-3 text-xs leading-5 text-slate-500">
          Source filter 只匹配 event.sourceId，因此不会自动把 Global/Cohort 变更解释为“影响该
          Source”。时间范围采用 from inclusive / to exclusive。Cursor
          仅是只读分页位置，不是权限令牌。
        </p>
      </div>

      {error ? (
        <div className="m-5 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          {error}
        </div>
      ) : null}
      {loading ? <div className="p-6 text-sm text-slate-500">正在查询 Policy Audit…</div> : null}

      {!loading && result ? (
        <div className="space-y-4 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
            <span>
              第 {pageIndex + 1} 页 · 本页 {result.page.eventCount} 条 · newest-first
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={previousPage}
                disabled={pageIndex === 0}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1.5 disabled:opacity-40"
              >
                <ChevronLeft size={14} aria-hidden="true" /> 上一页
              </button>
              <button
                type="button"
                onClick={nextPage}
                disabled={!result.page.hasMore || !result.page.nextCursor}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1.5 disabled:opacity-40"
              >
                下一页 <ChevronRight size={14} aria-hidden="true" />
              </button>
            </div>
          </div>

          {result.events.length === 0 ? (
            <div className="rounded-xl border border-cyan-200 bg-cyan-50 p-4 text-sm text-cyan-900">
              当前筛选条件没有匹配的 audit event。查询不会扩大范围、推断身份或生成事件。
            </div>
          ) : (
            <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
              {result.events.map((event) => {
                const source = event.sourceId ? sources[event.sourceId] : undefined;
                return (
                  <article key={event.eventId} className="p-4">
                    <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full border border-cyan-200 bg-cyan-50 px-2 py-0.5 text-xs font-semibold text-cyan-800">
                            {actionLabel[event.action]}
                          </span>
                          <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-600">
                            {event.scope}
                          </span>
                          {event.historicalCompleteness === "SNAPSHOT_BACKFILL" ? (
                            <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs text-amber-800">
                              snapshot only
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-2 text-sm font-medium text-slate-900">
                          {eventIdentity(event)}
                          {source ? ` · ${source.name}` : ""}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-600">
                          {event.changes.map((change) => (
                            <span
                              key={`${event.eventId}-${change.field}`}
                              className="rounded-lg bg-slate-100 px-2.5 py-1"
                            >
                              {change.field}: {String(change.before ?? "∅")} →{" "}
                              {String(change.after ?? "∅")}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="shrink-0 text-xs text-slate-500 xl:text-right">
                        <p className="font-medium text-slate-700">{event.actorLabel}</p>
                        <p className="mt-1">{new Date(event.occurredAt).toLocaleString("zh-CN")}</p>
                        <p className="mt-1 font-mono text-[10px] text-slate-400">{event.eventId}</p>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs leading-5 text-slate-600">
            JSON / CSV export 使用与当前查询相同的规范化筛选，最多导出 5,000 条，并保持 occurredAt +
            eventId 的确定性 newest-first 顺序；导出不包含
            generatedAt，因此相同已存储事件与筛选条件可得到相同 payload。
          </div>
        </div>
      ) : null}
    </section>
  );
}
