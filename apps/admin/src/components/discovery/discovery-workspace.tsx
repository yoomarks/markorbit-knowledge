"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Check,
  ChevronDown,
  ChevronUp,
  CircleAlert,
  ExternalLink,
  FileText,
  Globe2,
  Layers3,
  Loader2,
  Map,
  Play,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import { adminBrowserMutationHeaders } from "@/lib/admin-browser-api-client";
import { PageHeading } from "../page-heading";

type CandidateStatus = "DISCOVERED" | "REVIEWED" | "ACCEPTED" | "REJECTED";
type ReviewPriority = "HIGH" | "MEDIUM" | "LOW";
type DiscoveryTopic =
  | "TRADEMARKS"
  | "SEARCH"
  | "FEES"
  | "FORMS"
  | "GUIDANCE"
  | "LEGAL"
  | "NEWS"
  | "CONTACTS"
  | "ABOUT"
  | "GENERAL";
type ReviewFilter = "RECOMMENDED" | "ALL" | "DOCUMENTS" | "SITEMAP" | "BLOCKED";

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
  firstSeenAt: string;
  lastSeenAt: string;
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
  seeds: Array<{
    seedId: string;
    locator: string;
    status: "ACTIVE" | "ARCHIVED";
    createdAt: string;
    updatedAt: string;
  }>;
  batches: Array<{
    batch: {
      batchId: string;
      createdAt: string;
      seeds: Array<{ seedId: string; locator: string }>;
      constraints?: {
        maxDepth?: number;
        maxCandidates?: number;
        maxFetches?: number;
        respectRobots?: boolean;
        discoverSitemaps?: boolean;
      };
    };
    status: "RUNNING" | "COMPLETED" | "FAILED";
    candidateCount: number;
    completedAt?: string;
    errorMessage?: string;
  }>;
  candidates: {
    items: CandidateRecord[];
    total: number;
    summary: Record<CandidateStatus, number> & { total: number };
  };
};

const TOPICS: Record<DiscoveryTopic, { label: string; description: string }> = {
  TRADEMARKS: { label: "商标业务", description: "申请、注册、商品服务等核心业务页面" },
  SEARCH: { label: "查询与数据库", description: "检索、状态、公开数据库与查询入口" },
  FEES: { label: "费用", description: "官方费用、支付与费用表" },
  FORMS: { label: "表格与申请", description: "申请表、请愿表及相关表格" },
  GUIDANCE: { label: "指南与流程", description: "手册、流程、FAQ 与操作指引" },
  LEGAL: { label: "法律与案件", description: "法律、规则、决定、异议与案件材料" },
  NEWS: { label: "公告与资讯", description: "公告、新闻、更新、期刊与通知" },
  CONTACTS: { label: "人员与联系", description: "联系人、团队、办公室与专业人员" },
  ABOUT: { label: "机构信息", description: "机构介绍、历史、组织与辅助页面" },
  GENERAL: { label: "其他", description: "尚未归入专业主题的页面" },
};

const REASON_LABELS: Record<string, string> = {
  TRADEMARK_SIGNAL: "URL 中出现商标业务关键词",
  SEARCH_SIGNAL: "包含检索或数据库入口信号",
  FEE_SIGNAL: "包含费用或支付信息信号",
  FORM_SIGNAL: "包含表格或申请文件信号",
  GUIDANCE_SIGNAL: "包含指南、手册或流程信号",
  LEGAL_SIGNAL: "包含法律、规则、案件或裁决信号",
  NEWS_SIGNAL: "包含公告、新闻或更新信号",
  CONTACT_SIGNAL: "包含人员或联系信息信号",
  ABOUT_SIGNAL: "属于机构介绍或辅助信息",
  DOCUMENT_SIGNAL: "发现为可下载文档",
  SITEMAP_SIGNAL: "由 sitemap 结构发现",
  SHALLOW_SIGNAL: "距离主页较近，优先人工检查",
  ROBOTS_BLOCKED: "robots.txt 不允许自动抓取该页面",
  UTILITY_PAGE: "疑似登录、隐私、招聘等辅助页面",
};

const emptyOverview: DiscoveryOverview = {
  seeds: [],
  batches: [],
  candidates: {
    items: [],
    total: 0,
    summary: {
      DISCOVERED: 0,
      REVIEWED: 0,
      ACCEPTED: 0,
      REJECTED: 0,
      total: 0,
    },
  },
};

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: string }; message?: string };
    return body.error?.message ?? body.message ?? `Request failed (${response.status})`;
  } catch {
    return `Request failed (${response.status})`;
  }
}

async function discoveryMutationFetch(url: string, init: RequestInit): Promise<Response> {
  const headers = await adminBrowserMutationHeaders(init.headers ?? {});
  return fetch(url, { ...init, headers });
}

function shortTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function metadataString(record: CandidateRecord, key: string): string | undefined {
  const value = record.candidate.metadata?.[key];
  return typeof value === "string" ? value : undefined;
}

function metadataNumber(record: CandidateRecord, key: string): number | undefined {
  const value = record.candidate.metadata?.[key];
  return typeof value === "number" ? value : undefined;
}

function metadataBoolean(record: CandidateRecord, key: string): boolean | undefined {
  const value = record.candidate.metadata?.[key];
  return typeof value === "boolean" ? value : undefined;
}

function candidateKind(record: CandidateRecord): string {
  return metadataString(record, "kind") ?? "PAGE";
}

function candidateTopic(record: CandidateRecord): DiscoveryTopic {
  const topic = metadataString(record, "topic");
  return topic && topic in TOPICS ? (topic as DiscoveryTopic) : "GENERAL";
}

function candidatePriority(record: CandidateRecord): ReviewPriority {
  const priority = metadataString(record, "reviewPriority");
  return priority === "HIGH" || priority === "MEDIUM" || priority === "LOW" ? priority : "LOW";
}

function candidateScore(record: CandidateRecord): number {
  return metadataNumber(record, "relevanceScore") ?? 0;
}

function candidateReasons(record: CandidateRecord): string[] {
  const value = record.candidate.metadata?.reasonCodes;
  if (!Array.isArray(value)) return [];
  return value
    .filter((reason): reason is string => typeof reason === "string")
    .map((reason) => REASON_LABELS[reason] ?? reason);
}

function robotsAllowed(record: CandidateRecord): boolean {
  return metadataBoolean(record, "robotsAllowed") ?? true;
}

function displayTitle(record: CandidateRecord): string {
  if (record.candidate.title?.trim()) return record.candidate.title.trim();
  try {
    const url = new URL(record.candidate.locator);
    const path = decodeURIComponent(url.pathname).replace(/\/+$/, "");
    if (!path || path === "/") return url.hostname;
    const segment = path.split("/").filter(Boolean).at(-1) ?? url.hostname;
    return segment.replace(/[-_]+/g, " ").slice(0, 100);
  } catch {
    return record.candidate.locator;
  }
}

function compactLocator(locator: string): string {
  try {
    const url = new URL(locator);
    return `${url.hostname}${url.pathname}${url.search}`;
  } catch {
    return locator;
  }
}

function priorityClass(priority: ReviewPriority): string {
  if (priority === "HIGH") return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  if (priority === "MEDIUM") return "bg-amber-50 text-amber-700 ring-amber-200";
  return "bg-slate-100 text-slate-600 ring-slate-200";
}

function filterMatches(record: CandidateRecord, filter: ReviewFilter): boolean {
  if (filter === "ALL") return true;
  if (filter === "RECOMMENDED") return candidatePriority(record) === "HIGH";
  if (filter === "DOCUMENTS") return candidateKind(record) === "DOCUMENT";
  if (filter === "SITEMAP") return record.candidate.discoveryMethod === "SITEMAP";
  return !robotsAllowed(record);
}

export function DiscoveryWorkspace() {
  const [overview, setOverview] = useState<DiscoveryOverview>(emptyOverview);
  const [locator, setLocator] = useState("https://www.uspto.gov/");
  const [maxDepth, setMaxDepth] = useState(1);
  const [maxCandidates, setMaxCandidates] = useState(100);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [filter, setFilter] = useState<ReviewFilter>("RECOMMENDED");
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [authorizingId, setAuthorizingId] = useState<string | null>(null);
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
      setError(
        refreshError instanceof Error ? refreshError.message : "Failed to load discovery state",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;

    fetch("/api/discovery", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error(await readError(response));
        return (await response.json()) as DiscoveryOverview;
      })
      .then((data) => {
        if (!active) return;
        setOverview(data);
        setError(null);
      })
      .catch((loadError: unknown) => {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : "Failed to load discovery state");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  async function startDiscovery() {
    setRunning(true);
    setMessage(null);
    setError(null);
    try {
      const response = await discoveryMutationFetch("/api/discovery", {
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
      const result = (await response.json()) as { candidates?: CandidateRecord["candidate"][] };
      const candidates = result.candidates ?? [];
      const highPriority = candidates.filter(
        (candidate) => candidate.metadata?.reviewPriority === "HIGH",
      ).length;
      setMessage(
        `分析完成：发现 ${candidates.length} 个候选，其中 ${highPriority} 个建议优先审核。`,
      );
      setFilter(highPriority > 0 ? "RECOMMENDED" : "ALL");
      await refresh();
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : "Discovery failed");
    } finally {
      setRunning(false);
    }
  }

  async function review(candidateId: string, decision: "ACCEPTED" | "REJECTED") {
    setReviewingId(candidateId);
    setMessage(null);
    setError(null);
    try {
      const response = await discoveryMutationFetch(`/api/discovery/candidates/${candidateId}/review`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      if (!response.ok) throw new Error(await readError(response));
      setMessage(
        decision === "ACCEPTED"
          ? "候选已采纳：Source 与暂停状态的 Collection Plan 已创建。"
          : "候选已忽略。",
      );
      await refresh();
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : "Review failed");
    } finally {
      setReviewingId(null);
    }
  }

  async function authorizeCollection(candidateId: string) {
    setAuthorizingId(candidateId);
    setMessage(null);
    setError(null);
    try {
      const response = await discoveryMutationFetch(
        `/api/discovery/candidates/${candidateId}/authorize-collection`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({}),
        },
      );
      if (!response.ok) throw new Error(await readError(response));
      const result = (await response.json()) as { run: { id: string }; replayed: boolean };
      setMessage(
        result.replayed
          ? `该采集任务已授权：${result.run.id}`
          : `采集已授权，任务 ${result.run.id} 已进入 Worker 队列。`,
      );
      await refresh();
    } catch (authorizationError) {
      setError(
        authorizationError instanceof Error
          ? authorizationError.message
          : "Collection authorization failed",
      );
    } finally {
      setAuthorizingId(null);
    }
  }

  const pending = useMemo(
    () =>
      overview.candidates.items.filter(
        (record) =>
          record.candidate.status === "DISCOVERED" || record.candidate.status === "REVIEWED",
      ),
    [overview.candidates.items],
  );

  const reviewed = useMemo(
    () =>
      overview.candidates.items.filter(
        (record) =>
          record.candidate.status === "ACCEPTED" || record.candidate.status === "REJECTED",
      ),
    [overview.candidates.items],
  );

  const sortedPending = useMemo(
    () =>
      [...pending].sort((left, right) => {
        const scoreOrder = candidateScore(right) - candidateScore(left);
        if (scoreOrder !== 0) return scoreOrder;
        return (left.candidate.depth ?? 99) - (right.candidate.depth ?? 99);
      }),
    [pending],
  );

  const filteredPending = useMemo(
    () => sortedPending.filter((record) => filterMatches(record, filter)),
    [filter, sortedPending],
  );

  const sourceMap = useMemo(() => {
    return (Object.keys(TOPICS) as DiscoveryTopic[])
      .map((topic) => {
        const items = overview.candidates.items.filter(
          (record) => candidateTopic(record) === topic,
        );
        return {
          topic,
          total: items.length,
          pending: items.filter(
            (record) =>
              record.candidate.status === "DISCOVERED" || record.candidate.status === "REVIEWED",
          ).length,
          high: items.filter((record) => candidatePriority(record) === "HIGH").length,
          documents: items.filter((record) => candidateKind(record) === "DOCUMENT").length,
        };
      })
      .filter((group) => group.total > 0)
      .sort((left, right) => right.high - left.high || right.total - left.total);
  }, [overview.candidates.items]);

  const highPriorityCount = pending.filter((record) => candidatePriority(record) === "HIGH").length;
  const documentCount = pending.filter((record) => candidateKind(record) === "DOCUMENT").length;
  const latestBatch = overview.batches[0];

  return (
    <>
      <PageHeading
        title="来源发现"
        description="输入一个网站主页，MarkOrbit Knowledge 自动发现其中值得关注的专业页面与文档，再由你决定哪些内容进入正式来源体系。"
        actions={
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 disabled:opacity-50"
          >
            <RefreshCw className={loading ? "animate-spin" : ""} size={16} /> 刷新
          </button>
        }
      />

      <div className="mb-5 rounded-2xl border border-blue-100 bg-blue-50/70 px-4 py-3 text-sm text-blue-950">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 shrink-0" size={18} />
          <p>
            系统会自动遵守 robots.txt、读取 sitemap、限定同站点范围并控制抓取预算。发现结果只是
            <strong> 审核建议</strong>，不会自动成为可信来源，也不会自动开始正式采集。
          </p>
        </div>
      </div>

      {error ? (
        <div className="mb-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      ) : null}
      {message ? (
        <div className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {message}
        </div>
      ) : null}

      <section className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
        <article className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <span className="grid size-11 place-items-center rounded-xl bg-slate-950 text-white">
              <Globe2 size={20} />
            </span>
            <div>
              <h2 className="text-base font-semibold text-slate-950">添加一个来源网站</h2>
              <p className="mt-1 text-sm text-slate-500">
                通常只需要主页地址。系统会自行寻找导航、专业栏目、文档入口与 sitemap。
              </p>
            </div>
          </div>

          <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:p-5">
            <label className="text-xs font-semibold text-slate-600" htmlFor="discovery-seed">
              网站主页
            </label>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-3 text-slate-400" size={17} />
                <input
                  id="discovery-seed"
                  value={locator}
                  onChange={(event) => setLocator(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !running && locator.trim()) void startDiscovery();
                  }}
                  className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm text-slate-900 outline-none focus:border-slate-400"
                  placeholder="https://www.example.com/"
                />
              </div>
              <button
                type="button"
                onClick={() => void startDiscovery()}
                disabled={running || locator.trim().length === 0}
                className="inline-flex min-w-36 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white disabled:bg-slate-300"
              >
                {running ? <Loader2 className="animate-spin" size={16} /> : <Sparkles size={16} />}
                {running ? "正在分析…" : "自动发现"}
              </button>
            </div>

            <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-600">
              {[
                "读取 robots.txt",
                "发现 sitemap",
                "分析主页导航",
                "同站点去重",
                "进入人工审核队列",
              ].map((item) => (
                <span
                  key={item}
                  className="rounded-full border border-slate-200 bg-white px-2.5 py-1"
                >
                  {item}
                </span>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setShowAdvanced((value) => !value)}
              className="mt-4 inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-800"
            >
              {showAdvanced ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              高级设置
            </button>

            {showAdvanced ? (
              <div className="mt-3 grid gap-3 rounded-xl border border-slate-200 bg-white p-3 sm:grid-cols-2">
                <label className="text-xs font-medium text-slate-600">
                  发现深度
                  <select
                    value={maxDepth}
                    onChange={(event) => setMaxDepth(Number(event.target.value))}
                    className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                  >
                    <option value={0}>仅主页</option>
                    <option value={1}>标准 · 推荐</option>
                    <option value={2}>更深入</option>
                  </select>
                </label>
                <label className="text-xs font-medium text-slate-600">
                  单次候选上限
                  <select
                    value={maxCandidates}
                    onChange={(event) => setMaxCandidates(Number(event.target.value))}
                    className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                  >
                    <option value={50}>50</option>
                    <option value={100}>100 · 推荐</option>
                    <option value={250}>250</option>
                    <option value={500}>500</option>
                  </select>
                </label>
              </div>
            ) : null}
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-4">
            {[
              [String(pending.length), "待审核"],
              [String(highPriorityCount), "优先审核"],
              [String(documentCount), "文档"],
              [String(overview.candidates.summary.ACCEPTED), "已采纳"],
            ].map(([value, label]) => (
              <div key={label} className="rounded-xl border border-slate-200 p-4">
                <p className="text-xl font-semibold text-slate-950">{value}</p>
                <p className="mt-1 text-xs text-slate-500">{label}</p>
              </div>
            ))}
          </div>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Latest analysis
              </p>
              <h2 className="mt-1 font-semibold text-slate-950">最近一次来源分析</h2>
            </div>
            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
              Assisted
            </span>
          </div>

          {latestBatch ? (
            <div className="mt-5 space-y-4">
              <div>
                <p className="text-xs text-slate-500">来源</p>
                <p className="mt-1 break-all text-sm font-medium text-slate-900">
                  {latestBatch.batch.seeds[0]?.locator ?? latestBatch.batch.batchId}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-slate-50 p-3">
                  <p className="text-lg font-semibold text-slate-950">
                    {latestBatch.candidateCount}
                  </p>
                  <p className="text-xs text-slate-500">发现候选</p>
                </div>
                <div className="rounded-xl bg-slate-50 p-3">
                  <p className="text-lg font-semibold text-slate-950">
                    {latestBatch.status === "COMPLETED" ? "完成" : latestBatch.status}
                  </p>
                  <p className="text-xs text-slate-500">运行状态</p>
                </div>
              </div>
              <div className="space-y-2 border-t border-slate-100 pt-4 text-xs text-slate-500">
                <p className="flex items-center justify-between gap-3">
                  <span>robots.txt</span>
                  <span className="font-medium text-slate-700">
                    {latestBatch.batch.constraints?.respectRobots === false ? "关闭" : "自动遵守"}
                  </span>
                </p>
                <p className="flex items-center justify-between gap-3">
                  <span>sitemap</span>
                  <span className="font-medium text-slate-700">
                    {latestBatch.batch.constraints?.discoverSitemaps === false
                      ? "关闭"
                      : "自动发现"}
                  </span>
                </p>
                <p className="flex items-center justify-between gap-3">
                  <span>时间</span>
                  <span className="font-medium text-slate-700">
                    {shortTime(latestBatch.batch.createdAt)}
                  </span>
                </p>
              </div>
            </div>
          ) : (
            <div className="mt-5 rounded-xl border border-dashed border-slate-200 p-5 text-sm text-slate-500">
              还没有分析记录。输入一个来源网站即可开始。
            </div>
          )}
        </article>
      </section>

      <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-indigo-50 text-indigo-700">
              <Map size={18} />
            </span>
            <div>
              <h2 className="font-semibold text-slate-950">Source Map</h2>
              <p className="mt-1 text-sm text-slate-500">
                把发现结果按专业主题整理成站点地图，先看哪里最值得人工检查。
              </p>
            </div>
          </div>
          <span className="text-xs text-slate-400">基于当前最多 100 个最近候选</span>
        </div>

        {sourceMap.length === 0 ? (
          <div className="mt-5 rounded-xl border border-dashed border-slate-200 p-5 text-sm text-slate-500">
            完成一次来源分析后，这里会自动形成站点的专业内容地图。
          </div>
        ) : (
          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            {sourceMap.map((group) => {
              const config = TOPICS[group.topic];
              return (
                <button
                  type="button"
                  key={group.topic}
                  onClick={() => {
                    setFilter("ALL");
                    document
                      .getElementById("discovery-review-queue")
                      ?.scrollIntoView({ behavior: "smooth" });
                  }}
                  className="rounded-xl border border-slate-200 p-4 text-left transition hover:border-slate-300 hover:bg-slate-50"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-900">{config.label}</p>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                      {group.total}
                    </span>
                  </div>
                  <p className="mt-2 min-h-8 text-xs leading-4 text-slate-500">
                    {config.description}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-slate-500">
                    {group.high > 0 ? <span>{group.high} 个优先</span> : null}
                    {group.documents > 0 ? <span>{group.documents} 个文档</span> : null}
                    {group.pending > 0 ? <span>{group.pending} 个待审</span> : null}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>

      <section
        id="discovery-review-queue"
        className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white"
      >
        <div className="border-b border-slate-200 px-5 py-4 sm:px-6">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Layers3 size={18} className="text-slate-600" />
                <h2 className="font-semibold text-slate-950">审核队列</h2>
              </div>
              <p className="mt-1 text-sm text-slate-500">
                优先级是可解释的发现排序，不代表法律权威或内容正确性。采纳仍必须由人工决定。
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["RECOMMENDED", `建议优先 ${highPriorityCount}`],
                  ["ALL", `全部 ${pending.length}`],
                  ["DOCUMENTS", `文档 ${documentCount}`],
                  ["SITEMAP", "Sitemap"],
                  ["BLOCKED", "Robots 限制"],
                ] as Array<[ReviewFilter, string]>
              ).map(([value, label]) => (
                <button
                  type="button"
                  key={value}
                  onClick={() => setFilter(value)}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                    filter === value
                      ? "bg-slate-950 text-white"
                      : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 px-5 py-12 text-sm text-slate-500">
            <Loader2 className="animate-spin" size={17} /> 正在读取发现结果…
          </div>
        ) : filteredPending.length === 0 ? (
          <div className="px-5 py-12 text-center text-sm text-slate-500">
            {pending.length === 0
              ? "审核队列为空。添加一个来源网站即可开始。"
              : "当前筛选条件下没有候选，可切换到“全部”。"}
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredPending.map((record) => {
              const busy = reviewingId === record.candidate.candidateId;
              const priority = candidatePriority(record);
              const score = candidateScore(record);
              const topic = candidateTopic(record);
              const reasons = candidateReasons(record).slice(0, 3);
              const blocked = !robotsAllowed(record);

              return (
                <div key={record.candidate.candidateId} className="px-5 py-5 sm:px-6">
                  <div className="grid gap-4 xl:grid-cols-[1fr_auto] xl:items-start">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${priorityClass(
                            priority,
                          )}`}
                        >
                          {priority === "HIGH" ? <Sparkles size={11} /> : null}
                          {priority === "HIGH" ? "优先" : priority === "MEDIUM" ? "一般" : "低优先"}
                          {score > 0 ? ` · ${score}` : ""}
                        </span>
                        <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700">
                          {TOPICS[topic].label}
                        </span>
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                          {candidateKind(record)}
                        </span>
                        {record.candidate.discoveryMethod ? (
                          <span className="text-[11px] text-slate-400">
                            {record.candidate.discoveryMethod}
                          </span>
                        ) : null}
                      </div>

                      <h3 className="mt-2 truncate text-sm font-semibold text-slate-950">
                        {displayTitle(record)}
                      </h3>
                      <p className="mt-1 truncate text-xs text-slate-500">
                        {compactLocator(record.candidate.locator)}
                      </p>

                      {reasons.length > 0 ? (
                        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
                          {reasons.map((reason) => (
                            <span key={reason} className="inline-flex items-center gap-1.5">
                              <span className="size-1.5 rounded-full bg-slate-300" /> {reason}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="mt-3 text-xs text-slate-400">
                          暂无明显专业信号，建议按需检查。
                        </p>
                      )}

                      {blocked ? (
                        <div className="mt-3 inline-flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                          <CircleAlert className="mt-0.5 shrink-0" size={13} />
                          robots.txt 不允许自动抓取该页面。系统只保留发现记录，不会绕过限制访问。
                        </div>
                      ) : null}

                      <p className="mt-3 truncate text-[11px] text-slate-400">
                        depth {record.candidate.depth ?? 0}
                        {record.candidate.discoveredFrom
                          ? ` · 发现自 ${compactLocator(record.candidate.discoveredFrom)}`
                          : ""}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2 xl:justify-end">
                      <a
                        href={record.candidate.locator}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
                      >
                        查看页面 <ExternalLink size={13} />
                      </a>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void review(record.candidate.candidateId, "REJECTED")}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 disabled:opacity-50"
                      >
                        <X size={14} /> 忽略
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void review(record.candidate.candidateId, "ACCEPTED")}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-slate-950 px-3 py-2 text-xs font-semibold text-white disabled:bg-slate-300"
                      >
                        {busy ? (
                          <Loader2 className="animate-spin" size={14} />
                        ) : (
                          <Check size={14} />
                        )}
                        采纳候选
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {reviewed.length > 0 ? (
        <section className="mt-5 rounded-2xl border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-5 py-4 sm:px-6">
            <div className="flex items-center gap-2">
              <FileText size={17} className="text-slate-500" />
              <h2 className="font-semibold text-slate-950">最近审核</h2>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              保留人工决策以及对应 Source / Collection Plan 的关系。
            </p>
          </div>
          <div className="divide-y divide-slate-100">
            {reviewed.slice(0, 10).map((record) => (
              <div
                key={record.candidate.candidateId}
                className="flex flex-col gap-3 px-5 py-4 sm:px-6 md:flex-row md:items-center md:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className={`size-2 rounded-full ${
                        record.candidate.status === "ACCEPTED" ? "bg-emerald-500" : "bg-slate-300"
                      }`}
                    />
                    <p className="truncate text-sm font-medium text-slate-800">
                      {displayTitle(record)}
                    </p>
                  </div>
                  <p className="mt-1 truncate text-xs text-slate-500">
                    {compactLocator(record.candidate.locator)} ·{" "}
                    {record.candidate.status === "ACCEPTED" ? "已采纳" : "已忽略"}
                    {record.review ? ` · ${shortTime(record.review.reviewedAt)}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {record.review?.acceptedSourceId ? (
                    <Link
                      href={`/sources/${record.review.acceptedSourceId}`}
                      className="inline-flex items-center gap-1 text-xs font-medium text-blue-700"
                    >
                      查看 Source <ArrowRight size={13} />
                    </Link>
                  ) : null}
                  {record.candidate.status === "ACCEPTED" && record.review?.collectionPlanId ? (
                    <button
                      type="button"
                      disabled={authorizingId === record.candidate.candidateId}
                      onClick={() => void authorizeCollection(record.candidate.candidateId)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-slate-950 px-3 py-2 text-xs font-medium text-white disabled:bg-slate-300"
                    >
                      {authorizingId === record.candidate.candidateId ? (
                        <Loader2 className="animate-spin" size={13} />
                      ) : (
                        <Play size={13} />
                      )}
                      授权采集
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}
