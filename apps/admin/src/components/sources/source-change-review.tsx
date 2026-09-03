"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ExternalLink, Loader2, RefreshCw, RotateCcw, Sparkles } from "lucide-react";
import { adminBrowserMutationHeaders } from "@/lib/admin-browser-api-client";
import { useAdminI18n } from "@/lib/i18n";

type Observation = {
  observationId: string;
  candidateId: string;
  locator: string;
  observedAt: string;
  evidenceKind: "CONTENT_SHA256" | "HTTP_METADATA" | "STRUCTURAL";
  fingerprint: string;
  delta: "NEW" | "KNOWN" | "CHANGED" | "REJECTED_CHANGED";
  facts: {
    title?: string;
    kind?: string;
    host?: string;
    contentSha256?: string;
    httpEtag?: string;
    httpLastModified?: string;
    httpContentType?: string;
  };
};

type ChangeItem = {
  observation: Observation;
  previous: Observation | null;
  candidate: {
    candidate: {
      candidateId: string;
      locator: string;
      title?: string;
      status: string;
    };
    review?: {
      note?: string;
      reviewedAt?: string;
    };
  } | null;
};

type SignificanceResult = {
  level: "SIGNIFICANT" | "MINOR" | "UNKNOWN";
  summary: string;
  reason: string;
  signals?: string[];
};

async function requestMessage(response: Response, fallback: string): Promise<string> {
  try {
    const payload = (await response.json()) as { error?: { message?: string }; message?: string };
    return payload.error?.message ?? payload.message ?? fallback;
  } catch {
    return fallback;
  }
}

function levelClasses(level: SignificanceResult["level"]): string {
  if (level === "SIGNIFICANT") return "bg-rose-50 text-rose-700 ring-rose-200";
  if (level === "MINOR") return "bg-amber-50 text-amber-700 ring-amber-200";
  return "bg-slate-100 text-slate-600 ring-slate-200";
}

export function SourceChangeReview() {
  const { locale } = useAdminI18n();
  const zh = locale === "zh-CN";
  const [items, setItems] = useState<ChangeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [capabilityConfigured, setCapabilityConfigured] = useState<boolean | null>(null);
  const [assessing, setAssessing] = useState<string | null>(null);
  const [reopening, setReopening] = useState<string | null>(null);
  const [assessments, setAssessments] = useState<Record<string, SignificanceResult>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/discovery/changes?delta=REJECTED_CHANGED&limit=100", {
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error(
          await requestMessage(response, zh ? "无法读取变化记录" : "Unable to load changes"),
        );
      }
      const payload = (await response.json()) as { items?: ChangeItem[] };
      const nextItems = (payload.items ?? []).filter(
        (item) => item.candidate?.candidate.status === "REJECTED",
      );
      setItems(nextItems);
      if (nextItems.length > 0) {
        const first = nextItems[0]!.observation.candidateId;
        const statusResponse = await fetch(
          `/api/discovery/changes/${encodeURIComponent(first)}/significance`,
          { cache: "no-store" },
        );
        if (statusResponse.ok) {
          const status = (await statusResponse.json()) as { configured?: boolean };
          setCapabilityConfigured(status.configured === true);
        }
      }
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : zh
            ? "无法读取变化记录"
            : "Unable to load changes",
      );
    } finally {
      setLoading(false);
    }
  }, [zh]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const visible = useMemo(() => items.slice(0, 12), [items]);
  if (!loading && !error && visible.length === 0) return null;

  async function assess(candidateId: string) {
    setAssessing(candidateId);
    setError(null);
    try {
      const response = await fetch(
        `/api/discovery/changes/${encodeURIComponent(candidateId)}/significance`,
        {
          method: "POST",
          headers: await adminBrowserMutationHeaders({ "content-type": "application/json" }),
          body: JSON.stringify({ locale }),
        },
      );
      if (!response.ok) {
        throw new Error(
          await requestMessage(
            response,
            zh ? "变化重要性评估失败" : "Change significance assessment failed",
          ),
        );
      }
      const payload = (await response.json()) as { response: SignificanceResult };
      setAssessments((current) => ({ ...current, [candidateId]: payload.response }));
    } catch (assessError) {
      setError(assessError instanceof Error ? assessError.message : "Capability request failed");
    } finally {
      setAssessing(null);
    }
  }

  async function reopen(candidateId: string) {
    setReopening(candidateId);
    setError(null);
    try {
      const response = await fetch("/api/discovery/reviews/reopen", {
        method: "POST",
        headers: await adminBrowserMutationHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({
          candidateId,
          note: "Objective rescan detected a changed fingerprint; explicitly reopened for review.",
        }),
      });
      if (!response.ok) {
        throw new Error(
          await requestMessage(response, zh ? "重新进入审批失败" : "Unable to reopen candidate"),
        );
      }
      setItems((current) => current.filter((item) => item.observation.candidateId !== candidateId));
    } catch (reopenError) {
      setError(reopenError instanceof Error ? reopenError.message : "Unable to reopen candidate");
    } finally {
      setReopening(null);
    }
  }

  return (
    <section className="mb-5 rounded-2xl border border-amber-200 bg-white p-5 shadow-sm shadow-slate-200/20 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="grid size-9 place-items-center rounded-xl bg-amber-50 text-amber-700">
              <RefreshCw size={16} />
            </span>
            <div>
              <h2 className="text-sm font-semibold text-slate-950">
                {zh ? "已淘汰来源出现客观变化" : "Rejected candidates changed on rescan"}
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                {zh
                  ? "系统只确认采集证据指纹发生变化，不会自动判断变化是否重要，也不会自动恢复候选。"
                  : "Knowledge only confirms that the observed evidence fingerprint changed. It neither decides materiality nor reopens a candidate automatically."}
              </p>
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-1.5 self-start rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-50"
        >
          {loading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
          {zh ? "刷新" : "Refresh"}
        </button>
      </div>

      {error ? (
        <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-800">
          {error}
        </div>
      ) : null}

      {loading && items.length === 0 ? (
        <div className="mt-4 flex items-center gap-2 text-xs text-slate-500">
          <Loader2 size={14} className="animate-spin" />
          {zh ? "正在读取增量扫描记录…" : "Loading incremental scan observations…"}
        </div>
      ) : null}

      <div className="mt-4 space-y-3">
        {visible.map((item) => {
          const id = item.observation.candidateId;
          const assessment = assessments[id];
          const title =
            item.candidate?.candidate.title ||
            item.observation.facts.title ||
            item.observation.locator;
          return (
            <article
              key={item.observation.observationId}
              className="rounded-xl border border-slate-200 p-4"
            >
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900">{title}</p>
                  <a
                    href={item.observation.locator}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 flex items-center gap-1 truncate text-xs text-blue-600"
                  >
                    <ExternalLink size={11} className="shrink-0" />
                    <span className="truncate">{item.observation.locator}</span>
                  </a>
                  <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-slate-500">
                    <span className="rounded-full bg-slate-100 px-2 py-1">
                      {item.observation.evidenceKind}
                    </span>
                    <span className="rounded-full bg-amber-50 px-2 py-1 text-amber-700">
                      REJECTED_CHANGED
                    </span>
                    <span>{new Date(item.observation.observedAt).toLocaleString(locale)}</span>
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void assess(id)}
                    disabled={assessing === id || capabilityConfigured === false}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
                    title={
                      capabilityConfigured === false
                        ? zh
                          ? "共享 Capability 尚未配置"
                          : "Shared Capability is not configured"
                        : undefined
                    }
                  >
                    {assessing === id ? (
                      <Loader2 size={13} className="animate-spin" />
                    ) : (
                      <Sparkles size={13} />
                    )}
                    {zh ? "评估变化" : "Assess change"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void reopen(id)}
                    disabled={reopening === id}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                  >
                    {reopening === id ? (
                      <Loader2 size={13} className="animate-spin" />
                    ) : (
                      <RotateCcw size={13} />
                    )}
                    {zh ? "重新进入审批" : "Reopen for review"}
                  </button>
                </div>
              </div>

              {assessment ? (
                <div className="mt-3 rounded-xl border border-violet-100 bg-violet-50/50 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-1 text-[10px] font-semibold ring-1 ring-inset ${levelClasses(assessment.level)}`}
                    >
                      {assessment.level}
                    </span>
                    <span className="text-xs font-semibold text-slate-800">
                      {assessment.summary}
                    </span>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-slate-600">{assessment.reason}</p>
                  <p className="mt-2 text-[11px] text-slate-500">
                    {zh
                      ? "这是共享 Capability 的辅助判断；是否恢复候选仍由人工决定。"
                      : "This is advisory output from a shared Capability; reopening remains an explicit human decision."}
                  </p>
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}
