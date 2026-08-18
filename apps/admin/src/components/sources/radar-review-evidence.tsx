"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, ExternalLink, Loader2, RefreshCw, ShieldCheck, X } from "lucide-react";
import { useAdminI18n } from "@/lib/i18n";

type CandidateStatus = "DISCOVERED" | "REVIEWED" | "ACCEPTED" | "REJECTED";

type CandidateRecord = {
  batchId: string;
  candidate: {
    candidateId: string;
    locator: string;
    title?: string;
    discoveredAt: string;
    status: CandidateStatus;
    discoveredFrom?: string;
    metadata?: Record<string, unknown>;
  };
};

type DiscoveryOverview = {
  candidates: {
    items: CandidateRecord[];
    total: number;
  };
};

type RadarAcquisition = {
  kind?: string;
  locator?: string;
  status?: string;
  notes?: string;
};

type RadarEvidence = {
  origin: "RADAR_CODEX_ONBOARDING";
  externalSourceId?: string;
  externalCandidateId?: string;
  organizationName?: string;
  authorityType?: string;
  sourceType?: string;
  priority?: string;
  subscriptionStatus?: string;
  confirmed?: boolean;
  jurisdiction?: string;
  country?: string;
  region?: string;
  language?: string;
  topic?: string;
  category?: string;
  discoveredBy?: string;
  parentSource?: string;
  discoveredFrom?: string;
  reason?: string;
  estimatedPriority?: string;
  externalStatus?: string;
  notes?: string;
  acquisitions: RadarAcquisition[];
};

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function evidenceFor(candidate: CandidateRecord["candidate"]): RadarEvidence | null {
  const metadata = record(candidate.metadata);
  const radar = record(metadata?.radarIntake);
  if (radar?.origin !== "RADAR_CODEX_ONBOARDING") return null;
  const acquisitions = Array.isArray(radar.acquisitions)
    ? radar.acquisitions
        .map((value) => record(value))
        .filter((value): value is Record<string, unknown> => Boolean(value))
        .map((value) => ({
          kind: text(value.kind),
          locator: text(value.locator),
          status: text(value.status),
          notes: text(value.notes),
        }))
    : [];
  return {
    origin: "RADAR_CODEX_ONBOARDING",
    externalSourceId: text(radar.externalSourceId),
    externalCandidateId: text(radar.externalCandidateId),
    organizationName: text(radar.organizationName),
    authorityType: text(radar.authorityType),
    sourceType: text(radar.sourceType),
    priority: text(radar.priority),
    subscriptionStatus: text(radar.subscriptionStatus),
    confirmed: typeof radar.confirmed === "boolean" ? radar.confirmed : undefined,
    jurisdiction: text(radar.jurisdiction),
    country: text(radar.country),
    region: text(radar.region),
    language: text(radar.language),
    topic: text(radar.topic),
    category: text(radar.category),
    discoveredBy: text(radar.discoveredBy),
    parentSource: text(radar.parentSource),
    discoveredFrom: text(radar.discoveredFrom),
    reason: text(radar.reason),
    estimatedPriority: text(radar.estimatedPriority),
    externalStatus: text(radar.externalStatus),
    notes: text(radar.notes),
    acquisitions,
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

function chip(value: string | undefined) {
  if (!value) return null;
  return (
    <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600">
      {value}
    </span>
  );
}

export function RadarReviewEvidence() {
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
      params.append("candidateStatus", "DISCOVERED");
      params.append("candidateStatus", "REVIEWED");
      const response = await fetch(`/api/discovery?${params.toString()}`, { cache: "no-store" });
      if (!response.ok) throw new Error(await responseError(response));
      const overview = (await response.json()) as DiscoveryOverview;
      setItems(overview.candidates.items.filter((item) => Boolean(evidenceFor(item.candidate))));
      setError(null);
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : "Failed to read Radar review queue");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  const evidence = useMemo(
    () => items.map((item) => ({ item, radar: evidenceFor(item.candidate)! })),
    [items],
  );

  async function decide(candidateId: string, decision: "ACCEPTED" | "REJECTED") {
    setWorkingId(candidateId);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch("/api/discovery/reviews", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          candidateIds: [candidateId],
          decision,
          reviewer: "radar-review-console",
          startCollection: false,
          ...(decision === "REJECTED"
            ? { note: "reason:NOT_NEEDED|Rejected from Radar evidence review" }
            : {}),
        }),
      });
      if (!response.ok) throw new Error(await responseError(response));
      setMessage(
        decision === "ACCEPTED"
          ? zh
            ? "来源已批准；采集仍保持未授权状态。"
            : "Source approved; collection remains unauthorized."
          : zh
            ? "候选来源已拒绝。"
            : "Radar candidate rejected.",
      );
      await refresh();
    } catch (decisionError) {
      setError(decisionError instanceof Error ? decisionError.message : "Radar review failed");
    } finally {
      setWorkingId(null);
    }
  }

  if (!loading && evidence.length === 0 && !error) return null;

  return (
    <section className="overflow-hidden rounded-2xl border border-blue-200 bg-white shadow-sm shadow-blue-100/40">
      <div className="border-b border-blue-100 bg-blue-50/60 p-5 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <ShieldCheck size={19} className="text-blue-600" />
              <h2 className="font-semibold text-slate-950">
                {zh ? "Radar 来源证据审核" : "Radar Source Evidence Review"}
              </h2>
              <span className="rounded-full bg-blue-600 px-2.5 py-1 text-[11px] font-semibold text-white">
                {loading ? "…" : evidence.length}
              </span>
            </div>
            <p className="mt-1 max-w-4xl text-sm leading-6 text-slate-600">
              {zh
                ? "这里展示 Radar / Codex 发现来源时保留下来的原始 onboarding 证据。批准只进入 Source 生命周期并建立暂停的采集计划，不会自动启动 CollectionRun。"
                : "Shows the onboarding evidence preserved by Radar/Codex. Approval enters the Source lifecycle with a paused collection plan; it never starts a CollectionRun automatically."}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading || Boolean(workingId)}
            className="inline-flex items-center gap-2 self-start rounded-xl border border-blue-200 bg-white px-3.5 py-2 text-sm font-medium text-blue-700 disabled:opacity-50"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
            {zh ? "刷新" : "Refresh"}
          </button>
        </div>
      </div>

      {message ? (
        <div className="border-b border-emerald-200 bg-emerald-50 px-5 py-3 text-sm text-emerald-800">
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
          {zh ? "正在读取 Radar 候选…" : "Loading Radar candidates…"}
        </div>
      ) : (
        <div className="divide-y divide-slate-100">
          {evidence.map(({ item, radar }) => {
            const candidate = item.candidate;
            const location = [radar.jurisdiction, radar.country, radar.region]
              .filter(Boolean)
              .join(" · ");
            const externalId = radar.externalSourceId ?? radar.externalCandidateId;
            return (
              <article key={candidate.candidateId} className="p-5 sm:p-6">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-slate-950">
                        {radar.organizationName ?? candidate.title ?? candidate.locator}
                      </h3>
                      <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700">
                        RADAR
                      </span>
                      {radar.confirmed === true ? (
                        <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700">
                          {zh ? "已确认" : "Confirmed"}
                        </span>
                      ) : null}
                    </div>
                    <a
                      href={candidate.locator}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 inline-flex max-w-full items-center gap-1 break-all text-xs text-slate-500 hover:text-blue-700"
                    >
                      {candidate.locator} <ExternalLink size={12} />
                    </a>

                    <div className="mt-3 flex flex-wrap gap-2">
                      {chip(radar.authorityType)}
                      {chip(radar.sourceType ?? radar.category)}
                      {chip(radar.priority ?? radar.estimatedPriority)}
                      {chip(radar.subscriptionStatus)}
                      {chip(location)}
                      {chip(radar.language)}
                      {chip(radar.topic)}
                      {chip(radar.externalStatus)}
                    </div>

                    <div className="mt-4 grid gap-3 lg:grid-cols-2">
                      <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                          {zh ? "发现与溯源" : "Discovery provenance"}
                        </p>
                        <div className="mt-2 space-y-1 text-xs leading-5 text-slate-600">
                          {radar.discoveredBy ? <p>{zh ? "发现者" : "Discovered by"}: {radar.discoveredBy}</p> : null}
                          {radar.parentSource ? <p>{zh ? "父来源" : "Parent source"}: {radar.parentSource}</p> : null}
                          {radar.discoveredFrom || candidate.discoveredFrom ? (
                            <p className="break-all">
                              {zh ? "发现自" : "Discovered from"}: {radar.discoveredFrom ?? candidate.discoveredFrom}
                            </p>
                          ) : null}
                          {externalId ? <p>External ID: {externalId}</p> : null}
                          <p>{zh ? "入队时间" : "Queued"}: {new Date(candidate.discoveredAt).toLocaleString(locale)}</p>
                        </div>
                      </div>

                      <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                          {zh ? "采集入口证据" : "Acquisition evidence"}
                        </p>
                        {radar.acquisitions.length > 0 ? (
                          <div className="mt-2 space-y-2">
                            {radar.acquisitions.slice(0, 6).map((acquisition, index) => (
                              <div key={`${acquisition.kind ?? "acq"}-${acquisition.locator ?? index}`} className="text-xs text-slate-600">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  {acquisition.kind ? (
                                    <span className="rounded bg-white px-1.5 py-0.5 font-semibold text-slate-700">
                                      {acquisition.kind}
                                    </span>
                                  ) : null}
                                  {acquisition.status ? <span>{acquisition.status}</span> : null}
                                </div>
                                {acquisition.locator ? (
                                  <a
                                    href={acquisition.locator}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="mt-1 block break-all text-blue-700 hover:underline"
                                  >
                                    {acquisition.locator}
                                  </a>
                                ) : null}
                                {acquisition.notes ? <p className="mt-1 text-slate-500">{acquisition.notes}</p> : null}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="mt-2 text-xs text-slate-500">
                            {zh ? "未提供结构化采集入口；仍可根据主 URL 审核。" : "No structured acquisition endpoint was supplied; review the primary URL."}
                          </p>
                        )}
                      </div>
                    </div>

                    {radar.reason || radar.notes ? (
                      <div className="mt-3 rounded-xl border border-amber-100 bg-amber-50/70 px-3 py-2.5 text-xs leading-5 text-amber-900">
                        {radar.reason ? <p><strong>{zh ? "推荐原因" : "Reason"}:</strong> {radar.reason}</p> : null}
                        {radar.notes ? <p className={radar.reason ? "mt-1" : ""}><strong>{zh ? "备注" : "Notes"}:</strong> {radar.notes}</p> : null}
                      </div>
                    ) : null}
                  </div>

                  <div className="flex shrink-0 flex-row gap-2 xl:flex-col">
                    <button
                      type="button"
                      disabled={Boolean(workingId)}
                      onClick={() => void decide(candidate.candidateId, "ACCEPTED")}
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-3.5 py-2 text-sm font-semibold text-white disabled:opacity-40"
                    >
                      {workingId === candidate.candidateId ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
                      {zh ? "批准来源" : "Approve source"}
                    </button>
                    <button
                      type="button"
                      disabled={Boolean(workingId)}
                      onClick={() => void decide(candidate.candidateId, "REJECTED")}
                      className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 disabled:opacity-40"
                    >
                      <X size={15} />
                      {zh ? "拒绝" : "Reject"}
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
