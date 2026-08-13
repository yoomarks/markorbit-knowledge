"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Compass,
  Database,
  Loader2,
  PackageCheck,
  RefreshCw,
} from "lucide-react";
import type { SourceListResult } from "@markorbit/persistence";
import { useAdminI18n } from "@/lib/i18n";

type DiscoveryOverview = {
  candidates: {
    total: number;
    summary: {
      DISCOVERED: number;
      REVIEWED: number;
      ACCEPTED: number;
      REJECTED: number;
      total: number;
    };
  };
  batches: Array<{
    batch: { batchId: string; createdAt: string; seeds: Array<{ locator: string }> };
    status: "RUNNING" | "COMPLETED" | "FAILED";
    candidateCount: number;
  }>;
};

type KnowledgeResponse = {
  total: number;
  summary: { total: number; ready: number; generated: number; blocked: number; archived: number };
  items: Array<{
    id: string;
    title: string;
    status: string;
    generatedAt: string;
    source: { name: string; jurisdictions: string[] } | null;
  }>;
};

type ReadyPackage = {
  id: string;
  status: "CREATED" | "VERIFIED" | "HANDED_OFF";
  createdAt: string;
  evidence: { sourceId?: string };
};

type DashboardState = {
  discovery: DiscoveryOverview;
  sources: SourceListResult;
  knowledge: KnowledgeResponse;
  packages: ReadyPackage[];
};

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: string }; message?: string };
    return body.error?.message ?? body.message ?? `Request failed (${response.status})`;
  } catch {
    return `Request failed (${response.status})`;
  }
}

export function OverviewWorkbench({ workspaceId }: { workspaceId: string }) {
  const { locale } = useAdminI18n();
  const zh = locale === "zh-CN";
  const [state, setState] = useState<DashboardState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [discoveryResponse, sourcesResponse, knowledgeResponse, packagesResponse] =
        await Promise.all([
          fetch("/api/discovery", { cache: "no-store" }),
          fetch(`/api/sources?workspaceId=${encodeURIComponent(workspaceId)}&limit=20`, {
            cache: "no-store",
          }),
          fetch(`/api/knowledge?workspaceId=${encodeURIComponent(workspaceId)}&limit=5`, {
            cache: "no-store",
          }),
          fetch(`/api/ready-packages?workspaceId=${encodeURIComponent(workspaceId)}`, {
            cache: "no-store",
          }),
        ]);
      for (const response of [
        discoveryResponse,
        sourcesResponse,
        knowledgeResponse,
        packagesResponse,
      ]) {
        if (!response.ok) throw new Error(await readError(response));
      }
      const packagesBody = (await packagesResponse.json()) as { readyPackages: ReadyPackage[] };
      setState({
        discovery: (await discoveryResponse.json()) as DiscoveryOverview,
        sources: (await sourcesResponse.json()) as SourceListResult,
        knowledge: (await knowledgeResponse.json()) as KnowledgeResponse,
        packages: packagesBody.readyPackages,
      });
      setError(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to load overview");
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  const metrics = useMemo(() => {
    const pending =
      (state?.discovery.candidates.summary.DISCOVERED ?? 0) +
      (state?.discovery.candidates.summary.REVIEWED ?? 0);
    return {
      pending,
      activeSources: state?.sources.summary.ACTIVE ?? 0,
      sourceErrors: state?.sources.summary.ERROR ?? 0,
      knowledge: state?.knowledge.summary.total ?? 0,
      knowledgeBlocked: state?.knowledge.summary.blocked ?? 0,
      packagesReady: state?.packages.filter((item) => item.status === "VERIFIED").length ?? 0,
      packagesDelivered: state?.packages.filter((item) => item.status === "HANDED_OFF").length ?? 0,
    };
  }, [state]);

  const actions = useMemo(() => {
    const items: Array<{
      severity: "attention" | "normal" | "good";
      title: string;
      detail: string;
      href: string;
      cta: string;
    }> = [];
    if (metrics.pending > 0) {
      items.push({
        severity: "attention",
        title: zh ? `${metrics.pending} 个来源等待审批` : `${metrics.pending} sources need review`,
        detail: zh
          ? "Discovery 已完成发现，下一步应在 Sources 中批量审核。"
          : "Discovery has completed intake. Review the candidates in Sources next.",
        href: "/sources",
        cta: zh ? "去审批" : "Review sources",
      });
    }
    if (metrics.sourceErrors > 0) {
      items.push({
        severity: "attention",
        title: zh
          ? `${metrics.sourceErrors} 个来源状态异常`
          : `${metrics.sourceErrors} sources have errors`,
        detail: zh
          ? "优先检查来源状态与最近采集情况，必要时暂停或重新扫描。"
          : "Inspect source state and recent acquisition before pausing or rescanning.",
        href: "/sources",
        cta: zh ? "查看来源" : "View sources",
      });
    }
    if (metrics.knowledgeBlocked > 0) {
      items.push({
        severity: "attention",
        title: zh
          ? `${metrics.knowledgeBlocked} 份知识资料需要处理`
          : `${metrics.knowledgeBlocked} knowledge items need attention`,
        detail: zh
          ? "这些资料已经进入转换链，但当前未达到可用状态。"
          : "These documents entered the conversion chain but are not yet ready.",
        href: "/knowledge",
        cta: zh ? "查看知识资料" : "View knowledge",
      });
    }
    if (metrics.packagesReady > 0) {
      items.push({
        severity: "normal",
        title: zh
          ? `${metrics.packagesReady} 个资料包可以交付`
          : `${metrics.packagesReady} packages are ready`,
        detail: zh
          ? "资料包已完成验证，可以进入下游交付流程。"
          : "These packages passed validation and can proceed to downstream delivery.",
        href: "/packages",
        cta: zh ? "处理交付" : "Handle delivery",
      });
    }
    if (items.length === 0) {
      items.push({
        severity: "good",
        title: zh ? "当前没有需要立即处理的事项" : "Nothing needs immediate attention",
        detail: zh
          ? "可以继续添加新的来源，扩大知识覆盖。"
          : "Continue adding sources to expand knowledge coverage.",
        href: "/discovery",
        cta: zh ? "发现新来源" : "Discover sources",
      });
    }
    return items;
  }, [metrics, zh]);

  if (loading && !state) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-14 text-center text-sm text-slate-500">
        <Loader2 className="mx-auto mb-3 animate-spin" size={22} />
        {zh ? "正在汇总运营状态…" : "Loading operational status…"}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-950">
            {zh ? "知识运营概览" : "Knowledge Operations"}
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            {zh
              ? "只显示现在发生了什么、哪里需要处理，以及下一步应该做什么。"
              : "See what is happening now, what needs attention, and the next operator action."}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 disabled:opacity-50"
        >
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
          {zh ? "刷新" : "Refresh"}
        </button>
      </div>

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {[
          { label: zh ? "待审批来源" : "Pending review", value: metrics.pending, icon: Compass },
          {
            label: zh ? "启用来源" : "Active sources",
            value: metrics.activeSources,
            icon: Database,
          },
          { label: zh ? "知识资料" : "Knowledge assets", value: metrics.knowledge, icon: BookOpen },
          {
            label: zh ? "待交付资料包" : "Ready packages",
            value: metrics.packagesReady,
            icon: PackageCheck,
          },
          {
            label: zh ? "需关注" : "Needs attention",
            value: metrics.sourceErrors + metrics.knowledgeBlocked,
            icon: AlertCircle,
          },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.label} className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-slate-500">{item.label}</p>
                <Icon size={17} className="text-slate-400" />
              </div>
              <p className="mt-3 text-2xl font-semibold text-slate-950">{item.value}</p>
            </div>
          );
        })}
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-5 py-4 sm:px-6">
          <h2 className="font-semibold text-slate-950">
            {zh ? "现在需要处理" : "Needs attention"}
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            {zh
              ? "按业务优先级整理，不要求你进入底层工程页面。"
              : "Business-priority actions without requiring engineering control-plane pages."}
          </p>
        </div>
        <div className="divide-y divide-slate-100">
          {actions.map((item) => (
            <div
              key={`${item.href}-${item.title}`}
              className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6"
            >
              <div className="flex items-start gap-3">
                <span
                  className={`mt-0.5 grid size-8 shrink-0 place-items-center rounded-full ${
                    item.severity === "attention"
                      ? "bg-rose-50 text-rose-600"
                      : item.severity === "good"
                        ? "bg-emerald-50 text-emerald-600"
                        : "bg-blue-50 text-blue-600"
                  }`}
                >
                  {item.severity === "good" ? (
                    <CheckCircle2 size={17} />
                  ) : (
                    <AlertCircle size={17} />
                  )}
                </span>
                <div>
                  <p className="font-medium text-slate-950">{item.title}</p>
                  <p className="mt-1 text-sm text-slate-500">{item.detail}</p>
                </div>
              </div>
              <Link
                href={item.href}
                className="inline-flex shrink-0 items-center gap-1.5 self-start text-sm font-semibold text-emerald-700 sm:self-auto"
              >
                {item.cta} <ArrowRight size={15} />
              </Link>
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-slate-950">
                {zh ? "最近知识资料" : "Recent knowledge"}
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                {zh ? "最近进入知识库的采集成果。" : "Recently acquired and converted material."}
              </p>
            </div>
            <Link href="/knowledge" className="text-xs font-semibold text-emerald-700">
              {zh ? "全部资料" : "View all"} →
            </Link>
          </div>
          <div className="mt-4 divide-y divide-slate-100">
            {state?.knowledge.items.length ? (
              state.knowledge.items.map((item) => (
                <div key={item.id} className="py-3 first:pt-0 last:pb-0">
                  <p className="truncate text-sm font-medium text-slate-900">{item.title}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {item.source?.name ?? "—"} · {item.source?.jurisdictions.join(", ") || "—"} ·{" "}
                    {new Date(item.generatedAt).toLocaleString(locale)}
                  </p>
                </div>
              ))
            ) : (
              <p className="py-6 text-sm text-slate-500">
                {zh ? "暂无知识资料。" : "No knowledge yet."}
              </p>
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-slate-950">
                {zh ? "交付进度" : "Delivery progress"}
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                {zh
                  ? "资料从知识库进入下游的整体状态。"
                  : "How prepared knowledge is moving downstream."}
              </p>
            </div>
            <Link href="/packages" className="text-xs font-semibold text-emerald-700">
              {zh ? "查看资料包" : "View packages"} →
            </Link>
          </div>
          <div className="mt-5 grid grid-cols-3 gap-3">
            {[
              [
                state?.packages.filter((item) => item.status === "CREATED").length ?? 0,
                zh ? "准备中" : "Preparing",
              ],
              [metrics.packagesReady, zh ? "可交付" : "Ready"],
              [metrics.packagesDelivered, zh ? "已交付" : "Delivered"],
            ].map(([value, label]) => (
              <div key={String(label)} className="rounded-xl bg-slate-50 p-4 text-center">
                <p className="text-xl font-semibold text-slate-950">{value}</p>
                <p className="mt-1 text-xs text-slate-500">{label}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
