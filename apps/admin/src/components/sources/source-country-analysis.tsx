"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { adminBrowserMutationHeaders } from "@/lib/admin-browser-api-client";
import { useAdminI18n } from "@/lib/i18n";

type CoverageItem = {
  jurisdiction: string;
  sourceCount: number;
  activeSourceCount: number;
  targetCount: number;
  registeredTargetCount: number;
  completenessPercent: number | null;
  missingCount: number;
};

type CoverageResponse = { items: CoverageItem[] };
type CapabilityStatus = { configured: boolean };

type Analysis = {
  status: "HEALTHY" | "ATTENTION" | "BUILDING" | "UNKNOWN";
  summary: string;
  strengths: string[];
  gaps: string[];
  recommendedNextSteps: Array<{
    title: string;
    reason: string;
    priority: "HIGH" | "MEDIUM" | "LOW";
    category?: string;
  }>;
};

async function readError(response: Response, fallback: string): Promise<string> {
  try {
    const payload = (await response.json()) as { error?: { message?: string }; message?: string };
    return payload.error?.message ?? payload.message ?? fallback;
  } catch {
    return fallback;
  }
}

function statusTone(status: Analysis["status"]): string {
  if (status === "HEALTHY") return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  if (status === "ATTENTION") return "bg-amber-50 text-amber-700 ring-amber-200";
  if (status === "BUILDING") return "bg-blue-50 text-blue-700 ring-blue-200";
  return "bg-slate-100 text-slate-600 ring-slate-200";
}

function priorityTone(priority: "HIGH" | "MEDIUM" | "LOW"): string {
  if (priority === "HIGH") return "bg-rose-50 text-rose-700 ring-rose-200";
  if (priority === "MEDIUM") return "bg-amber-50 text-amber-700 ring-amber-200";
  return "bg-slate-100 text-slate-600 ring-slate-200";
}

export function SourceCountryAnalysis({ workspaceId }: { workspaceId: string }) {
  const { locale } = useAdminI18n();
  const zh = locale === "zh-CN";
  const [coverage, setCoverage] = useState<CoverageItem[]>([]);
  const [jurisdiction, setJurisdiction] = useState("");
  const [capability, setCapability] = useState<CapabilityStatus | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [coverageResponse, capabilityResponse] = await Promise.all([
        fetch(`/api/sources/coverage?workspaceId=${encodeURIComponent(workspaceId)}`, {
          cache: "no-store",
        }),
        fetch("/api/sources/coverage/analysis", { cache: "no-store" }),
      ]);
      if (!coverageResponse.ok) {
        throw new Error(
          await readError(
            coverageResponse,
            zh ? "无法读取国家资源覆盖" : "Unable to load jurisdiction coverage",
          ),
        );
      }
      const coveragePayload = (await coverageResponse.json()) as CoverageResponse;
      const next = coveragePayload.items.filter((item) => item.targetCount > 0);
      setCoverage(next);
      setJurisdiction((current) => {
        if (current && next.some((item) => item.jurisdiction === current)) return current;
        return (
          next.find((item) => item.missingCount > 0)?.jurisdiction ?? next[0]?.jurisdiction ?? ""
        );
      });
      if (capabilityResponse.ok) {
        setCapability((await capabilityResponse.json()) as CapabilityStatus);
      } else {
        setCapability({ configured: false });
      }
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : zh
            ? "无法读取覆盖分析状态"
            : "Unable to load coverage analysis status",
      );
    } finally {
      setLoading(false);
    }
  }, [workspaceId, zh]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const selected = useMemo(
    () => coverage.find((item) => item.jurisdiction === jurisdiction) ?? null,
    [coverage, jurisdiction],
  );

  async function analyze() {
    if (!jurisdiction) return;
    setAnalyzing(true);
    setError(null);
    setAnalysis(null);
    try {
      const response = await fetch("/api/sources/coverage/analysis", {
        method: "POST",
        headers: await adminBrowserMutationHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({ workspaceId, jurisdiction, locale }),
      });
      if (!response.ok) {
        throw new Error(
          await readError(response, zh ? "覆盖分析失败" : "Coverage analysis failed"),
        );
      }
      const payload = (await response.json()) as { response: Analysis };
      setAnalysis(payload.response);
    } catch (analyzeError) {
      setError(
        analyzeError instanceof Error
          ? analyzeError.message
          : zh
            ? "覆盖分析失败"
            : "Coverage analysis failed",
      );
    } finally {
      setAnalyzing(false);
    }
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="flex flex-col gap-4 border-b border-slate-200 p-5 sm:flex-row sm:items-start sm:justify-between sm:p-6">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Sparkles size={18} className="text-violet-600" />
            <h2 className="font-semibold text-slate-950">
              {zh ? "国家知识覆盖分析" : "Jurisdiction coverage analysis"}
            </h2>
            <span className="rounded-full bg-violet-50 px-2 py-1 text-[10px] font-semibold text-violet-700 ring-1 ring-inset ring-violet-200">
              Capability
            </span>
          </div>
          <p className="mt-1 max-w-4xl text-sm leading-6 text-slate-600">
            {zh
              ? "Knowledge 提供客观的来源覆盖事实；共享 Coverage Analysis Capability 只负责解释优势、缺口和建议下一步，不会自动新增来源，也不会把覆盖率解释成法律或内容质量结论。"
              : "Knowledge supplies objective source-coverage facts. The shared Coverage Analysis Capability explains strengths, gaps and suggested next steps without creating sources or turning coverage into legal or content-quality conclusions."}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-slate-300 px-3.5 py-2 text-sm font-medium text-slate-700 disabled:opacity-50"
        >
          <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
          {zh ? "刷新" : "Refresh"}
        </button>
      </div>

      <div className="p-5 sm:p-6">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-slate-500">
              {zh ? "选择国家 / 地区" : "Select jurisdiction"}
            </span>
            <select
              value={jurisdiction}
              onChange={(event) => {
                setJurisdiction(event.target.value);
                setAnalysis(null);
              }}
              disabled={loading || coverage.length === 0}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-blue-500"
            >
              {coverage.map((item) => (
                <option key={item.jurisdiction} value={item.jurisdiction}>
                  {item.jurisdiction} · {item.completenessPercent ?? "—"}% · {item.sourceCount}{" "}
                  {zh ? "来源" : "sources"}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => void analyze()}
            disabled={analyzing || loading || !jurisdiction || capability?.configured === false}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {analyzing ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
            {analyzing
              ? zh
                ? "正在分析…"
                : "Analyzing…"
              : zh
                ? "分析当前覆盖"
                : "Analyze coverage"}
          </button>
        </div>

        {selected ? (
          <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-600">
            <span className="rounded-full bg-slate-100 px-2.5 py-1">
              {zh ? "来源" : "Sources"} {selected.activeSourceCount}/{selected.sourceCount}
            </span>
            <span className="rounded-full bg-slate-100 px-2.5 py-1">
              {zh ? "目录覆盖" : "Catalog"} {selected.registeredTargetCount}/{selected.targetCount}
            </span>
            {selected.missingCount > 0 ? (
              <span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-700">
                {zh ? "缺失" : "Missing"} {selected.missingCount}
              </span>
            ) : (
              <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700">
                {zh ? "目录目标已覆盖" : "Catalog covered"}
              </span>
            )}
          </div>
        ) : null}

        {capability?.configured === false ? (
          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-5 text-slate-600">
            {zh
              ? "共享 Capability 服务尚未配置。配置 MARKORBIT_CAPABILITY_BASE_URL 后可启用覆盖分析；Knowledge 本身不会内置语义分析模型。"
              : "The shared Capability service is not configured. Set MARKORBIT_CAPABILITY_BASE_URL to enable coverage analysis; Knowledge does not embed the semantic model."}
          </div>
        ) : null}

        {error ? (
          <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-800">
            {error}
          </div>
        ) : null}

        {analysis ? (
          <div className="mt-5 space-y-4">
            <div className="rounded-xl border border-violet-100 bg-violet-50/50 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ring-1 ring-inset ${statusTone(analysis.status)}`}
                >
                  {analysis.status}
                </span>
                <p className="text-sm font-semibold text-slate-900">{analysis.summary}</p>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-xl border border-slate-200 p-4">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <CheckCircle2 size={15} className="text-emerald-600" />
                  {zh ? "当前优势" : "Strengths"}
                </h3>
                <ul className="mt-3 space-y-2 text-xs leading-5 text-slate-600">
                  {analysis.strengths.length > 0 ? (
                    analysis.strengths.map((item, index) => (
                      <li key={`${index}-${item}`}>• {item}</li>
                    ))
                  ) : (
                    <li>{zh ? "暂无明确优势。" : "No explicit strengths identified."}</li>
                  )}
                </ul>
              </div>
              <div className="rounded-xl border border-slate-200 p-4">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <AlertTriangle size={15} className="text-amber-600" />
                  {zh ? "覆盖缺口" : "Gaps"}
                </h3>
                <ul className="mt-3 space-y-2 text-xs leading-5 text-slate-600">
                  {analysis.gaps.length > 0 ? (
                    analysis.gaps.map((item, index) => <li key={`${index}-${item}`}>• {item}</li>)
                  ) : (
                    <li>{zh ? "未识别到明显缺口。" : "No explicit gaps identified."}</li>
                  )}
                </ul>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 p-4">
              <h3 className="text-sm font-semibold text-slate-900">
                {zh ? "建议下一步" : "Recommended next steps"}
              </h3>
              <div className="mt-3 space-y-2">
                {analysis.recommendedNextSteps.map((item, index) => (
                  <div key={`${index}-${item.title}`} className="rounded-lg bg-slate-50 px-3 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full px-2 py-1 text-[10px] font-semibold ring-1 ring-inset ${priorityTone(item.priority)}`}
                      >
                        {item.priority}
                      </span>
                      <p className="text-xs font-semibold text-slate-800">{item.title}</p>
                      {item.category ? (
                        <span className="text-[10px] text-slate-400">{item.category}</span>
                      ) : null}
                    </div>
                    <p className="mt-1.5 text-xs leading-5 text-slate-600">{item.reason}</p>
                  </div>
                ))}
                {analysis.recommendedNextSteps.length === 0 ? (
                  <p className="text-xs text-slate-500">
                    {zh ? "当前没有建议动作。" : "No next action was recommended."}
                  </p>
                ) : null}
              </div>
            </div>

            <p className="text-[11px] leading-5 text-slate-400">
              {zh
                ? "分析结果来自共享 Capability，仅用于辅助运营判断；不会修改 Source、CollectionPlan 或采集授权。"
                : "Analysis is advisory output from a shared Capability. It does not modify Sources, CollectionPlans or collection authorization."}
            </p>
          </div>
        ) : null}
      </div>
    </section>
  );
}
