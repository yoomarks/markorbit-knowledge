"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Activity, AlertTriangle, RefreshCw, ShieldAlert } from "lucide-react";
import type {
  SourceDefinition,
  SourceIntelligenceCrossSourceObservationSummaryV2,
  SourceIntelligenceObservationFlagV2,
} from "@markorbit/contracts";
import type { SourceListResult } from "@markorbit/persistence";

const COHORT_LIMIT = 100;
const HISTORY_LIMIT = 2;
const FLAG_LIMIT = 8;

const flagLabels: Record<SourceIntelligenceObservationFlagV2["kind"], string> = {
  HIGH_VALUE_UNOBSERVED: "高价值但 Evidence Unobserved",
  EVIDENCE_MATURITY_REGRESSION: "Evidence Maturity 回退",
  SOURCE_VALUE_BAND_CHANGED: "Source Value 档位变化",
  ACQUISITION_COST_INCREASED: "Acquisition Cost 代理值明显上升",
};

type SummarySnapshot = {
  summary: SourceIntelligenceCrossSourceObservationSummaryV2 | null;
  sources: Record<string, SourceDefinition>;
};

function flagDetail(flag: SourceIntelligenceObservationFlagV2): string {
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

async function readSummary(signal?: AbortSignal): Promise<SummarySnapshot> {
  const sourceResponse = await fetch(`/api/sources?limit=${COHORT_LIMIT}&offset=0`, { signal });
  const sourceBody = (await sourceResponse.json()) as
    | SourceListResult
    | { error?: { message?: string } };
  if (!sourceResponse.ok) {
    const message = "error" in sourceBody ? sourceBody.error?.message : undefined;
    throw new Error(message ?? "无法读取 Sources");
  }

  const sourceItems = (sourceBody as SourceListResult).items;
  const sources = Object.fromEntries(sourceItems.map((source) => [source.id, source]));
  if (sourceItems.length === 0) return { summary: null, sources };

  const params = new URLSearchParams({
    sourceIds: sourceItems.map((source) => source.id).join(","),
    protocolVersion: "2.0",
    includeHistory: "true",
    historyLimit: String(HISTORY_LIMIT),
    includeSummary: "true",
  });
  const response = await fetch(`/api/source-intelligence?${params.toString()}`, { signal });
  const body = (await response.json()) as {
    summary?: SourceIntelligenceCrossSourceObservationSummaryV2;
    error?: { message?: string };
  };
  if (!response.ok || !body.summary) {
    throw new Error(body.error?.message ?? "无法读取跨 Source 观测摘要");
  }
  return { summary: body.summary, sources };
}

export function SourceIntelligenceObservationSummary() {
  const [snapshot, setSnapshot] = useState<SummarySnapshot>({ summary: null, sources: {} });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setSnapshot(await readSummary());
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "无法读取跨 Source 观测摘要");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void readSummary(controller.signal)
      .then((nextSnapshot) => {
        setSnapshot(nextSnapshot);
        setError(null);
      })
      .catch((requestError: unknown) => {
        if (requestError instanceof DOMException && requestError.name === "AbortError") return;
        setError(requestError instanceof Error ? requestError.message : "无法读取跨 Source 观测摘要");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  const { summary, sources } = snapshot;

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="flex flex-col gap-4 border-b border-slate-200 p-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Activity size={18} className="text-emerald-700" aria-hidden="true" />
            <h2 className="font-semibold text-slate-950">D2.8 · Cross-source observation flags</h2>
          </div>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">
            比较每个 Source 最近两个不同 Evidence State，只输出确定性运营观测；不是法律真实性、专业质量或身份异常判定。
          </p>
        </div>
        <button
          type="button"
          onClick={() => void reload()}
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 px-3.5 py-2 text-sm font-medium text-slate-700 disabled:opacity-50"
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

      {loading ? <div className="p-6 text-sm text-slate-500">正在汇总跨 Source 变化…</div> : null}

      {!loading && !summary ? (
        <div className="p-6 text-sm text-slate-500">当前没有可汇总的 Source Intelligence 状态。</div>
      ) : null}

      {summary ? (
        <div className="space-y-5 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
            <span>
              已评估 {summary.assessedSourceCount} / {summary.sourceCount} · 有观测旗标的 Source {summary.flaggedSourceCount}
            </span>
            <span>
              summarized through {summary.summarizedThrough ? new Date(summary.summarizedThrough).toLocaleString("zh-CN") : "—"}
            </span>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              ["High value · Unobserved", summary.counts.highValueUnobserved],
              ["Maturity regressions", summary.counts.evidenceMaturityRegressions],
              ["Value band changes", summary.counts.sourceValueBandChanges],
              ["Cost increases ≥20", summary.counts.acquisitionCostIncreases],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-medium text-slate-500">{label}</p>
                <p className="mt-2 text-2xl font-semibold text-slate-950">{value}</p>
              </div>
            ))}
          </div>

          {summary.flags.length === 0 ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
              最近的 distinct evidence states 没有触发 D2.8 观测规则。
            </div>
          ) : (
            <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
              {summary.flags.slice(0, FLAG_LIMIT).map((flag) => {
                const source = sources[flag.sourceId];
                return (
                  <div key={`${flag.sourceId}:${flag.kind}`} className="flex gap-3 p-4">
                    <span
                      className={`mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl ${
                        flag.severity === "ATTENTION"
                          ? "bg-amber-50 text-amber-700"
                          : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      <AlertTriangle size={17} aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <p className="text-sm font-semibold text-slate-900">{flagLabels[flag.kind]}</p>
                        <span className="text-xs text-slate-400">{flag.severity}</span>
                      </div>
                      <p className="mt-1 text-sm text-slate-600">{flagDetail(flag)}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                        {source ? (
                          <Link href={`/sources/${source.id}`} className="font-medium text-emerald-700 hover:underline">
                            {source.name}
                          </Link>
                        ) : (
                          <span>{flag.sourceId}</span>
                        )}
                        <span>{new Date(flag.observedAt).toLocaleString("zh-CN")}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
            <div className="flex gap-3">
              <ShieldAlert className="mt-0.5 shrink-0" size={18} aria-hidden="true" />
              <p className="leading-6">
                Observation Flag 只提示“值得人工看一眼”。Scheduler 仍为 <strong>{summary.scheduling.policyStatus}</strong>；不会创建 CollectionPlan、启动采集、推断 Authority、验证法律真实性、做跨来源身份合并或授予 MGSN 资格。
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
