"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Archive, ChevronLeft, ChevronRight, Plus, Search } from "lucide-react";
import {
  AUTHORITY_LEVELS,
  SOURCE_CATEGORIES,
  SOURCE_STATUSES,
  SOURCE_TYPES,
  type SourceDefinition,
} from "@markorbit/contracts";
import type { SourceListResult } from "@markorbit/persistence";

const PAGE_SIZE = 20;

type Filters = {
  q: string;
  sourceType: string;
  category: string;
  authorityLevel: string;
  status: string;
  jurisdiction: string;
};

const initialFilters: Filters = {
  q: "",
  sourceType: "",
  category: "",
  authorityLevel: "",
  status: "",
  jurisdiction: "",
};

function label(value: string): string {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function StatusBadge({ status }: { status: SourceDefinition["status"] }) {
  const classes: Record<SourceDefinition["status"], string> = {
    DRAFT: "bg-slate-100 text-slate-700",
    ACTIVE: "bg-emerald-50 text-emerald-700",
    PAUSED: "bg-amber-50 text-amber-800",
    ERROR: "bg-rose-50 text-rose-700",
    ARCHIVED: "bg-slate-200 text-slate-600",
  };
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${classes[status]}`}>
      {status}
    </span>
  );
}

export function SourceList() {
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [offset, setOffset] = useState(0);
  const [result, setResult] = useState<SourceListResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const query = useMemo(() => {
    const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset) });
    for (const [key, value] of Object.entries(filters)) {
      if (value.trim()) params.set(key, value.trim());
    }
    return params.toString();
  }, [filters, offset]);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/sources?${query}`, { signal: controller.signal })
      .then(async (response) => {
        const body = (await response.json()) as SourceListResult | { error?: { message?: string } };
        if (!response.ok) {
          const message = "error" in body ? body.error?.message : undefined;
          throw new Error(message ?? "Unable to load sources");
        }
        setResult(body as SourceListResult);
      })
      .catch((requestError: unknown) => {
        if (requestError instanceof DOMException && requestError.name === "AbortError") return;
        setError(requestError instanceof Error ? requestError.message : "Unable to load sources");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [query]);

  function beginRequest() {
    setLoading(true);
    setError(null);
  }

  function updateFilter(key: keyof Filters, value: string) {
    beginRequest();
    setOffset(0);
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function changePage(nextOffset: number) {
    beginRequest();
    setOffset(nextOffset);
  }

  const summary = result?.summary;
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;
  const totalPages = Math.max(1, Math.ceil((result?.total ?? 0) / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        {[
          ["全部", summary?.total ?? 0],
          ["启用", summary?.ACTIVE ?? 0],
          ["草稿", summary?.DRAFT ?? 0],
          ["暂停", summary?.PAUSED ?? 0],
          ["异常", summary?.ERROR ?? 0],
          ["归档", summary?.ARCHIVED ?? 0],
        ].map(([title, count]) => (
          <div key={String(title)} className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-medium text-slate-500">{title}</p>
            <p className="mt-2 text-2xl font-semibold text-slate-950">{count}</p>
          </div>
        ))}
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 p-4 sm:p-5">
          <div className="grid gap-3 lg:grid-cols-6">
            <label className="relative lg:col-span-2">
              <span className="sr-only">搜索数据源</span>
              <Search
                className="absolute left-3 top-3 text-slate-400"
                size={17}
                aria-hidden="true"
              />
              <input
                className="w-full rounded-xl border border-slate-300 py-2.5 pl-10 pr-3 text-sm"
                placeholder="搜索名称、Slug 或 URL"
                value={filters.q}
                onChange={(event) => updateFilter("q", event.target.value)}
              />
            </label>
            <FilterSelect
              label="类型"
              value={filters.sourceType}
              values={SOURCE_TYPES}
              onChange={(value) => updateFilter("sourceType", value)}
            />
            <FilterSelect
              label="分类"
              value={filters.category}
              values={SOURCE_CATEGORIES}
              onChange={(value) => updateFilter("category", value)}
            />
            <FilterSelect
              label="权威等级"
              value={filters.authorityLevel}
              values={AUTHORITY_LEVELS}
              onChange={(value) => updateFilter("authorityLevel", value)}
            />
            <FilterSelect
              label="状态"
              value={filters.status}
              values={SOURCE_STATUSES}
              onChange={(value) => updateFilter("status", value)}
            />
          </div>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <input
              className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm sm:max-w-xs"
              placeholder="国家或地区代码，例如 US、EU、WIPO"
              value={filters.jurisdiction}
              onChange={(event) => updateFilter("jurisdiction", event.target.value.toUpperCase())}
            />
            <Link
              href="/sources/new"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-medium text-white"
            >
              <Plus size={17} aria-hidden="true" />
              新建数据源
            </Link>
          </div>
        </div>

        {error ? (
          <div className="m-5 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
            {error}
          </div>
        ) : null}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3 font-medium">名称</th>
                <th className="px-5 py-3 font-medium">类型 / 分类</th>
                <th className="px-5 py-3 font-medium">国家地区</th>
                <th className="px-5 py-3 font-medium">Connector</th>
                <th className="px-5 py-3 font-medium">状态</th>
                <th className="px-5 py-3 font-medium">更新时间</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {result?.items.map((source) => (
                <tr key={source.id} className="hover:bg-slate-50">
                  <td className="px-5 py-4">
                    <Link
                      href={`/sources/${source.id}`}
                      className="font-medium text-slate-950 hover:text-emerald-700"
                    >
                      {source.name}
                    </Link>
                    <p className="mt-1 text-xs text-slate-500">{source.slug}</p>
                  </td>
                  <td className="px-5 py-4 text-slate-700">
                    <p>{source.sourceType}</p>
                    <p className="mt-1 text-xs text-slate-500">{label(source.category)}</p>
                  </td>
                  <td className="px-5 py-4 text-slate-700">
                    {source.jurisdictions.join(", ") || "—"}
                  </td>
                  <td className="px-5 py-4 text-slate-700">
                    <p>{source.connector.connectorId}</p>
                    <p className="mt-1 text-xs text-slate-500">v{source.connector.version}</p>
                  </td>
                  <td className="px-5 py-4">
                    <StatusBadge status={source.status} />
                  </td>
                  <td className="px-5 py-4 text-slate-500">
                    {new Date(source.updatedAt).toLocaleString("zh-CN")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!loading && result?.items.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <Archive className="mx-auto text-slate-400" size={30} aria-hidden="true" />
            <h2 className="mt-4 font-semibold text-slate-950">尚无匹配的数据源</h2>
            <p className="mt-2 text-sm text-slate-500">
              清除筛选条件，或创建第一个真实 SourceDefinition。
            </p>
          </div>
        ) : null}

        {loading ? (
          <div className="px-6 py-12 text-center text-sm text-slate-500">
            正在读取 Source Registry…
          </div>
        ) : null}

        <div className="flex items-center justify-between border-t border-slate-200 px-5 py-4 text-sm">
          <p className="text-slate-500">
            第 {currentPage} / {totalPages} 页 · 共 {result?.total ?? 0} 条
          </p>
          <div className="flex gap-2">
            <button
              className="rounded-lg border border-slate-300 p-2 disabled:cursor-not-allowed disabled:opacity-40"
              disabled={offset === 0 || loading}
              onClick={() => changePage(Math.max(0, offset - PAGE_SIZE))}
              aria-label="上一页"
            >
              <ChevronLeft size={17} aria-hidden="true" />
            </button>
            <button
              className="rounded-lg border border-slate-300 p-2 disabled:cursor-not-allowed disabled:opacity-40"
              disabled={loading || offset + PAGE_SIZE >= (result?.total ?? 0)}
              onClick={() => changePage(offset + PAGE_SIZE)}
              aria-label="下一页"
            >
              <ChevronRight size={17} aria-hidden="true" />
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function FilterSelect({
  label: selectLabel,
  value,
  values,
  onChange,
}: {
  label: string;
  value: string;
  values: readonly string[];
  onChange: (value: string) => void;
}) {
  return (
    <label>
      <span className="sr-only">{selectLabel}</span>
      <select
        className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">全部{selectLabel}</option>
        {values.map((option) => (
          <option key={option} value={option}>
            {label(option)}
          </option>
        ))}
      </select>
    </label>
  );
}
