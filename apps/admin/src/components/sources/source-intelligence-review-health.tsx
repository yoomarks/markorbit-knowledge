"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Activity, Clock3, History, RefreshCw, Repeat2, ShieldAlert } from "lucide-react";
import type {
  SourceDefinition,
  SourceIntelligenceObservationFlagKind,
  SourceIntelligenceReviewQueueOperationalHealthV2,
} from "@markorbit/contracts";
import type { SourceListResult } from "@markorbit/persistence";

const COHORT_LIMIT = 100;

const flagLabels: Record<SourceIntelligenceObservationFlagKind, string> = {
  HIGH_VALUE_UNOBSERVED: "高价值但 Evidence Unobserved",
  EVIDENCE_MATURITY_REGRESSION: "Evidence Maturity 回退",
  SOURCE_VALUE_BAND_CHANGED: "Source Value 档位变化",
  ACQUISITION_COST_INCREASED: "Acquisition Cost 代理值明显上升",
};

const eventLabels = {
  SNAPSHOT_BACKFILL: "D2.9 状态回填",
  DISPOSITION_CHANGED: "处理状态变化",
  NOTE_UPDATED: "备注更新",
  REVIEW_TOUCHED: "复核记录更新",
} as const;

type HealthSnapshot = {
  health: SourceIntelligenceReviewQueueOperationalHealthV2 | null;
  sources: Record<string, SourceDefinition>;
};

function formatHours(value: number | null): string {
  if (value === null) return "—";
  if (value < 24) return `${value.toFixed(value < 10 ? 1 : 0)}h`;
  return `${(value / 24).toFixed(value < 72 ? 1 : 0)}d`;
}

async function readHealth(signal?: AbortSignal): Promise<HealthSnapshot> {
  const sourceResponse = await fetch(`/api/sources?limit=${COHORT_LIMIT}&offset=0`, { signal });
  const sourceBody = (await sourceResponse.json()) as
    SourceListResult | { error?: { message?: string } };
  if (!sourceResponse.ok) {
    const message = "error" in sourceBody ? sourceBody.error?.message : undefined;
    throw new Error(message ?? "无法读取 Sources");
  }

  const sourceItems = (sourceBody as SourceListResult).items;
  const sources = Object.fromEntries(sourceItems.map((source) => [source.id, source]));
  if (sourceItems.length === 0) return { health: null, sources };

  const params = new URLSearchParams({
    sourceIds: sourceItems.map((source) => source.id).join(","),
    protocolVersion: "2.0",
    historyLimit: "50",
    reviewEventLimit: "200",
  });
  const response = await fetch(`/api/source-intelligence/reviews/health?${params.toString()}`, {
    signal,
  });
  const body = (await response.json()) as {
    health?: SourceIntelligenceReviewQueueOperationalHealthV2;
    error?: { message?: string };
  };
  if (!response.ok || !body.health) {
    throw new Error(body.error?.message ?? "无法读取 Review Queue Operational Health");
  }
  return { health: body.health, sources };
}

export function SourceIntelligenceReviewHealth() {
  const [snapshot, setSnapshot] = useState<HealthSnapshot>({ health: null, sources: {} });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setSnapshot(await readHealth());
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "无法读取人工复核运营健康状态",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void readHealth(controller.signal)
      .then((next) => {
        setSnapshot(next);
        setError(null);
      })
      .catch((requestError: unknown) => {
        if (requestError instanceof DOMException && requestError.name === "AbortError") return;
        setError(
          requestError instanceof Error ? requestError.message : "无法读取人工复核运营健康状态",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  const { health, sources } = snapshot;

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="flex flex-col gap-4 border-b border-slate-200 p-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Activity size={19} className="text-violet-700" aria-hidden="true" />
            <h2 className="font-semibold text-slate-950">
              D2.10 · Review Queue Operational Health
            </h2>
          </div>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">
            描述人工复核队列的积压年龄、重复 Observation、处理分布与 Source 级复核历史。这里的 age
            是运营 backlog age，不是 Source Evidence freshness，也不会转化为 Scheduler priority。
          </p>
        </div>
        <button
          type="button"
          onClick={() => void reload()}
          disabled={loading}
          className="inline-flex items-center gap-2 self-start rounded-xl border border-slate-300 px-3.5 py-2 text-sm font-medium text-slate-700 disabled:opacity-50"
        >
          <RefreshCw size={15} className={loading ? "animate-spin" : ""} aria-hidden="true" />
          重新读取
        </button>
      </div>

      {error ? (
        <div className="m-5 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          {error}
        </div>
      ) : null}

      {loading ? <div className="p-6 text-sm text-slate-500">正在计算队列运营健康状态…</div> : null}

      {!loading && !health ? (
        <div className="p-6 text-sm text-slate-500">
          当前没有 Source 可用于计算复核队列健康状态。
        </div>
      ) : null}

      {health ? (
        <div className="space-y-5 p-5">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
                <Clock3 size={14} aria-hidden="true" /> 当前待处理
              </div>
              <p className="mt-2 text-2xl font-semibold text-slate-950">
                {health.currentCounts.pending}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                oldest {formatHours(health.backlog.oldestPendingAgeHours)}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
                <Repeat2 size={14} aria-hidden="true" /> 重复 Source × Flag
              </div>
              <p className="mt-2 text-2xl font-semibold text-slate-950">
                {health.recurrence.recurringSourceFlagPairCount}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                max occurrence {health.recurrence.maxOccurrenceCount}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
                <History size={14} aria-hidden="true" /> Review events
              </div>
              <p className="mt-2 text-2xl font-semibold text-slate-950">
                {health.reviewActivity.eventCount}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                median first touch {formatHours(health.reviewActivity.medianFirstTouchLatencyHours)}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-medium text-slate-500">当前处理分布</p>
              <p className="mt-2 text-sm font-semibold text-slate-950">
                {health.currentCounts.acknowledged} confirmed · {health.currentCounts.ignored}{" "}
                ignored
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {health.reviewActivity.reopenedToPendingEvents} reopened ·{" "}
                {health.reviewActivity.noteUpdateEvents} note updates
              </p>
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <div className="rounded-xl border border-slate-200 p-4">
              <h3 className="text-sm font-semibold text-slate-950">Pending age distribution</h3>
              <div className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                {[
                  ["< 24h", health.backlog.ageBuckets.under24Hours],
                  ["24–72h", health.backlog.ageBuckets.from24To72Hours],
                  ["3–7d", health.backlog.ageBuckets.from72HoursTo7Days],
                  ["≥ 7d", health.backlog.ageBuckets.atLeast7Days],
                ].map(([label, count]) => (
                  <div key={String(label)} className="rounded-lg bg-slate-50 p-3">
                    <p className="text-xs text-slate-500">{label}</p>
                    <p className="mt-1 font-semibold text-slate-950">{count}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 p-4">
              <h3 className="text-sm font-semibold text-slate-950">Human review activity</h3>
              <div className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                {[
                  ["Confirmed", health.reviewActivity.acknowledgedEvents],
                  ["Ignored", health.reviewActivity.ignoredEvents],
                  ["Reopened", health.reviewActivity.reopenedToPendingEvents],
                  ["D2.9 backfill", health.reviewActivity.snapshotBackfillEvents],
                ].map(([label, count]) => (
                  <div key={String(label)} className="rounded-lg bg-slate-50 p-3">
                    <p className="text-xs text-slate-500">{label}</p>
                    <p className="mt-1 font-semibold text-slate-950">{count}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {health.attention.length > 0 ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50/40">
              <div className="border-b border-amber-100 px-4 py-3">
                <h3 className="text-sm font-semibold text-amber-950">Operator attention order</h3>
                <p className="mt-1 text-xs text-amber-800">
                  仅用于人工阅读顺序：ATTENTION severity → backlog age → occurrence
                  count。不是自动优先级。
                </p>
              </div>
              <div className="divide-y divide-amber-100">
                {health.attention.slice(0, 10).map((item) => {
                  const source = sources[item.sourceId];
                  return (
                    <div
                      key={item.observationKey}
                      className="grid gap-2 px-4 py-3 text-sm sm:grid-cols-[1fr_auto]"
                    >
                      <div>
                        <p className="font-medium text-slate-950">{flagLabels[item.flagKind]}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {source ? (
                            <Link
                              href={`/sources/${source.id}`}
                              className="font-medium text-violet-700 hover:underline"
                            >
                              {source.name}
                            </Link>
                          ) : (
                            item.sourceId
                          )}
                          {" · "}
                          occurrence × {item.occurrenceCount}
                        </p>
                      </div>
                      <div className="text-right text-xs text-slate-600">
                        <p className="font-semibold">{formatHours(item.pendingAgeHours)}</p>
                        <p>{item.severity}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          {health.recurrence.top.length > 0 ? (
            <div className="rounded-xl border border-slate-200">
              <div className="border-b border-slate-200 px-4 py-3">
                <h3 className="text-sm font-semibold text-slate-950">
                  Recurring observation patterns
                </h3>
                <p className="mt-1 text-xs text-slate-500">
                  基于 distinct Evidence State history 重建历史
                  occurrence；重复本身不代表法律或质量异常。
                </p>
              </div>
              <div className="divide-y divide-slate-100">
                {health.recurrence.top.slice(0, 10).map((entry) => {
                  const source = sources[entry.sourceId];
                  return (
                    <div
                      key={`${entry.sourceId}:${entry.flagKind}`}
                      className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm"
                    >
                      <div>
                        <p className="font-medium text-slate-950">{flagLabels[entry.flagKind]}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {source ? source.name : entry.sourceId}
                        </p>
                      </div>
                      <div className="text-right text-xs text-slate-600">
                        <p className="font-semibold">× {entry.occurrenceCount}</p>
                        <p>{new Date(entry.latestObservedAt).toLocaleString("zh-CN")}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          {health.recentReviewEvents.length > 0 ? (
            <details className="rounded-xl border border-slate-200 p-4">
              <summary className="cursor-pointer text-sm font-semibold text-slate-950">
                Source-level review history · latest {health.recentReviewEvents.length}
              </summary>
              <div className="mt-3 divide-y divide-slate-100">
                {health.recentReviewEvents.map((event) => {
                  const source = sources[event.sourceId];
                  return (
                    <div
                      key={event.eventId}
                      className="grid gap-2 py-3 text-xs sm:grid-cols-[1fr_auto]"
                    >
                      <div>
                        <p className="font-medium text-slate-800">
                          {source ? source.name : event.sourceId} · {flagLabels[event.flagKind]}
                        </p>
                        <p className="mt-1 text-slate-500">
                          {eventLabels[event.action]} · {event.previousStatus} → {event.status} ·{" "}
                          {event.reviewer}
                        </p>
                        {event.note ? <p className="mt-1 text-slate-500">{event.note}</p> : null}
                      </div>
                      <p className="text-slate-400">
                        {new Date(event.occurredAt).toLocaleString("zh-CN")}
                      </p>
                    </div>
                  );
                })}
              </div>
            </details>
          ) : null}

          <div className="rounded-xl border border-violet-200 bg-violet-50 p-4 text-sm text-violet-950">
            <div className="flex gap-3">
              <ShieldAlert className="mt-0.5 shrink-0" size={18} aria-hidden="true" />
              <p className="leading-6">
                D2.10 只描述人工复核工作负载与历史。它不会将 backlog age、重复次数或人工确认转换为
                CollectionPlan、采集许可或 Scheduler 指令；Scheduler 仍为{" "}
                <strong>{health.scheduling.policyStatus}</strong>。
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
