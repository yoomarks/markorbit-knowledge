"use client";

import { AlertTriangle, CheckCircle2, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type {
  ProducerCoreReliabilityLatencyDistribution,
  ProducerCoreReliabilityRate,
  ProducerCoreReliabilityScorecardV1,
} from "@markorbit/persistence/producer-core-reliability-scorecard";
import { useAdminI18n } from "@/lib/i18n";

type Props = {
  workspaceId: string;
};

function percent(rate: ProducerCoreReliabilityRate): string {
  return rate.value === null ? "—" : `${Math.round(rate.value * 100)}%`;
}

function duration(value: number | null): string {
  if (value === null) return "—";
  if (value < 60_000) return `${Math.round(value / 1_000)}s`;
  if (value < 3_600_000) return `${Math.round(value / 60_000)}m`;
  if (value < 86_400_000) return `${(value / 3_600_000).toFixed(1)}h`;
  return `${(value / 86_400_000).toFixed(1)}d`;
}

function latencyLabel(value: ProducerCoreReliabilityLatencyDistribution): string {
  if (value.sampleSize === 0) return "—";
  return `P50 ${duration(value.p50Ms)} · P95 ${duration(value.p95Ms)} · n=${value.sampleSize}`;
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 text-xl font-semibold text-slate-950">{value}</p>
      <p className="mt-1 text-[11px] text-slate-400">{detail}</p>
    </div>
  );
}

export function ProducerCoreReliability({ workspaceId }: Props) {
  const { locale } = useAdminI18n();
  const zh = locale === "zh-CN";
  const [windowDays, setWindowDays] = useState(30);
  const [scorecard, setScorecard] = useState<ProducerCoreReliabilityScorecardV1 | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(
        `/api/knowledge/reliability?workspaceId=${encodeURIComponent(workspaceId)}&windowDays=${windowDays}`,
        { cache: "no-store" },
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      setScorecard((await response.json()) as ProducerCoreReliabilityScorecardV1);
      setError(null);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : zh
            ? "无法读取 Producer → Core 可靠性"
            : "Unable to load Producer → Core reliability",
      );
    } finally {
      setLoading(false);
    }
  }, [workspaceId, windowDays, zh]);

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  const funnel = scorecard?.funnel;
  const delivery = scorecard?.delivery;
  const progression = scorecard?.progression;
  const latency = scorecard?.latency;
  const reconciliation = scorecard?.drillThrough.reconciliation ?? [];

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-200/30">
      <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-slate-900">Producer → Core Reliability</h2>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
              v{scorecard?.version ?? "1.0"}
            </span>
          </div>
          <p className="mt-1 text-xs leading-5 text-slate-400">
            {zh
              ? "仅从 durable lifecycle evidence 计算；空样本不会被显示为成功，REJECTED / unknown 与最终交付成功严格分开。"
              : "Derived only from durable lifecycle evidence. Empty cohorts are not success; rejected and unknown outcomes stay separate from finalized delivery success."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {[7, 30, 90].map((days) => (
            <button
              key={days}
              type="button"
              onClick={() => setWindowDays(days)}
              aria-pressed={windowDays === days}
              className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold ${
                windowDays === days
                  ? "border-blue-200 bg-blue-50 text-blue-700"
                  : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
              }`}
            >
              {days}d
            </button>
          ))}
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11px] font-semibold text-slate-500 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw size={12} className={loading ? "animate-spin" : ""} aria-hidden="true" />
            {zh ? "刷新" : "Refresh"}
          </button>
        </div>
      </div>

      {error ? (
        <div
          role="alert"
          className="flex items-center gap-2 border-b border-rose-100 bg-rose-50 px-5 py-3 text-xs text-rose-700"
        >
          <AlertTriangle size={14} aria-hidden="true" />
          {zh ? "可靠性数据加载失败：" : "Reliability load failed: "}
          {error}
        </div>
      ) : null}

      {loading && !scorecard ? (
        <div role="status" className="px-5 py-8 text-center text-xs text-slate-400">
          {zh ? "正在读取 durable evidence…" : "Loading durable evidence…"}
        </div>
      ) : scorecard && progression && funnel && delivery && latency ? (
        <>
          <div className="grid gap-3 border-b border-slate-100 p-5 sm:grid-cols-2 xl:grid-cols-5">
            <Metric
              label={zh ? "Verified → Canonical" : "Verified → Canonical"}
              value={percent(progression.verifiedFinalizationToCanonical)}
              detail={`${progression.verifiedFinalizationToCanonical.numerator}/${progression.verifiedFinalizationToCanonical.denominator}`}
            />
            <Metric
              label="Promoted → ReadyPackage"
              value={percent(progression.canonicalPromotionToReadyPackage)}
              detail={`${progression.canonicalPromotionToReadyPackage.numerator}/${progression.canonicalPromotionToReadyPackage.denominator}`}
            />
            <Metric
              label="ReadyPackage → Prepared"
              value={percent(progression.readyPackageToDeliveryPrepared)}
              detail={`${progression.readyPackageToDeliveryPrepared.numerator}/${progression.readyPackageToDeliveryPrepared.denominator}`}
            />
            <Metric
              label={zh ? "最终交付成功" : "Finalized delivery success"}
              value={percent(progression.attemptedDeliveryDeliveredSuccess)}
              detail={`${progression.attemptedDeliveryDeliveredSuccess.numerator}/${progression.attemptedDeliveryDeliveredSuccess.denominator}`}
            />
            <Metric
              label={zh ? "需协调" : "Reconciliation required"}
              value={String(delivery.reconciliationRequired)}
              detail={`${delivery.outcomeUnknown} unknown · ${delivery.retrying} retrying`}
            />
          </div>

          <div className="border-b border-slate-100 px-5 py-4">
            <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-500">
              {[
                [zh ? "Observed*" : "Observed*", funnel.observed],
                [zh ? "Imported" : "Imported", funnel.imported],
                [zh ? "Verified" : "Verified", funnel.verified],
                [zh ? "Promoted" : "Promoted", funnel.promoted],
                ["ReadyPackage", funnel.readyPackageCreated],
                [zh ? "Prepared" : "Prepared", funnel.deliveryPrepared],
                [zh ? "Result" : "Result", funnel.deliveryResultRecorded],
                [zh ? "Finalized" : "Finalized", funnel.deliveryFinalized],
              ].map(([label, value]) => (
                <span key={String(label)}>
                  {label} <strong className="font-semibold text-slate-800">{value}</strong>
                </span>
              ))}
            </div>
            <p className="mt-2 text-[10px] leading-4 text-slate-400">
              *{" "}
              {zh
                ? "Observed 来自 canonical origin preservation，属于明确标注的部分历史覆盖，不等同于全量 acquisition event。"
                : "Observed comes from canonical origin preservation and is explicitly partial historical coverage, not a complete acquisition-event count."}
            </p>
          </div>

          <div className="grid gap-px border-b border-slate-100 bg-slate-100 lg:grid-cols-2">
            <div className="bg-white px-5 py-4">
              <h3 className="text-xs font-semibold text-slate-800">Consumer result evidence</h3>
              <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-semibold">
                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-emerald-700">
                  ACCEPTED {delivery.resultStatus.ACCEPTED}
                </span>
                <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-blue-700">
                  RECEIVED {delivery.resultStatus.RECEIVED}
                </span>
                <span className="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-rose-700">
                  REJECTED {delivery.resultStatus.REJECTED}
                </span>
                <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-amber-700">
                  NO RESULT {delivery.resultStatus.noDurableResult}
                </span>
              </div>
              <p className="mt-3 text-[11px] text-slate-400">
                {zh
                  ? `首次 attempt 位于窗口内的 cohort：${delivery.attemptedCohortSize}。消费者结果与本地 FINALIZED 分开计算。`
                  : `Cohort with first attempt inside the window: ${delivery.attemptedCohortSize}. Consumer result evidence is measured separately from local FINALIZED.`}
              </p>
            </div>
            <div className="bg-white px-5 py-4">
              <h3 className="text-xs font-semibold text-slate-800">Latency</h3>
              <dl className="mt-3 space-y-2 text-[11px]">
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-slate-500">Verified → Promoted</dt>
                  <dd className="font-medium text-slate-700">
                    {latencyLabel(latency.verifiedToPromoted)}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-slate-500">Promoted → ReadyPackage</dt>
                  <dd className="font-medium text-slate-700">
                    {latencyLabel(latency.promotedToReadyPackage)}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-slate-500">ReadyPackage → Result</dt>
                  <dd className="font-medium text-slate-700">
                    {latencyLabel(latency.readyPackageToDeliveryResult)}
                  </dd>
                </div>
              </dl>
            </div>
          </div>

          {reconciliation.length > 0 ? (
            <details className="border-b border-slate-100 px-5 py-4">
              <summary className="cursor-pointer text-xs font-semibold text-amber-700">
                {zh
                  ? `查看 ${reconciliation.length} 个需关注的 durable delivery records`
                  : `Inspect ${reconciliation.length} durable delivery records requiring attention`}
              </summary>
              <div className="mt-3 overflow-x-auto">
                <table className="min-w-full text-left text-[11px]">
                  <thead className="text-slate-400">
                    <tr>
                      <th className="pb-2 pr-4 font-semibold">State</th>
                      <th className="pb-2 pr-4 font-semibold">Submission</th>
                      <th className="pb-2 pr-4 font-semibold">ReadyPackage</th>
                      <th className="pb-2 pr-4 font-semibold">Result</th>
                      <th className="pb-2 font-semibold">Attempts</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-600">
                    {reconciliation.map((item) => (
                      <tr key={item.submissionId}>
                        <td className="py-2 pr-4 font-medium text-slate-800">{item.state}</td>
                        <td className="py-2 pr-4 font-mono">{item.submissionId}</td>
                        <td className="py-2 pr-4 font-mono">{item.readyPackageId}</td>
                        <td className="py-2 pr-4">{item.resultStatus ?? "—"}</td>
                        <td className="py-2">{item.attemptCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          ) : (
            <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-3 text-xs text-emerald-700">
              <CheckCircle2 size={14} aria-hidden="true" />
              {zh
                ? "当前窗口没有需要协调的 delivery evidence。"
                : "No delivery evidence requires reconciliation in this window."}
            </div>
          )}

          {scorecard.cohorts.byBinding.length > 0 ? (
            <div className="px-5 py-4">
              <h3 className="text-xs font-semibold text-slate-800">
                {zh ? "按 Vault binding 的事实 cohort" : "Factual cohorts by Vault binding"}
              </h3>
              <div className="mt-3 overflow-x-auto">
                <table className="min-w-full text-left text-[11px]">
                  <thead className="text-slate-400">
                    <tr>
                      <th className="pb-2 pr-4 font-semibold">Binding</th>
                      <th className="pb-2 pr-4 font-semibold">Promoted</th>
                      <th className="pb-2 pr-4 font-semibold">Ready</th>
                      <th className="pb-2 pr-4 font-semibold">Prepared</th>
                      <th className="pb-2 pr-4 font-semibold">Delivered</th>
                      <th className="pb-2 font-semibold">Promoted → Ready</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-600">
                    {scorecard.cohorts.byBinding.slice(0, 12).map((item) => (
                      <tr key={item.bindingId}>
                        <td className="py-2 pr-4 font-mono text-slate-800">{item.bindingId}</td>
                        <td className="py-2 pr-4">{item.promoted}</td>
                        <td className="py-2 pr-4">{item.readyPackageCreated}</td>
                        <td className="py-2 pr-4">{item.deliveryPrepared}</td>
                        <td className="py-2 pr-4">{item.delivered}</td>
                        <td className="py-2">{latencyLabel(item.promotedToReadyPackageLatency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
