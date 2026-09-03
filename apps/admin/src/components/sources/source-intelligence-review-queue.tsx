"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  EyeOff,
  ListChecks,
  RefreshCw,
  RotateCcw,
  Save,
  ShieldAlert,
} from "lucide-react";
import type {
  SourceDefinition,
  SourceIntelligenceObservationReviewQueueItemV2,
  SourceIntelligenceObservationReviewQueueV2,
  SourceIntelligenceObservationReviewStatus,
} from "@markorbit/contracts";
import type { SourceListResult } from "@markorbit/persistence";
import { adminBrowserMutationHeaders } from "@/lib/admin-browser-api-client";

const COHORT_LIMIT = 100;
type StatusFilter = "ALL" | SourceIntelligenceObservationReviewStatus;

const flagLabels: Record<SourceIntelligenceObservationReviewQueueItemV2["flag"]["kind"], string> = {
  HIGH_VALUE_UNOBSERVED: "高价值但 Evidence Unobserved",
  EVIDENCE_MATURITY_REGRESSION: "Evidence Maturity 回退",
  SOURCE_VALUE_BAND_CHANGED: "Source Value 档位变化",
  ACQUISITION_COST_INCREASED: "Acquisition Cost 代理值明显上升",
};

const statusLabels: Record<SourceIntelligenceObservationReviewStatus, string> = {
  PENDING: "待处理",
  ACKNOWLEDGED: "已确认",
  IGNORED: "已忽略",
};

type QueueSnapshot = {
  queue: SourceIntelligenceObservationReviewQueueV2 | null;
  sources: Record<string, SourceDefinition>;
};

function statusClass(status: SourceIntelligenceObservationReviewStatus): string {
  return {
    PENDING: "border-amber-200 bg-amber-50 text-amber-800",
    ACKNOWLEDGED: "border-emerald-200 bg-emerald-50 text-emerald-800",
    IGNORED: "border-slate-200 bg-slate-100 text-slate-700",
  }[status];
}

function flagDetail(item: SourceIntelligenceObservationReviewQueueItemV2): string {
  const flag = item.flag;
  switch (flag.kind) {
    case "HIGH_VALUE_UNOBSERVED":
      return `${flag.current.sourceValue.band} ${flag.current.sourceValue.score} · Evidence ${flag.current.evidenceMaturity.stage}`;
    case "EVIDENCE_MATURITY_REGRESSION":
      return `${flag.previous?.evidenceMaturity.stage ?? "—"} → ${flag.current.evidenceMaturity.stage}`;
    case "SOURCE_VALUE_BAND_CHANGED":
      return `${flag.previous?.sourceValue.band ?? "—"} → ${flag.current.sourceValue.band}`;
    case "ACQUISITION_COST_INCREASED":
      return `${flag.previous?.observedAcquisitionCost.score ?? "—"} → ${flag.current.observedAcquisitionCost.score ?? "—"}`;
  }
}

async function readQueue(signal?: AbortSignal): Promise<QueueSnapshot> {
  const sourceResponse = await fetch(`/api/sources?limit=${COHORT_LIMIT}&offset=0`, { signal });
  const sourceBody = (await sourceResponse.json()) as
    SourceListResult | { error?: { message?: string } };
  if (!sourceResponse.ok) {
    const message = "error" in sourceBody ? sourceBody.error?.message : undefined;
    throw new Error(message ?? "无法读取 Sources");
  }

  const sourceItems = (sourceBody as SourceListResult).items;
  const sources = Object.fromEntries(sourceItems.map((source) => [source.id, source]));
  if (sourceItems.length === 0) return { queue: null, sources };

  const params = new URLSearchParams({
    sourceIds: sourceItems.map((source) => source.id).join(","),
    protocolVersion: "2.0",
  });
  const response = await fetch(`/api/source-intelligence/reviews?${params.toString()}`, { signal });
  const body = (await response.json()) as {
    queue?: SourceIntelligenceObservationReviewQueueV2;
    error?: { message?: string };
  };
  if (!response.ok || !body.queue) {
    throw new Error(body.error?.message ?? "无法读取 Source Intelligence Review Queue");
  }
  return { queue: body.queue, sources };
}

export function SourceIntelligenceReviewQueue() {
  const [snapshot, setSnapshot] = useState<QueueSnapshot>({ queue: null, sources: {} });
  const [filter, setFilter] = useState<StatusFilter>("PENDING");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const applySnapshot = useCallback((next: QueueSnapshot) => {
    setSnapshot(next);
    setNotes(
      Object.fromEntries(
        (next.queue?.items ?? []).map((item) => [item.observationKey, item.review?.note ?? ""]),
      ),
    );
  }, []);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      applySnapshot(await readQueue());
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "无法读取人工复核队列");
    } finally {
      setLoading(false);
    }
  }, [applySnapshot]);

  useEffect(() => {
    const controller = new AbortController();
    void readQueue(controller.signal)
      .then((next) => {
        applySnapshot(next);
        setError(null);
      })
      .catch((requestError: unknown) => {
        if (requestError instanceof DOMException && requestError.name === "AbortError") return;
        setError(requestError instanceof Error ? requestError.message : "无法读取人工复核队列");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [applySnapshot]);

  async function saveDecision(
    item: SourceIntelligenceObservationReviewQueueItemV2,
    status: SourceIntelligenceObservationReviewStatus,
  ) {
    setSavingKey(item.observationKey);
    setError(null);
    try {
      const response = await fetch("/api/source-intelligence/reviews", {
        method: "POST",
        headers: await adminBrowserMutationHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({
          protocolVersion: "2.0",
          sourceId: item.sourceId,
          observationKey: item.observationKey,
          status,
          note: notes[item.observationKey] ?? "",
        }),
      });
      const body = (await response.json()) as { error?: { message?: string } };
      if (!response.ok) throw new Error(body.error?.message ?? "无法保存人工复核决定");
      applySnapshot(await readQueue());
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "无法保存人工复核决定");
    } finally {
      setSavingKey(null);
    }
  }

  const { queue, sources } = snapshot;
  const visibleItems = useMemo(
    () => (queue?.items ?? []).filter((item) => filter === "ALL" || item.status === filter),
    [filter, queue],
  );

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="flex flex-col gap-4 border-b border-slate-200 p-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <ListChecks size={19} className="text-emerald-700" aria-hidden="true" />
            <h2 className="font-semibold text-slate-950">D2.9 · Operator Review Queue</h2>
          </div>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">
            D2.8 Observation Flag 进入人工队列后可以确认、忽略或留下备注。决定只绑定当前这一次
            observation occurrence；后续 Evidence State 变化会产生新的待处理项。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select
            value={filter}
            onChange={(event) => setFilter(event.target.value as StatusFilter)}
            className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
            aria-label="筛选人工复核状态"
          >
            <option value="PENDING">待处理</option>
            <option value="ACKNOWLEDGED">已确认</option>
            <option value="IGNORED">已忽略</option>
            <option value="ALL">全部状态</option>
          </select>
          <button
            type="button"
            onClick={() => void reload()}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-3.5 py-2 text-sm font-medium text-slate-700 disabled:opacity-50"
          >
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} aria-hidden="true" />
            重新读取
          </button>
        </div>
      </div>

      {error ? (
        <div className="m-5 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          {error}
        </div>
      ) : null}

      {loading ? <div className="p-6 text-sm text-slate-500">正在读取人工复核队列…</div> : null}

      {!loading && !queue ? (
        <div className="p-6 text-sm text-slate-500">当前没有可进入人工复核队列的 Source。</div>
      ) : null}

      {queue ? (
        <div className="space-y-5 p-5">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              ["当前 Flags", queue.itemCount],
              ["待处理", queue.counts.pending],
              ["已确认", queue.counts.acknowledged],
              ["已忽略", queue.counts.ignored],
            ].map(([label, value]) => (
              <div
                key={String(label)}
                className="rounded-xl border border-slate-200 bg-slate-50 p-4"
              >
                <p className="text-xs font-medium text-slate-500">{label}</p>
                <p className="mt-2 text-2xl font-semibold text-slate-950">{value}</p>
              </div>
            ))}
          </div>

          {visibleItems.length === 0 ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
              当前筛选状态下没有 Observation Flag。
            </div>
          ) : (
            <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
              {visibleItems.map((item) => {
                const source = sources[item.sourceId];
                const saving = savingKey === item.observationKey;
                return (
                  <article
                    key={item.observationKey}
                    className="grid gap-4 p-4 xl:grid-cols-[1fr_340px]"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-slate-950">
                          {flagLabels[item.flag.kind]}
                        </p>
                        <span
                          className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClass(item.status)}`}
                        >
                          {statusLabels[item.status]}
                        </span>
                        <span className="text-xs text-slate-400">{item.flag.severity}</span>
                      </div>
                      <p className="mt-2 text-sm text-slate-600">{flagDetail(item)}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                        {source ? (
                          <Link
                            href={`/sources/${source.id}`}
                            className="font-medium text-emerald-700 hover:underline"
                          >
                            {source.name}
                          </Link>
                        ) : (
                          <span>{item.sourceId}</span>
                        )}
                        <span>{new Date(item.flag.observedAt).toLocaleString("zh-CN")}</span>
                        {item.review ? <span>reviewed by {item.review.reviewer}</span> : null}
                      </div>
                      <details className="mt-3 text-xs text-slate-500">
                        <summary className="cursor-pointer">查看确定性 reason codes</summary>
                        <p className="mt-1 leading-5">{item.flag.reasonCodes.join(" · ")}</p>
                        <p className="mt-1 font-mono text-[11px] text-slate-400">
                          {item.observationKey}
                        </p>
                      </details>
                    </div>

                    <div className="space-y-2">
                      <textarea
                        value={notes[item.observationKey] ?? ""}
                        onChange={(event) =>
                          setNotes((current) => ({
                            ...current,
                            [item.observationKey]: event.target.value,
                          }))
                        }
                        maxLength={2000}
                        rows={3}
                        placeholder="人工备注（可选）"
                        className="w-full resize-y rounded-xl border border-slate-300 p-3 text-sm"
                      />
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => void saveDecision(item, "ACKNOWLEDGED")}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                        >
                          <CheckCircle2 size={14} /> 确认
                        </button>
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => void saveDecision(item, "IGNORED")}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-50"
                        >
                          <EyeOff size={14} /> 忽略
                        </button>
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => void saveDecision(item, item.status)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-50"
                        >
                          <Save size={14} /> 保存备注
                        </button>
                        {item.status !== "PENDING" ? (
                          <button
                            type="button"
                            disabled={saving}
                            onClick={() => void saveDecision(item, "PENDING")}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 disabled:opacity-50"
                          >
                            <RotateCcw size={14} /> 恢复待处理
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
            <div className="flex gap-3">
              <ShieldAlert className="mt-0.5 shrink-0" size={18} aria-hidden="true" />
              <p className="leading-6">
                人工“确认/忽略”只是运营复核结果，不授权任何后续动作。Scheduler 仍为{" "}
                <strong>{queue.scheduling.policyStatus}</strong>；不会创建或修改
                CollectionPlan、启动采集、推断 Authority、验证法律真实性、合并跨来源身份或授予 MGSN
                资格。
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
