"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  Globe2,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
} from "lucide-react";
import { PageHeading } from "../page-heading";

type CandidateStatus = "DISCOVERED" | "REVIEWED" | "ACCEPTED" | "REJECTED";

type DiscoveryOverview = {
  batches: Array<{
    batch: {
      batchId: string;
      createdAt: string;
      seeds: Array<{ seedId: string; locator: string }>;
    };
    status: "RUNNING" | "COMPLETED" | "FAILED";
    candidateCount: number;
    completedAt?: string;
    errorMessage?: string;
  }>;
  candidates: {
    total: number;
    summary: Record<CandidateStatus, number> & { total: number };
  };
};

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: string }; message?: string };
    return body.error?.message ?? body.message ?? `Request failed (${response.status})`;
  } catch {
    return `Request failed (${response.status})`;
  }
}

function normalizedLocators(value: string): string[] {
  const values = value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
  return [...new Set(values)].slice(0, 20);
}

function time(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("zh-CN");
}

export function DiscoveryIntake() {
  const [overview, setOverview] = useState<DiscoveryOverview | null>(null);
  const [locators, setLocators] = useState("https://www.uspto.gov/");
  const [maxDepth, setMaxDepth] = useState(1);
  const [maxCandidates, setMaxCandidates] = useState(100);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ completed: 0, total: 0 });
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/discovery", { cache: "no-store" });
      if (!response.ok) throw new Error(await readError(response));
      setOverview((await response.json()) as DiscoveryOverview);
      setError(null);
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : "无法读取 Discovery 状态");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  const inputs = useMemo(() => normalizedLocators(locators), [locators]);
  const pending =
    (overview?.candidates.summary.DISCOVERED ?? 0) + (overview?.candidates.summary.REVIEWED ?? 0);

  async function start() {
    if (inputs.length === 0) return;
    setRunning(true);
    setError(null);
    setMessage(null);
    setProgress({ completed: 0, total: inputs.length });
    const failures: string[] = [];
    let discovered = 0;

    for (let index = 0; index < inputs.length; index += 1) {
      const locator = inputs[index]!;
      try {
        const response = await fetch("/api/discovery", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            locator,
            maxDepth,
            maxCandidates,
            deniedUrlPatterns: ["/login", "/signin", "/logout"],
          }),
        });
        if (!response.ok) throw new Error(await readError(response));
        const result = (await response.json()) as { candidates?: unknown[] };
        discovered += result.candidates?.length ?? 0;
      } catch (runError) {
        failures.push(
          `${locator}: ${runError instanceof Error ? runError.message : "Discovery failed"}`,
        );
      } finally {
        setProgress({ completed: index + 1, total: inputs.length });
      }
    }

    if (failures.length > 0) {
      setError(
        `已完成 ${inputs.length - failures.length}/${inputs.length} 个来源，${failures.length} 个失败。${failures[0]}`,
      );
    } else {
      setMessage(
        `已分析 ${inputs.length} 个网站，共发现 ${discovered} 个候选。候选已送往 Sources 统一审核。`,
      );
    }
    await refresh();
    setRunning(false);
  }

  return (
    <>
      <PageHeading
        title="来源发现"
        description="输入一个或一批网站。Discovery 负责发现和整理候选，审批、启用和首次采集统一在 Sources 完成。"
        actions={
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading || running}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 disabled:opacity-50"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} /> 刷新
          </button>
        }
      />

      <div className="mb-5 rounded-2xl border border-blue-100 bg-blue-50/70 px-4 py-3 text-sm text-blue-950">
        <div className="flex items-start gap-3">
          <ShieldCheck size={18} className="mt-0.5 shrink-0" />
          <p>
            Discovery 会遵守 robots.txt、读取
            sitemap、限制抓取预算并记录发现路径。这里不会批准来源，也不会绕过 Sources 自动授权采集。
          </p>
        </div>
      </div>

      {message ? (
        <div className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {message}
        </div>
      ) : null}
      {error ? (
        <div className="mb-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      ) : null}

      <section className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <article className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-slate-950 text-white">
              <Globe2 size={20} />
            </span>
            <div>
              <h2 className="font-semibold text-slate-950">添加来源网站</h2>
              <p className="mt-1 text-sm text-slate-500">
                支持单个或批量输入；每行一个网址，单次最多 20 个网站。
              </p>
            </div>
          </div>

          <label className="mt-5 block">
            <span className="text-xs font-semibold text-slate-600">网站地址</span>
            <div className="relative mt-2">
              <Search className="absolute left-3 top-3 text-slate-400" size={17} />
              <textarea
                value={locators}
                onChange={(event) => setLocators(event.target.value)}
                rows={6}
                placeholder={"https://www.uspto.gov/\nhttps://www.wipo.int/"}
                className="w-full resize-y rounded-xl border border-slate-300 bg-white py-2.5 pl-10 pr-3 text-sm leading-6 text-slate-900 outline-none focus:border-slate-500"
              />
            </div>
          </label>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-medium text-slate-600">
              发现深度
              <select
                value={maxDepth}
                onChange={(event) => setMaxDepth(Number(event.target.value))}
                className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm"
              >
                <option value={0}>仅主页</option>
                <option value={1}>标准 · 推荐</option>
                <option value={2}>更深入</option>
              </select>
            </label>
            <label className="text-xs font-medium text-slate-600">
              每站候选预算
              <select
                value={maxCandidates}
                onChange={(event) => setMaxCandidates(Number(event.target.value))}
                className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm"
              >
                <option value={50}>50</option>
                <option value={100}>100 · 推荐</option>
                <option value={250}>250</option>
                <option value={500}>500</option>
              </select>
            </label>
          </div>

          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-slate-500">
              已识别 {inputs.length} 个网址
              {running ? ` · 正在处理 ${progress.completed}/${progress.total}` : ""}
            </p>
            <button
              type="button"
              onClick={() => void start()}
              disabled={running || inputs.length === 0}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white disabled:bg-slate-300"
            >
              {running ? <Loader2 size={16} className="animate-spin" /> : <Globe2 size={16} />}
              {running ? "发现中…" : inputs.length > 1 ? "批量发现" : "开始发现"}
            </button>
          </div>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Discovery status
              </p>
              <h2 className="mt-1 font-semibold text-slate-950">发现进度</h2>
            </div>
            <CheckCircle2 size={20} className="text-emerald-600" />
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3">
            {[
              [overview?.batches.length ?? 0, "最近批次"],
              [overview?.candidates.total ?? 0, "全部候选"],
              [pending, "待 Sources 审批"],
              [overview?.candidates.summary.ACCEPTED ?? 0, "已批准"],
            ].map(([value, label]) => (
              <div key={label} className="rounded-xl bg-slate-50 p-4">
                <p className="text-xl font-semibold text-slate-950">{value}</p>
                <p className="mt-1 text-xs text-slate-500">{label}</p>
              </div>
            ))}
          </div>

          <Link
            href="/sources"
            className="mt-5 inline-flex w-full items-center justify-between rounded-xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800"
          >
            <span>前往 Sources 审核 {pending > 0 ? `${pending} 个候选` : "候选"}</span>
            <ArrowRight size={17} />
          </Link>
        </article>
      </section>

      <section className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-5 py-4 sm:px-6">
          <h2 className="font-semibold text-slate-950">最近发现记录</h2>
          <p className="mt-1 text-sm text-slate-500">
            这里只显示发现事实和进度；候选取舍统一到 Sources。
          </p>
        </div>
        {overview?.batches.length ? (
          <div className="divide-y divide-slate-100">
            {overview.batches.slice(0, 8).map((record) => (
              <div
                key={record.batch.batchId}
                className="grid gap-2 px-5 py-4 text-sm sm:grid-cols-[1fr_auto_auto] sm:items-center sm:px-6"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-900">
                    {record.batch.seeds[0]?.locator ?? record.batch.batchId}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {time(record.batch.createdAt)} · {record.batch.batchId}
                  </p>
                </div>
                <span className="text-xs text-slate-500">{record.candidateCount} 个候选</span>
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                    record.status === "COMPLETED"
                      ? "bg-emerald-50 text-emerald-700"
                      : record.status === "FAILED"
                        ? "bg-rose-50 text-rose-700"
                        : "bg-amber-50 text-amber-700"
                  }`}
                >
                  {record.status}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-10 text-center text-sm text-slate-500">还没有发现记录。</div>
        )}
      </section>
    </>
  );
}
