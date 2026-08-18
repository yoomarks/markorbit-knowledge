"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ExternalLink, Loader2, Play, RefreshCw } from "lucide-react";
import { useAdminI18n } from "@/lib/i18n";

type CandidateRecord = {
  candidate: {
    candidateId: string;
    locator: string;
    title?: string;
    discoveredAt: string;
    status: "ACCEPTED";
    metadata?: Record<string, unknown>;
  };
  review?: {
    acceptedSourceId?: string;
    collectionPlanId?: string;
  };
};

type DiscoveryOverview = {
  candidates: { items: CandidateRecord[]; total: number };
};

type AuthorizationResponse = {
  candidateId: string;
  sourceId: string;
  planId: string;
  planStatus: string;
  runId: string;
  jobCount: number;
  replayed: boolean;
};

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function radarEvidence(candidate: CandidateRecord["candidate"]) {
  const radar = record(record(candidate.metadata)?.radarIntake);
  if (radar?.origin !== "RADAR_CODEX_ONBOARDING") return null;
  return {
    organizationName: text(radar.organizationName),
    sourceType: text(radar.sourceType) ?? text(radar.category),
    country: text(radar.country),
    jurisdiction: text(radar.jurisdiction),
    priority: text(radar.priority) ?? text(radar.estimatedPriority),
    subscriptionStatus: text(radar.subscriptionStatus),
  };
}

async function responseError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: string }; message?: string };
    return body.error?.message ?? body.message ?? `Request failed (${response.status})`;
  } catch {
    return `Request failed (${response.status})`;
  }
}

export function RadarCollectionAuthorization() {
  const { locale } = useAdminI18n();
  const zh = locale === "zh-CN";
  const [items, setItems] = useState<CandidateRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ candidateLimit: "100", candidateOffset: "0" });
      params.append("candidateStatus", "ACCEPTED");
      const response = await fetch(`/api/discovery?${params.toString()}`, { cache: "no-store" });
      if (!response.ok) throw new Error(await responseError(response));
      const overview = (await response.json()) as DiscoveryOverview;
      setItems(
        overview.candidates.items.filter(
          (item) => Boolean(radarEvidence(item.candidate)) && Boolean(item.review?.collectionPlanId),
        ),
      );
      setError(null);
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : "Failed to load Radar sources");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  const rows = useMemo(
    () => items.map((item) => ({ item, radar: radarEvidence(item.candidate)! })),
    [items],
  );

  async function authorize(candidateId: string) {
    setWorkingId(candidateId);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch("/api/discovery/collection-authorization", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ candidateId, requestedBy: "radar-collection-console" }),
      });
      if (!response.ok) throw new Error(await responseError(response));
      const result = (await response.json()) as AuthorizationResponse;
      setMessage(
        result.replayed
          ? zh
            ? `该来源已有首次采集记录：${result.runId}`
            : `Initial collection already exists: ${result.runId}`
          : zh
            ? `已显式授权采集，Run ${result.runId} 已进入队列（${result.jobCount} 个 Job）。`
            : `Collection explicitly authorized. Run ${result.runId} queued with ${result.jobCount} job(s).`,
      );
    } catch (authorizeError) {
      setError(
        authorizeError instanceof Error ? authorizeError.message : "Collection authorization failed",
      );
    } finally {
      setWorkingId(null);
    }
  }

  if (!loading && rows.length === 0 && !error) return null;

  return (
    <section className="overflow-hidden rounded-2xl border border-emerald-200 bg-white">
      <div className="border-b border-emerald-100 bg-emerald-50/60 p-5 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Play size={18} className="text-emerald-700" />
              <h2 className="font-semibold text-slate-950">
                {zh ? "Radar 首次采集授权" : "Radar Initial Collection Authorization"}
              </h2>
              <span className="rounded-full bg-emerald-700 px-2.5 py-1 text-[11px] font-semibold text-white">
                {loading ? "…" : rows.length}
              </span>
            </div>
            <p className="mt-1 max-w-4xl text-sm leading-6 text-slate-600">
              {zh
                ? "这里仅显示已经人工批准进入 Source 生命周期的 Radar 来源。点击“开始首次采集”才会把暂停的默认采集计划激活并创建首个 CollectionRun。"
                : "Only Radar sources already approved into the Source lifecycle appear here. The paused default plan is activated and the first CollectionRun is created only after Start initial collection is clicked."}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading || Boolean(workingId)}
            className="inline-flex items-center gap-2 self-start rounded-xl border border-emerald-200 bg-white px-3.5 py-2 text-sm font-medium text-emerald-800 disabled:opacity-50"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
            {zh ? "刷新" : "Refresh"}
          </button>
        </div>
      </div>

      {message ? (
        <div className="border-b border-emerald-200 bg-emerald-50 px-5 py-3 text-sm text-emerald-900">
          {message}
        </div>
      ) : null}
      {error ? (
        <div className="border-b border-rose-200 bg-rose-50 px-5 py-3 text-sm text-rose-800">
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="p-8 text-center text-sm text-slate-500">
          {zh ? "正在读取已批准 Radar 来源…" : "Loading approved Radar sources…"}
        </div>
      ) : (
        <div className="divide-y divide-slate-100">
          {rows.map(({ item, radar }) => {
            const candidate = item.candidate;
            const location = [radar.jurisdiction, radar.country].filter(Boolean).join(" · ");
            return (
              <article
                key={candidate.candidateId}
                className="flex flex-col gap-4 p-5 sm:p-6 lg:flex-row lg:items-center lg:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold text-slate-950">
                      {radar.organizationName ?? candidate.title ?? candidate.locator}
                    </h3>
                    <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                      {zh ? "来源已批准" : "Source approved"}
                    </span>
                    {[radar.sourceType, radar.priority, radar.subscriptionStatus, location]
                      .filter(Boolean)
                      .map((value) => (
                        <span
                          key={value}
                          className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600"
                        >
                          {value}
                        </span>
                      ))}
                  </div>
                  <a
                    href={candidate.locator}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 inline-flex max-w-full items-center gap-1 break-all text-xs text-slate-500 hover:text-emerald-700"
                  >
                    {candidate.locator} <ExternalLink size={12} />
                  </a>
                  <p className="mt-2 text-xs text-slate-500">
                    Source {item.review?.acceptedSourceId} · Plan {item.review?.collectionPlanId}
                  </p>
                </div>

                <button
                  type="button"
                  disabled={Boolean(workingId)}
                  onClick={() => void authorize(candidate.candidateId)}
                  className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
                >
                  {workingId === candidate.candidateId ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Play size={16} />
                  )}
                  {zh ? "开始首次采集" : "Start initial collection"}
                </button>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
