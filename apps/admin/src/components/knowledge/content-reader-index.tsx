"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BookOpen, Loader2, Search } from "lucide-react";
import { useAdminI18n } from "@/lib/i18n";

type ReaderIndexItem = {
  id: string;
  title: string;
  status: "GENERATED" | "READY" | "BLOCKED" | "ARCHIVED";
  updatedAt: string;
  source: { name: string } | null;
};

type ReaderIndexResponse = { items: ReaderIndexItem[] };

export function ContentReaderIndex({ workspaceId }: { workspaceId: string }) {
  const { locale } = useAdminI18n();
  const zh = locale === "zh-CN";
  const [items, setItems] = useState<ReaderIndexItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const params = new URLSearchParams({ workspaceId, offset: "0", limit: "5" });
        const response = await fetch(`/api/knowledge?${params.toString()}`, { cache: "no-store" });
        if (!response.ok) return;
        const result = (await response.json()) as ReaderIndexResponse;
        if (active) setItems(result.items);
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [workspaceId]);

  if (!loading && items.length === 0) return null;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <BookOpen size={17} className="text-emerald-700" />
          <div>
            <h2 className="text-sm font-semibold text-slate-950">
              {zh ? "内容阅读器" : "Content Reader"}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              {zh
                ? "最近进入 Knowledge 的资料，可直接打开阅读。"
                : "Open recently acquired Knowledge documents in the native reader."}
            </p>
          </div>
        </div>
        <Link
          href="/knowledge/search"
          className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-emerald-300 hover:text-emerald-800"
        >
          <Search size={14} /> {zh ? "混合搜索" : "Hybrid search"}
        </Link>
      </div>
      {loading ? (
        <div className="mt-4 flex items-center gap-2 text-xs text-slate-500">
          <Loader2 size={14} className="animate-spin" /> {zh ? "正在读取…" : "Loading…"}
        </div>
      ) : (
        <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-5">
          {items.map((item) => (
            <Link
              key={item.id}
              href={`/knowledge/${encodeURIComponent(item.id)}`}
              className="min-w-0 rounded-xl border border-slate-200 px-3 py-3 transition hover:border-emerald-300 hover:bg-emerald-50/40"
            >
              <p className="truncate text-xs font-semibold text-slate-900">{item.title}</p>
              <p className="mt-1 truncate text-[11px] text-slate-500">{item.source?.name ?? "—"}</p>
              <p className="mt-2 text-[10px] font-medium text-slate-400">{item.status}</p>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
