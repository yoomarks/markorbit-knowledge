"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FilterX,
  Loader2,
  Network,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { useAdminI18n } from "@/lib/i18n";
import { knowledgeWorkspaceHref } from "@/lib/knowledge-workspace-model";
import {
  buildKnowledgeSearchApiQuery,
  knowledgeSearchRange,
  KNOWLEDGE_SEARCH_PAGE_LIMIT,
  patchKnowledgeSearchQuery,
  readKnowledgeSearchState,
  type KnowledgeSearchState,
} from "./knowledge-hybrid-search-model";

type SearchItem = {
  id: string;
  title: string;
  targetPath: string;
  status: "GENERATED" | "READY" | "BLOCKED" | "ARCHIVED";
  generatedAt: string;
  source: {
    id: string;
    name: string;
    jurisdictions: string[];
    canonicalUri: string | null;
  } | null;
  artifact: {
    originalName: string;
    artifactKind: string;
    canonicalUri: string | null;
    sourceUri: string;
  } | null;
  searchMatch: {
    channels: Array<"FULL_TEXT" | "METADATA">;
    fullText?: {
      indexMode: "SQLITE_FTS5_BM25";
      score: number;
      snippet: string;
      headingPath: string[];
    };
  };
};

type SearchResponse = {
  search: {
    mode: "METADATA_PLUS_FTS5_BM25";
    indexMode: "SQLITE_FTS5_BM25";
    graphNavigation: "OBJECTIVE_LOCAL_1_2_HOP";
    graphAffectsRank: false;
    vectorSearch: false;
    complete: boolean;
    totalSemantics: "EXACT_COMPLETE";
    dateSemantics: "GENERATED_AT_UTC_DATE";
    pageSizes: { metadata: number; fullText: number };
  };
  query: string;
  items: SearchItem[];
  total: number;
  offset: number;
  limit: number;
  summary: {
    total: number;
    ready: number;
    generated: number;
    blocked: number;
    archived: number;
  };
  filters: {
    sources: Array<{ id: string; name: string; jurisdictions: string[] }>;
    jurisdictions: string[];
    artifactKinds: string[];
  };
};

type FilterKey = Exclude<keyof KnowledgeSearchState, "q" | "offset">;

const STATUS_OPTIONS = ["GENERATED", "READY", "BLOCKED", "ARCHIVED"] as const;

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: string }; message?: string };
    return body.error?.message ?? body.message ?? `Request failed (${response.status})`;
  } catch {
    return `Request failed (${response.status})`;
  }
}

export function KnowledgeHybridSearch({ workspaceId }: { workspaceId: string }) {
  const { locale } = useAdminI18n();
  const zh = locale === "zh-CN";
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const state = useMemo(() => readKnowledgeSearchState(searchParams), [searchParams]);
  const pendingQueryRef = useRef<string | null>(null);
  const queryTimerRef = useRef<number | null>(null);
  const [result, setResult] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const replaceSearchState = useCallback(
    (patch: Partial<KnowledgeSearchState>, resetOffset = true) => {
      const pendingQuery = pendingQueryRef.current;
      const effectivePatch =
        pendingQuery !== null && patch.q === undefined ? { ...patch, q: pendingQuery } : patch;
      if (pendingQuery !== null) {
        if (queryTimerRef.current !== null) window.clearTimeout(queryTimerRef.current);
        queryTimerRef.current = null;
        pendingQueryRef.current = null;
      }
      const query = patchKnowledgeSearchQuery(searchParams.toString(), effectivePatch, resetOffset);
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  useEffect(
    () => () => {
      if (queryTimerRef.current !== null) window.clearTimeout(queryTimerRef.current);
    },
    [],
  );

  const scheduleQueryUpdate = useCallback(
    (value: string) => {
      const nextQuery = value.trim();
      pendingQueryRef.current = nextQuery;
      if (queryTimerRef.current !== null) window.clearTimeout(queryTimerRef.current);
      queryTimerRef.current = window.setTimeout(() => {
        pendingQueryRef.current = null;
        queryTimerRef.current = null;
        replaceSearchState({ q: nextQuery });
      }, 250);
    },
    [replaceSearchState],
  );

  const query = useMemo(
    () => buildKnowledgeSearchApiQuery(workspaceId, state),
    [state, workspaceId],
  );

  useEffect(() => {
    if (!query) return;
    let active = true;
    const load = async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/knowledge/search?${query}`, { cache: "no-store" });
        if (!response.ok) throw new Error(await readError(response));
        const value = (await response.json()) as SearchResponse;
        if (active) {
          setResult(value);
          setError(null);
        }
      } catch (requestError) {
        if (active) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : zh
                ? "无法搜索 Knowledge"
                : "Unable to search Knowledge",
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [query, zh]);

  const sourceOptions = result?.filters.sources ?? [];
  const jurisdictionOptions = result?.filters.jurisdictions ?? [];
  const artifactKindOptions = useMemo(() => {
    const values = result?.filters.artifactKinds ?? [];
    return state.artifactKind && !values.includes(state.artifactKind)
      ? [state.artifactKind, ...values]
      : values;
  }, [result?.filters.artifactKinds, state.artifactKind]);

  const sourceName = sourceOptions.find((source) => source.id === state.sourceId)?.name;
  const activeFilters = [
    state.sourceId
      ? {
          key: "sourceId" as const,
          label: `${zh ? "来源" : "Source"}: ${sourceName ?? state.sourceId}`,
        }
      : null,
    state.jurisdiction
      ? {
          key: "jurisdiction" as const,
          label: `${zh ? "地区" : "Jurisdiction"}: ${state.jurisdiction}`,
        }
      : null,
    state.status
      ? { key: "status" as const, label: `${zh ? "状态" : "Status"}: ${state.status}` }
      : null,
    state.artifactKind
      ? { key: "artifactKind" as const, label: `${zh ? "载体" : "Kind"}: ${state.artifactKind}` }
      : null,
    state.generatedFrom
      ? { key: "generatedFrom" as const, label: `${zh ? "起始" : "From"}: ${state.generatedFrom}` }
      : null,
    state.generatedTo
      ? { key: "generatedTo" as const, label: `${zh ? "截至" : "To"}: ${state.generatedTo}` }
      : null,
  ].filter((value): value is { key: FilterKey; label: string } => value !== null);

  const clearAllFilters = () =>
    replaceSearchState({
      sourceId: "",
      jurisdiction: "",
      status: "",
      artifactKind: "",
      generatedFrom: "",
      generatedTo: "",
    });

  const resetSearch = () => {
    if (queryTimerRef.current !== null) window.clearTimeout(queryTimerRef.current);
    replaceSearchState({
      q: "",
      sourceId: "",
      jurisdiction: "",
      status: "",
      artifactKind: "",
      generatedFrom: "",
      generatedTo: "",
    });
  };

  const sourceUrl = (item: SearchItem) =>
    item.artifact?.canonicalUri ?? item.artifact?.sourceUri ?? item.source?.canonicalUri ?? null;
  const range = result
    ? knowledgeSearchRange(result.total, result.offset, result.items.length)
    : null;
  const hasPrevious = Boolean(result && result.offset > 0);
  const hasNext = Boolean(result && result.offset + result.items.length < result.total);

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-700">
            <Search size={18} />
          </span>
          <div>
            <h1 className="text-lg font-semibold text-slate-950">
              {zh ? "Knowledge 搜索" : "Knowledge Search"}
            </h1>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">
              {zh
                ? "一次查询后继续用真实 corpus facets 收窄结果；查询、筛选和分页都保存在 URL 中，打开证据后返回不会丢失调查状态。"
                : "Run one query, narrow it with real corpus facets, and keep query, filters, and pagination in the URL so investigation state survives source inspection and back navigation."}
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(12rem,0.8fr)_minmax(12rem,0.8fr)]">
          <label className="relative">
            <Search className="absolute left-3 top-3 text-slate-400" size={17} />
            <input
              key={state.q}
              defaultValue={state.q}
              onChange={(event) => scheduleQueryUpdate(event.target.value)}
              placeholder={
                zh
                  ? "搜索标题、来源、文件名或正文内容"
                  : "Search metadata or indexed document content"
              }
              className="w-full rounded-xl border border-slate-300 py-2.5 pl-10 pr-3 text-sm"
            />
          </label>
          <select
            value={state.sourceId}
            onChange={(event) => replaceSearchState({ sourceId: event.target.value })}
            className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm"
          >
            <option value="">{zh ? "全部来源" : "All sources"}</option>
            {sourceOptions.map((source) => (
              <option key={source.id} value={source.id}>
                {source.name}
              </option>
            ))}
          </select>
          <select
            value={state.jurisdiction}
            onChange={(event) => replaceSearchState({ jurisdiction: event.target.value })}
            className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm"
          >
            <option value="">{zh ? "全部国家 / 地区" : "All jurisdictions"}</option>
            {jurisdictionOptions.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <select
            value={state.status}
            onChange={(event) => replaceSearchState({ status: event.target.value })}
            className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm"
          >
            <option value="">{zh ? "全部状态" : "All statuses"}</option>
            {STATUS_OPTIONS.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
          <select
            value={state.artifactKind}
            onChange={(event) => replaceSearchState({ artifactKind: event.target.value })}
            className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm"
          >
            <option value="">{zh ? "全部载体类型" : "All artifact kinds"}</option>
            {artifactKindOptions.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-xs text-slate-500">
            <span>{zh ? "从" : "From"}</span>
            <input
              type="date"
              value={state.generatedFrom}
              onChange={(event) => replaceSearchState({ generatedFrom: event.target.value })}
              className="min-w-0 flex-1 bg-transparent text-sm text-slate-800 outline-none"
            />
          </label>
          <label className="flex items-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-xs text-slate-500">
            <span>{zh ? "到" : "To"}</span>
            <input
              type="date"
              value={state.generatedTo}
              onChange={(event) => replaceSearchState({ generatedTo: event.target.value })}
              className="min-w-0 flex-1 bg-transparent text-sm text-slate-800 outline-none"
            />
          </label>
        </div>

        {activeFilters.length ? (
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              <SlidersHorizontal size={13} /> {zh ? "当前筛选" : "Active filters"}
            </span>
            {activeFilters.map((filter) => (
              <button
                key={filter.key}
                type="button"
                onClick={() => replaceSearchState({ [filter.key]: "" })}
                className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-200"
              >
                {filter.label} <X size={12} />
              </button>
            ))}
            <button
              type="button"
              onClick={clearAllFilters}
              className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-100"
            >
              <FilterX size={13} /> {zh ? "清除全部筛选" : "Clear all filters"}
            </button>
          </div>
        ) : null}
      </section>

      {!state.q ? (
        <section className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-10 text-center text-sm text-slate-500">
          {zh
            ? "输入关键词开始搜索。不会为填满结果而制造匹配。"
            : "Enter a query to search. This surface never fabricates matches to fill a result set."}
        </section>
      ) : loading ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
          <Loader2 className="mx-auto mb-3 animate-spin" size={22} />
          {zh ? "正在组合完整搜索结果…" : "Composing the complete search result…"}
        </section>
      ) : error ? (
        <section className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-800">
          {error}
        </section>
      ) : result?.items.length ? (
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4 text-xs text-slate-500">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-slate-700">
                {result.search.complete
                  ? zh
                    ? `精确结果 ${result.total} 条`
                    : `${result.total} exact results`
                  : zh
                    ? `已知候选 ${result.total} 条`
                    : `${result.total} known candidates`}
              </span>
              {range ? (
                <span>
                  · {range.start}–{range.end}
                </span>
              ) : null}
            </div>
            <details className="relative">
              <summary className="cursor-pointer list-none rounded-lg px-2 py-1 text-[11px] font-semibold text-slate-500 hover:bg-slate-100">
                {zh ? "检索详情" : "Retrieval details"}
              </summary>
              <div className="absolute right-0 z-10 mt-2 w-80 rounded-xl border border-slate-200 bg-white p-3 text-[10px] leading-5 text-slate-500 shadow-lg">
                <div>{result.search.mode}</div>
                <div>{result.search.indexMode}</div>
                <div>{result.search.totalSemantics}</div>
                <div>{result.search.dateSemantics}</div>
                <div>graph rank = off · vector = off</div>
              </div>
            </details>
          </div>
          <div className="divide-y divide-slate-100">
            {result.items.map((item) => {
              const externalUrl = sourceUrl(item);
              return (
                <article key={item.id} className="p-5 sm:p-6">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="font-semibold text-slate-950">{item.title}</h2>
                        {item.searchMatch.channels.map((channel) => (
                          <span
                            key={channel}
                            className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600"
                          >
                            {channel === "FULL_TEXT"
                              ? zh
                                ? "全文"
                                : "Full text"
                              : zh
                                ? "元数据"
                                : "Metadata"}
                          </span>
                        ))}
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        {item.source?.name ?? "—"} ·{" "}
                        {item.artifact?.originalName ?? item.targetPath} · {item.status} ·{" "}
                        {new Date(item.generatedAt).toLocaleDateString(zh ? "zh-CN" : "en-US")}
                      </p>
                      {item.searchMatch.fullText ? (
                        <div className="mt-3 rounded-xl border border-emerald-100 bg-emerald-50/50 p-3">
                          <p className="text-xs leading-5 text-slate-700">
                            {item.searchMatch.fullText.snippet}
                          </p>
                          <details className="mt-2 text-[10px] text-emerald-800">
                            <summary className="cursor-pointer font-semibold">
                              {zh ? "匹配依据" : "Match evidence"}
                            </summary>
                            <div className="mt-1 leading-5">
                              <div>{item.searchMatch.fullText.indexMode}</div>
                              <div>score {item.searchMatch.fullText.score.toFixed(4)}</div>
                              {item.searchMatch.fullText.headingPath.length ? (
                                <div>{item.searchMatch.fullText.headingPath.join(" › ")}</div>
                              ) : null}
                            </div>
                          </details>
                        </div>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      <Link
                        href={knowledgeWorkspaceHref(
                          `/knowledge/${encodeURIComponent(item.id)}`,
                          workspaceId,
                        )}
                        className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-3.5 py-2 text-xs font-semibold text-white"
                      >
                        <BookOpen size={14} /> {zh ? "检查证据" : "Inspect evidence"}
                      </Link>
                      {externalUrl ? (
                        <a
                          href={externalUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-3.5 py-2 text-xs font-semibold text-slate-700"
                        >
                          <ExternalLink size={14} /> {zh ? "打开来源" : "Open source"}
                        </a>
                      ) : null}
                      <Link
                        href={knowledgeWorkspaceHref(
                          `/knowledge/${encodeURIComponent(item.id)}#knowledge-graph`,
                          workspaceId,
                        )}
                        className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-3.5 py-2 text-xs font-semibold text-slate-700"
                      >
                        <Network size={14} /> {zh ? "继续调查" : "Continue with graph"}
                      </Link>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-slate-200 px-5 py-4">
            <button
              type="button"
              disabled={!hasPrevious}
              onClick={() =>
                replaceSearchState(
                  { offset: Math.max(0, state.offset - KNOWLEDGE_SEARCH_PAGE_LIMIT) },
                  false,
                )
              }
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft size={14} /> {zh ? "上一页" : "Previous"}
            </button>
            <span className="text-xs text-slate-400">
              {range ? `${range.start}–${range.end} / ${result.total}` : null}
            </span>
            <button
              type="button"
              disabled={!hasNext}
              onClick={() =>
                replaceSearchState({ offset: state.offset + KNOWLEDGE_SEARCH_PAGE_LIMIT }, false)
              }
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {zh ? "下一页" : "Next"} <ChevronRight size={14} />
            </button>
          </div>
        </section>
      ) : (
        <section className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center">
          <p className="text-sm font-semibold text-slate-700">
            {zh ? "没有找到真实匹配。" : "No real matches found."}
          </p>
          <p className="mx-auto mt-2 max-w-xl text-xs leading-5 text-slate-500">
            {zh
              ? "可以放宽状态、载体、地区或日期范围；系统不会为了填满列表而伪造候选结果。"
              : "Broaden status, artifact kind, jurisdiction, or date filters. The system will not fabricate candidates to fill the list."}
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {activeFilters.length ? (
              <button
                type="button"
                onClick={clearAllFilters}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700"
              >
                <FilterX size={14} /> {zh ? "清除筛选" : "Clear filters"}
              </button>
            ) : null}
            <button
              type="button"
              onClick={resetSearch}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-3.5 py-2 text-xs font-semibold text-white"
            >
              <Search size={14} /> {zh ? "重置搜索" : "Reset search"}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
