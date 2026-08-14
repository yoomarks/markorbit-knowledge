"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, ExternalLink, Loader2, Network, ShieldCheck, Sparkles } from "lucide-react";
import { useAdminI18n } from "@/lib/i18n";

type CapabilityStatus = {
  configured: boolean;
  maxResults: number;
};

type Candidate = {
  candidate: {
    candidateId: string;
    locator: string;
    title?: string;
    status: string;
    metadata?: Record<string, unknown>;
  };
};

type RecommendationPayload = {
  candidates?: Candidate[];
  skipped?: Array<{ url: string; reason: string }>;
  error?: { message?: string };
};

async function errorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const payload = (await response.json()) as { error?: { message?: string }; message?: string };
    return payload.error?.message ?? payload.message ?? fallback;
  } catch {
    return fallback;
  }
}

function metadataString(candidate: Candidate, key: string): string | undefined {
  const value = candidate.candidate.metadata?.[key];
  return typeof value === "string" ? value : undefined;
}

function metadataNumber(candidate: Candidate, key: string): number | undefined {
  const value = candidate.candidate.metadata?.[key];
  return typeof value === "number" ? value : undefined;
}

function priorityTone(value: string | undefined): string {
  if (value === "HIGH") return "bg-blue-50 text-blue-700 ring-blue-200";
  if (value === "MEDIUM") return "bg-amber-50 text-amber-700 ring-amber-200";
  return "bg-slate-100 text-slate-600 ring-slate-200";
}

export function SourceRelatedRecommendations({ sourceId }: { sourceId: string }) {
  const { locale } = useAdminI18n();
  const zh = locale === "zh-CN";
  const [status, setStatus] = useState<CapabilityStatus | null>(null);
  const [items, setItems] = useState<Candidate[]>([]);
  const [skippedCount, setSkippedCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetch(`/api/sources/${sourceId}/recommendations`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok)
          throw new Error(await errorMessage(response, "Unable to load capability"));
        return (await response.json()) as CapabilityStatus;
      })
      .then((payload) => {
        if (!cancelled) setStatus(payload);
      })
      .catch(() => {
        if (!cancelled) setStatus({ configured: false, maxResults: 30 });
      });
    return () => {
      cancelled = true;
    };
  }, [sourceId]);

  async function recommend() {
    setLoading(true);
    setError(null);
    setCompleted(false);
    try {
      const response = await fetch(`/api/sources/${sourceId}/recommendations`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ locale, maxResults: 12 }),
      });
      if (!response.ok) {
        throw new Error(
          await errorMessage(
            response,
            zh ? "相关来源推荐失败" : "Unable to recommend related sources",
          ),
        );
      }
      const payload = (await response.json()) as RecommendationPayload;
      setItems(payload.candidates ?? []);
      setSkippedCount(payload.skipped?.length ?? 0);
      setCompleted(true);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : zh
            ? "相关来源推荐失败"
            : "Unable to recommend related sources",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/20 sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-600">
            <Network size={18} />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold text-slate-950">
                {zh ? "相关来源推荐" : "Related source recommendations"}
              </h2>
              <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-1 text-[11px] font-semibold text-violet-700 ring-1 ring-inset ring-violet-200">
                <Sparkles size={11} /> Capability
              </span>
            </div>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">
              {zh
                ? "共享能力根据当前来源推荐可能值得纳入的独立公共来源。Knowledge 只把结果登记为待审批候选，不会在审批前抓取，也不会把推荐理由当作事实结论。"
                : "A shared capability proposes independent public sources around this source. Knowledge records them only as untrusted review candidates: no fetch occurs before approval and recommendation reasons are not treated as factual conclusions."}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void recommend()}
          disabled={loading || status?.configured === false}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {loading ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
          {loading
            ? zh
              ? "正在发现…"
              : "Discovering…"
            : zh
              ? "查找相关来源"
              : "Find related sources"}
        </button>
      </div>

      {status?.configured === false ? (
        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-5 text-slate-600">
          {zh
            ? "共享 Capability 服务尚未配置。配置 MARKORBIT_CAPABILITY_BASE_URL 后即可启用；Knowledge 本身不内置语义推荐模型。"
            : "The shared Capability service is not configured. Set MARKORBIT_CAPABILITY_BASE_URL to enable it; Knowledge does not embed a semantic recommendation model."}
        </div>
      ) : null}

      {error ? (
        <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-800">
          {error}
        </div>
      ) : null}

      {completed ? (
        <div className="mt-4 flex flex-col gap-3 rounded-xl border border-emerald-200 bg-emerald-50/70 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2 text-sm text-emerald-800">
            <ShieldCheck size={16} className="mt-0.5 shrink-0" />
            <span>
              {zh
                ? `${items.length} 个新推荐已进入待审批队列${skippedCount ? `，另有 ${skippedCount} 个重复、同源或低优先级结果被跳过` : ""}。审批前没有触发抓取。`
                : `${items.length} new recommendations entered the review queue${skippedCount ? `; ${skippedCount} duplicate, same-origin or skipped results were omitted` : ""}. No collection was triggered.`}
            </span>
          </div>
          <Link
            href="/sources"
            className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-emerald-800"
          >
            {zh ? "前往审批" : "Review candidates"} <ArrowRight size={14} />
          </Link>
        </div>
      ) : null}

      {items.length > 0 ? (
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {items.map((item) => {
            const priority = metadataString(item, "recommendationPriority");
            const score = metadataNumber(item, "recommendationScore");
            const reason = metadataString(item, "recommendationReason");
            const summary = metadataString(item, "recommendationSummary");
            return (
              <article
                key={item.candidate.candidateId}
                className="rounded-xl border border-slate-200 bg-slate-50/60 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">
                      {item.candidate.title ?? item.candidate.locator}
                    </p>
                    <a
                      href={item.candidate.locator}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 flex items-center gap-1 truncate text-xs text-blue-600"
                    >
                      <ExternalLink size={11} className="shrink-0" />
                      <span className="truncate">{item.candidate.locator}</span>
                    </a>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold ring-1 ring-inset ${priorityTone(priority)}`}
                  >
                    {priority ?? "—"}
                    {score !== undefined ? ` · ${score}` : ""}
                  </span>
                </div>
                {summary ? (
                  <p className="mt-3 text-xs leading-5 text-slate-600">{summary}</p>
                ) : null}
                {reason ? (
                  <p className="mt-2 text-xs leading-5 text-slate-500">
                    <span className="font-semibold text-slate-600">
                      {zh ? "推荐原因：" : "Why: "}
                    </span>
                    {reason}
                  </p>
                ) : null}
              </article>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
