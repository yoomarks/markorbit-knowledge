"use client";

import { useEffect, useState } from "react";
import { Activity, Database, RefreshCw, ShieldAlert } from "lucide-react";
import type {
  EvidenceMaturityStage,
  SourceIntelligenceAssessmentV2,
  SourceIntelligenceDimension,
  SourceValuePriorityBand,
} from "@markorbit/contracts";

const sourceValueLabels: Record<SourceValuePriorityBand, string> = {
  VERY_HIGH: "Very High",
  HIGH: "High",
  MEDIUM: "Medium",
  LOW: "Low",
};

const evidenceMaturityLabels: Record<EvidenceMaturityStage, string> = {
  UNOBSERVED: "Unobserved",
  CAPTURED: "Captured",
  TRACEABLE: "Traceable",
  CURRENT_TRACEABLE: "Current + Traceable",
};

function sourceValueClass(band: SourceValuePriorityBand): string {
  return {
    VERY_HIGH: "border-emerald-200 bg-emerald-50 text-emerald-900",
    HIGH: "border-sky-200 bg-sky-50 text-sky-900",
    MEDIUM: "border-amber-200 bg-amber-50 text-amber-900",
    LOW: "border-slate-200 bg-slate-100 text-slate-800",
  }[band];
}

function evidenceMaturityClass(stage: EvidenceMaturityStage): string {
  return {
    CURRENT_TRACEABLE: "border-emerald-200 bg-emerald-50 text-emerald-900",
    TRACEABLE: "border-sky-200 bg-sky-50 text-sky-900",
    CAPTURED: "border-amber-200 bg-amber-50 text-amber-900",
    UNOBSERVED: "border-slate-200 bg-slate-100 text-slate-800",
  }[stage];
}

function reasonLabel(reason: string): string {
  return reason.replaceAll("_", " ").toLowerCase();
}

function legacyRescanLabel(assessment: SourceIntelligenceAssessmentV2): string {
  const recommendation = assessment.compatibility.legacyRecommendedRescan;
  return recommendation.mode === "DAYS"
    ? `${recommendation.intervalDays} 天后人工复查`
    : "仅在人工判断需要时复查";
}

function SignalCard({ title, signal }: { title: string; signal: SourceIntelligenceDimension }) {
  return (
    <div className="rounded-2xl border border-slate-200 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium text-slate-900">{title}</p>
          <p className="mt-1 text-xs text-slate-500">置信度 {signal.confidence}</p>
        </div>
        <span className="text-2xl font-semibold text-slate-950">
          {signal.score === null ? "—" : signal.score}
        </span>
      </div>
      <div className="mt-3 space-y-1.5 text-xs leading-5 text-slate-600">
        {signal.reasonCodes.map((reason) => (
          <p key={reason}>• {reasonLabel(reason)}</p>
        ))}
      </div>
    </div>
  );
}

async function readAssessment(
  sourceId: string,
  signal?: AbortSignal,
): Promise<SourceIntelligenceAssessmentV2 | null> {
  const params = new URLSearchParams({ sourceId, protocolVersion: "2.0" });
  const response = await fetch(`/api/source-intelligence?${params.toString()}`, { signal });
  const body = (await response.json()) as {
    assessment?: SourceIntelligenceAssessmentV2 | null;
    error?: { message?: string };
  };
  if (!response.ok) throw new Error(body.error?.message ?? "无法读取 Source Intelligence");
  return body.assessment ?? null;
}

export function SourceIntelligencePanel({ sourceId }: { sourceId: string }) {
  const [assessment, setAssessment] = useState<SourceIntelligenceAssessmentV2 | null>(null);
  const [loading, setLoading] = useState(true);
  const [assessing, setAssessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void readAssessment(sourceId, controller.signal)
      .then((nextAssessment) => {
        setAssessment(nextAssessment);
        setError(null);
      })
      .catch((requestError: unknown) => {
        if (requestError instanceof DOMException && requestError.name === "AbortError") return;
        setError(
          requestError instanceof Error ? requestError.message : "无法读取 Source Intelligence",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [sourceId]);

  async function assess() {
    setAssessing(true);
    setError(null);
    try {
      const response = await fetch("/api/source-intelligence", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sourceId, protocolVersion: "2.0" }),
      });
      const body = (await response.json()) as {
        assessment?: SourceIntelligenceAssessmentV2;
        error?: { message?: string };
      };
      if (!response.ok || !body.assessment) {
        throw new Error(body.error?.message ?? "无法完成 Source Intelligence 评估");
      }
      setAssessment(body.assessment);
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "无法完成 Source Intelligence 评估",
      );
    } finally {
      setAssessing(false);
    }
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="flex flex-col gap-4 border-b border-slate-200 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Activity size={18} className="text-emerald-700" aria-hidden="true" />
            <h2 className="font-semibold text-slate-950">Source Intelligence</h2>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            默认使用 Source Value × Evidence Maturity 双轴；Acquisition Cost 保持独立决策上下文。
          </p>
        </div>
        <button
          type="button"
          onClick={() => void assess()}
          disabled={assessing || loading}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RefreshCw size={16} className={assessing ? "animate-spin" : ""} aria-hidden="true" />
          {assessment ? "重新评估" : "建立首次评估"}
        </button>
      </div>

      {error ? (
        <div className="m-5 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          {error}
        </div>
      ) : null}

      {loading ? <div className="p-8 text-center text-sm text-slate-500">正在读取评估…</div> : null}

      {!loading && !assessment ? (
        <div className="p-8 text-center">
          <Database className="mx-auto text-slate-400" size={28} aria-hidden="true" />
          <p className="mt-3 font-medium text-slate-900">尚未建立 Source Intelligence 基线</p>
          <p className="mx-auto mt-2 max-w-2xl text-sm text-slate-500">
            首次评估仍保存 v1 历史评估快照，再只读投影为双轴 v2；不会改变 Authority、CollectionPlan
            或执行状态。
          </p>
        </div>
      ) : null}

      {assessment ? (
        <div className="space-y-6 p-5">
          <div className="grid gap-4 lg:grid-cols-2">
            <div
              className={`rounded-2xl border p-5 ${sourceValueClass(assessment.sourceValuePriority.band)}`}
            >
              <p className="text-xs font-semibold uppercase tracking-[0.14em]">Source Value</p>
              <div className="mt-3 flex items-end justify-between gap-4">
                <div>
                  <p className="text-3xl font-semibold">
                    {sourceValueLabels[assessment.sourceValuePriority.band]}
                  </p>
                  <p className="mt-1 text-sm">来源本身的长期优先价值</p>
                </div>
                <span className="text-3xl font-semibold">{assessment.sourceValuePriority.score}</span>
              </div>
              <p className="mt-4 text-xs leading-5">
                仅由来源类别相关性基线与显式 Authority 信号组成，不因当前是否已采集而降低。
              </p>
            </div>

            <div
              className={`rounded-2xl border p-5 ${evidenceMaturityClass(assessment.evidenceMaturity.stage)}`}
            >
              <p className="text-xs font-semibold uppercase tracking-[0.14em]">Evidence Maturity</p>
              <div className="mt-3 flex items-end justify-between gap-4">
                <div>
                  <p className="text-3xl font-semibold">
                    {evidenceMaturityLabels[assessment.evidenceMaturity.stage]}
                  </p>
                  <p className="mt-1 text-sm">当前证据成熟度</p>
                </div>
                <span className="text-3xl font-semibold">
                  {assessment.evidenceMaturity.score === null ? "—" : assessment.evidenceMaturity.score}
                </span>
              </div>
              <p className="mt-4 text-xs leading-5">
                UNOBSERVED 表示尚无可用采集证据，不代表来源价值低，也不授权自动采集。
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950">
            <div className="flex gap-3">
              <ShieldAlert className="mt-0.5 shrink-0" size={19} aria-hidden="true" />
              <div>
                <p className="font-semibold">双轴展示 ≠ 执行授权</p>
                <p className="mt-2 leading-6">
                  Scheduler 当前仍为 <strong>{assessment.scheduling.policyStatus}</strong>。系统不会从
                  Source Value 推断法律权威，不会从 Evidence Maturity 推断法律真实性，也不会自动写入
                  CollectionPlan、启动采集或授予 MGSN 资格。
                </p>
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-slate-950">Source Value 信号</h3>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <SignalCard title="来源类别相关性基线" signal={assessment.sourceValuePriority.signals.relevance} />
              <SignalCard title="显式 Authority 信号" signal={assessment.sourceValuePriority.signals.authority} />
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-slate-950">Evidence Maturity 信号</h3>
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <SignalCard title="Freshness" signal={assessment.evidenceMaturity.signals.freshness} />
              <SignalCard
                title="Evidenceability"
                signal={assessment.evidenceMaturity.signals.evidenceability}
              />
              <SignalCard title="Novelty" signal={assessment.evidenceMaturity.signals.novelty} />
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-sm font-semibold text-slate-950">Decision Context · Acquisition Cost</h3>
                <p className="mt-1 text-xs text-slate-500">
                  采集成本保持独立，不进入 Source Value，也不决定 Evidence Maturity。
                </p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-semibold text-slate-950">
                  {assessment.decisionContext.observedAcquisitionCost.score === null
                    ? "—"
                    : assessment.decisionContext.observedAcquisitionCost.score}
                </p>
                <p className="text-xs text-slate-500">
                  {assessment.decisionContext.observedAcquisitionCost.score === null
                    ? "尚未观察"
                    : "observed footprint proxy"}
                </p>
              </div>
            </div>
          </div>

          <details className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
            <summary className="cursor-pointer text-sm font-semibold text-slate-900">
              Advanced · Legacy v1 compatibility
            </summary>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <p className="text-xs text-slate-500">Legacy Tier</p>
                <p className="mt-1 font-semibold text-slate-900">
                  Tier {assessment.compatibility.legacyOperationalTier}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Legacy priority score</p>
                <p className="mt-1 font-semibold text-slate-900">
                  {assessment.compatibility.legacyPriorityScore}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Legacy rescan</p>
                <p className="mt-1 font-semibold text-slate-900">{legacyRescanLabel(assessment)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Projection</p>
                <p className="mt-1 font-semibold text-slate-900">
                  {assessment.compatibility.projectionMode}
                </p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-xs text-slate-500">
              <span>Legacy assessment: {assessment.compatibility.legacyAssessmentId}</span>
              <span>评估时间：{new Date(assessment.assessedAt).toLocaleString("zh-CN")}</span>
              <span>Evaluator：{assessment.evaluator.version}</span>
            </div>
          </details>
        </div>
      ) : null}
    </section>
  );
}
