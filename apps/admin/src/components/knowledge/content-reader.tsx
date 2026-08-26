"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ExternalLink, FileText, Loader2 } from "lucide-react";
import { useAdminI18n } from "@/lib/i18n";
import { buildKnowledgeReaderModel, type KnowledgeReaderBlock } from "./content-reader-model";

type KnowledgeReaderDetail = {
  id: string;
  title: string;
  content: string;
  targetPath: string;
  outputFormat: string;
  status: "GENERATED" | "READY" | "BLOCKED" | "ARCHIVED";
  validation: { outcome: string; warnings: string[] };
  generatedAt: string;
  createdAt: string;
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
    entrypoints: Array<{ uri: string; label?: string }>;
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
    contentHash: { algorithm: string; value: string };
  } | null;
};

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

function ReaderBlock({ block }: { block: KnowledgeReaderBlock }) {
  if (block.kind === "heading") {
    if (block.level === 1)
      return <h1 className="mt-8 text-3xl font-semibold tracking-tight text-slate-950">{block.text}</h1>;
    if (block.level === 2)
      return <h2 className="mt-8 text-2xl font-semibold tracking-tight text-slate-950">{block.text}</h2>;
    return <h3 className="mt-6 text-lg font-semibold text-slate-900">{block.text}</h3>;
  }
  if (block.kind === "bullet") {
    return (
      <ul className="my-5 list-disc space-y-2 pl-6 text-[15px] leading-7 text-slate-700">
        {block.items.map((item, index) => (
          <li key={`${index}:${item}`}>{item}</li>
        ))}
      </ul>
    );
  }
  if (block.kind === "quote") {
    return (
      <blockquote className="my-5 border-l-4 border-emerald-200 bg-emerald-50/60 px-4 py-3 text-[15px] leading-7 text-slate-700">
        {block.text}
      </blockquote>
    );
  }
  if (block.kind === "divider") return <hr className="my-8 border-slate-200" />;
  return <p className="my-4 text-[15px] leading-8 text-slate-700">{block.text}</p>;
}

export function ContentReader({ documentId, workspaceId }: { documentId: string; workspaceId: string }) {
  const { locale } = useAdminI18n();
  const zh = locale === "zh-CN";
  const [detail, setDetail] = useState<KnowledgeReaderDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      try {
        const response = await fetch(
          `/api/knowledge/${encodeURIComponent(documentId)}?workspaceId=${encodeURIComponent(workspaceId)}`,
          { cache: "no-store" },
        );
        if (!response.ok) throw new Error(await readError(response));
        const value = (await response.json()) as KnowledgeReaderDetail;
        if (active) {
          setDetail(value);
          setError(null);
        }
      } catch (requestError) {
        if (active)
          setError(requestError instanceof Error ? requestError.message : "Unable to load document");
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [documentId, workspaceId]);

  const model = useMemo(() => (detail ? buildKnowledgeReaderModel(detail.content) : null), [detail]);

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-14 text-center text-sm text-slate-500">
        <Loader2 className="mx-auto mb-3 animate-spin" size={22} />
        {zh ? "正在打开内容阅读器…" : "Opening content reader…"}
      </div>
    );
  }

  if (error || !detail || !model) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6">
        <p className="font-semibold text-rose-900">{zh ? "无法读取资料" : "Unable to read document"}</p>
        <p className="mt-2 text-sm text-rose-700">{error ?? "Document not available"}</p>
        <Link href="/knowledge" className="mt-4 inline-flex text-sm font-semibold text-rose-900">
          ← {zh ? "返回知识库" : "Back to Knowledge"}
        </Link>
      </div>
    );
  }

  const sourceUrl = detail.source?.canonicalUri ?? detail.artifact?.canonicalUri ?? detail.artifact?.sourceUri;
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4">
        <Link href="/knowledge" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-950">
          <ArrowLeft size={16} /> {zh ? "返回知识库" : "Back to Knowledge"}
        </Link>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">{detail.status}</span>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <article className="min-w-0 rounded-2xl border border-slate-200 bg-white px-6 py-7 sm:px-9 sm:py-9">
          <header className="border-b border-slate-100 pb-6">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">Knowledge · Content Reader</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">{detail.title}</h1>
            <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-500">
              <span>{detail.source?.name ?? (zh ? "未知来源" : "Unknown source")}</span>
              <span>{detail.source?.jurisdictions.join(", ") || "—"}</span>
              <span>{detail.artifact?.artifactKind ?? detail.outputFormat}</span>
              <span>v{detail.artifact?.version ?? 1}</span>
            </div>
          </header>

          <div className="mx-auto max-w-3xl pt-2">
            {model.blocks.length ? (
              model.blocks.map((block, index) => <ReaderBlock key={index} block={block} />)
            ) : (
              <p className="py-10 text-sm text-slate-500">{zh ? "正文为空" : "No readable body content"}</p>
            )}
          </div>
        </article>

        <aside className="space-y-4 xl:sticky xl:top-5 xl:self-start">
          <section className="rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-slate-950">{zh ? "来源与证据" : "Source & evidence"}</h2>
            <dl className="mt-4 space-y-3 text-xs">
              <div><dt className="text-slate-400">{zh ? "来源" : "Source"}</dt><dd className="mt-1 font-medium text-slate-800">{detail.source?.name ?? "—"}</dd></div>
              <div><dt className="text-slate-400">{zh ? "来源类型" : "Source type"}</dt><dd className="mt-1 text-slate-700">{detail.source?.sourceType ?? "—"}</dd></div>
              <div><dt className="text-slate-400">{zh ? "分类" : "Category"}</dt><dd className="mt-1 text-slate-700">{detail.source?.category ?? "—"}</dd></div>
              <div><dt className="text-slate-400">{zh ? "权限级别" : "Authority level"}</dt><dd className="mt-1 text-slate-700">{detail.source?.authorityLevel ?? "—"}</dd></div>
            </dl>
            <div className="mt-4 flex flex-wrap gap-2">
              {detail.source ? <Link href={`/sources/${detail.source.id}`} className="text-xs font-semibold text-emerald-700">{zh ? "来源详情" : "Source detail"} →</Link> : null}
              {sourceUrl ? <a href={sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">{zh ? "原始来源" : "Original source"} <ExternalLink size={11} /></a> : null}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-slate-950">{zh ? "原始证据" : "Original evidence"}</h2>
            <div className="mt-4 flex items-start gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-500"><FileText size={16} /></span>
              <div className="min-w-0">
                <p className="break-words text-xs font-medium text-slate-800">{detail.artifact?.originalName ?? "—"}</p>
                <p className="mt-1 text-xs text-slate-500">{detail.artifact ? `${detail.artifact.mimeType} · ${formatBytes(detail.artifact.sizeBytes)}` : "—"}</p>
              </div>
            </div>
            {detail.artifact ? <a href={`/api/artifacts/${encodeURIComponent(detail.artifact.id)}/content`} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">{zh ? "打开原始文件" : "Open original file"} <ExternalLink size={11} /></a> : null}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-slate-950">{zh ? "验证与溯源" : "Validation & provenance"}</h2>
            <dl className="mt-4 space-y-3 text-xs">
              <div><dt className="text-slate-400">{zh ? "验证结果" : "Validation"}</dt><dd className="mt-1 text-slate-700">{detail.validation.outcome}</dd></div>
              <div><dt className="text-slate-400">{zh ? "采集时间" : "Captured"}</dt><dd className="mt-1 text-slate-700">{detail.artifact?.capturedAt ? new Date(detail.artifact.capturedAt).toLocaleString(locale) : "—"}</dd></div>
              <div><dt className="text-slate-400">{zh ? "发布时间" : "Published"}</dt><dd className="mt-1 text-slate-700">{detail.artifact?.publishedAt ? new Date(detail.artifact.publishedAt).toLocaleString(locale) : "—"}</dd></div>
              <div><dt className="text-slate-400">SHA-256</dt><dd className="mt-1 break-all font-mono text-[10px] leading-4 text-slate-600">{detail.artifact?.contentHash?.value ?? "—"}</dd></div>
              <div><dt className="text-slate-400">Knowledge ID</dt><dd className="mt-1 break-all font-mono text-[10px] leading-4 text-slate-600">{detail.id}</dd></div>
            </dl>
          </section>
        </aside>
      </div>
    </div>
  );
}
