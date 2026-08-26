"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, Link2, Loader2 } from "lucide-react";
import { useAdminI18n } from "@/lib/i18n";

type RelationshipItem = {
  direction: "OUTGOING" | "INCOMING";
  relationType: string;
  origin: string;
  evidenceRef?: string;
  algorithm?: { id: string; version: string };
  content: {
    objectId: string;
    objectKind: string;
    workspaceId: string;
    title?: string;
    readerHref?: string;
    sourceName?: string;
    version?: number;
    jurisdictions: string[];
    facets: Array<{
      facetType: string;
      value: string;
      origin: string;
      evidenceRef?: string;
    }>;
  };
};

type RelationshipResponse = {
  protocolVersion: "1.0";
  related: RelationshipItem[];
  backlinks: RelationshipItem[];
  truncated: boolean;
};

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: string }; message?: string };
    return body.error?.message ?? body.message ?? `Request failed (${response.status})`;
  } catch {
    return `Request failed (${response.status})`;
  }
}

function RelationshipCard({ item, incoming }: { item: RelationshipItem; incoming: boolean }) {
  const label = item.content.title ?? item.content.objectId;
  const metadata = [
    item.content.sourceName,
    item.content.jurisdictions.join(", ") || undefined,
    item.content.version === undefined ? undefined : `v${item.content.version}`,
    item.content.objectKind,
  ].filter(Boolean);
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="break-words text-sm font-semibold text-slate-900">{label}</p>
          <p className="mt-1 break-all font-mono text-[10px] text-slate-400">
            {item.content.objectId}
          </p>
        </div>
        {incoming ? (
          <ArrowDownLeft className="shrink-0 text-violet-500" size={16} />
        ) : (
          <ArrowUpRight className="shrink-0 text-emerald-600" size={16} />
        )}
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-600">
          {item.relationType}
        </span>
        <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] text-slate-500">
          {item.origin}
        </span>
        {item.algorithm ? (
          <span className="rounded-full bg-amber-50 px-2 py-1 text-[10px] text-amber-700">
            {item.algorithm.id}@{item.algorithm.version}
          </span>
        ) : null}
      </div>
      {metadata.length ? (
        <p className="mt-3 text-xs leading-5 text-slate-500">{metadata.join(" · ")}</p>
      ) : null}
      {item.evidenceRef ? (
        <p className="mt-2 break-all text-[10px] leading-4 text-slate-400">
          evidence: {item.evidenceRef}
        </p>
      ) : null}
    </>
  );

  return item.content.readerHref ? (
    <Link
      href={item.content.readerHref}
      className="block rounded-xl border border-slate-200 bg-white p-4 transition hover:border-emerald-300 hover:shadow-sm"
    >
      {body}
    </Link>
  ) : (
    <div className="rounded-xl border border-slate-200 bg-white p-4">{body}</div>
  );
}

export function ContentRelationshipPanel({
  documentId,
  workspaceId,
}: {
  documentId: string;
  workspaceId: string;
}) {
  const { locale } = useAdminI18n();
  const zh = locale === "zh-CN";
  const [data, setData] = useState<RelationshipResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      try {
        const response = await fetch(
          `/api/knowledge/${encodeURIComponent(documentId)}/relationships?workspaceId=${encodeURIComponent(workspaceId)}`,
          { cache: "no-store" },
        );
        if (!response.ok) throw new Error(await readError(response));
        const value = (await response.json()) as RelationshipResponse;
        if (active) {
          setData(value);
          setError(null);
        }
      } catch (requestError) {
        if (active)
          setError(
            requestError instanceof Error
              ? requestError.message
              : zh
                ? "无法读取内容关系"
                : "Unable to load relationships",
          );
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [documentId, workspaceId, zh]);

  return (
    <section className="rounded-2xl border border-slate-200 bg-slate-50/70 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Link2 size={17} className="text-emerald-700" />
            <h2 className="text-base font-semibold text-slate-950">
              {zh ? "相关内容与反向链接" : "Related & Backlinks"}
            </h2>
          </div>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            {zh
              ? "仅展示内容到内容的显式/系统关系；不进行实体推断或相关性打分。"
              : "Content-to-content navigation only; no entity inference or relevance scoring."}
          </p>
        </div>
        {data?.truncated ? (
          <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-semibold text-amber-800">
            {zh ? "关系窗口已截断" : "Neighborhood truncated"}
          </span>
        ) : null}
      </div>

      {loading ? (
        <div className="mt-5 flex items-center gap-2 text-sm text-slate-500">
          <Loader2 size={15} className="animate-spin" />
          {zh ? "正在读取关系…" : "Loading relationships…"}
        </div>
      ) : error ? (
        <p className="mt-5 text-sm text-rose-700">{error}</p>
      ) : data ? (
        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <div>
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                {zh ? "相关内容" : "Related"}
              </h3>
              <span className="text-xs text-slate-400">{data.related.length}</span>
            </div>
            <div className="mt-3 space-y-3">
              {data.related.length ? (
                data.related.map((item, index) => (
                  <RelationshipCard
                    key={`${item.content.objectKind}:${item.content.objectId}:${item.relationType}:${index}`}
                    item={item}
                    incoming={false}
                  />
                ))
              ) : (
                <p className="rounded-xl border border-dashed border-slate-200 bg-white p-4 text-xs text-slate-500">
                  {zh ? "暂无 outgoing 内容关系。" : "No outgoing content relationships yet."}
                </p>
              )}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                {zh ? "反向链接" : "Backlinks"}
              </h3>
              <span className="text-xs text-slate-400">{data.backlinks.length}</span>
            </div>
            <div className="mt-3 space-y-3">
              {data.backlinks.length ? (
                data.backlinks.map((item, index) => (
                  <RelationshipCard
                    key={`${item.content.objectKind}:${item.content.objectId}:${item.relationType}:${index}`}
                    item={item}
                    incoming
                  />
                ))
              ) : (
                <p className="rounded-xl border border-dashed border-slate-200 bg-white p-4 text-xs text-slate-500">
                  {zh ? "暂无 incoming backlinks。" : "No incoming backlinks yet."}
                </p>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
