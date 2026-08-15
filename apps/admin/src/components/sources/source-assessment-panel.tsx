"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Database, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { useAdminI18n } from "@/lib/i18n";

type EvidenceMaturity = {
  stage: "UNOBSERVED" | "CAPTURED" | "TRACEABLE" | "CURRENT_TRACEABLE";
  rawArtifactCount: number;
  distinctArtifactHashCount: number;
  provenanceNodeCount: number;
  latestCapturedAt?: string;
  ageDays?: number;
  currentWindowDays: number;
};

type CapabilityStatus = {
  configured: boolean;
  evidenceMaturity: EvidenceMaturity;
};

type SourceValue = {
  score: number;
  priority: "VERY_HIGH" | "HIGH" | "MEDIUM" | "LOW";
  confidence: "HIGH" | "MEDIUM" | "LOW";
  summary: string;
  reason: string;
  valuePoints: string[];
  cautionPoints?: string[];
};

type AssessmentPayload = {
  response?: { sourceValue: SourceValue };
  evidenceMaturity?: EvidenceMaturity;
  error?: { message?: string };
};

async function responseMessage(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: string }; message?: string };
    return body.error?.message ?? body.message ?? fallback;
  } catch {
    return fallback;
  }
}

function priorityLabel(value: SourceValue["priority"], zh: boolean): string {
  if (!zh) return value.replaceAll("_", " ");
  if (value === "VERY_HIGH") return "极高价值";
  if (value === "HIGH") return "高价值";
  if (value === "MEDIUM") return "中等价值";
  return "一般价值";
}

function priorityTone(value: SourceValue["priority"]): string {
  if (value === "VERY_HIGH") return "bg-blue-600 text-white";
  if (value === "HIGH") return "bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-200";
  if (value === "MEDIUM") return "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200";
  return "bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-200";
}

function maturityLabel(stage: EvidenceMaturity["stage"], zh: boolean): string {
  if (!zh) {
    if (stage === "CURRENT_TRACEABLE") return "Current & traceable";
    if (stage === "TRACEABLE") return "Traceable";
    if (stage === "CAPTURED") return "Captured";
    return "Unobserved";
  }
  if (stage === "CURRENT_TRACEABLE") return "当前可溯源";
  if (stage === "TRACEABLE") return "可溯源";
  if (stage === "CAPTURED") return "已采集";
  return "尚未采集";
}

function maturityDescription(stage: EvidenceMaturity["stage"], zh: boolean): string {
  if (!zh) {
    if (stage === "CURRENT_TRACEABLE")
      return "Recent acquisition evidence is retained and traceable.";
    if (stage === "TRACEABLE")
      return "Acquisition evidence is retained with provenance, but is outside the current window.";
    if (stage === "CAPTURED")
      return "Raw material exists, but provenance linkage is not yet complete.";
    return "No retained raw acquisition evidence is available yet.";
  }
  if (stage === "CURRENT_TRACEABLE") return "近期采集资料与原始证据链都已保留，可以追溯到来源。";
  if (stage === "TRACEABLE") return "资料和来源证据链已保留，但最近一次采集已超出当前窗口。";
  if (stage === "CAPTURED") return "已经保存原始资料，但来源证据链还没有完整建立。";
  return "目前还没有保存该来源的原始采集证据。";
}

export function SourceAssessmentPanel({ sourceId }: { sourceId: string }) {
  const { locale } = useAdminI18n();
  const zh = locale === "zh-CN";
  const [status, setStatus] = useState<CapabilityStatus | null>(null);
  const [sourceValue, setSourceValue] = useState<SourceValue | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [assessing, setAssessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch(`/api/sources/${sourceId}/assessment`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(
            await responseMessage(
              response,
              zh ? "无法读取来源评估状态" : "Unable to load source assessment status",
            ),
          );
        }
        return (await response.json()) as CapabilityStatus;
      })
      .then((payload) => {
        if (!cancelled) {
          setStatus(payload);
          setError(null);
        }
      })
      .catch((loadError) => {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Unable to load assessment");
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingStatus(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sourceId, zh]);

  async function assess() {
    setAssessing(true);
    setError(null);
    try {
      const response = await fetch(`/api/sources/${sourceId}/assessment`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ locale }),
      });
      if (!response.ok) {
        throw new Error(
          await responseMessage(
            response,
            zh ? "来源价值评估失败" : "Unable to assess source value",
          ),
        );
      }
      const payload = (await response.json()) as AssessmentPayload;
      if (!payload.response?.sourceValue) {
        throw new Error(zh ? "共享能力没有返回有效评估" : "Capability returned no assessment");
      }
      setSourceValue(payload.response.sourceValue);
      if (payload.evidenceMaturity) {
        setStatus((current) =>
          current ? { ...current, evidenceMaturity: payload.evidenceMaturity! } : current,
        );
      }
    } catch (assessmentError) {
      setError(
        assessmentError instanceof Error
          ? assessmentError.message
          : zh
            ? "来源价值评估失败"
            : "Unable to assess source value",
      );
    } finally {
      setAssessing(false);
    }
  }

  const evidence = status?.evidenceMaturity;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/20 sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold text-slate-950">
              {zh ? "来源价值与证据状态" : "Source value & evidence status"}
            </h2>
            <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-1 text-[11px] font-semibold text-violet-700 ring-1 ring-inset ring-violet-200">
              <Sparkles size={11} /> {zh ? "共享能力" : "Shared Capability"}
            </span>
          </div>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">
            {zh
              ? "来源价值由共享 Capability 辅助判断；证据成熟度只使用 Knowledge 已采集、可溯源和时间状态等客观事实。两者不会自动授权采集。"
              : "Source value is advisory output from the shared Capability. Evidence maturity uses only objective acquisition and provenance facts held by Knowledge. Neither grants collection authority."}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void assess()}
          disabled={assessing || status?.configured === false || loadingStatus}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {assessing ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
          {assessing
            ? zh
              ? "评估中…"
              : "Assessing…"
            : sourceValue
              ? zh
                ? "重新评估"
                : "Reassess"
              : zh
                ? "评估来源价值"
                : "Assess source value"}
        </button>
      </div>

      {status?.configured === false ? (
        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-5 text-slate-600">
          {zh
            ? "共享 Capability 服务尚未配置，因此 Knowledge 不会在本地替代它做语义价值判断。证据状态仍可正常显示。"
            : "The shared Capability service is not configured, so Knowledge will not substitute a local semantic value model. Evidence status remains available."}
        </div>
      ) : null}

      {error ? (
        <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-800">
          {error}
        </div>
      ) : null}

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-violet-100 bg-violet-50/40 p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="grid size-9 place-items-center rounded-xl bg-white text-violet-700 shadow-sm">
                <Sparkles size={16} />
              </span>
              <div>
                <p className="text-sm font-semibold text-slate-900">
                  {zh ? "来源价值" : "Source value"}
                </p>
                <p className="text-[11px] text-slate-500">
                  {zh ? "语义判断 · 来自共享能力" : "Semantic assessment · shared capability"}
                </p>
              </div>
            </div>
            {sourceValue ? (
              <span
                className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${priorityTone(sourceValue.priority)}`}
              >
                {priorityLabel(sourceValue.priority, zh)} · {sourceValue.score}
              </span>
            ) : null}
          </div>

          {sourceValue ? (
            <div className="mt-4">
              <p className="text-sm font-semibold leading-6 text-slate-900">
                {sourceValue.summary}
              </p>
              <p className="mt-2 text-xs leading-5 text-slate-600">{sourceValue.reason}</p>
              {sourceValue.valuePoints.length > 0 ? (
                <div className="mt-3 space-y-2">
                  {sourceValue.valuePoints.slice(0, 5).map((point) => (
                    <div
                      key={point}
                      className="flex items-start gap-2 text-xs leading-5 text-slate-700"
                    >
                      <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-violet-600" />
                      <span>{point}</span>
                    </div>
                  ))}
                </div>
              ) : null}
              <p className="mt-3 text-[11px] text-slate-500">
                {zh
                  ? `置信度：${sourceValue.confidence}。该结果用于排序和人工判断，不代表法律事实或专业质量认证。`
                  : `Confidence: ${sourceValue.confidence}. This output supports prioritization and human review; it is not legal verification or professional certification.`}
              </p>
            </div>
          ) : (
            <p className="mt-4 text-xs leading-5 text-slate-500">
              {zh
                ? "点击“评估来源价值”后，系统会把当前来源的公开信息和客观采集事实发送给共享 Capability。"
                : "Run the assessment to send public source metadata and objective acquisition facts to the shared Capability."}
            </p>
          )}
        </div>

        <div className="rounded-2xl border border-emerald-100 bg-emerald-50/40 p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="grid size-9 place-items-center rounded-xl bg-white text-emerald-700 shadow-sm">
                <Database size={16} />
              </span>
              <div>
                <p className="text-sm font-semibold text-slate-900">
                  {zh ? "证据成熟度" : "Evidence maturity"}
                </p>
                <p className="text-[11px] text-slate-500">
                  {zh ? "客观状态 · 由 Knowledge 记录" : "Objective state · recorded by Knowledge"}
                </p>
              </div>
            </div>
            {evidence ? (
              <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-semibold text-emerald-800">
                {maturityLabel(evidence.stage, zh)}
              </span>
            ) : null}
          </div>

          {loadingStatus && !evidence ? (
            <div className="mt-4 flex items-center gap-2 text-xs text-slate-500">
              <Loader2 size={14} className="animate-spin" />
              {zh ? "正在读取采集证据…" : "Loading acquisition evidence…"}
            </div>
          ) : evidence ? (
            <div className="mt-4">
              <p className="text-xs leading-5 text-slate-600">
                {maturityDescription(evidence.stage, zh)}
              </p>
              <div className="mt-3 grid grid-cols-3 gap-2">
                <div className="rounded-xl bg-white px-3 py-2.5 text-center shadow-sm">
                  <p className="text-lg font-semibold text-slate-900">
                    {evidence.rawArtifactCount}
                  </p>
                  <p className="mt-0.5 text-[10px] text-slate-500">
                    {zh ? "原始资料" : "Raw items"}
                  </p>
                </div>
                <div className="rounded-xl bg-white px-3 py-2.5 text-center shadow-sm">
                  <p className="text-lg font-semibold text-slate-900">
                    {evidence.provenanceNodeCount}
                  </p>
                  <p className="mt-0.5 text-[10px] text-slate-500">
                    {zh ? "可溯源节点" : "Provenance nodes"}
                  </p>
                </div>
                <div className="rounded-xl bg-white px-3 py-2.5 text-center shadow-sm">
                  <p className="text-lg font-semibold text-slate-900">
                    {evidence.ageDays === undefined ? "—" : Math.round(evidence.ageDays)}
                  </p>
                  <p className="mt-0.5 text-[10px] text-slate-500">
                    {zh ? "距最近采集/天" : "Days since capture"}
                  </p>
                </div>
              </div>
              <p className="mt-3 text-[11px] leading-5 text-slate-500">
                {zh
                  ? `“当前”仅表示最近采集时间仍在 ${evidence.currentWindowDays} 天运行窗口内，不评价内容是否重要。`
                  : `“Current” only means the latest capture is within the ${evidence.currentWindowDays}-day operating window; it does not judge content importance.`}
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
