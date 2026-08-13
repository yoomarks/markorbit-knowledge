"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check,
  ExternalLink,
  Loader2,
  RefreshCw,
  RotateCcw,
  Sparkles,
  X,
} from "lucide-react";

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
    metadata?: Record<string, unknown>;
  };
  review?: {
    decision: "ACCEPTED" | "REJECTED";
    acceptedSourceId?: string;
  };
};

type DiscoveryOverview = {
  candidates: {
    items: CandidateRecord[];
    total: number;
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

async function responseError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: string }; message?: string };
    return body.error?.message ?? body.message ?? `Request failed (${response.status})`;
  } catch {
    return `Request failed (${response.status})`;
  }
}

export function SourceSmartReview() {
  const [overview, setOverview] = useState<DiscoveryOverview | null>(null);
  const [capability, setCapability] = useState<CapabilityStatus | null>(null);
  const [valueResults, setValueResults] = useState<Record<string, PageValueRecord>>({});
  const [tab, setTab] = useState<ReviewTab>("PENDING");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [smartOnly, setSmartOnly] = useState(true);
  const [loading, setLoading] = useState(true);
  const [screening, setScreening] = useState(false);
  const [working, setWorking] = useState(false);
  const [rescanningId, setRescanningId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/discovery", { cache: "no-store" });
      if (!response.ok) throw new Error(await responseError(response));
      const next = (await response.json()) as DiscoveryOverview;
      setOverview(next);
      const pendingIds = next.candidates.items
        .filter(
          (record) =>
            record.candidate.status === "DISCOVERED" || record.candidate.status === "REVIEWED",
        )
        .map((record) => record.candidate.candidateId)
        .slice(0, 500);
      const capabilityResponse = await fetch("/api/capabilities/page-value", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "LATEST", candidateIds: pendingIds }),
      });
      if (!capabilityResponse.ok) throw new Error(await responseError(capabilityResponse));
      const capabilityBody = (await capabilityResponse.json()) as CapabilityResponse;
      setCapability(capabilityBody.status);
      setValueResults(capabilityBody.latest ?? {});
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

  const pendingRecords = useMemo(
    () =>
      (overview?.candidates.items ?? []).filter(
        (record) =>
          record.candidate.status === "DISCOVERED" || record.candidate.status === "REVIEWED",
      ),
    [overview],
  );
  const smartCount = Object.keys(valueResults).length;
  const pendingCount = pendingRecords.length;

  const records = useMemo(() => {
    const all = overview?.candidates.items ?? [];
    let filtered = all.filter((record) => {
      if (tab === "PENDING") {
        return record.candidate.status === "DISCOVERED" || record.candidate.status === "REVIEWED";
      }
      return record.candidate.status === tab;
    });
    if (tab === "PENDING" && smartOnly && smartCount > 0) {
      filtered = filtered.filter((record) => Boolean(valueResults[record.candidate.candidateId]));
    }
    return [...filtered].sort((left, right) => {
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
  }, [overview, smartCount, smartOnly, tab, valueResults]);

  function toggle(candidateId: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(candidateId)) next.delete(candidateId);
      else next.add(candidateId);
      return next;
    });
  }

  function toggleAll() {
    if (records.length > 0 && selected.size === records.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(records.map((record) => record.candidate.candidateId)));
    }
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
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "SCREEN",
          candidateIds,
          locale: "zh-CN",
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
        `共享能力已从 ${candidateIds.length} 个候选中筛出 ${Object.keys(body.latest ?? {}).length} 个优先页面。`,
      );
    } catch (screenError) {
      setError(screenError instanceof Error ? screenError.message : "智能筛选失败");
    } finally {
      setScreening(false);
    }
  }

  async function review(ids: string[], decision: "ACCEPTED" | "REJECTED") {
    if (ids.length === 0) return;
    setWorking(true);
    setError(null);
    setMessage(null);
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
      if (!response.ok) throw new Error(await responseError(response));
      const result = (await response.json()) as BatchReviewResponse;
      if (result.summary.failed > 0) {
        const first = result.items.find((item) => item.status === "FAILED");
        setError(
          `${result.summary.succeeded} 项完成，${result.summary.failed} 项失败：${first?.error?.message ?? "未知错误"}`,
        );
      } else if (decision === "ACCEPTED") {
        setMessage(
          `已批准 ${result.summary.succeeded} 个来源，并启动 ${result.summary.collectionStarted} 个首次采集任务。`,
        );
      } else {
        setMessage(`已淘汰 ${result.summary.succeeded} 个候选，选择已保留。`);
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
    setError(null);
    setMessage(null);
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
      if (!response.ok) throw new Error(await responseError(response));
      setTab("PENDING");
      setMessage("重新扫描已完成，新发现结果会进入待审批队列。");
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
              <Sparkles size={19} className="text-violet-600" aria-hidden="true" />
              <h2 className="font-semibold text-slate-950">来源审核</h2>
              <span
                className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
                  capability?.configured
                    ? "bg-violet-50 text-violet-700"
                    : "bg-slate-100 text-slate-500"
                }`}
              >
                {capability?.configured ? "共享智能能力已连接" : "共享智能能力未配置"}
              </span>
            </div>
            <p className="mt-1 max-w-4xl text-sm leading-6 text-slate-600">
              Discovery 负责找页面；共享 Page Value Capability 负责跨行业通用的标题、摘要、页面类型、价值点与优先级判断；Knowledge 只保存结果并让人工审批。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={loading || screening || working}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-3.5 py-2 text-sm font-medium text-slate-700 disabled:opacity-50"
            >
              <RefreshCw size={16} className={loading ? "animate-spin" : ""} /> 刷新
            </button>
            <button
              type="button"
              onClick={() => void screen()}
              disabled={!capability?.configured || screening || pendingCount === 0}
              className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-3.5 py-2 text-sm font-semibold text-white disabled:bg-slate-300"
            >
              {screening ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
              {screening ? "智能分析中…" : "智能筛选最优 100 个"}
            </button>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2">
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
              {smartOnly ? `智能推荐 ${smartCount}` : `全部候选 ${pendingCount}`}
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
              checked={records.length > 0 && selected.size === records.length}
              onChange={toggleAll}
              className="size-4 rounded border-slate-300"
            />
            已选择 {selected.size} / {records.length}
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={working || selected.size === 0}
              onClick={() => void review([...selected], "REJECTED")}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 disabled:opacity-40"
            >
              <X size={16} /> 批量淘汰
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
        <div className="p-10 text-center text-sm text-slate-500">
          {tab === "PENDING" ? (
            <Link href="/discovery" className="font-medium text-emerald-700 hover:underline">
              当前没有待审批来源，前往 Discovery 添加来源 →
            </Link>
          ) : (
            "当前没有记录"
          )}
        </div>
      ) : (
        <div className="divide-y divide-slate-100">
          {records.map((record) => {
            const candidateId = record.candidate.candidateId;
            const value = valueResults[candidateId];
            const displayTitle = value?.item.title || fallbackTitle(record);
            return (
              <article key={candidateId} className="p-5 sm:p-6">
                <div className="flex gap-3">
                  {tab === "PENDING" ? (
                    <input
                      type="checkbox"
                      checked={selected.has(candidateId)}
                      onChange={() => toggle(candidateId)}
                      className="mt-1 size-4 shrink-0 rounded border-slate-300"
                      aria-label={`选择 ${displayTitle}`}
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
                              智能价值 {value.item.score}
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
                            结构评分 {structuralScore(record)}
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
                          {value.provider.model ? ` · ${value.provider.model}` : ""} · {" "}
                          {new Date(value.generatedAt).toLocaleString("zh-CN")}
                        </p>
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
