"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, ExternalLink, Loader2, RefreshCw, RotateCcw, ShieldCheck, X } from "lucide-react";

type CandidateStatus = "DISCOVERED" | "REVIEWED" | "ACCEPTED" | "REJECTED";
type ReviewTab = "PENDING" | "ACCEPTED" | "REJECTED";

type CandidateRecord = {
  batchId: string;
  candidate: {
    candidateId: string;
    locator: string;
    title?: string;
    discoveredAt: string;
    status: CandidateStatus;
    discoveredFrom?: string;
    discoveryMethod?: string;
    depth?: number;
    metadata?: Record<string, unknown>;
  };
  review?: {
    decision: "ACCEPTED" | "REJECTED";
    reviewedAt: string;
    reviewer?: string;
    note?: string;
    acceptedSourceId?: string;
    collectionPlanId?: string;
  };
};

type DiscoveryOverview = {
  candidates: {
    items: CandidateRecord[];
    total: number;
    summary: Record<CandidateStatus, number> & { total: number };
  };
};

type BatchReviewResponse = {
  items: Array<{
    candidateId: string;
    status: "ACCEPTED" | "REJECTED" | "FAILED";
    sourceId?: string;
    runId?: string;
    error?: { code: string; message: string };
  }>;
  summary: {
    requested: number;
    succeeded: number;
    failed: number;
    collectionStarted: number;
  };
};

function metadataString(record: CandidateRecord, key: string): string | undefined {
  const value = record.candidate.metadata?.[key];
  return typeof value === "string" ? value : undefined;
}

function metadataNumber(record: CandidateRecord, key: string): number | undefined {
  const value = record.candidate.metadata?.[key];
  return typeof value === "number" ? value : undefined;
}

function title(record: CandidateRecord): string {
  if (record.candidate.title?.trim()) return record.candidate.title.trim();
  try {
    const url = new URL(record.candidate.locator);
    const part = decodeURIComponent(url.pathname).split("/").filter(Boolean).at(-1);
    return part?.replace(/[-_]+/g, " ") || url.hostname;
  } catch {
    return record.candidate.locator;
  }
}

function reasons(record: CandidateRecord): string[] {
  const value = record.candidate.metadata?.reasonCodes;
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string").slice(0, 4);
}

async function errorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: string }; message?: string };
    return body.error?.message ?? body.message ?? `Request failed (${response.status})`;
  } catch {
    return `Request failed (${response.status})`;
  }
}

export function SourceReviewQueue() {
  const [overview, setOverview] = useState<DiscoveryOverview | null>(null);
  const [tab, setTab] = useState<ReviewTab>("PENDING");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [rescanningId, setRescanningId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/discovery", { cache: "no-store" });
      if (!response.ok) throw new Error(await errorMessage(response));
      setOverview((await response.json()) as DiscoveryOverview);
      setSelected(new Set());
      setError(null);
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : "无法读取来源审核队列");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  const records = useMemo(() => {
    const items = overview?.candidates.items ?? [];
    const filtered = items.filter((record) => {
      if (tab === "PENDING") {
        return record.candidate.status === "DISCOVERED" || record.candidate.status === "REVIEWED";
      }
      return record.candidate.status === tab;
    });
    return [...filtered].sort((left, right) => {
      const score =
        (metadataNumber(right, "relevanceScore") ?? 0) -
        (metadataNumber(left, "relevanceScore") ?? 0);
      if (score !== 0) return score;
      return Date.parse(right.candidate.discoveredAt) - Date.parse(left.candidate.discoveredAt);
    });
  }, [overview, tab]);

  const pendingCount =
    (overview?.candidates.summary.DISCOVERED ?? 0) + (overview?.candidates.summary.REVIEWED ?? 0);

  function toggle(candidateId: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(candidateId)) next.delete(candidateId);
      else next.add(candidateId);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === records.length) {
      setSelected(new Set());
      return;
    }
    setSelected(new Set(records.map((record) => record.candidate.candidateId)));
  }

  async function review(ids: string[], decision: "ACCEPTED" | "REJECTED") {
    if (ids.length === 0) return;
    setWorking(true);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch("/api/discovery/reviews", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          candidateIds: ids,
          decision,
          reviewer: "admin-console",
          startCollection: decision === "ACCEPTED",
        }),
      });
      if (!response.ok) throw new Error(await errorMessage(response));
      const result = (await response.json()) as BatchReviewResponse;
      const failures = result.items.filter((item) => item.status === "FAILED");
      if (failures.length > 0) {
        setError(
          `${result.summary.succeeded} 项完成，${result.summary.failed} 项失败：${failures[0]?.error?.message ?? "未知错误"}`,
        );
      } else if (decision === "ACCEPTED") {
        setMessage(
          `已批准 ${result.summary.succeeded} 个来源，并启动 ${result.summary.collectionStarted} 个首次采集任务。`,
        );
      } else {
        setMessage(`已淘汰 ${result.summary.succeeded} 个候选，决定会保留供后续重新扫描参考。`);
      }
      await refresh();
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : "来源审核失败");
    } finally {
      setWorking(false);
    }
  }

  async function rescan(record: CandidateRecord) {
    setRescanningId(record.candidate.candidateId);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch("/api/discovery", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          locator: record.candidate.locator,
          maxDepth: 1,
          maxCandidates: 100,
          deniedUrlPatterns: ["/login", "/signin", "/logout"],
        }),
      });
      if (!response.ok) throw new Error(await errorMessage(response));
      setMessage("重新扫描已完成，新发现结果会进入待审批队列。");
      setTab("PENDING");
      await refresh();
    } catch (rescanError) {
      setError(rescanError instanceof Error ? rescanError.message : "重新扫描失败");
    } finally {
      setRescanningId(null);
    }
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="border-b border-slate-200 p-5 sm:p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <ShieldCheck size={19} className="text-emerald-700" aria-hidden="true" />
              <h2 className="font-semibold text-slate-950">来源审核</h2>
            </div>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
              Discovery 只负责发现。候选在这里统一审批；批准后系统会建立
              Source、默认采集计划并启动首次采集，避免再进入 Plan / Run 页面补操作。
            </p>
          </div>
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading || working}
            className="inline-flex items-center gap-2 self-start rounded-xl border border-slate-300 px-3.5 py-2 text-sm font-medium text-slate-700 disabled:opacity-50"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} aria-hidden="true" />
            刷新
          </button>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {(
            [
              ["PENDING", `待审批 ${pendingCount}`],
              ["ACCEPTED", `已批准 ${overview?.candidates.summary.ACCEPTED ?? 0}`],
              ["REJECTED", `已淘汰 ${overview?.candidates.summary.REJECTED ?? 0}`],
            ] as Array<[ReviewTab, string]>
          ).map(([value, label]) => (
            <button
              type="button"
              key={value}
              onClick={() => {
                setTab(value);
                setSelected(new Set());
              }}
              className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                tab === value
                  ? "bg-slate-950 text-white"
                  : "border border-slate-200 bg-white text-slate-600"
              }`}
            >
              {label}
            </button>
          ))}
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
              checked={selected.size === records.length && records.length > 0}
              onChange={toggleAll}
              className="size-4 rounded border-slate-300"
            />
            已选择 {selected.size} / {records.length}
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={working || selected.size === 0}
              onClick={() => void review([...selected], "REJECTED")}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 disabled:opacity-40"
            >
              <X size={16} aria-hidden="true" /> 批量淘汰
            </button>
            <button
              type="button"
              disabled={working || selected.size === 0}
              onClick={() => void review([...selected], "ACCEPTED")}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-3.5 py-2 text-sm font-semibold text-white disabled:opacity-40"
            >
              {working ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
              批准并启用
            </button>
          </div>
        </div>
      ) : null}

      {loading ? (
        <div className="p-10 text-center text-sm text-slate-500">正在读取审核队列…</div>
      ) : records.length === 0 ? (
        <div className="p-10 text-center">
          <p className="font-medium text-slate-900">
            {tab === "PENDING" ? "当前没有待审批来源" : "当前没有记录"}
          </p>
          {tab === "PENDING" ? (
            <Link
              href="/discovery"
              className="mt-2 inline-flex text-sm font-medium text-emerald-700 hover:underline"
            >
              前往 Discovery 添加来源 →
            </Link>
          ) : null}
        </div>
      ) : (
        <div className="divide-y divide-slate-100">
          {records.map((record) => {
            const candidateId = record.candidate.candidateId;
            const score = metadataNumber(record, "relevanceScore");
            const priority = metadataString(record, "reviewPriority");
            const topic = metadataString(record, "topic");
            const kind = metadataString(record, "kind");
            return (
              <article key={candidateId} className="p-5 sm:p-6">
                <div className="flex gap-3">
                  {tab === "PENDING" ? (
                    <input
                      type="checkbox"
                      checked={selected.has(candidateId)}
                      onChange={() => toggle(candidateId)}
                      className="mt-1 size-4 shrink-0 rounded border-slate-300"
                      aria-label={`选择 ${title(record)}`}
                    />
                  ) : null}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-col gap-2 xl:flex-row xl:items-start xl:justify-between">
                      <div className="min-w-0">
                        <h3 className="font-semibold text-slate-950">{title(record)}</h3>
                        <a
                          href={record.candidate.locator}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-1 inline-flex max-w-full items-center gap-1 break-all text-xs text-slate-500 hover:text-emerald-700"
                        >
                          {record.candidate.locator} <ExternalLink size={12} aria-hidden="true" />
                        </a>
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-2 text-[11px] font-medium">
                        {score !== undefined ? (
                          <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700">
                            发现评分 {score}
                          </span>
                        ) : null}
                        {priority ? (
                          <span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-700">
                            {priority}
                          </span>
                        ) : null}
                        {topic ? (
                          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">
                            {topic}
                          </span>
                        ) : null}
                        {kind ? (
                          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">
                            {kind}
                          </span>
                        ) : null}
                      </div>
                    </div>

                    {reasons(record).length > 0 ? (
                      <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
                        {reasons(record).map((reason) => (
                          <span key={reason} className="rounded-lg bg-slate-50 px-2 py-1">
                            {reason}
                          </span>
                        ))}
                      </div>
                    ) : null}

                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      {tab === "PENDING" ? (
                        <>
                          <button
                            type="button"
                            disabled={working}
                            onClick={() => void review([candidateId], "REJECTED")}
                            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 disabled:opacity-40"
                          >
                            淘汰
                          </button>
                          <button
                            type="button"
                            disabled={working}
                            onClick={() => void review([candidateId], "ACCEPTED")}
                            className="rounded-lg bg-slate-950 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
                          >
                            批准并启用
                          </button>
                        </>
                      ) : null}
                      {tab === "ACCEPTED" && record.review?.acceptedSourceId ? (
                        <Link
                          href={`/sources/${record.review.acceptedSourceId}`}
                          className="text-xs font-semibold text-emerald-700 hover:underline"
                        >
                          查看 Source →
                        </Link>
                      ) : null}
                      {tab === "REJECTED" ? (
                        <button
                          type="button"
                          disabled={rescanningId === candidateId}
                          onClick={() => void rescan(record)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 disabled:opacity-40"
                        >
                          {rescanningId === candidateId ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : (
                            <RotateCcw size={14} />
                          )}
                          重新扫描
                        </button>
                      ) : null}
                    </div>
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
