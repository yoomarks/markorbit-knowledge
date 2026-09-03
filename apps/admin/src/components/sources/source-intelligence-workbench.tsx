"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, ExternalLink, RefreshCw, Search } from "lucide-react";
import type {
  EvidenceMaturityStage,
  SourceDefinition,
  SourceIntelligenceAssessmentV2,
  SourceValuePriorityBand,
} from "@markorbit/contracts";
import type { SourceListResult } from "@markorbit/persistence";
import { adminBrowserMutationHeaders } from "@/lib/admin-browser-api-client";
import {
  compareDualAxisAssessments,
  countDualAxisAssessments,
  matchesDualAxisFilters,
  type EvidenceMaturityFilter,
  type SourceValueFilter,
} from "@/lib/source-intelligence-presentation";

const COHORT_LIMIT = 100;

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

type IntelligenceBatchResponse = {
  items: Array<{ sourceId: string; assessment: SourceIntelligenceAssessmentV2 | null }>;
};

type CohortSnapshot = {
  sources: SourceDefinition[];
  assessments: Record<string, SourceIntelligenceAssessmentV2 | null>;
};

function sourceValueClass(band: SourceValuePriorityBand): string {
  return {
    VERY_HIGH: "border-emerald-200 bg-emerald-50 text-emerald-800",
    HIGH: "border-sky-200 bg-sky-50 text-sky-800",
    MEDIUM: "border-amber-200 bg-amber-50 text-amber-800",
    LOW: "border-slate-200 bg-slate-100 text-slate-700",
  }[band];
}

function evidenceMaturityClass(stage: EvidenceMaturityStage): string {
  return {
    CURRENT_TRACEABLE: "border-emerald-200 bg-emerald-50 text-emerald-800",
    TRACEABLE: "border-sky-200 bg-sky-50 text-sky-800",
    CAPTURED: "border-amber-200 bg-amber-50 text-amber-800",
    UNOBSERVED: "border-slate-200 bg-slate-100 text-slate-700",
  }[stage];
}

function legacyRescanLabel(assessment: SourceIntelligenceAssessmentV2): string {
  const recommendation = assessment.compatibility.legacyRecommendedRescan;
  return recommendation.mode === "DAYS" ? `${recommendation.intervalDays} 天后复查` : "人工决定";
}

async function readCohort(signal?: AbortSignal): Promise<CohortSnapshot> {
  const sourceResponse = await fetch(`/api/sources?limit=${COHORT_LIMIT}&offset=0`, { signal });
  const sourceBody = (await sourceResponse.json()) as
    SourceListResult | { error?: { message?: string } };
  if (!sourceResponse.ok) {
    const message = "error" in sourceBody ? sourceBody.error?.message : undefined;
    throw new Error(message ?? "无法读取 Sources");
  }

  const sources = (sourceBody as SourceListResult).items;
  if (sources.length === 0) return { sources, assessments: {} };

  const params = new URLSearchParams({
    sourceIds: sources.map((source) => source.id).join(","),
    protocolVersion: "2.0",
  });
  const intelligenceResponse = await fetch(`/api/source-intelligence?${params.toString()}`, {
    signal,
  });
  const intelligenceBody = (await intelligenceResponse.json()) as
    IntelligenceBatchResponse | { error?: { message?: string } };
  if (!intelligenceResponse.ok) {
    const message = "error" in intelligenceBody ? intelligenceBody.error?.message : undefined;
    throw new Error(message ?? "无法读取 Source Intelligence");
  }

  const assessments: Record<string, SourceIntelligenceAssessmentV2 | null> = {};
  for (const item of (intelligenceBody as IntelligenceBatchResponse).items) {
    assessments[item.sourceId] = item.assessment;
  }
  return { sources, assessments };
}

export function SourceIntelligenceWorkbench() {
  const [sources, setSources] = useState<SourceDefinition[]>([]);
  const [assessments, setAssessments] = useState<
    Record<string, SourceIntelligenceAssessmentV2 | null>
  >({});
  const [query, setQuery] = useState("");
  const [sourceValueFilter, setSourceValueFilter] = useState<SourceValueFilter>("ALL");
  const [evidenceMaturityFilter, setEvidenceMaturityFilter] =
    useState<EvidenceMaturityFilter>("ALL");
  const [loading, setLoading] = useState(true);
  const [assessingSourceId, setAssessingSourceId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const snapshot = await readCohort();
      setSources(snapshot.sources);
      setAssessments(snapshot.assessments);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "无法读取 Source Intelligence 工作台",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void readCohort(controller.signal)
      .then((snapshot) => {
        setSources(snapshot.sources);
        setAssessments(snapshot.assessments);
        setError(null);
      })
      .catch((requestError: unknown) => {
        if (requestError instanceof DOMException && requestError.name === "AbortError") return;
        setError(
          requestError instanceof Error
            ? requestError.message
            : "无法读取 Source Intelligence 工作台",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  async function assess(sourceId: string) {
    setAssessingSourceId(sourceId);
    setError(null);
    try {
      const response = await fetch("/api/source-intelligence", {
        method: "POST",
        headers: await adminBrowserMutationHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({ sourceId, protocolVersion: "2.0" }),
      });
      const body = (await response.json()) as {
        assessment?: SourceIntelligenceAssessmentV2;
        error?: { message?: string };
      };
      if (!response.ok || !body.assessment) {
        throw new Error(body.error?.message ?? "无法完成 Source Intelligence 评估");
      }
      setAssessments((current) => ({ ...current, [sourceId]: body.assessment ?? null }));
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "无法完成 Source Intelligence 评估",
      );
    } finally {
      setAssessingSourceId(null);
    }
  }

  const rows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return sources
      .map((source) => ({ source, assessment: assessments[source.id] ?? null }))
      .filter(({ source, assessment }) => {
        if (normalizedQuery) {
          const haystack = [
            source.name,
            source.slug,
            source.canonicalUri ?? "",
            source.category,
            source.authorityLevel,
            ...source.jurisdictions,
          ]
            .join(" ")
            .toLowerCase();
          if (!haystack.includes(normalizedQuery)) return false;
        }
        return matchesDualAxisFilters(assessment, sourceValueFilter, evidenceMaturityFilter);
      })
      .sort((left, right) => {
        const axisDelta = compareDualAxisAssessments(left.assessment, right.assessment);
        if (axisDelta !== 0) return axisDelta;
        return left.source.name.localeCompare(right.source.name);
      });
  }, [assessments, evidenceMaturityFilter, query, sourceValueFilter, sources]);

  const counts = useMemo(
    () => countDualAxisAssessments(sources.map((source) => assessments[source.id] ?? null)),
    [assessments, sources],
  );

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-950">
        <div className="flex gap-3">
          <Activity className="mt-0.5 shrink-0" size={19} aria-hidden="true" />
          <div>
            <p className="font-semibold">D2.6 默认运营视图：Source Value × Evidence Maturity</p>
            <p className="mt-1 leading-6">
              Source Value 回答“这个来源本身有多值得长期关注”，Evidence Maturity
              回答“我们当前掌握的证据有多成熟”。 两者独立展示；Authority
              仍来自显式人工分类，Scheduler 仍未授权。
            </p>
          </div>
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        {[
          ["当前批次", sources.length],
          ["Very High", counts.veryHigh],
          ["High", counts.high],
          ["Current + Traceable", counts.currentTraceable],
          ["Unobserved", counts.unobserved],
          ["未评估", counts.unassessed],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-medium text-slate-500">{label}</p>
            <p className="mt-2 text-2xl font-semibold text-slate-950">{value}</p>
          </div>
        ))}
      </div>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-1 flex-col gap-3 lg:flex-row">
            <label className="relative flex-1 lg:max-w-md">
              <span className="sr-only">搜索来源</span>
              <Search
                className="absolute left-3 top-3 text-slate-400"
                size={17}
                aria-hidden="true"
              />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索来源、国家、分类或 Authority"
                className="w-full rounded-xl border border-slate-300 py-2.5 pl-10 pr-3 text-sm"
              />
            </label>
            <select
              value={sourceValueFilter}
              onChange={(event) => setSourceValueFilter(event.target.value as SourceValueFilter)}
              className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm"
              aria-label="筛选 Source Value"
            >
              <option value="ALL">全部 Source Value</option>
              <option value="VERY_HIGH">Very High</option>
              <option value="HIGH">High</option>
              <option value="MEDIUM">Medium</option>
              <option value="LOW">Low</option>
              <option value="UNASSESSED">未评估</option>
            </select>
            <select
              value={evidenceMaturityFilter}
              onChange={(event) =>
                setEvidenceMaturityFilter(event.target.value as EvidenceMaturityFilter)
              }
              className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm"
              aria-label="筛选 Evidence Maturity"
            >
              <option value="ALL">全部 Evidence Maturity</option>
              <option value="CURRENT_TRACEABLE">Current + Traceable</option>
              <option value="TRACEABLE">Traceable</option>
              <option value="CAPTURED">Captured</option>
              <option value="UNOBSERVED">Unobserved</option>
            </select>
          </div>
          <button
            type="button"
            onClick={() => void reload()}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-800 disabled:opacity-50"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} aria-hidden="true" />
            重新读取
          </button>
        </div>

        <div className="border-b border-slate-100 px-5 py-3 text-xs text-slate-500">
          最多读取前 {COHORT_LIMIT} 个 Source。默认按 Source Value 降序，再以 Evidence Maturity
          作为同价值来源的次级排序；这只是运营展示，不构成自动采集或调度规则。
        </div>

        {error ? (
          <div className="m-5 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
            {error}
          </div>
        ) : null}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1180px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3 font-medium">Source</th>
                <th className="px-5 py-3 font-medium">Source Value</th>
                <th className="px-5 py-3 font-medium">Evidence Maturity</th>
                <th className="px-5 py-3 font-medium">显式 Authority</th>
                <th className="px-5 py-3 font-medium">Acquisition Cost</th>
                <th className="px-5 py-3 font-medium">评估时间</th>
                <th className="px-5 py-3 font-medium">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map(({ source, assessment }) => (
                <tr key={source.id} className="align-top hover:bg-slate-50">
                  <td className="px-5 py-4">
                    <Link
                      href={`/sources/${source.id}`}
                      className="font-medium text-slate-950 hover:text-emerald-700"
                    >
                      {source.name}
                    </Link>
                    <p className="mt-1 max-w-xs truncate text-xs text-slate-500">
                      {source.canonicalUri ?? source.slug}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      {source.category} · {source.jurisdictions.join(", ") || "无地区标签"}
                    </p>
                  </td>
                  <td className="px-5 py-4">
                    {assessment ? (
                      <div>
                        <div className="flex items-center gap-2">
                          <span
                            className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${sourceValueClass(assessment.sourceValuePriority.band)}`}
                          >
                            {sourceValueLabels[assessment.sourceValuePriority.band]}
                          </span>
                          <span className="font-medium text-slate-800">
                            {assessment.sourceValuePriority.score}
                          </span>
                        </div>
                        <details className="mt-2 text-xs text-slate-500">
                          <summary className="cursor-pointer">Advanced · legacy v1</summary>
                          <p className="mt-1">
                            Tier {assessment.compatibility.legacyOperationalTier} · score{" "}
                            {assessment.compatibility.legacyPriorityScore} ·{" "}
                            {legacyRescanLabel(assessment)}
                          </p>
                        </details>
                      </div>
                    ) : (
                      <span className="text-slate-400">未评估</span>
                    )}
                  </td>
                  <td className="px-5 py-4">
                    {assessment ? (
                      <div className="flex items-center gap-2">
                        <span
                          className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${evidenceMaturityClass(assessment.evidenceMaturity.stage)}`}
                        >
                          {evidenceMaturityLabels[assessment.evidenceMaturity.stage]}
                        </span>
                        <span className="font-medium text-slate-800">
                          {assessment.evidenceMaturity.score === null
                            ? "—"
                            : assessment.evidenceMaturity.score}
                        </span>
                      </div>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-5 py-4">
                    <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700">
                      {source.authorityLevel}
                    </span>
                    {source.authorityLevel === "UNKNOWN" ? (
                      <p className="mt-2 text-xs text-slate-500">
                        保持未知，不从 Source Value 推断
                      </p>
                    ) : null}
                  </td>
                  <td className="px-5 py-4 text-slate-700">
                    {assessment?.decisionContext.observedAcquisitionCost.score === null ||
                    !assessment
                      ? "尚未观察"
                      : `${assessment.decisionContext.observedAcquisitionCost.score} / 100`}
                  </td>
                  <td className="px-5 py-4 text-slate-500">
                    {assessment ? new Date(assessment.assessedAt).toLocaleString("zh-CN") : "—"}
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void assess(source.id)}
                        disabled={assessingSourceId !== null}
                        className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {assessingSourceId === source.id
                          ? "评估中…"
                          : assessment
                            ? "重新评估"
                            : "评估"}
                      </button>
                      <Link
                        href={`/sources/${source.id}`}
                        className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:text-slate-950"
                        aria-label={`查看 ${source.name} 详情`}
                      >
                        <ExternalLink size={15} aria-hidden="true" />
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {loading ? (
          <div className="px-6 py-12 text-center text-sm text-slate-500">正在读取来源批次…</div>
        ) : null}
        {!loading && rows.length === 0 ? (
          <div className="px-6 py-14 text-center text-sm text-slate-500">
            当前筛选条件下没有 Source。
          </div>
        ) : null}
      </section>
    </div>
  );
}
