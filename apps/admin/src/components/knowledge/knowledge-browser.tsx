"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  FileText,
  Loader2,
  RefreshCw,
  Search,
} from "lucide-react";
import { useAdminI18n } from "@/lib/i18n";
import {
  knowledgeEvidenceContextHref,
  knowledgeLocationHref,
} from "@/lib/knowledge-navigation-model";
import {
  buildKnowledgeBrowserApiQuery,
  KNOWLEDGE_BROWSER_PAGE_LIMIT,
  patchKnowledgeBrowserQuery,
  readKnowledgeBrowserState,
  type KnowledgeBrowserState,
} from "./knowledge-browser-model";

type KnowledgeItem = {
  id: string;
  title: string;
  targetPath: string;
  outputFormat: string;
  sizeBytes: number;
  status: "GENERATED" | "READY" | "BLOCKED" | "ARCHIVED";
  validation: { outcome: string; warnings: string[] };
  generatedAt: string;
  updatedAt: string;
  source: {
    id: string;
    name: string;
    sourceType: string;
    category: string;
    authorityLevel: string;
    jurisdictions: string[];
    languages: string[];
    canonicalUri: string | null;
  } | null;
  artifact: {
    id: string;
    originalName: string;
    artifactKind: string;
    mimeType: string;
    version: number;
    sizeBytes: number;
    capturedAt: string;
    publishedAt: string | null;
    canonicalUri: string | null;
    sourceUri: string;
    status: string;
  } | null;
};

type KnowledgeListResponse = {
  items: KnowledgeItem[];
  total: number;
  offset: number;
  limit: number;
  summary: { total: number; ready: number; generated: number; blocked: number; archived: number };
  filters: {
    sources: Array<{ id: string; name: string; jurisdictions: string[] }>;
    jurisdictions: string[];
    artifactKinds: string[];
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

function statusTone(status: KnowledgeItem["status"]): string {
  if (status === "READY") return "bg-emerald-50 text-emerald-700";
  if (status === "BLOCKED") return "bg-rose-50 text-rose-700";
  if (status === "GENERATED") return "bg-amber-50 text-amber-700";
  return "bg-slate-100 text-slate-600";
}

export function KnowledgeBrowser({ workspaceId }: { workspaceId: string }) {
  const { locale } = useAdminI18n();
  const zh = locale === "zh-CN";
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const state = useMemo(() => readKnowledgeBrowserState(searchParams), [searchParams]);
  const copy = {
    search: zh
      ? "搜索标题、来源、文件名或来源网址"
      : "Search title, source, filename or source URL",
    allSources: zh ? "全部来源" : "All sources",
    allJurisdictions: zh ? "全部国家 / 地区" : "All jurisdictions",
    allTypes: zh ? "全部资料类型" : "All content types",
    allStatus: zh ? "全部状态" : "All status",
    refresh: zh ? "刷新" : "Refresh",
    total: zh ? "知识资料" : "Knowledge assets",
    ready: zh ? "可用" : "Ready",
    generated: zh ? "待验证" : "Generated",
    blocked: zh ? "需处理" : "Needs attention",
    source: zh ? "来源" : "Source",
    jurisdiction: zh ? "国家 / 地区" : "Jurisdiction",
    type: zh ? "类型" : "Type",
    acquired: zh ? "采集时间" : "Acquired",
    version: zh ? "版本" : "Version",
    view: zh ? "检查证据" : "Inspect evidence",
    noData: zh ? "目前还没有进入知识库的资料" : "No acquired knowledge is available yet",
    noDataHint: zh
      ? "批准来源并完成采集、转换后，资料会自动出现在这里。"
      : "Approve sources and complete collection/conversion; resulting documents will appear here automatically.",
    page: zh ? "页" : "Page",
    validation: zh ? "验证" : "Validation",
  };

  const [result, setResult] = useState<KnowledgeListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const replaceBrowserState = useCallback(
    (patch: Partial<KnowledgeBrowserState>, resetOffset = true) => {
      const query = patchKnowledgeBrowserQuery(searchParams.toString(), patch, resetOffset);
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const query = useMemo(
    () => buildKnowledgeBrowserApiQuery(workspaceId, state),
    [state, workspaceId],
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/knowledge?${query}`, { cache: "no-store" });
      if (!response.ok) throw new Error(await readError(response));
      setResult((await response.json()) as KnowledgeListResponse);
      setError(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to load knowledge");
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  useEffect(() => {
    if (!state.selectedId || !result?.items.some((item) => item.id === state.selectedId)) return;
    const timer = window.setTimeout(() => {
      document
        .getElementById(`knowledge-item-${state.selectedId}`)
        ?.scrollIntoView({ block: "center" });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [result?.items, state.selectedId]);

  const totalPages = Math.max(1, Math.ceil((result?.total ?? 0) / KNOWLEDGE_BROWSER_PAGE_LIMIT));
  const currentPage = Math.floor(state.offset / KNOWLEDGE_BROWSER_PAGE_LIMIT) + 1;

  function evidenceHref(itemId: string): string {
    const returnQuery = patchKnowledgeBrowserQuery(
      searchParams.toString(),
      { selectedId: itemId },
      false,
    );
    return knowledgeEvidenceContextHref(
      `/knowledge/${encodeURIComponent(itemId)}`,
      workspaceId,
      knowledgeLocationHref(pathname, returnQuery),
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          [copy.total, result?.summary.total ?? 0],
          [copy.ready, result?.summary.ready ?? 0],
          [copy.generated, result?.summary.generated ?? 0],
          [copy.blocked, result?.summary.blocked ?? 0],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-medium text-slate-500">{label}</p>
            <p className="mt-2 text-2xl font-semibold text-slate-950">{value}</p>
          </div>
        ))}
      </div>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 p-4 sm:p-5">
          <div className="grid gap-3 xl:grid-cols-[2fr_1fr_1fr_1fr_1fr_auto]">
            <label className="relative">
              <Search className="absolute left-3 top-3 text-slate-400" size={17} />
              <input
                value={state.q}
                onChange={(event) => replaceBrowserState({ q: event.target.value })}
                placeholder={copy.search}
                aria-label={copy.search}
                className="w-full rounded-xl border border-slate-300 py-2.5 pl-10 pr-3 text-sm"
              />
            </label>
            <select
              value={state.sourceId}
              onChange={(event) => replaceBrowserState({ sourceId: event.target.value })}
              aria-label={copy.source}
              className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm"
            >
              <option value="">{copy.allSources}</option>
              {result?.filters.sources.map((source) => (
                <option key={source.id} value={source.id}>
                  {source.name}
                </option>
              ))}
            </select>
            <select
              value={state.jurisdiction}
              onChange={(event) => replaceBrowserState({ jurisdiction: event.target.value })}
              aria-label={copy.jurisdiction}
              className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm"
            >
              <option value="">{copy.allJurisdictions}</option>
              {result?.filters.jurisdictions.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
            <select
              value={state.artifactKind}
              onChange={(event) => replaceBrowserState({ artifactKind: event.target.value })}
              aria-label={copy.type}
              className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm"
            >
              <option value="">{copy.allTypes}</option>
              {result?.filters.artifactKinds.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
            <select
              value={state.status}
              onChange={(event) => replaceBrowserState({ status: event.target.value })}
              aria-label={copy.validation}
              className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm"
            >
              <option value="">{copy.allStatus}</option>
              {(["READY", "GENERATED", "BLOCKED", "ARCHIVED"] as const).map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={loading}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm font-medium text-slate-700 disabled:opacity-50"
            >
              <RefreshCw size={16} className={loading ? "animate-spin" : ""} /> {copy.refresh}
            </button>
          </div>
        </div>

        {error ? (
          <div
            role="alert"
            className="border-b border-rose-200 bg-rose-50 px-5 py-3 text-sm text-rose-800"
          >
            {error}
          </div>
        ) : null}

        {!loading && !error && result ? (
          <p role="status" aria-live="polite" className="sr-only">
            {zh
              ? `已载入 ${result.total} 条知识资料。`
              : `Loaded ${result.total} knowledge assets.`}
          </p>
        ) : null}

        {loading ? (
          <div
            role="status"
            aria-live="polite"
            aria-busy="true"
            className="p-12 text-center text-sm text-slate-500"
          >
            <Loader2 className="mx-auto mb-3 animate-spin" size={22} />
            {zh ? "正在读取知识资料…" : "Loading knowledge…"}
          </div>
        ) : result?.items.length ? (
          <div className="divide-y divide-slate-100">
            {result.items.map((item) => (
              <article
                id={`knowledge-item-${item.id}`}
                key={item.id}
                className={`p-5 sm:p-6 ${state.selectedId === item.id ? "bg-emerald-50/35" : ""}`}
              >
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start gap-3">
                      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-600">
                        <FileText size={18} />
                      </span>
                      <div className="min-w-0">
                        <h2 className="truncate font-semibold text-slate-950">{item.title}</h2>
                        <p className="mt-1 truncate text-xs text-slate-500">
                          {item.artifact?.originalName ?? item.targetPath}
                        </p>
                      </div>
                    </div>
                    <div className="mt-4 grid gap-x-6 gap-y-2 text-xs text-slate-600 sm:grid-cols-2 xl:grid-cols-5">
                      <p>
                        <span className="text-slate-400">{copy.source} · </span>
                        {item.source?.name ?? "—"}
                      </p>
                      <p>
                        <span className="text-slate-400">{copy.jurisdiction} · </span>
                        {item.source?.jurisdictions.join(", ") || "—"}
                      </p>
                      <p>
                        <span className="text-slate-400">{copy.type} · </span>
                        {item.artifact?.artifactKind ?? item.outputFormat}
                      </p>
                      <p>
                        <span className="text-slate-400">{copy.acquired} · </span>
                        {new Date(item.artifact?.capturedAt ?? item.generatedAt).toLocaleString(
                          locale,
                        )}
                      </p>
                      <p>
                        <span className="text-slate-400">{copy.version} · </span>v
                        {item.artifact?.version ?? 1}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusTone(item.status)}`}
                    >
                      {item.status}
                    </span>
                    <Link
                      href={evidenceHref(item.id)}
                      className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-3.5 py-2 text-xs font-semibold text-white"
                    >
                      <BookOpen size={15} /> {copy.view}
                    </Link>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="p-14 text-center">
            <BookOpen className="mx-auto text-slate-300" size={34} />
            <h2 className="mt-4 font-semibold text-slate-900">{copy.noData}</h2>
            <p className="mx-auto mt-2 max-w-xl text-sm text-slate-500">{copy.noDataHint}</p>
            <Link
              href="/sources"
              className="mt-4 inline-flex text-sm font-semibold text-emerald-700"
            >
              {zh ? "前往来源管理 →" : "Go to Sources →"}
            </Link>
          </div>
        )}

        <div className="flex items-center justify-between border-t border-slate-200 px-5 py-4 text-sm">
          <p className="text-slate-500">
            {copy.page} {currentPage} / {totalPages} · {result?.total ?? 0}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={state.offset === 0 || loading}
              onClick={() =>
                replaceBrowserState(
                  { offset: Math.max(0, state.offset - KNOWLEDGE_BROWSER_PAGE_LIMIT) },
                  false,
                )
              }
              className="rounded-lg border border-slate-300 p-2 disabled:opacity-40"
              aria-label="Previous page"
            >
              <ChevronLeft size={17} />
            </button>
            <button
              type="button"
              disabled={loading || state.offset + KNOWLEDGE_BROWSER_PAGE_LIMIT >= (result?.total ?? 0)}
              onClick={() =>
                replaceBrowserState(
                  { offset: state.offset + KNOWLEDGE_BROWSER_PAGE_LIMIT },
                  false,
                )
              }
              className="rounded-lg border border-slate-300 p-2 disabled:opacity-40"
              aria-label="Next page"
            >
              <ChevronRight size={17} />
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
