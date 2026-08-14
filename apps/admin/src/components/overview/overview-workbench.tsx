"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  Check,
  Clock3,
  Compass,
  Database,
  FileText,
  Globe2,
  Loader2,
  PackageCheck,
  RefreshCw,
  UploadCloud,
  X,
} from "lucide-react";
import type { SourceListResult } from "@markorbit/persistence";
import { useAdminI18n } from "@/lib/i18n";

type CandidateRecord = {
  candidate: {
    candidateId: string;
    locator: string;
    title?: string;
    discoveredAt: string;
    status: "DISCOVERED" | "REVIEWED" | "ACCEPTED" | "REJECTED";
  };
};

type DiscoveryOverview = {
  candidates: {
    total: number;
    items?: CandidateRecord[];
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

function candidateTitle(record: CandidateRecord): string {
  if (record.candidate.title?.trim()) return record.candidate.title.trim();
  try {
    const url = new URL(record.candidate.locator);
    const last = decodeURIComponent(url.pathname).split("/").filter(Boolean).at(-1);
    return last?.replace(/[-_]+/g, " ") || url.hostname;
  } catch {
    return record.candidate.locator;
  }
}

export function OverviewWorkbench({ workspaceId }: { workspaceId: string }) {
  const { locale } = useAdminI18n();
  const zh = locale === "zh-CN";
  const [state, setState] = useState<DashboardState | null>(null);
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [discoveryResponse, sourcesResponse, knowledgeResponse, packagesResponse] =
        await Promise.all([
          fetch("/api/discovery", { cache: "no-store" }),
          fetch(
            `/api/sources?workspaceId=${encodeURIComponent(workspaceId)}&limit=8&hideLegacySystem=true`,
            {
              cache: "no-store",
            },
          ),
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

  async function review(candidateId: string, decision: "ACCEPTED" | "REJECTED") {
    setWorkingId(candidateId);
    setError(null);
    try {
      const response = await fetch("/api/discovery/reviews", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          candidateIds: [candidateId],
          decision,
          reviewer: "admin-console",
          startCollection: decision === "ACCEPTED",
        }),
      });
      if (!response.ok) throw new Error(await readError(response));
      await refresh();
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : "Unable to review source");
    } finally {
      setWorkingId(null);
    }
  }

  const metrics = useMemo(() => {
    const pending =
      (state?.discovery.candidates.summary.DISCOVERED ?? 0) +
      (state?.discovery.candidates.summary.REVIEWED ?? 0);
    return {
      activeSources: state?.sources.summary.ACTIVE ?? 0,
      pending,
      knowledge: state?.knowledge.summary.total ?? 0,
      packagesReady: state?.packages.filter((item) => item.status === "VERIFIED").length ?? 0,
    };
  }, [state]);

  const pendingCandidates = useMemo(
    () =>
      (state?.discovery.candidates.items ?? [])
        .filter(
          (record) =>
            record.candidate.status === "DISCOVERED" || record.candidate.status === "REVIEWED",
        )
        .slice(0, 4),
    [state],
  );

  if (loading && !state) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-16 text-center text-sm text-slate-500 shadow-sm">
        <Loader2 className="mx-auto mb-3 animate-spin text-blue-600" size={22} />
        {zh ? "正在汇总知识运营状态…" : "Loading knowledge operations…"}
      </div>
    );
  }

  const cards = [
    {
      label: zh ? "活跃来源" : "Active Sources",
      secondary: zh ? "Active Sources" : "活跃来源",
      value: metrics.activeSources,
      hint: zh ? "已启用 / enabled" : "enabled / 已启用",
      icon: Database,
      iconClass: "bg-blue-50 text-blue-600",
    },
    {
      label: zh ? "待审查" : "Pending Review",
      secondary: zh ? "Pending Review" : "待审查",
      value: metrics.pending,
      hint: zh ? "需要关注 / needs attention" : "needs attention / 需要关注",
      icon: Clock3,
      iconClass: "bg-amber-50 text-amber-600",
    },
    {
      label: zh ? "知识资产" : "Knowledge Assets",
      secondary: zh ? "Knowledge Assets" : "知识资产",
      value: metrics.knowledge,
      hint: zh ? "已沉淀 / acquired" : "acquired / 已沉淀",
      icon: BookOpen,
      iconClass: "bg-emerald-50 text-emerald-600",
    },
    {
      label: zh ? "就绪交付包" : "Ready Packages",
      secondary: zh ? "Ready Packages" : "就绪交付包",
      value: metrics.packagesReady,
      hint: zh ? "可交付 / ready to deliver" : "ready to deliver / 可交付",
      icon: PackageCheck,
      iconClass: "bg-violet-50 text-violet-600",
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-medium tracking-wide text-slate-400">
            MarkOrbit Knowledge
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950 sm:text-[28px]">
            {zh ? "知识运营中心 / Knowledge Operations" : "Knowledge Operations / 知识运营中心"}
          </h1>
          <p className="mt-1.5 text-sm text-slate-500">
            {zh
              ? "统一发现、管理与交付知识资产 / Discover, manage and deliver knowledge assets."
              : "Discover, manage and deliver knowledge assets / 统一发现、管理与交付知识资产。"}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={loading}
          className="inline-flex items-center gap-2 self-start rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-600 shadow-sm hover:bg-slate-50 disabled:opacity-50 sm:self-auto"
        >
          <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
          {zh ? "刷新 Refresh" : "Refresh 刷新"}
        </button>
      </div>

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((item) => {
          const Icon = item.icon;
          return (
            <section
              key={item.label}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/40"
            >
              <div className="flex items-start justify-between gap-3">
                <span className={`grid size-10 place-items-center rounded-xl ${item.iconClass}`}>
                  <Icon size={20} />
                </span>
                <span className="rounded-full bg-slate-50 px-2 py-1 text-[10px] font-medium text-slate-400">
                  Live
                </span>
              </div>
              <p className="mt-4 text-sm font-semibold text-slate-800">{item.label}</p>
              <p className="mt-0.5 text-xs text-slate-400">{item.secondary}</p>
              <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
                {item.value}
              </p>
              <p className="mt-1 text-xs text-slate-400">{item.hint}</p>
            </section>
          );
        })}
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/30">
        <h2 className="text-sm font-semibold text-slate-900">
          {zh ? "知识运营流程 / Knowledge Pipeline" : "Knowledge Pipeline / 知识运营流程"}
        </h2>
        <div className="mt-5 grid gap-4 md:grid-cols-4">
          {[
            [
              Compass,
              zh ? "来源发现" : "Discovery",
              zh ? "Discovery" : "来源发现",
              zh ? "发现候选来源" : "Find candidates",
              "/discovery",
            ],
            [
              FileText,
              zh ? "来源审查" : "Sources Review",
              zh ? "Sources Review" : "来源审查",
              zh ? "评估并批准来源" : "Review & approve",
              "/sources",
            ],
            [
              BookOpen,
              zh ? "知识资产" : "Knowledge Assets",
              zh ? "Knowledge Assets" : "知识资产",
              zh ? "构建与管理知识" : "Build & manage",
              "/knowledge",
            ],
            [
              PackageCheck,
              zh ? "交付包" : "Packages",
              zh ? "Packages" : "交付包",
              zh ? "打包并交付知识" : "Package & deliver",
              "/packages",
            ],
          ].map(([Icon, title, secondary, detail, href], index) => {
            const StepIcon = Icon as typeof Compass;
            return (
              <Link
                key={String(title)}
                href={String(href)}
                className="group relative flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/60 p-4 transition hover:border-blue-200 hover:bg-blue-50/50"
              >
                <span className="grid size-11 shrink-0 place-items-center rounded-full bg-blue-50 text-blue-600 group-hover:bg-blue-600 group-hover:text-white">
                  <StepIcon size={19} />
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="grid size-4 place-items-center rounded-full bg-blue-600 text-[9px] font-bold text-white">
                      {index + 1}
                    </span>
                    <p className="truncate text-sm font-semibold text-slate-900">{String(title)}</p>
                  </div>
                  <p className="mt-0.5 text-[11px] text-slate-400">{String(secondary)}</p>
                  <p className="mt-1 text-xs text-slate-500">{String(detail)}</p>
                </div>
                {index < 3 ? (
                  <ArrowRight
                    className="absolute -right-3 top-1/2 hidden -translate-y-1/2 text-slate-300 md:block"
                    size={18}
                  />
                ) : null}
              </Link>
            );
          })}
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-200/30">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                {zh ? "待处理 To Review" : "To Review 待处理"}
                <span className="ml-2 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] text-blue-600">
                  {metrics.pending}
                </span>
              </h2>
              <p className="mt-1 text-xs text-slate-400">
                {zh ? "来源发现后的审批入口。" : "Review candidates discovered by Discovery."}
              </p>
            </div>
            <Link
              href="/sources"
              className="text-xs font-semibold text-blue-600 hover:text-blue-700"
            >
              {zh ? "查看全部 View All" : "View All 查看全部"}
            </Link>
          </div>
          <div className="divide-y divide-slate-100">
            {pendingCandidates.length > 0 ? (
              pendingCandidates.map((record) => {
                const id = record.candidate.candidateId;
                const busy = workingId === id;
                return (
                  <div
                    key={id}
                    className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex min-w-0 items-start gap-3">
                      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-violet-50 text-violet-600">
                        <Globe2 size={17} />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-900">
                          {candidateTitle(record)}
                        </p>
                        <p className="mt-1 truncate text-xs text-slate-400">
                          {record.candidate.locator}
                        </p>
                        <span className="mt-2 inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                          {zh ? "待审查 Review" : "Review 待审查"}
                        </span>
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-2 pl-12 sm:pl-0">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void review(id, "ACCEPTED")}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                      >
                        {busy ? (
                          <Loader2 size={13} className="animate-spin" />
                        ) : (
                          <Check size={13} />
                        )}
                        {zh ? "批准 Approve" : "Approve 批准"}
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void review(id, "REJECTED")}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                      >
                        <X size={13} /> {zh ? "淘汰 Reject" : "Reject 淘汰"}
                      </button>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="px-5 py-10 text-center text-sm text-slate-400">
                {zh ? "当前没有待审批来源。" : "No sources are waiting for review."}
              </div>
            )}
          </div>
        </section>

        <div className="space-y-5">
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-200/30">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <h2 className="text-sm font-semibold text-slate-900">
                {zh ? "最近来源 / Recent Sources" : "Recent Sources / 最近来源"}
              </h2>
              <Link
                href="/sources"
                className="text-xs font-semibold text-blue-600 hover:text-blue-700"
              >
                {zh ? "查看全部 View All" : "View All 查看全部"}
              </Link>
            </div>
            <div className="divide-y divide-slate-100 px-5">
              {(state?.sources.items ?? []).slice(0, 4).map((source) => (
                <Link
                  key={source.id}
                  href={`/sources/${source.id}`}
                  className="flex items-center gap-3 py-3.5"
                >
                  <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-blue-50 text-blue-600">
                    <Globe2 size={15} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-800">{source.name}</p>
                    <p className="mt-0.5 truncate text-[11px] text-slate-400">
                      {source.jurisdictions.join(", ") || source.slug}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${source.status === "ACTIVE" ? "bg-emerald-50 text-emerald-700" : source.status === "ERROR" ? "bg-rose-50 text-rose-700" : "bg-slate-100 text-slate-500"}`}
                  >
                    {source.status === "ACTIVE"
                      ? zh
                        ? "已启用 Enabled"
                        : "Enabled 已启用"
                      : source.status}
                  </span>
                </Link>
              ))}
              {(state?.sources.items ?? []).length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-400">
                  {zh ? "暂无来源。" : "No sources yet."}
                </p>
              ) : null}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/30">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-xl bg-blue-50 text-blue-600">
                <UploadCloud size={19} />
              </span>
              <div>
                <h2 className="text-sm font-semibold text-slate-900">
                  {zh ? "文件导入 / File Import" : "File Import / 文件导入"}
                </h2>
                <p className="mt-1 text-xs text-slate-400">
                  {zh
                    ? "文件也统一作为 Source 进入来源管理。"
                    : "Files enter the same unified Source lifecycle."}
                </p>
              </div>
            </div>
            <Link
              href="/sources?import=1"
              className="mt-4 flex min-h-28 flex-col items-center justify-center rounded-xl border border-dashed border-blue-200 bg-blue-50/40 px-4 py-5 text-center transition hover:bg-blue-50"
            >
              <UploadCloud className="text-blue-600" size={25} />
              <p className="mt-2 text-sm font-medium text-slate-700">
                {zh ? "选择文件或打开导入 / Choose Files" : "Choose Files / 选择文件"}
              </p>
              <p className="mt-1 text-[11px] text-slate-400">
                PDF · DOCX · XLSX · CSV · JSON · XML · MD · Images
              </p>
            </Link>
          </section>
        </div>
      </div>
    </div>
  );
}
