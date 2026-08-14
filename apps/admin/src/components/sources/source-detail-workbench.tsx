"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Archive,
  ArrowLeft,
  BookOpen,
  Clock3,
  Database,
  ExternalLink,
  Globe2,
  Loader2,
  PauseCircle,
  PlayCircle,
  RefreshCw,
  Settings2,
} from "lucide-react";
import type { SourceDefinition } from "@markorbit/contracts";
import type { CollectionPlanRegistryRecord } from "@markorbit/persistence/collection-plans";
import type { ExecutionRunRecord } from "@markorbit/persistence/execution-ledger";
import { useAdminI18n } from "@/lib/i18n";
import { SourceEditor } from "@/components/sources/source-editor";
import { SourceGraphPanel } from "@/components/sources/source-graph-panel";
import { SourcePlansPanel } from "@/components/sources/source-plans-panel";

type SourcePayload = { source?: SourceDefinition; error?: { message?: string } };
type PlansPayload = { items?: CollectionPlanRegistryRecord[]; error?: { message?: string } };
type RunsPayload = { runs?: ExecutionRunRecord[]; error?: { message?: string } };

type DetailState = {
  source: SourceDefinition;
  plans: CollectionPlanRegistryRecord[];
  runs: ExecutionRunRecord[];
};

async function readError(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: string }; message?: string };
    return body.error?.message ?? body.message ?? fallback;
  } catch {
    return fallback;
  }
}

function humanize(value: string): string {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function sourceLabel(value: string, zh: boolean): string {
  if (!zh) return humanize(value);
  const labels: Record<string, string> = {
    WEB: "网站",
    API: "API",
    RSS: "RSS / 订阅",
    EMAIL: "邮件",
    MANUAL_UPLOAD: "人工文件",
    LOCAL_FOLDER: "本地目录",
    GITHUB: "GitHub",
    OFFICIAL_AUTHORITY: "官方机构",
    OFFICIAL_GUIDANCE: "官方指南",
    LAW_FIRM: "律所 / 代理机构",
    NEWS: "新闻",
    RESEARCH: "研究资料",
    TECHNICAL: "技术资料",
    INTERNAL: "内部资料",
    USER_PROVIDED: "用户提供",
    OTHER: "其他",
    PRIMARY_OFFICIAL: "一级官方",
    SECONDARY_OFFICIAL: "二级官方",
    PROFESSIONAL: "专业来源",
    INDUSTRY: "行业来源",
    COMMUNITY: "社区来源",
    UNKNOWN: "未评估",
    DRAFT: "草稿",
    ACTIVE: "启用",
    PAUSED: "暂停",
    ERROR: "异常",
    ARCHIVED: "归档",
    PENDING: "等待执行",
    RUNNING: "执行中",
    COMPLETED: "完成",
    FAILED: "失败",
    CANCELLED: "已取消",
  };
  return labels[value] ?? humanize(value);
}

function statusTone(status: SourceDefinition["status"]): string {
  if (status === "ACTIVE") return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  if (status === "PAUSED") return "bg-amber-50 text-amber-700 ring-amber-200";
  if (status === "ERROR") return "bg-rose-50 text-rose-700 ring-rose-200";
  if (status === "ARCHIVED") return "bg-slate-100 text-slate-600 ring-slate-200";
  return "bg-blue-50 text-blue-700 ring-blue-200";
}

function runTone(status: ExecutionRunRecord["run"]["status"]): string {
  if (status === "COMPLETED") return "text-emerald-700";
  if (status === "FAILED") return "text-rose-700";
  if (status === "RUNNING") return "text-blue-700";
  if (status === "PENDING") return "text-amber-700";
  return "text-slate-500";
}

function formatDate(value: string, locale: "zh-CN" | "en-US"): string {
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function SourceDetailWorkbench({ sourceId }: { sourceId: string }) {
  const { locale } = useAdminI18n();
  const zh = locale === "zh-CN";
  const [state, setState] = useState<DetailState | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [sourceResponse, plansResponse, runsResponse] = await Promise.all([
        fetch(`/api/sources/${sourceId}`, { cache: "no-store" }),
        fetch(`/api/sources/${sourceId}/plans`, { cache: "no-store" }),
        fetch(`/api/sources/${sourceId}/runs?limit=20`, { cache: "no-store" }),
      ]);

      if (!sourceResponse.ok) {
        throw new Error(await readError(sourceResponse, zh ? "无法读取来源" : "Unable to load source"));
      }
      if (!plansResponse.ok) {
        throw new Error(
          await readError(plansResponse, zh ? "无法读取采集策略" : "Unable to load collection plans"),
        );
      }
      if (!runsResponse.ok) {
        throw new Error(
          await readError(runsResponse, zh ? "无法读取采集记录" : "Unable to load collection runs"),
        );
      }

      const sourceBody = (await sourceResponse.json()) as SourcePayload;
      const plansBody = (await plansResponse.json()) as PlansPayload;
      const runsBody = (await runsResponse.json()) as RunsPayload;
      if (!sourceBody.source) throw new Error(zh ? "来源不存在" : "Source not found");

      setState({
        source: sourceBody.source,
        plans: plansBody.items ?? [],
        runs: runsBody.runs ?? [],
      });
      setError(null);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : zh
            ? "无法读取来源详情"
            : "Unable to load source details",
      );
    } finally {
      setLoading(false);
    }
  }, [sourceId, zh]);

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  const latestRun = useMemo(() => {
    if (!state?.runs.length) return null;
    return [...state.runs].sort(
      (left, right) => Date.parse(right.run.createdAt) - Date.parse(left.run.createdAt),
    )[0]!;
  }, [state?.runs]);

  const defaultPlan = useMemo(() => {
    if (!state?.source.defaultCollectionPlanId) return null;
    return (
      state.plans.find((record) => record.plan.id === state.source.defaultCollectionPlanId) ?? null
    );
  }, [state?.plans, state?.source.defaultCollectionPlanId]);

  async function setStatus(status: SourceDefinition["status"]) {
    if (!state) return;
    setWorking(`status:${status}`);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(`/api/sources/${sourceId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          status,
          expectedUpdatedAt: state.source.updatedAt,
        }),
      });
      if (!response.ok) {
        throw new Error(
          await readError(response, zh ? "来源状态更新失败" : "Unable to update source status"),
        );
      }
      const body = (await response.json()) as SourcePayload;
      if (!body.source) throw new Error(zh ? "来源状态更新失败" : "Unable to update source status");
      setState((current) => (current ? { ...current, source: body.source! } : current));
      setMessage(
        zh
          ? `来源已${status === "ACTIVE" ? "启用" : "暂停"}。`
          : `Source ${status === "ACTIVE" ? "enabled" : "paused"}.`,
      );
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to update source");
    } finally {
      setWorking(null);
    }
  }

  async function archive() {
    if (!state) return;
    const confirmed = window.confirm(
      zh
        ? "确认归档该来源？历史资料、采集记录和溯源证据都会保留。"
        : "Archive this source? Historical assets, runs and provenance will be retained.",
    );
    if (!confirmed) return;
    setWorking("archive");
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(`/api/sources/${sourceId}/archive`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ expectedUpdatedAt: state.source.updatedAt }),
      });
      if (!response.ok) {
        throw new Error(await readError(response, zh ? "归档来源失败" : "Unable to archive source"));
      }
      const body = (await response.json()) as SourcePayload;
      if (!body.source) throw new Error(zh ? "归档来源失败" : "Unable to archive source");
      setState((current) => (current ? { ...current, source: body.source! } : current));
      setMessage(zh ? "来源已归档，历史资料仍然保留。" : "Source archived; history is retained.");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to archive source");
    } finally {
      setWorking(null);
    }
  }

  async function rescan() {
    if (!state || state.source.sourceType !== "WEB") return;
    setWorking("rescan");
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(`/api/sources/${sourceId}/discovery-expansion`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          maxDepth: 2,
          maxCandidates: 250,
          maxFetches: 80,
          discoverExternalLinks: true,
          maxExternalCandidates: 30,
          maxExpansionGeneration: 2,
          deniedUrlPatterns: ["/login", "/signin", "/logout"],
        }),
      });
      if (!response.ok) {
        throw new Error(await readError(response, zh ? "重新扫描失败" : "Rescan failed"));
      }
      setMessage(
        zh
          ? "重新扫描已完成。新发现的候选资料会进入 Sources 的待审批队列。"
          : "Rescan completed. Newly discovered candidates will enter the Sources review queue.",
      );
      await refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Rescan failed");
    } finally {
      setWorking(null);
    }
  }

  if (loading && !state) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-14 text-center text-sm text-slate-500">
        <Loader2 className="mx-auto mb-3 animate-spin text-blue-600" size={22} />
        {zh ? "正在读取来源详情…" : "Loading source details…"}
      </div>
    );
  }

  if (!state) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-800">
        {error ?? (zh ? "无法读取来源详情" : "Unable to load source details")}
      </div>
    );
  }

  const { source, plans } = state;
  const sourceUrl = source.canonicalUri ?? source.entrypoints[0]?.uri ?? null;
  const activePlans = plans.filter((record) => record.plan.status === "ACTIVE");
  const needsAttention =
    source.status === "ERROR" ||
    !source.defaultCollectionPlanId ||
    latestRun?.run.status === "FAILED";

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <Link
            href="/sources"
            className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-900"
          >
            <ArrowLeft size={16} /> {zh ? "返回来源中心" : "Back to Sources"}
          </Link>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-950 sm:text-[28px]">
              {source.name}
            </h1>
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${statusTone(source.status)}`}
            >
              {sourceLabel(source.status, zh)}
            </span>
          </div>
          <p className="mt-2 text-sm text-slate-500">
            {zh
              ? "在一个页面完成来源状态、重新扫描、采集概况和溯源信息检查。"
              : "Manage source status, rescan, collection overview and provenance from one place."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading || Boolean(working)}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-600 disabled:opacity-50"
          >
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
            {zh ? "刷新" : "Refresh"}
          </button>
          <Link
            href="/knowledge"
            className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3.5 py-2 text-sm font-semibold text-blue-700"
          >
            <BookOpen size={15} /> {zh ? "查看知识资产" : "View Knowledge"}
          </Link>
          {sourceUrl ? (
            <a
              href={sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-3.5 py-2 text-sm font-semibold text-white"
            >
              <ExternalLink size={15} /> {zh ? "打开原始来源" : "Open Source"}
            </a>
          ) : null}
        </div>
      </div>

      {message ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {message}
        </div>
      ) : null}
      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      ) : null}

      <section
        className={`rounded-2xl border p-4 sm:p-5 ${
          needsAttention ? "border-amber-200 bg-amber-50/70" : "border-emerald-200 bg-emerald-50/60"
        }`}
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-900">
              {needsAttention
                ? zh
                  ? "这个来源有事项需要处理"
                  : "This source needs attention"
                : zh
                  ? "来源运行状态正常"
                  : "Source is operating normally"}
            </p>
            <p className="mt-1 text-xs leading-5 text-slate-600">
              {source.status === "ERROR"
                ? zh
                  ? "来源当前处于异常状态，请检查采集配置或最近执行记录。"
                  : "The source is in an error state; check collection settings or recent runs."
                : !source.defaultCollectionPlanId
                  ? zh
                    ? "尚未设置默认采集策略；来源可以保存，但持续采集链路还没有完整闭环。"
                    : "No default collection strategy is set yet."
                  : latestRun?.run.status === "FAILED"
                    ? zh
                      ? "最近一次采集失败，建议检查后重新扫描或查看高级执行记录。"
                      : "The latest collection failed; review it before rescanning or retrying."
                    : zh
                      ? "来源已纳入来源库，采集策略与最近执行状态没有发现需要立即处理的问题。"
                      : "The source is registered and no immediate collection issue was detected."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {source.sourceType === "WEB" && source.status !== "ARCHIVED" ? (
              <button
                type="button"
                onClick={() => void rescan()}
                disabled={Boolean(working)}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 disabled:opacity-50"
              >
                {working === "rescan" ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <RefreshCw size={15} />
                )}
                {zh ? "重新扫描" : "Rescan"}
              </button>
            ) : null}
            {source.status === "ACTIVE" ? (
              <button
                type="button"
                onClick={() => void setStatus("PAUSED")}
                disabled={Boolean(working)}
                className="inline-flex items-center gap-2 rounded-xl border border-amber-200 bg-white px-3.5 py-2 text-sm font-medium text-amber-700 disabled:opacity-50"
              >
                <PauseCircle size={15} /> {zh ? "暂停来源" : "Pause Source"}
              </button>
            ) : source.status !== "ARCHIVED" ? (
              <button
                type="button"
                onClick={() => void setStatus("ACTIVE")}
                disabled={Boolean(working)}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-3.5 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                <PlayCircle size={15} /> {zh ? "启用来源" : "Enable Source"}
              </button>
            ) : null}
            {source.status !== "ARCHIVED" ? (
              <button
                type="button"
                onClick={() => void archive()}
                disabled={Boolean(working)}
                className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-white px-3.5 py-2 text-sm font-medium text-rose-700 disabled:opacity-50"
              >
                <Archive size={15} /> {zh ? "归档" : "Archive"}
              </button>
            ) : null}
          </div>
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={Database}
          label={zh ? "来源状态" : "Source status"}
          value={sourceLabel(source.status, zh)}
          detail={`${sourceLabel(source.sourceType, zh)} · ${sourceLabel(source.category, zh)}`}
        />
        <MetricCard
          icon={Globe2}
          label={zh ? "国家 / 地区" : "Jurisdictions"}
          value={source.jurisdictions.join(" · ") || "—"}
          detail={source.languages.join(" · ") || "—"}
        />
        <MetricCard
          icon={Clock3}
          label={zh ? "采集策略" : "Collection strategy"}
          value={defaultPlan?.plan.name ?? (zh ? "未设置默认策略" : "No default plan")}
          detail={
            zh
              ? `${activePlans.length} 个启用 / ${plans.length} 个计划`
              : `${activePlans.length} active / ${plans.length} plans`
          }
        />
        <MetricCard
          icon={RefreshCw}
          label={zh ? "最近采集" : "Latest collection"}
          value={latestRun ? sourceLabel(latestRun.run.status, zh) : zh ? "暂无记录" : "No runs yet"}
          valueClass={latestRun ? runTone(latestRun.run.status) : undefined}
          detail={latestRun ? formatDate(latestRun.run.createdAt, locale) : formatDate(source.updatedAt, locale)}
        />
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/20 sm:p-6">
        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              {zh ? "来源信息" : "Source information"}
            </h2>
            <dl className="mt-4 grid gap-4 sm:grid-cols-2">
              <Fact label={zh ? "来源类型" : "Source type"} value={sourceLabel(source.sourceType, zh)} />
              <Fact label={zh ? "权威等级" : "Authority"} value={sourceLabel(source.authorityLevel, zh)} />
              <Fact label={zh ? "分类" : "Category"} value={sourceLabel(source.category, zh)} />
              <Fact label={zh ? "更新时间" : "Updated"} value={formatDate(source.updatedAt, locale)} />
            </dl>
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              {zh ? "采集概况" : "Collection overview"}
            </h2>
            <dl className="mt-4 grid gap-4 sm:grid-cols-2">
              <Fact
                label={zh ? "默认策略" : "Default plan"}
                value={defaultPlan?.plan.name ?? (zh ? "未设置" : "Not set")}
              />
              <Fact
                label={zh ? "最近状态" : "Latest status"}
                value={latestRun ? sourceLabel(latestRun.run.status, zh) : zh ? "暂无执行" : "No run yet"}
              />
              <Fact
                label={zh ? "已登记策略" : "Registered plans"}
                value={String(plans.length)}
              />
              <Fact
                label={zh ? "最近 20 次采集" : "Recent collection runs"}
                value={String(state.runs.length)}
              />
            </dl>
          </div>
        </div>
      </section>

      <details className="group overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-xl bg-slate-100 text-slate-600">
              <Settings2 size={17} />
            </span>
            <div>
              <p className="text-sm font-semibold text-slate-900">
                {zh ? "高级技术设置" : "Advanced technical settings"}
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                {zh
                  ? "Connector、Source Map 与 CollectionPlan 等系统对象默认收起，普通来源管理无需进入这里。"
                  : "Connector, Source Map and CollectionPlan system objects stay collapsed by default."}
              </p>
            </div>
          </div>
          <span className="text-xs font-medium text-slate-400 group-open:hidden">
            {zh ? "展开" : "Expand"}
          </span>
          <span className="hidden text-xs font-medium text-slate-400 group-open:inline">
            {zh ? "收起" : "Collapse"}
          </span>
        </summary>
        <div className="space-y-6 border-t border-slate-200 bg-slate-50/40 p-4 sm:p-6">
          <SourceEditor sourceId={sourceId} />
          <SourceGraphPanel sourceId={sourceId} />
          <SourcePlansPanel sourceId={sourceId} />
        </div>
      </details>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
  valueClass,
}: {
  icon: typeof Database;
  label: string;
  value: string;
  detail: string;
  valueClass?: string;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/20">
      <span className="grid size-9 place-items-center rounded-xl bg-blue-50 text-blue-600">
        <Icon size={17} />
      </span>
      <p className="mt-4 text-xs font-medium text-slate-400">{label}</p>
      <p className={`mt-1 truncate text-base font-semibold text-slate-900 ${valueClass ?? ""}`}>{value}</p>
      <p className="mt-1 truncate text-xs text-slate-500">{detail}</p>
    </section>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium text-slate-400">{label}</dt>
      <dd className="mt-1 break-words text-sm font-medium text-slate-800">{value}</dd>
    </div>
  );
}
