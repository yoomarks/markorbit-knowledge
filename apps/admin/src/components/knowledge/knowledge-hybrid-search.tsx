"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { BookOpen, Loader2, Network, Search } from "lucide-react";
import { useAdminI18n } from "@/lib/i18n";

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
  } | null;
  artifact: {
    originalName: string;
    artifactKind: string;
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
    truncated: boolean;
    truncationReasons: Array<"METADATA_SCAN_LIMIT" | "FULL_TEXT_HIT_LIMIT">;
    limits: { metadataScan: number; fullTextHits: number };
  };
  query: string;
  items: SearchItem[];
  total: number;
  filters: {
    sources: Array<{ id: string; name: string; jurisdictions: string[] }>;
    jurisdictions: string[];
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

export function KnowledgeHybridSearch({ workspaceId }: { workspaceId: string }) {
  const { locale } = useAdminI18n();
  const zh = locale === "zh-CN";
  const [q, setQ] = useState("");
  const [sourceId, setSourceId] = useState("");
  const [jurisdiction, setJurisdiction] = useState("");
  const [result, setResult] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const query = useMemo(() => {
    if (!q.trim()) return null;
    const params = new URLSearchParams({ workspaceId, q: q.trim(), limit: "50" });
    if (sourceId) params.set("sourceId", sourceId);
    if (jurisdiction) params.set("jurisdiction", jurisdiction);
    return params.toString();
  }, [jurisdiction, q, sourceId, workspaceId]);

  useEffect(() => {
    if (!query) {
      setResult(null);
      setError(null);
      setLoading(false);
      return;
    }
    let active = true;
    const timer = window.setTimeout(() => {
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
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [query, zh]);

  const sourceOptions = result?.filters.sources ?? [];
  const jurisdictionOptions = result?.filters.jurisdictions ?? [];

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-700">
            <Search size={18} />
          </span>
          <div>
            <h1 className="text-lg font-semibold text-slate-950">
              {zh ? "Knowledge 混合搜索" : "Knowledge Hybrid Search"}
            </h1>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">
              {zh
                ? "组合现有元数据匹配与 SQLite FTS5/BM25 全文检索；关系图仅用于命中后的客观导航，不参与排序，也不声称向量搜索。"
                : "Combines existing metadata matching with SQLite FTS5/BM25 full-text retrieval. The content graph is navigation only: it never affects rank and this surface does not claim vector search."}
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(12rem,0.7fr)_minmax(12rem,0.7fr)]">
          <label className="relative">
            <Search className="absolute left-3 top-3 text-slate-400" size={17} />
            <input
              value={q}
              onChange={(event) => setQ(event.target.value)}
              placeholder={
                zh
                  ? "搜索标题、来源、文件名或正文内容"
                  : "Search metadata or indexed document content"
              }
              className="w-full rounded-xl border border-slate-300 py-2.5 pl-10 pr-3 text-sm"
            />
          </label>
          <select
            value={sourceId}
            onChange={(event) => setSourceId(event.target.value)}
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
            value={jurisdiction}
            onChange={(event) => setJurisdiction(event.target.value)}
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
      </section>

      {!q.trim() ? (
        <section className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-10 text-center text-sm text-slate-500">
          {zh
            ? "输入关键词开始搜索。空查询仍使用原有 Knowledge 列表浏览，不改变既有行为。"
            : "Enter a query to search. Blank-query browsing remains the existing Knowledge list experience."}
        </section>
      ) : loading ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
          <Loader2 className="mx-auto mb-3 animate-spin" size={22} />
          {zh ? "正在组合搜索结果…" : "Composing search results…"}
        </section>
      ) : error ? (
        <section className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-800">
          {error}
        </section>
      ) : result?.items.length ? (
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4 text-xs text-slate-500">
            <div className="flex flex-wrap items-center gap-2">
              <span>
                {result.total} {zh ? "个去重后的内容结果" : "deduplicated content results"}
              </span>
              {result.search.truncated ? (
                <span
                  title={result.search.truncationReasons.join(", ")}
                  className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800"
                >
                  {zh ? "候选窗口已截断" : "Candidate window truncated"}
                </span>
              ) : null}
            </div>
            <span className="font-mono text-[10px] text-slate-400">
              {result.search.mode} · graph rank = off · vector = off
            </span>
          </div>
          <div className="divide-y divide-slate-100">
            {result.items.map((item) => (
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
                          {channel}
                        </span>
                      ))}
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {item.source?.name ?? "—"} · {item.artifact?.originalName ?? item.targetPath}{" "}
                      · {item.status}
                    </p>
                    {item.searchMatch.fullText ? (
                      <div className="mt-3 rounded-xl border border-emerald-100 bg-emerald-50/50 p-3">
                        <div className="flex flex-wrap items-center gap-2 text-[10px] font-medium text-emerald-800">
                          <span>{item.searchMatch.fullText.indexMode}</span>
                          <span>score {item.searchMatch.fullText.score.toFixed(4)}</span>
                          {item.searchMatch.fullText.headingPath.length ? (
                            <span>{item.searchMatch.fullText.headingPath.join(" › ")}</span>
                          ) : null}
                        </div>
                        <p className="mt-1.5 text-xs leading-5 text-slate-700">
                          {item.searchMatch.fullText.snippet}
                        </p>
                      </div>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <Link
                      href={`/knowledge/${encodeURIComponent(item.id)}`}
                      className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-3.5 py-2 text-xs font-semibold text-white"
                    >
                      <BookOpen size={14} /> {zh ? "打开 Reader" : "Open Reader"}
                    </Link>
                    <Link
                      href={`/knowledge/${encodeURIComponent(item.id)}#knowledge-graph`}
                      className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-3.5 py-2 text-xs font-semibold text-slate-700"
                    >
                      <Network size={14} /> {zh ? "关系图" : "Graph"}
                    </Link>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : (
        <section className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-10 text-center text-sm text-slate-500">
          {zh ? "没有找到匹配内容。" : "No matching Knowledge content."}
        </section>
      )}
    </div>
  );
}
