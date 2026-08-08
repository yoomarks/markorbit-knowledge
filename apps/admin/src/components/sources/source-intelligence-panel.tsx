"use client";

import { useCallback, useEffect, useState } from "react";
import { Activity, Database, RefreshCw, ShieldAlert } from "lucide-react";
import {
  SOURCE_INTELLIGENCE_DIMENSIONS,
  type SourceIntelligenceAssessment,
  type SourceIntelligenceDimensionName,
  type SourceIntelligenceTier,
} from "@markorbit/contracts";

const dimensionLabels: Record<SourceIntelligenceDimensionName, string> = {
  RELEVANCE: "商标相关性",
  AUTHORITY_SIGNAL: "显式权威信号",
  FRESHNESS: "证据新鲜度",
  EVIDENCEABILITY: "可证据化程度",
  NOVELTY: "新增信息",
  ACQUISITION_COST: "采集成本代理值",
};

const reasonLabels: Record<string, string> = {
  EXPLICIT_AUTHORITY_PRIMARY_OFFICIAL: "来源已明确标记为一手官方",
  EXPLICIT_AUTHORITY_SECONDARY_OFFICIAL: "来源已明确标记为官方衍生信息",
  EXPLICIT_AUTHORITY_PROFESSIONAL: "来源已明确标记为专业机构",
  EXPLICIT_AUTHORITY_INTERNAL: "来源已明确标记为内部资料",
  EXPLICIT_AUTHORITY_INDUSTRY: "来源已明确标记为行业来源",
  EXPLICIT_AUTHORITY_COMMUNITY: "来源已明确标记为社区来源",
  AUTHORITY_NOT_EXPLICITLY_ASSIGNED: "尚未人工明确权威等级",
  NO_RAW_ARTIFACT_RECENCY_EVIDENCE: "尚无 RawArtifact 时间证据",
  CAPTURED_WITHIN_7_DAYS: "最近 7 天内有采集证据",
  CAPTURED_WITHIN_30_DAYS: "最近 30 天内有采集证据",
  CAPTURED_WITHIN_90_DAYS: "最近 90 天内有采集证据",
  CAPTURED_WITHIN_365_DAYS: "最近一年内有采集证据",
  CAPTURE_OLDER_THAN_365_DAYS: "最近采集证据已超过一年",
  NO_ARTIFACT_BACKED_GRAPH_EVIDENCE: "Source Graph 尚缺 RawArtifact 支撑",
  RAW_ARTIFACT_PROVENANCE_COVERAGE: "评分参考 RawArtifact provenance 覆盖率",
  IMMUTABLE_ARTIFACT_EVIDENCE_PRESENT: "已有不可变原始证据",
  CATEGORY_BASELINE_ONLY: "当前仅能使用 Source 分类基线",
  NO_CONTENT_NODES_YET: "Source Graph 尚无内容节点",
  GRAPH_TOPIC_COVERAGE: "评分参考 Source Graph 主题覆盖",
  HUMAN_RETAINED_EVIDENCE: "存在人工保留的证据节点",
  NO_PREVIOUS_ASSESSMENT_BASELINE: "尚无上一次评估作为变化基线",
  NO_NEW_GRAPH_OR_ARTIFACT_EVIDENCE: "相较上次评估未发现新增图谱或 Artifact",
  NEW_EVIDENCE_SINCE_PREVIOUS_ASSESSMENT: "相较上次评估发现新增证据",
  NO_ACQUISITION_FOOTPRINT_YET: "尚无采集体量数据",
  OBSERVED_BYTE_FOOTPRINT_PROXY: "成本仅以已观察字节体量近似",
  COST_SCORE_IS_HEURISTIC_NOT_BILLING_DATA: "该分值不是实际费用数据",
};

function tierClass(tier: SourceIntelligenceTier): string {
  return {
    A: "border-emerald-200 bg-emerald-50 text-emerald-800",
    B: "border-sky-200 bg-sky-50 text-sky-800",
    C: "border-amber-200 bg-amber-50 text-amber-800",
    D: "border-slate-200 bg-slate-100 text-slate-700",
  }[tier];
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 * 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`;
  return `${(value / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

function rescanLabel(assessment: SourceIntelligenceAssessment): string {
  return assessment.recommendedRescan.mode === "DAYS"
    ? `建议 ${assessment.recommendedRescan.intervalDays} 天后人工复查是否需要重扫`
    : "建议仅在人工判断需要时重新扫描";
}

export function SourceIntelligencePanel({ sourceId }: { sourceId: string }) {
  const [assessment, setAssessment] = useState<SourceIntelligenceAssessment | null>(null);
  const [loading, setLoading] = useState(true);
  const [assessing, setAssessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/source-intelligence?sourceId=${encodeURIComponent(sourceId)}`);
      const body = (await response.json()) as {
        assessment?: SourceIntelligenceAssessment | null;
        error?: { message?: string };
      };
      if (!response.ok) throw new Error(body.error?.message ?? "无法读取 Source Intelligence");
      setAssessment(body.assessment ?? null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "无法读取 Source Intelligence");
    } finally {
      setLoading(false);
    }
  }, [sourceId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function assess() {
    setAssessing(true);
    setError(null);
    try {
      const response = await fetch("/api/source-intelligence", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sourceId }),
      });
      const body = (await response.json()) as {
        assessment?: SourceIntelligenceAssessment;
        error?: { message?: string };
      };
      if (!response.ok || !body.assessment) {
        throw new Error(body.error?.message ?? "无法完成 Source Intelligence 评估");
      }
      setAssessment(body.assessment);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "无法完成 Source Intelligence 评估");
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
            用现有 Source Graph 与 RawArtifact 证据计算运营优先级，不判断法律事实。
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
            首次评估只读取当前 Source、Source Graph 与 RawArtifact 证据并保存评估快照；不会改变 Authority、CollectionPlan 或执行状态。
          </p>
        </div>
      ) : null}

      {assessment ? (
        <div className="space-y-6 p-5">
          <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
            <div className={`rounded-2xl border p-5 ${tierClass(assessment.operationalTier)}`}>
              <p className="text-xs font-semibold uppercase tracking-[0.14em]">Operational Tier</p>
              <div className="mt-3 flex items-end gap-3">
                <span className="text-5xl font-semibold">{assessment.operationalTier}</span>
                <span className="pb-1 text-sm">{assessment.priorityScore} / 100</span>
              </div>
              <p className="mt-4 text-xs leading-5">{rescanLabel(assessment)}</p>
            </div>

            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950">
              <div className="flex gap-3">
                <ShieldAlert className="mt-0.5 shrink-0" size={19} aria-hidden="true" />
                <div>
                  <p className="font-semibold">运营优先级 ≠ 法律权威评级</p>
                  <p className="mt-2 leading-6">
                    当前显式 Authority 为 <strong>{assessment.input.explicitAuthorityLevel}</strong>。系统不会从 Tier
                    反推 Authority，也不会验证法律真实性；重扫建议不会自动写入 CollectionPlan，更不会自动授权执行。
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-slate-950">六维解释</h3>
            <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {SOURCE_INTELLIGENCE_DIMENSIONS.map((name) => {
                const item = assessment.dimensions[name];
                return (
                  <div key={name} className="rounded-2xl border border-slate-200 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-slate-900">{dimensionLabels[name]}</p>
                        <p className="mt-1 text-xs text-slate-500">置信度 {item.confidence}</p>
                      </div>
                      <span className="text-2xl font-semibold text-slate-950">
                        {item.score === null ? "—" : item.score}
                      </span>
                    </div>
                    <div className="mt-3 space-y-1.5 text-xs leading-5 text-slate-600">
                      {item.reasonCodes.map((reason) => (
                        <p key={reason}>• {reasonLabels[reason] ?? reason.replaceAll("_", " ")}</p>
                      ))}
                    </div>
                    {name === "ACQUISITION_COST" ? (
                      <p className="mt-3 text-xs text-slate-500">该项越高表示观察到的采集体量越高，并作为轻量成本惩罚项。</p>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-slate-950">证据快照</h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
              {[
                ["Graph 节点", assessment.input.graphNodeCount],
                ["内容节点", assessment.input.contentNodeCount],
                ["相关内容", assessment.input.relevantContentNodeCount],
                ["人工保留", assessment.input.retainedNodeCount],
                ["Raw provenance", assessment.input.rawProvenanceNodeCount],
                ["RawArtifact", assessment.input.rawArtifactCount],
                ["唯一内容哈希", assessment.input.distinctArtifactHashCount],
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded-xl bg-slate-50 p-3">
                  <p className="text-xs text-slate-500">{label}</p>
                  <p className="mt-1 text-lg font-semibold text-slate-950">{value}</p>
                </div>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-xs text-slate-500">
              <span>采集体量：{formatBytes(assessment.input.rawArtifactBytes)}</span>
              <span>
                最近采集：
                {assessment.input.latestCapturedAt
                  ? new Date(assessment.input.latestCapturedAt).toLocaleString("zh-CN")
                  : "暂无"}
              </span>
              <span>评估时间：{new Date(assessment.assessedAt).toLocaleString("zh-CN")}</span>
              <span>Evaluator：{assessment.evaluator.version}</span>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
