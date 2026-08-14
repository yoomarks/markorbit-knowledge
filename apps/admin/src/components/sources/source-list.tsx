"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Archive, ChevronLeft, ChevronRight, Search } from "lucide-react";
import {
  AUTHORITY_LEVELS,
  SOURCE_CATEGORIES,
  SOURCE_STATUSES,
  SOURCE_TYPES,
  type SourceDefinition,
} from "@markorbit/contracts";
import type { SourceListResult } from "@markorbit/persistence";
import { useAdminI18n } from "@/lib/i18n";

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

function humanize(value: string): string {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function enumLabel(value: string, zh: boolean): string {
  if (!zh) return humanize(value);
  const translations: Record<string, string> = {
    WEB: "网站",
    API: "API",
    RSS: "RSS / 订阅",
    EMAIL: "邮件",
    MANUAL_UPLOAD: "人工文件",
    LOCAL_FOLDER: "本地目录",
    GITHUB: "GitHub",
    OFFICIAL_AUTHORITY: "官方机构",
    GOVERNMENT_PUBLICATION: "政府出版物",
    INTERGOVERNMENTAL: "国际组织",
    PUBLIC_REFERENCE: "公共参考资料",
    PROFESSIONAL_ASSOCIATION: "专业协会",
    LAW_FIRM: "律所 / 代理机构",
    PROFESSIONAL: "专业人士",
    MEDIA: "媒体",
    OTHER: "其他",
    USER_PROVIDED: "用户提供",
    PRIMARY_OFFICIAL: "一级官方",
    SECONDARY_OFFICIAL: "二级官方",
    HIGH: "高",
    MEDIUM: "中",
    LOW: "低",
    UNKNOWN: "未评估",
    DRAFT: "草稿",
    ACTIVE: "启用",
    PAUSED: "暂停",
    ERROR: "异常",
    ARCHIVED: "归档",
  };
  return translations[value] ?? humanize(value);
}

function StatusBadge({ status, zh }: { status: SourceDefinition["status"]; zh: boolean }) {
  const classes: Record<SourceDefinition["status"], string> = {
    DRAFT: "bg-slate-100 text-slate-700",
    ACTIVE: "bg-emerald-50 text-emerald-700",
    PAUSED: "bg-amber-50 text-amber-800",
    ERROR: "bg-rose-50 text-rose-700",
    ARCHIVED: "bg-slate-200 text-slate-600",
  };
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${classes[status]}`}>
      {enumLabel(status, zh)}
    </span>
  );
}

export function SourceList() {
  const { locale } = useAdminI18n();
  const zh = locale === "zh-CN";
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [offset, setOffset] = useState(0);
  const [result, setResult] = useState<SourceListResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const query = useMemo(() => {
    const params = new URLSearchParams({
      limit: String(PAGE_SIZE),
      offset: String(offset),
      hideLegacySystem: "true",
    });
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

  const copy = {
    all: zh ? "全部" : "All",
    active: zh ? "启用" : "Active",
    draft: zh ? "草稿" : "Draft",
    paused: zh ? "暂停" : "Paused",
    error: zh ? "异常" : "Error",
    archived: zh ? "归档" : "Archived",
    search: zh ? "搜索名称、Slug 或网址" : "Search name, slug or URL",
    type: zh ? "类型" : "Type",
    category: zh ? "分类" : "Category",
    authority: zh ? "权威等级" : "Authority",
    status: zh ? "状态" : "Status",
    jurisdiction: zh
      ? "国家 / 地区代码，例如 US、EU、WIPO"
      : "Jurisdiction code, e.g. US, EU, WIPO",
    name: zh ? "名称" : "Name",
    typeCategory: zh ? "类型 / 分类" : "Type / category",
    countries: zh ? "国家地区" : "Jurisdictions",
    connector: "Connector",
    updated: zh ? "更新时间" : "Updated",
    noMatch: zh ? "没有匹配的来源" : "No matching sources",
    noMatchHint: zh ? "清除筛选条件，或添加新的真实来源。" : "Clear filters or add a new source.",
    loading: zh ? "正在读取来源…" : "Loading sources…",
    page: zh ? "页" : "Page",
    records: zh ? "条" : "records",
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        {[
          [copy.all, summary?.total ?? 0],
          [copy.active, summary?.ACTIVE ?? 0],
          [copy.draft, summary?.DRAFT ?? 0],
          [copy.paused, summary?.PAUSED ?? 0],
          [copy.error, summary?.ERROR ?? 0],
          [copy.archived, summary?.ARCHIVED ?? 0],
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
              <span className="sr-only">{copy.search}</span>
              <Search
                className="absolute left-3 top-3 text-slate-400"
                size={17}
                aria-hidden="true"
              />
              <input
                className="w-full rounded-xl border border-slate-300 py-2.5 pl-10 pr-3 text-sm"
                placeholder={copy.search}
                value={filters.q}
                onChange={(event) => updateFilter("q", event.target.value)}
              />
            </label>
            <FilterSelect
              label={copy.type}
              value={filters.sourceType}
              values={SOURCE_TYPES}
              zh={zh}
              onChange={(value) => updateFilter("sourceType", value)}
            />
            <FilterSelect
              label={copy.category}
              value={filters.category}
              values={SOURCE_CATEGORIES}
              zh={zh}
              onChange={(value) => updateFilter("category", value)}
            />
            <FilterSelect
              label={copy.authority}
              value={filters.authorityLevel}
              values={AUTHORITY_LEVELS}
              zh={zh}
              onChange={(value) => updateFilter("authorityLevel", value)}
            />
            <FilterSelect
              label={copy.status}
              value={filters.status}
              values={SOURCE_STATUSES}
              zh={zh}
              onChange={(value) => updateFilter("status", value)}
            />
          </div>
          <div className="mt-3">
            <input
              className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm sm:max-w-xs"
              placeholder={copy.jurisdiction}
              value={filters.jurisdiction}
              onChange={(event) => updateFilter("jurisdiction", event.target.value.toUpperCase())}
            />
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
                <th className="px-5 py-3 font-medium">{copy.name}</th>
                <th className="px-5 py-3 font-medium">{copy.typeCategory}</th>
                <th className="px-5 py-3 font-medium">{copy.countries}</th>
                <th className="px-5 py-3 font-medium">{copy.connector}</th>
                <th className="px-5 py-3 font-medium">{copy.status}</th>
                <th className="px-5 py-3 font-medium">{copy.updated}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {result?.items.map((source) => (
                <tr key={source.id} className="hover:bg-slate-50">
                  <td className="px-5 py-4">
                    <Link
                      href={`/sources/${source.id}`}
                      className="font-medium text-slate-950 hover:text-blue-700"
                    >
                      {source.name}
                    </Link>
                    <p className="mt-1 text-xs text-slate-500">{source.slug}</p>
                  </td>
                  <td className="px-5 py-4 text-slate-700">
                    <p>{enumLabel(source.sourceType, zh)}</p>
                    <p className="mt-1 text-xs text-slate-500">{enumLabel(source.category, zh)}</p>
                  </td>
                  <td className="px-5 py-4 text-slate-700">
                    {source.jurisdictions.join(", ") || "—"}
                  </td>
                  <td className="px-5 py-4 text-slate-700">
                    <p>{source.connector.connectorId}</p>
                    <p className="mt-1 text-xs text-slate-500">v{source.connector.version}</p>
                  </td>
                  <td className="px-5 py-4">
                    <StatusBadge status={source.status} zh={zh} />
                  </td>
                  <td className="px-5 py-4 text-slate-500">
                    {new Date(source.updatedAt).toLocaleString(locale)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!loading && result?.items.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <Archive className="mx-auto text-slate-400" size={30} aria-hidden="true" />
            <h2 className="mt-4 font-semibold text-slate-950">{copy.noMatch}</h2>
            <p className="mt-2 text-sm text-slate-500">{copy.noMatchHint}</p>
          </div>
        ) : null}

        {loading ? (
          <div className="px-6 py-12 text-center text-sm text-slate-500">{copy.loading}</div>
        ) : null}

        <div className="flex items-center justify-between border-t border-slate-200 px-5 py-4 text-sm">
          <p className="text-slate-500">
            {copy.page} {currentPage} / {totalPages} · {result?.total ?? 0} {copy.records}
          </p>
          <div className="flex gap-2">
            <button
              className="rounded-lg border border-slate-300 p-2 disabled:cursor-not-allowed disabled:opacity-40"
              disabled={offset === 0 || loading}
              onClick={() => changePage(Math.max(0, offset - PAGE_SIZE))}
              aria-label="Previous page"
            >
              <ChevronLeft size={17} aria-hidden="true" />
            </button>
            <button
              className="rounded-lg border border-slate-300 p-2 disabled:cursor-not-allowed disabled:opacity-40"
              disabled={loading || offset + PAGE_SIZE >= (result?.total ?? 0)}
              onClick={() => changePage(offset + PAGE_SIZE)}
              aria-label="Next page"
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
  label,
  value,
  values,
  zh,
  onChange,
}: {
  label: string;
  value: string;
  values: readonly string[];
  zh: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label>
      <span className="sr-only">{label}</span>
      <select
        className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">{zh ? `全部${label}` : `All ${label.toLowerCase()}`}</option>
        {values.map((option) => (
          <option key={option} value={option}>
            {enumLabel(option, zh)}
          </option>
        ))}
      </select>
    </label>
  );
}
