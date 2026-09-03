"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Check, ExternalLink, Loader2, RefreshCw, RotateCcw, Sparkles, X } from "lucide-react";
import { useAdminI18n } from "@/lib/i18n";
import { adminBrowserMutationHeaders } from "@/lib/admin-browser-api-client";
import { intakeT, type IntakeMessageKey, type IntakeMessageParams } from "@/lib/intake-i18n";

type CandidateStatus = "DISCOVERED" | "REVIEWED" | "ACCEPTED" | "REJECTED";
type ReviewTab = "PENDING" | "ACCEPTED" | "REJECTED";
type RejectionReason =
  | "IRRELEVANT"
  | "DUPLICATE"
  | "LOGIN_NAVIGATION"
  | "LOW_VALUE"
  | "BETTER_AUTHORITY"
  | "NOT_NEEDED"
  | "OTHER";

type CandidateRecord = {
  batchId: string;
  candidate: {
    candidateId: string;
    locator: string;
    title?: string;
    discoveredAt: string;
    status: CandidateStatus;
    metadata?: Record<string, unknown>;
  };
  review?: {
    decision: "ACCEPTED" | "REJECTED";
    acceptedSourceId?: string;
    collectionPlanId?: string;
    reviewer?: string;
    note?: string;
    reviewedAt?: string;
  };
};

type DiscoveryOverview = {
  candidates: {
    items: CandidateRecord[];
    total: number;
    limit: number;
    offset: number;
    summary: Record<CandidateStatus, number> & { total: number };
  };
};

type PageValueRecord = {
  candidateId: string;
  item: {
    candidateId: string;
    title: string;
    summary: string;
    pageType: string;
    valuePoints: string[];
    score: number;
    priority: "HIGH" | "MEDIUM" | "LOW" | "SKIP";
  };
  provider: {
    providerId: string;
    model?: string;
  };
  generatedAt: string;
};

type CapabilityStatus = {
  capability: string;
  configured: boolean;
  maxCandidates: number;
  maxResults: number;
};

type CapabilityResponse = {
  status: CapabilityStatus;
  latest?: Record<string, PageValueRecord>;
};

type BatchReviewResponse = {
  items: Array<{
    candidateId: string;
    status: "ACCEPTED" | "REJECTED" | "FAILED";
    error?: { message: string };
  }>;
  summary: {
    succeeded: number;
    failed: number;
    collectionStarted: number;
  };
};

const PAGE_SIZE = 50;

const rejectionReasons: Array<{ code: RejectionReason; labelKey: IntakeMessageKey }> = [
  { code: "IRRELEVANT", labelKey: "rejectionReasonIrrelevant" },
  { code: "DUPLICATE", labelKey: "rejectionReasonDuplicate" },
  { code: "LOGIN_NAVIGATION", labelKey: "rejectionReasonLoginNavigation" },
  { code: "LOW_VALUE", labelKey: "rejectionReasonLowValue" },
  { code: "BETTER_AUTHORITY", labelKey: "rejectionReasonBetterAuthority" },
  { code: "NOT_NEEDED", labelKey: "rejectionReasonNotNeeded" },
  { code: "OTHER", labelKey: "rejectionReasonOther" },
];

function structuralScore(record: CandidateRecord): number {
  const value = record.candidate.metadata?.relevanceScore;
  return typeof value === "number" ? value : 0;
}

function fallbackTitle(record: CandidateRecord): string {
  if (record.candidate.title?.trim()) return record.candidate.title.trim();
  try {
    const url = new URL(record.candidate.locator);
    const part = decodeURIComponent(url.pathname).split("/").filter(Boolean).at(-1);
    return part?.replace(/[-_]+/g, " ") || url.hostname;
  } catch {
    return record.candidate.locator;
  }
}

function encodeRejectionNote(reason: RejectionReason, custom: string): string {
  const suffix = custom.trim();
  return `reason:${reason}${suffix ? `|${suffix.slice(0, 500)}` : ""}`;
}

function decodeRejectionNote(note: string | undefined): {
  reason?: RejectionReason;
  custom?: string;
  legacy?: string;
} {
  if (!note) return {};
  const match = /^reason:([A-Z_]+)(?:\|([\s\S]*))?$/.exec(note);
  if (!match) return { legacy: note };
  const code = match[1] as RejectionReason;
  if (!rejectionReasons.some((item) => item.code === code)) return { legacy: note };
  return { reason: code, ...(match[2]?.trim() ? { custom: match[2].trim() } : {}) };
}

async function responseError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: string }; message?: string };
    return body.error?.message ?? body.message ?? `Request failed (${response.status})`;
  } catch {
    return `Request failed (${response.status})`;
  }
}

export function SourceSmartReviewUi() {
  const { locale } = useAdminI18n();
  const t = useCallback(
    (key: IntakeMessageKey, params?: IntakeMessageParams) => intakeT(locale, key, params),
    [locale],
  );
  const [overview, setOverview] = useState<DiscoveryOverview | null>(null);
  const [capability, setCapability] = useState<CapabilityStatus | null>(null);
  const [valueResults, setValueResults] = useState<Record<string, PageValueRecord>>({});
  const [tab, setTab] = useState<ReviewTab>("PENDING");
  const [pageOffset, setPageOffset] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [smartOnly, setSmartOnly] = useState(true);
  const [loading, setLoading] = useState(true);
  const [screening, setScreening] = useState(false);
  const [working, setWorking] = useState(false);
  const [rescanningId, setRescanningId] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<string[]>([]);
  const [rejectReason, setRejectReason] = useState<RejectionReason | "">("");
  const [rejectCustom, setRejectCustom] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        candidateLimit: String(PAGE_SIZE),
        candidateOffset: String(pageOffset),
      });
      const statuses: CandidateStatus[] = tab === "PENDING" ? ["DISCOVERED", "REVIEWED"] : [tab];
      for (const status of statuses) params.append("candidateStatus", status);
      const response = await fetch(`/api/discovery?${params.toString()}`, { cache: "no-store" });
      if (!response.ok) throw new Error(await responseError(response));
      const next = (await response.json()) as DiscoveryOverview;
      const lastOffset =
        next.candidates.total > 0
          ? Math.floor((next.candidates.total - 1) / PAGE_SIZE) * PAGE_SIZE
          : 0;
      if (pageOffset > lastOffset) {
        setPageOffset(lastOffset);
        return;
      }
      setOverview(next);
      const pendingIds = next.candidates.items
        .filter(
          (record) =>
            record.candidate.status === "DISCOVERED" || record.candidate.status === "REVIEWED",
        )
        .map((record) => record.candidate.candidateId);
      const capabilityResponse = await fetch("/api/capabilities/page-value", {
        method: "POST",
        headers: await adminBrowserMutationHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({ action: "LATEST", candidateIds: pendingIds }),
      });
      if (!capabilityResponse.ok) throw new Error(await responseError(capabilityResponse));
      const capabilityBody = (await capabilityResponse.json()) as CapabilityResponse;
      setCapability(capabilityBody.status);
      setValueResults(capabilityBody.latest ?? {});
      setSelected(new Set());
      setError(null);
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : t("reviewReadError"));
    } finally {
      setLoading(false);
    }
  }, [pageOffset, t, tab]);

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  const allRecords = overview?.candidates.items ?? [];
  const pendingRecords = allRecords.filter(
    (record) => record.candidate.status === "DISCOVERED" || record.candidate.status === "REVIEWED",
  );
  const smartCount = Object.keys(valueResults).length;
  const pendingCount =
    (overview?.candidates.summary.DISCOVERED ?? 0) + (overview?.candidates.summary.REVIEWED ?? 0);
  const pageTotal = overview?.candidates.total ?? 0;
  const pageStart = pageTotal === 0 ? 0 : pageOffset + 1;
  const pageEnd = Math.min(pageOffset + allRecords.length, pageTotal);
  let records = allRecords.filter((record) => {
    if (tab === "PENDING") {
      return record.candidate.status === "DISCOVERED" || record.candidate.status === "REVIEWED";
    }
    return record.candidate.status === tab;
  });
  if (tab === "PENDING" && smartOnly && smartCount > 0) {
    records = records.filter((record) => Boolean(valueResults[record.candidate.candidateId]));
  }
  records = [...records].sort((left, right) => {
    if (tab === "PENDING") {
      const leftValue = valueResults[left.candidate.candidateId]?.item.score;
      const rightValue = valueResults[right.candidate.candidateId]?.item.score;
      if (leftValue !== undefined || rightValue !== undefined) {
        return (rightValue ?? -1) - (leftValue ?? -1);
      }
      const structural = structuralScore(right) - structuralScore(left);
      if (structural !== 0) return structural;
    }
    return Date.parse(right.candidate.discoveredAt) - Date.parse(left.candidate.discoveredAt);
  });

  function toggle(candidateId: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(candidateId)) next.delete(candidateId);
      else next.add(candidateId);
      return next;
    });
  }

  function toggleAll() {
    if (
      records.length > 0 &&
      records.every((record) => selected.has(record.candidate.candidateId))
    ) {
      setSelected(new Set());
    } else {
      setSelected(new Set(records.map((record) => record.candidate.candidateId)));
    }
  }

  function openReject(ids: string[]) {
    if (ids.length === 0) return;
    setRejectTarget(ids);
    setRejectReason("");
    setRejectCustom("");
  }

  function closeReject() {
    if (working) return;
    setRejectTarget([]);
    setRejectReason("");
    setRejectCustom("");
  }

  async function screen() {
    const candidateIds = pendingRecords.map((record) => record.candidate.candidateId).slice(0, 500);
    if (candidateIds.length === 0) return;
    setScreening(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/capabilities/page-value", {
        method: "POST",
        headers: await adminBrowserMutationHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({
          action: "SCREEN",
          candidateIds,
          locale,
          maxResults: Math.min(100, candidateIds.length),
        }),
      });
      if (!response.ok) throw new Error(await responseError(response));
      const body = (await response.json()) as CapabilityResponse;
      setCapability(body.status);
      setValueResults(body.latest ?? {});
      setSmartOnly(true);
      setSelected(new Set());
      setMessage(
        t("screenSuccess", {
          candidates: candidateIds.length,
          results: Object.keys(body.latest ?? {}).length,
        }),
      );
    } catch (screenError) {
      setError(screenError instanceof Error ? screenError.message : t("screenError"));
    } finally {
      setScreening(false);
    }
  }

  async function review(
    ids: string[],
    decision: "ACCEPTED" | "REJECTED",
    note?: string,
  ): Promise<boolean> {
    if (ids.length === 0) return false;
    setWorking(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/discovery/reviews", {
        method: "POST",
        headers: await adminBrowserMutationHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({
          candidateIds: ids,
          decision,
          ...(note ? { note } : {}),
          startCollection: decision === "ACCEPTED",
        }),
      });
      if (!response.ok) throw new Error(await responseError(response));
      const result = (await response.json()) as BatchReviewResponse;
      if (result.summary.failed > 0) {
        const first = result.items.find((item) => item.status === "FAILED");
        setError(
          t("partialFailure", {
            succeeded: result.summary.succeeded,
            failed: result.summary.failed,
            message: first?.error?.message ?? t("unknownError"),
          }),
        );
      } else if (decision === "ACCEPTED") {
        setMessage(
          t("approveSuccess", {
            count: result.summary.succeeded,
            started: result.summary.collectionStarted,
          }),
        );
      } else {
        setMessage(t("rejectSuccess", { count: result.summary.succeeded }));
      }
      await refresh();
      return result.summary.failed === 0;
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : t("reviewError"));
      return false;
    } finally {
      setWorking(false);
    }
  }

  async function confirmReject() {
    if (!rejectReason) {
      setError(t("chooseRejectionReason"));
      return;
    }
    const completed = await review(
      rejectTarget,
      "REJECTED",
      encodeRejectionNote(rejectReason, rejectCustom),
    );
    if (completed) {
      setRejectTarget([]);
      setRejectReason("");
      setRejectCustom("");
    }
  }

  async function rescan(record: CandidateRecord) {
    setRescanningId(record.candidate.candidateId);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/discovery", {
        method: "POST",
        headers: await adminBrowserMutationHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({
          locator: record.candidate.locator,
          maxDepth: 1,
          maxCandidates: 100,
          deniedUrlPatterns: ["/login", "/signin", "/logout"],
        }),
      });
      if (!response.ok) throw new Error(await responseError(response));
      setTab("PENDING");
      setMessage(t("rescanSuccess"));
      await refresh();
    } catch (rescanError) {
      setError(rescanError instanceof Error ? rescanError.message : t("rescanError"));
    } finally {
      setRescanningId(null);
    }
  }

  async function restorePending(record: CandidateRecord) {
    const candidateId = record.candidate.candidateId;
    setRestoringId(candidateId);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/discovery/reviews/reopen", {
        method: "POST",
        headers: await adminBrowserMutationHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({
          candidateId,
          note: "restore:manual",
        }),
      });
      if (!response.ok) throw new Error(await responseError(response));
      setTab("PENDING");
      setMessage(t("restoreSuccess"));
      await refresh();
    } catch (restoreError) {
      setError(restoreError instanceof Error ? restoreError.message : t("restoreError"));
    } finally {
      setRestoringId(null);
    }
  }

  function rejectionLabel(note: string | undefined): string | null {
    const parsed = decodeRejectionNote(note);
    if (parsed.legacy) return parsed.legacy;
    if (!parsed.reason) return null;
    const option = rejectionReasons.find((item) => item.code === parsed.reason);
    if (!option) return null;
    const label = t(option.labelKey);
    return parsed.custom ? `${label} · ${parsed.custom}` : label;
  }

  return (
    <>
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 p-5 sm:p-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Sparkles size={19} className="text-violet-600" aria-hidden="true" />
                <h2 className="font-semibold text-slate-950">{t("reviewTitle")}</h2>
                <span
                  className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
                    capability?.configured
                      ? "bg-violet-50 text-violet-700"
                      : "bg-slate-100 text-slate-500"
                  }`}
                >
                  {capability?.configured ? t("capabilityConnected") : t("capabilityMissing")}
                </span>
              </div>
              <p className="mt-1 max-w-4xl text-sm leading-6 text-slate-600">
                {t("reviewDescription")}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void refresh()}
                disabled={loading || screening || working}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-3.5 py-2 text-sm font-medium text-slate-700 disabled:opacity-50"
              >
                <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
                {t("refresh")}
              </button>
              <button
                type="button"
                onClick={() => void screen()}
                disabled={!capability?.configured || screening || pendingCount === 0}
                className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-3.5 py-2 text-sm font-semibold text-white disabled:bg-slate-300"
              >
                {screening ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Sparkles size={16} />
                )}
                {screening ? t("screening") : t("screenTop")}
              </button>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-2">
            {(
              [
                ["PENDING", t("pendingTab", { count: pendingCount })],
                [
                  "ACCEPTED",
                  t("acceptedTab", { count: overview?.candidates.summary.ACCEPTED ?? 0 }),
                ],
                [
                  "REJECTED",
                  t("rejectedTab", { count: overview?.candidates.summary.REJECTED ?? 0 }),
                ],
              ] as Array<[ReviewTab, string]>
            ).map(([value, label]) => (
              <button
                type="button"
                key={value}
                onClick={() => {
                  setTab(value);
                  setPageOffset(0);
                  setSelected(new Set());
                }}
                className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                  tab === value
                    ? "bg-slate-950 text-white"
                    : "border border-slate-200 text-slate-600"
                }`}
              >
                {label}
              </button>
            ))}
            {tab === "PENDING" && smartCount > 0 ? (
              <button
                type="button"
                onClick={() => {
                  setSmartOnly((current) => !current);
                  setSelected(new Set());
                }}
                className="ml-auto rounded-full border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-medium text-violet-700"
              >
                {smartOnly
                  ? t("smartRecommended", { count: smartCount })
                  : t("allReviewCandidates", { count: pendingCount })}
              </button>
            ) : null}
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

        {tab === "PENDING" && records.length > 0 ? (
          <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={
                  records.length > 0 &&
                  records.every((record) => selected.has(record.candidate.candidateId))
                }
                onChange={toggleAll}
                className="size-4 rounded border-slate-300"
              />
              {t("selected", { selected: selected.size, total: records.length })}
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={working || selected.size === 0}
                onClick={() => openReject([...selected])}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 disabled:opacity-40"
              >
                <X size={16} /> {t("batchReject")}
              </button>
              <button
                type="button"
                disabled={working || selected.size === 0}
                onClick={() => void review([...selected], "ACCEPTED")}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-3.5 py-2 text-sm font-semibold text-white disabled:opacity-40"
              >
                {working ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                {t("approveEnable")}
              </button>
            </div>
          </div>
        ) : null}

        {loading ? (
          <div className="p-10 text-center text-sm text-slate-500">{t("loadingReviewQueue")}</div>
        ) : records.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">
            {tab === "PENDING" ? (
              <Link href="/discovery" className="font-medium text-emerald-700 hover:underline">
                {t("noPending")}
              </Link>
            ) : (
              t("noRecords")
            )}
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {records.map((record) => {
              const candidateId = record.candidate.candidateId;
              const value = valueResults[candidateId];
              const displayTitle = value?.item.title || fallbackTitle(record);
              const rejectedReason = rejectionLabel(record.review?.note);
              return (
                <article key={candidateId} className="p-5 sm:p-6">
                  <div className="flex gap-3">
                    {tab === "PENDING" ? (
                      <input
                        type="checkbox"
                        checked={selected.has(candidateId)}
                        onChange={() => toggle(candidateId)}
                        className="mt-1 size-4 shrink-0 rounded border-slate-300"
                        aria-label={displayTitle}
                      />
                    ) : null}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-col gap-2 xl:flex-row xl:items-start xl:justify-between">
                        <div className="min-w-0">
                          <h3 className="font-semibold text-slate-950">{displayTitle}</h3>
                          <a
                            href={record.candidate.locator}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-1 inline-flex max-w-full items-center gap-1 break-all text-xs text-slate-500 hover:text-emerald-700"
                          >
                            {record.candidate.locator} <ExternalLink size={12} />
                          </a>
                        </div>
                        <div className="flex shrink-0 flex-wrap gap-2 text-[11px] font-medium">
                          {value ? (
                            <>
                              <span className="rounded-full bg-violet-50 px-2.5 py-1 text-violet-700">
                                {t("smartValue", { score: value.item.score })}
                              </span>
                              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">
                                {value.item.priority}
                              </span>
                              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">
                                {value.item.pageType}
                              </span>
                            </>
                          ) : (
                            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-500">
                              {t("structuralScore", { score: structuralScore(record) })}
                            </span>
                          )}
                        </div>
                      </div>

                      {value ? (
                        <div className="mt-3 rounded-xl border border-violet-100 bg-violet-50/50 p-3">
                          <p className="text-sm leading-6 text-slate-700">{value.item.summary}</p>
                          {value.item.valuePoints.length > 0 ? (
                            <div className="mt-2 flex flex-wrap gap-2">
                              {value.item.valuePoints.slice(0, 5).map((point) => (
                                <span
                                  key={point}
                                  className="rounded-lg bg-white px-2 py-1 text-xs text-violet-800"
                                >
                                  {point}
                                </span>
                              ))}
                            </div>
                          ) : null}
                          <p className="mt-2 text-[11px] text-slate-400">
                            {value.provider.providerId}
                            {value.provider.model ? ` · ${value.provider.model}` : ""} ·{" "}
                            {new Date(value.generatedAt).toLocaleString(locale)}
                          </p>
                        </div>
                      ) : null}

                      {tab === "REJECTED" && (rejectedReason || record.review?.reviewedAt) ? (
                        <div className="mt-3 rounded-xl border border-amber-100 bg-amber-50 px-3 py-2.5">
                          {rejectedReason ? (
                            <p className="text-xs font-medium text-amber-900">
                              {t("rejectionRecorded", { reason: rejectedReason })}
                            </p>
                          ) : null}
                          {record.review?.reviewedAt ? (
                            <p className="mt-1 text-[11px] text-amber-700/80">
                              {t("reviewedMeta", {
                                reviewer: record.review.reviewer ?? "admin-console",
                                time: new Date(record.review.reviewedAt).toLocaleString(locale),
                              })}
                            </p>
                          ) : null}
                        </div>
                      ) : null}

                      <div className="mt-4 flex flex-wrap items-center gap-2">
                        {tab === "PENDING" ? (
                          <>
                            <button
                              type="button"
                              disabled={working}
                              onClick={() => openReject([candidateId])}
                              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 disabled:opacity-40"
                            >
                              {t("reject")}
                            </button>
                            <button
                              type="button"
                              disabled={working}
                              onClick={() => void review([candidateId], "ACCEPTED")}
                              className="rounded-lg bg-slate-950 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
                            >
                              {t("approveEnable")}
                            </button>
                          </>
                        ) : null}
                        {tab === "ACCEPTED" && record.review?.acceptedSourceId ? (
                          <Link
                            href={`/sources/${record.review.acceptedSourceId}`}
                            className="text-xs font-semibold text-emerald-700 hover:underline"
                          >
                            {t("viewSource")}
                          </Link>
                        ) : null}
                        {tab === "REJECTED" ? (
                          <>
                            <button
                              type="button"
                              disabled={Boolean(restoringId) || Boolean(rescanningId)}
                              onClick={() => void restorePending(record)}
                              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-950 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
                            >
                              {restoringId === candidateId ? (
                                <Loader2 size={14} className="animate-spin" />
                              ) : (
                                <RotateCcw size={14} />
                              )}
                              {t("restorePending")}
                            </button>
                            <button
                              type="button"
                              disabled={Boolean(restoringId) || Boolean(rescanningId)}
                              onClick={() => void rescan(record)}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 disabled:opacity-40"
                            >
                              {rescanningId === candidateId ? (
                                <Loader2 size={14} className="animate-spin" />
                              ) : (
                                <RefreshCw size={14} />
                              )}
                              {t("rescan")}
                            </button>
                          </>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {!loading && pageTotal > PAGE_SIZE ? (
          <div className="flex flex-col gap-3 border-t border-slate-200 px-5 py-3 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <span>
              {locale === "zh-CN"
                ? `第 ${pageStart}-${pageEnd} 条，共 ${pageTotal} 条`
                : `${pageStart}-${pageEnd} of ${pageTotal}`}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={pageOffset === 0 || loading || working}
                onClick={() => setPageOffset((current) => Math.max(0, current - PAGE_SIZE))}
                className="rounded-lg border border-slate-300 px-3 py-1.5 font-medium text-slate-700 disabled:opacity-40"
              >
                {locale === "zh-CN" ? "上一页" : "Previous"}
              </button>
              <button
                type="button"
                disabled={pageOffset + PAGE_SIZE >= pageTotal || loading || working}
                onClick={() => setPageOffset((current) => current + PAGE_SIZE)}
                className="rounded-lg border border-slate-300 px-3 py-1.5 font-medium text-slate-700 disabled:opacity-40"
              >
                {locale === "zh-CN" ? "下一页" : "Next"}
              </button>
            </div>
          </div>
        ) : null}
      </section>

      {rejectTarget.length > 0 ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 p-4"
          role="presentation"
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="rejection-reason-title"
            className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl sm:p-6"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 id="rejection-reason-title" className="font-semibold text-slate-950">
                  {t("rejectionReasonTitle")}
                </h3>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  {t("rejectionReasonDescription")}
                </p>
              </div>
              <button
                type="button"
                onClick={closeReject}
                disabled={working}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                aria-label={t("cancel")}
              >
                <X size={18} />
              </button>
            </div>

            <fieldset className="mt-5 space-y-2">
              <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                {t("rejectionReasonLabel")}
              </legend>
              {rejectionReasons.map((option) => (
                <label
                  key={option.code}
                  className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 text-sm transition ${
                    rejectReason === option.code
                      ? "border-blue-300 bg-blue-50 text-blue-900"
                      : "border-slate-200 text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  <input
                    type="radio"
                    name="rejection-reason"
                    value={option.code}
                    checked={rejectReason === option.code}
                    onChange={() => setRejectReason(option.code)}
                    className="size-4"
                  />
                  {t(option.labelKey)}
                </label>
              ))}
            </fieldset>

            <textarea
              value={rejectCustom}
              onChange={(event) => setRejectCustom(event.target.value)}
              placeholder={t("rejectionCustomPlaceholder")}
              maxLength={500}
              rows={3}
              className="mt-4 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />

            <div className="mt-5 flex items-center justify-between gap-3">
              <p className="text-xs text-slate-500">
                {t("selected", { selected: rejectTarget.length, total: rejectTarget.length })}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={closeReject}
                  disabled={working}
                  className="rounded-xl border border-slate-300 px-3.5 py-2 text-sm font-medium text-slate-700 disabled:opacity-50"
                >
                  {t("cancel")}
                </button>
                <button
                  type="button"
                  onClick={() => void confirmReject()}
                  disabled={working || !rejectReason}
                  className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-3.5 py-2 text-sm font-semibold text-white disabled:opacity-40"
                >
                  {working ? <Loader2 size={15} className="animate-spin" /> : <X size={15} />}
                  {t("confirmReject")}
                </button>
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
