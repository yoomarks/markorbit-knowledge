"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FileText,
  Loader2,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { useAdminI18n } from "@/lib/i18n";
import { useModalDialog } from "@/lib/use-modal-dialog";

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

type KnowledgeDetail = KnowledgeItem & {
  content: string;
  createdAt: string;
  source: KnowledgeItem["source"] & { entrypoints?: Array<{ uri: string; label?: string }> };
  artifact: KnowledgeItem["artifact"] & { contentHash?: { algorithm: string; value: string } };
};

const PAGE_SIZE = 20;

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KiB`;
  return `${(value / 1024 / 1024).toFixed(1)} MiB`;
}

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
    view: zh ? "查看资料" : "View document",
    noData: zh ? "目前还没有进入知识库的资料" : "No acquired knowledge is available yet",
    noDataHint: zh
      ? "批准来源并完成采集、转换后，资料会自动出现在这里。"
      : "Approve sources and complete collection/conversion; resulting documents will appear here automatically.",
    page: zh ? "页" : "Page",
    original: zh ? "原始证据" : "Original evidence",
    provenance: zh ? "来源证据" : "Provenance",
    sourcePage: zh ? "查看来源" : "View source",
    originalFile: zh ? "打开原始文件" : "Open original file",
    close: zh ? "关闭" : "Close",
    content: zh ? "转换后的正文" : "Converted content",
    validation: zh ? "验证" : "Validation",
    capturedAt: zh ? "采集于" : "Captured",
    publishedAt: zh ? "发布于" : "Published",
  };

  const [result, setResult] = useState<KnowledgeListResponse | null>(null);
  const [q, setQ] = useState("");
  const [sourceId, setSourceId] = useState("");
  const [jurisdiction, setJurisdiction] = useState("");
  const [artifactKind, setArtifactKind] = useState("");
  const [status, setStatus] = useState("");
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<KnowledgeDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const detailDialogRef = useRef<HTMLElement>(null);
  const detailCloseRef = useRef<HTMLButtonElement>(null);
  const closeDetail = useCallback(() => {
    setSelectedId(null);
    setDetail(null);
  }, []);

  useModalDialog({
    open: Boolean(selectedId),
    dialogRef: detailDialogRef,
    initialFocusRef: detailCloseRef,
    onClose: closeDetail,
  });

  const query = useMemo(() => {
    const params = new URLSearchParams({
      workspaceId,
      offset: String(offset),
      limit: String(PAGE_SIZE),
    });
    if (q.trim()) params.set("q", q.trim());
    if (sourceId) params.set("sourceId", sourceId);
    if (jurisdiction) params.set("jurisdiction", jurisdiction);
    if (artifactKind) params.set("artifactKind", artifactKind);
    if (status) params.set("status", status);
    return params.toString();
  }, [artifactKind, jurisdiction, offset, q, sourceId, status, workspaceId]);

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

  async function openDetail(id: string) {
    setSelectedId(id);
    setDetail(null);
    setDetailLoading(true);
    try {
      const response = await fetch(
        `/api/knowledge/${encodeURIComponent(id)}?workspaceId=${encodeURIComponent(workspaceId)}`,
        { cache: "no-store" },
      );
      if (!response.ok) throw new Error(await readError(response));
      setDetail((await response.json()) as KnowledgeDetail);
      setError(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to load document");
    } finally {
      setDetailLoading(false);
    }
  }

  function resetPage(action: () => void) {
    setOffset(0);
    action();
  }

  const totalPages = Math.max(1, Math.ceil((result?.total ?? 0) / PAGE_SIZE));
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

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
                value={q}
                onChange={(event) => resetPage(() => setQ(event.target.value))}
                placeholder={copy.search}
                aria-label={copy.search}
                className="w-full rounded-xl border border-slate-300 py-2.5 pl-10 pr-3 text-sm"
              />
            </label>
            <select
              value={sourceId}
              onChange={(event) => resetPage(() => setSourceId(event.target.value))}
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
              value={jurisdiction}
              onChange={(event) => resetPage(() => setJurisdiction(event.target.value))}
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
              value={artifactKind}
              onChange={(event) => resetPage(() => setArtifactKind(event.target.value))}
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
              value={status}
              onChange={(event) => resetPage(() => setStatus(event.target.value))}
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
            {locale === "zh-CN" ? "正在读取知识资料…" : "Loading knowledge…"}
          </div>
        ) : result?.items.length ? (
          <div className="divide-y divide-slate-100">
            {result.items.map((item) => (
              <article key={item.id} className="p-5 sm:p-6">
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
                    <button
                      type="button"
                      onClick={() => void openDetail(item.id)}
                      className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-3.5 py-2 text-xs font-semibold text-white"
                    >
                      <BookOpen size={15} /> {copy.view}
                    </button>
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
              {locale === "zh-CN" ? "前往来源管理 →" : "Go to Sources →"}
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
              disabled={offset === 0 || loading}
              onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
              className="rounded-lg border border-slate-300 p-2 disabled:opacity-40"
              aria-label="Previous page"
            >
              <ChevronLeft size={17} />
            </button>
            <button
              type="button"
              disabled={loading || offset + PAGE_SIZE >= (result?.total ?? 0)}
              onClick={() => setOffset(offset + PAGE_SIZE)}
              className="rounded-lg border border-slate-300 p-2 disabled:opacity-40"
              aria-label="Next page"
            >
              <ChevronRight size={17} />
            </button>
          </div>
        </div>
      </section>

      {selectedId ? (
        <div className="fixed inset-0 z-50 flex items-stretch justify-end bg-slate-950/35">
          <button
            type="button"
            className="absolute inset-0 cursor-default"
            aria-label={copy.close}
            onClick={closeDetail}
          />
          <aside
            ref={detailDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="knowledge-detail-title"
            tabIndex={-1}
            className="relative z-10 h-full w-full max-w-3xl overflow-y-auto bg-white shadow-2xl"
          >
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white/95 px-5 py-4 backdrop-blur">
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-wide text-emerald-700">
                  Knowledge
                </p>
                <h2
                  id="knowledge-detail-title"
                  className="mt-1 truncate font-semibold text-slate-950"
                >
                  {detail?.title ?? (zh ? "正在读取…" : "Loading…")}
                </h2>
              </div>
              <button
                ref={detailCloseRef}
                type="button"
                onClick={closeDetail}
                className="rounded-xl border border-slate-200 p-2 text-slate-600"
                aria-label={copy.close}
              >
                <X size={18} />
              </button>
            </div>

            {detailLoading || !detail ? (
              <div
                role="status"
                aria-live="polite"
                aria-busy="true"
                className="p-12 text-center text-sm text-slate-500"
              >
                <Loader2 className="mx-auto mb-3 animate-spin" size={22} />
                {locale === "zh-CN" ? "正在读取资料…" : "Loading document…"}
              </div>
            ) : (
              <div className="space-y-5 p-5 sm:p-6">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl bg-slate-50 p-4 text-sm">
                    <p className="text-xs text-slate-400">{copy.source}</p>
                    <p className="mt-1 font-medium text-slate-900">{detail.source?.name ?? "—"}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {detail.source?.jurisdictions.join(", ") || "—"} ·{" "}
                      {detail.source?.category ?? "—"}
                    </p>
                    {detail.source ? (
                      <Link
                        href={`/sources/${detail.source.id}`}
                        className="mt-3 inline-flex text-xs font-semibold text-emerald-700"
                      >
                        {copy.sourcePage} →
                      </Link>
                    ) : null}
                  </div>
                  <div className="rounded-xl bg-slate-50 p-4 text-sm">
                    <p className="text-xs text-slate-400">{copy.original}</p>
                    <p className="mt-1 font-medium text-slate-900">
                      {detail.artifact?.originalName ?? "—"}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {detail.artifact?.artifactKind ?? "—"} ·{" "}
                      {formatBytes(detail.artifact?.sizeBytes ?? 0)}
                    </p>
                    {detail.artifact ? (
                      <a
                        href={`/api/artifacts/${encodeURIComponent(detail.artifact.id)}/content`}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-emerald-700"
                      >
                        {copy.originalFile} <ExternalLink size={12} />
                      </a>
                    ) : null}
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 p-4 text-xs text-slate-600">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <p>
                      <span className="text-slate-400">{copy.capturedAt}: </span>
                      {detail.artifact?.capturedAt
                        ? new Date(detail.artifact.capturedAt).toLocaleString(locale)
                        : "—"}
                    </p>
                    <p>
                      <span className="text-slate-400">{copy.publishedAt}: </span>
                      {detail.artifact?.publishedAt
                        ? new Date(detail.artifact.publishedAt).toLocaleString(locale)
                        : "—"}
                    </p>
                    <p>
                      <span className="text-slate-400">{copy.validation}: </span>
                      {detail.validation.outcome}
                    </p>
                    <p className="truncate">
                      <span className="text-slate-400">{copy.provenance}: </span>
                      {detail.artifact?.sourceUri ?? "—"}
                    </p>
                  </div>
                </div>

                <section>
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="font-semibold text-slate-950">{copy.content}</h3>
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusTone(detail.status)}`}
                    >
                      {detail.status}
                    </span>
                  </div>
                  <pre className="whitespace-pre-wrap break-words rounded-xl border border-slate-200 bg-slate-50 p-4 font-sans text-sm leading-7 text-slate-700">
                    {detail.content}
                  </pre>
                </section>
              </div>
            )}
          </aside>
        </div>
      ) : null}
    </div>
  );
}
