"use client";

import { useEffect, useMemo, useState } from "react";
import { Clock3, History, RefreshCw, Route } from "lucide-react";
import type {
  SourceDefinition,
  SourceIntelligenceHistoricalPolicyResolutionV2,
} from "@markorbit/contracts";
import type { SourceListResult } from "@markorbit/persistence";

function localDateTimeValue(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function policySummary(
  policy: SourceIntelligenceHistoricalPolicyResolutionV2["items"][number]["observedPolicy"],
) {
  if (!policy) return "No observed policy";
  if (policy.scope === "COHORT")
    return `${policy.cohortName ?? policy.cohortId} · P${policy.priority}`;
  if (policy.scope === "GLOBAL") return "Global fallback";
  return "Unconfigured";
}

export function SourceIntelligencePolicyResolution() {
  const [sources, setSources] = useState<SourceDefinition[]>([]);
  const [sourceId, setSourceId] = useState("");
  const [asOf, setAsOf] = useState(() => localDateTimeValue(new Date()));
  const [result, setResult] = useState<SourceIntelligenceHistoricalPolicyResolutionV2 | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const selectedName = useMemo(
    () => sources.find((source) => source.id === sourceId)?.name ?? sourceId,
    [sourceId, sources],
  );

  async function resolve(nextSourceId = sourceId, nextAsOf = asOf) {
    if (!nextSourceId || !nextAsOf) return;
    setLoading(true);
    setError(null);
    try {
      const instant = new Date(nextAsOf);
      if (!Number.isFinite(instant.getTime())) throw new Error("请选择有效时间");
      const params = new URLSearchParams({
        protocolVersion: "2.0",
        sourceIds: nextSourceId,
        asOf: instant.toISOString(),
      });
      const response = await fetch(
        `/api/source-intelligence/reviews/policy-resolution?${params.toString()}`,
      );
      const body = (await response.json()) as {
        historicalPolicyResolution?: SourceIntelligenceHistoricalPolicyResolutionV2;
        error?: { message?: string };
      };
      if (!response.ok || !body.historicalPolicyResolution) {
        throw new Error(body.error?.message ?? "无法解析历史 Policy");
      }
      setResult(body.historicalPolicyResolution);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "无法解析历史 Policy");
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
        if (items[0]) {
          setSourceId(items[0].id);
          await resolve(items[0].id, localDateTimeValue(new Date()));
        } else {
          setLoading(false);
        }
      })
      .catch((requestError: unknown) => {
        if (requestError instanceof DOMException && requestError.name === "AbortError") return;
        setError(requestError instanceof Error ? requestError.message : "无法读取 Sources");
        setLoading(false);
      });
    return () => controller.abort();
    // Initial load intentionally resolves the first Source once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const item = result?.items[0] ?? null;

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="flex flex-col gap-4 border-b border-slate-200 p-5 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <History size={19} className="text-cyan-700" aria-hidden="true" />
            <h2 className="font-semibold text-slate-950">
              D2.17 · Historical Policy Resolution &amp; Impact Trace
            </h2>
          </div>
          <p className="mt-1 max-w-4xl text-sm leading-6 text-slate-500">
            按历史时点重放显式人工 policy state。D2.17 用一次性 immutable coverage checkpoint
            建立可证明的重放起点；早于 checkpoint 的历史只返回 PARTIAL / UNKNOWN，不用 backfill
            补猜缺失事件，也不推断 Source 属性或受影响范围。
          </p>
        </div>
        <div className="rounded-xl border border-cyan-200 bg-cyan-50 px-3 py-2 text-xs text-cyan-900">
          Scheduler · NOT_AUTHORIZED_UNCALIBRATED
        </div>
      </div>

      <div className="grid gap-3 border-b border-slate-200 bg-slate-50/70 p-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
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
          value={asOf}
          onChange={(event) => setAsOf(event.target.value)}
          className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
          aria-label="Historical policy as-of time"
        />
        <button
          type="button"
          disabled={loading || !sourceId}
          onClick={() => void resolve()}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} aria-hidden="true" />
          Resolve
        </button>
      </div>

      {error ? (
        <div className="m-5 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          {error}
        </div>
      ) : null}
      {loading ? (
        <div className="p-6 text-sm text-slate-500">正在重放 Historical Policy…</div>
      ) : null}

      {!loading && !item && !error ? (
        <div className="p-6 text-sm text-slate-500">
          当前没有 Source 可用于 Historical Policy Resolution。
        </div>
      ) : null}

      {!loading && item && result ? (
        <div className="space-y-5 p-5">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl border border-slate-200 p-4">
              <div className="text-xs uppercase tracking-wide text-slate-400">Source</div>
              <div className="mt-1 text-sm font-semibold text-slate-900">{selectedName}</div>
            </div>
            <div className="rounded-xl border border-slate-200 p-4">
              <div className="text-xs uppercase tracking-wide text-slate-400">Resolution</div>
              <div className="mt-1 text-sm font-semibold text-slate-900">{item.status}</div>
              <div className="mt-1 text-xs text-slate-500">{item.completeness}</div>
            </div>
            <div className="rounded-xl border border-slate-200 p-4">
              <div className="text-xs uppercase tracking-wide text-slate-400">Observed policy</div>
              <div className="mt-1 text-sm font-semibold text-slate-900">
                {policySummary(item.observedPolicy)}
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 p-4">
              <div className="text-xs uppercase tracking-wide text-slate-400">
                Coverage checkpoint
              </div>
              <div className="mt-1 flex items-center gap-1 text-xs text-slate-700">
                <Clock3 size={13} aria-hidden="true" />{" "}
                {new Date(result.checkpoint.checkpointAt).toLocaleString()}
              </div>
            </div>
          </div>

          {item.resolvedPolicy ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950">
              <div className="font-semibold">Resolved effective workflow policy</div>
              <div className="mt-1">
                {policySummary(item.resolvedPolicy)} · Claim{" "}
                {item.resolvedPolicy.claimTargetHours ?? "disabled"}h · Review{" "}
                {item.resolvedPolicy.reviewTargetHours ?? "disabled"}h
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
              <div className="font-semibold">不声明完整历史结果</div>
              {item.unknownReasons.map((reason) => (
                <p key={reason} className="mt-1 leading-6">
                  {reason}
                </p>
              ))}
            </div>
          )}

          <div>
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-900">
              <Route size={16} className="text-cyan-700" aria-hidden="true" /> Impact trace
            </div>
            <div className="space-y-2">
              {item.trace.map((step, index) => (
                <div
                  key={`${step.kind}-${step.eventId ?? index}`}
                  className="rounded-xl border border-slate-200 px-4 py-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                    <span className="font-semibold text-slate-700">{step.kind}</span>
                    <span>{new Date(step.occurredAt).toLocaleString()}</span>
                  </div>
                  <div className="mt-1 text-sm leading-6 text-slate-700">{step.summary}</div>
                  {step.eventId ? (
                    <div className="mt-1 font-mono text-[11px] text-slate-400">{step.eventId}</div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>

          <p className="text-xs leading-5 text-slate-500">
            Checkpoint 是只读覆盖元数据，不是 security/compliance audit anchor；Trace 仅解释显式
            workflow 配置，不认证 operator identity，不执行
            rollback、routing、notification、collection 或 scheduler action。
          </p>
        </div>
      ) : null}
    </section>
  );
}
