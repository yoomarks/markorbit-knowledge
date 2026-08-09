"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRight, GitCompareArrows, RefreshCw } from "lucide-react";
import type {
  SourceDefinition,
  SourceIntelligenceHistoricalPolicyComparisonV2,
} from "@markorbit/contracts";
import type { SourceListResult } from "@markorbit/persistence";

function localDateTimeValue(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function hours(value: number | null) {
  return value === null ? "disabled" : `${value}h`;
}

export function SourceIntelligencePolicyComparison() {
  const now = new Date();
  const earlier = new Date(now.getTime() - 60 * 60 * 1000);
  const [sources, setSources] = useState<SourceDefinition[]>([]);
  const [sourceId, setSourceId] = useState("");
  const [fromAsOf, setFromAsOf] = useState(() => localDateTimeValue(earlier));
  const [toAsOf, setToAsOf] = useState(() => localDateTimeValue(now));
  const [result, setResult] = useState<SourceIntelligenceHistoricalPolicyComparisonV2 | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedName = useMemo(
    () => sources.find((source) => source.id === sourceId)?.name ?? sourceId,
    [sourceId, sources],
  );

  async function compare(nextSourceId = sourceId) {
    if (!nextSourceId) return;
    setLoading(true);
    setError(null);
    try {
      const from = new Date(fromAsOf);
      const to = new Date(toAsOf);
      if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime())) {
        throw new Error("请选择有效的比较时间");
      }
      if (from.getTime() >= to.getTime()) throw new Error("From 必须早于 To");
      const params = new URLSearchParams({
        protocolVersion: "2.0",
        sourceIds: nextSourceId,
        fromAsOf: from.toISOString(),
        toAsOf: to.toISOString(),
      });
      const response = await fetch(
        `/api/source-intelligence/reviews/policy-comparison?${params.toString()}`,
      );
      const body = (await response.json()) as {
        historicalPolicyComparison?: SourceIntelligenceHistoricalPolicyComparisonV2;
        error?: { message?: string };
      };
      if (!response.ok || !body.historicalPolicyComparison) {
        throw new Error(body.error?.message ?? "无法比较 Historical Policy");
      }
      setResult(body.historicalPolicyComparison);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "无法比较 Historical Policy");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/sources?limit=100&offset=0", { signal: controller.signal })
      .then(async (response) => {
        const body = (await response.json()) as SourceListResult | { error?: { message?: string } };
        if (!response.ok) {
          throw new Error(
            "error" in body ? (body.error?.message ?? "无法读取 Sources") : "无法读取 Sources",
          );
        }
        const items = (body as SourceListResult).items;
        setSources(items);
        if (items[0]) setSourceId(items[0].id);
      })
      .catch((requestError: unknown) => {
        if (requestError instanceof DOMException && requestError.name === "AbortError") return;
        setError(requestError instanceof Error ? requestError.message : "无法读取 Sources");
      });
    return () => controller.abort();
  }, []);

  const item = result?.items[0] ?? null;

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="flex flex-col gap-4 border-b border-slate-200 p-5 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <GitCompareArrows size={19} className="text-violet-700" aria-hidden="true" />
            <h2 className="font-semibold text-slate-950">
              D2.18 · Historical Policy Comparison &amp; Change Explanation
            </h2>
          </div>
          <p className="mt-1 max-w-4xl text-sm leading-6 text-slate-500">
            比较同一显式 Source 的两个 D2.17 历史解析端点。只有两端都 RESOLVED 才声明 CHANGED /
            UNCHANGED；PARTIAL 或 UNKNOWN 不升级为确定结论，新增 event id 也只作为 trace delta，不当作因果证明。
          </p>
        </div>
        <div className="rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-xs text-violet-900">
          Read only · no rollback/apply
        </div>
      </div>

      <div className="grid gap-3 border-b border-slate-200 bg-slate-50/70 p-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_minmax(0,1fr)_auto]">
        <select
          value={sourceId}
          onChange={(event) => setSourceId(event.target.value)}
          className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
        >
          {sources.length === 0 ? <option value="">当前没有 Source</option> : null}
          {sources.map((source) => (
            <option key={source.id} value={source.id}>
              {source.name}
            </option>
          ))}
        </select>
        <input
          type="datetime-local"
          value={fromAsOf}
          onChange={(event) => setFromAsOf(event.target.value)}
          className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
          aria-label="Comparison from time"
        />
        <ArrowRight className="hidden self-center text-slate-400 lg:block" size={18} aria-hidden="true" />
        <input
          type="datetime-local"
          value={toAsOf}
          onChange={(event) => setToAsOf(event.target.value)}
          className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
          aria-label="Comparison to time"
        />
        <button
          type="button"
          disabled={loading || !sourceId}
          onClick={() => void compare()}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} aria-hidden="true" />
          Compare
        </button>
      </div>

      {error ? (
        <div className="m-5 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          {error}
        </div>
      ) : null}
      {loading ? <div className="p-6 text-sm text-slate-500">正在比较两个历史端点…</div> : null}
      {!loading && !item && !error ? (
        <div className="p-6 text-sm text-slate-500">选择 Source 与两个历史时间后执行 Compare。</div>
      ) : null}

      {!loading && item && result ? (
        <div className="space-y-5 p-5">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl border border-slate-200 p-4">
              <div className="text-xs uppercase tracking-wide text-slate-400">Source</div>
              <div className="mt-1 text-sm font-semibold text-slate-900">{selectedName}</div>
            </div>
            <div className="rounded-xl border border-slate-200 p-4">
              <div className="text-xs uppercase tracking-wide text-slate-400">Comparison</div>
              <div className="mt-1 text-sm font-semibold text-slate-900">{item.changeStatus}</div>
              <div className="mt-1 text-xs text-slate-500">{item.status}</div>
            </div>
            <div className="rounded-xl border border-slate-200 p-4">
              <div className="text-xs uppercase tracking-wide text-slate-400">From endpoint</div>
              <div className="mt-1 text-sm font-semibold text-slate-900">{item.from.status}</div>
              <div className="mt-1 text-xs text-slate-500">{item.from.completeness}</div>
            </div>
            <div className="rounded-xl border border-slate-200 p-4">
              <div className="text-xs uppercase tracking-wide text-slate-400">To endpoint</div>
              <div className="mt-1 text-sm font-semibold text-slate-900">{item.to.status}</div>
              <div className="mt-1 text-xs text-slate-500">{item.to.completeness}</div>
            </div>
          </div>

          {item.changeStatus !== "INDETERMINATE" ? (
            <div className="grid gap-3 lg:grid-cols-2">
              <div className="rounded-xl border border-slate-200 p-4 text-sm text-slate-700">
                <div className="font-semibold text-slate-950">Before</div>
                <div className="mt-2">
                  {item.beforePolicy?.scope ?? "—"} · Claim {hours(item.beforePolicy?.claimTargetHours ?? null)} · Review {hours(item.beforePolicy?.reviewTargetHours ?? null)}
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 p-4 text-sm text-slate-700">
                <div className="font-semibold text-slate-950">After</div>
                <div className="mt-2">
                  {item.afterPolicy?.scope ?? "—"} · Claim {hours(item.afterPolicy?.claimTargetHours ?? null)} · Review {hours(item.afterPolicy?.reviewTargetHours ?? null)}
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
              D2.18 不把 PARTIAL / UNKNOWN 历史端点升级成确定的 policy change。
            </div>
          )}

          {item.fieldChanges.length ? (
            <div>
              <div className="mb-2 text-sm font-semibold text-slate-900">Effective policy field changes</div>
              <div className="space-y-2">
                {item.fieldChanges.map((change) => (
                  <div key={change.field} className="grid gap-2 rounded-xl border border-slate-200 px-4 py-3 text-sm md:grid-cols-[180px_1fr_auto_1fr]">
                    <span className="font-medium text-slate-800">{change.field}</span>
                    <code className="text-xs text-slate-600">{JSON.stringify(change.before)}</code>
                    <ArrowRight size={14} className="text-slate-400" aria-hidden="true" />
                    <code className="text-xs text-slate-600">{JSON.stringify(change.after)}</code>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="rounded-xl border border-slate-200 p-4 text-sm text-slate-700">
            <div className="font-semibold text-slate-950">Explanation</div>
            {item.explanation.map((line) => (
              <p key={line} className="mt-1 leading-6">{line}</p>
            ))}
            {item.newlyObservedEventIds.length ? (
              <div className="mt-3 font-mono text-[11px] text-slate-500">
                Trace delta: {item.newlyObservedEventIds.join(", ")}
              </div>
            ) : null}
          </div>

          <p className="text-xs leading-5 text-slate-500">
            D2.18 只比较 D2.17 的两个证明状态，不执行 rollback / apply / route / notify / collect，
            不推断 Cohort membership、operator identity、RBAC、Authority 或法律真实性；Scheduler 继续为 NOT_AUTHORIZED_UNCALIBRATED。
          </p>
        </div>
      ) : null}
    </section>
  );
}
