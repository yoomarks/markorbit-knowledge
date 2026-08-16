"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Archive, ChevronLeft, ChevronRight, Search } from "lucide-react";
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

type SourceValueSummary = {
  assessmentId: string;
  assessedAt: string;
  sourceValue: {
    score: number;
    priority: "VERY_HIGH" | "HIGH" | "MEDIUM" | "LOW";
    confidence: "HIGH" | "MEDIUM" | "LOW";
    summary: string;
  };
};

type CollectionHealthState =
  "NEVER_RUN" | "COLLECTING" | "HEALTHY" | "RETRYING" | "FAILING" | "CANCELLED";

type CollectionAlertCode = "COLLECTION_OVERDUE" | "FAILURE_STREAK" | "SCHEDULER_ERROR";

type CollectionHealthAlert = {
  code: CollectionAlertCode;
  severity: "WARNING" | "CRITICAL";
  sinceAt: string | null;
  message: string;
};

type CollectionFailure = {
  attemptId: string;
  jobId: string;
  jobAttempt: number;
  code: string;
  message: string;
  retryable: boolean;
  occurredAt: string;
};

type CollectionHealthSummary = {
  state: CollectionHealthState;
  latestRunStatus: string | null;
  latestRunAt: string | null;
  latestSuccessAt: string | null;
  lastFailureAt: string | null;
  consecutiveFailures: number;
  failedRuns: number;
  expectedNextCollectionAt: string | null;
  staleSince: string | null;
  latestFailure: CollectionFailure | null;
  attentionRequired: boolean;
  alerts: CollectionHealthAlert[];
};

type CollectionAlertSummary = {
  scopeSources: number;
  sourcesRequiringAttention: number;
  totalAlerts: number;
  overdueCollections: number;
  failureStreaks: number;
  schedulerErrors: number;
  failingSources: number;
  retryingSources: number;
};

type CollectionAttentionSource = {
  sourceId: string;
  sourceName: string;
  state: CollectionHealthState;
  lastFailureAt: string | null;
  latestFailure: CollectionFailure | null;
  alerts: CollectionHealthAlert[];
};

type SourceListPayload = SourceListResult & {
  assessments?: Record<string, SourceValueSummary>;
  collectionHealth?: Record<string, CollectionHealthSummary>;
  collectionAlertSummary?: CollectionAlertSummary;
  collectionAttentionSources?: CollectionAttentionSource[];
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

function sourceValueLabel(value: SourceValueSummary["sourceValue"]["priority"], zh: boolean) {
  if (!zh) return value.replaceAll("_", " ");
  if (value === "VERY_HIGH") return "极高";
  if (value === "HIGH") return "高";
  if (value === "MEDIUM") return "中";
  return "一般";
}

function sourceValueTone(value: SourceValueSummary["sourceValue"]["priority"]): string {
  if (value === "VERY_HIGH") return "bg-blue-600 text-white";
  if (value === "HIGH") return "bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-200";
  if (value === "MEDIUM") return "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200";
  return "bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-200";
}

function collectionHealthLabel(value: CollectionHealthState, zh: boolean): string {
  const labels: Record<CollectionHealthState, [string, string]> = {
    NEVER_RUN: ["未采集", "Never run"],
    COLLECTING: ["采集中", "Collecting"],
    HEALTHY: ["正常", "Healthy"],
    RETRYING: ["重试中", "Retrying"],
    FAILING: ["采集失败", "Failing"],
    CANCELLED: ["已取消", "Cancelled"],
  };
  return labels[value][zh ? 0 : 1];
}

function collectionHealthTone(value: CollectionHealthState): string {
  if (value === "HEALTHY") return "bg-emerald-50 text-emerald-700";
  if (value === "RETRYING" || value === "COLLECTING") return "bg-amber-50 text-amber-800";
  if (value === "FAILING") return "bg-rose-50 text-rose-700";
  return "bg-slate-100 text-slate-600";
}

function collectionAlertLabel(code: CollectionAlertCode, zh: boolean): string {
  const labels: Record<CollectionAlertCode, [string, string]> = {
    COLLECTION_OVERDUE: ["采集超期", "Collection overdue"],
    FAILURE_STREAK: ["连续失败", "Failure streak"],
    SCHEDULER_ERROR: ["调度异常", "Scheduler error"],
  };
  return labels[code][zh ? 0 : 1];
}

function collectionAlertTone(severity: CollectionHealthAlert["severity"]): string {
  return severity === "CRITICAL"
    ? "bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200"
    : "bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200";
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
  const [result, setResult] = useState<SourceListPayload | null>(null);
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
        const body = (await response.json()) as
          SourceListPayload | { error?: { message?: string } };
        if (!response.ok) {
          const message = "error" in body ? body.error?.message : undefined;
          throw new Error(message ?? "Unable to load sources");
        }
        setResult(body as SourceListPayload);
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
    sourceAuthority: zh ? "来源权威" : "Source authority",
    sourceValue: zh ? "来源价值" : "Source value",
    collectionHealth: zh ? "采集健康" : "Collection health",
    failureHistory: zh ? "近期失败" : "Recent failures",
    languages: zh ? "语言" : "Languages",
    updated: zh ? "更新时间" : "Updated",
    notAssessed: zh ? "未评估" : "Not assessed",
    noMatch: zh ? "没有匹配的来源" : "No matching sources",
    noMatchHint: zh ? "清除筛选条件，或添加新的真实来源。" : "Clear filters or add a new source.",
    loading: zh ? "正在读取来源…" : "Loading sources…",
    page: zh ? "页" : "Page",
    records: zh ? "条" : "records",
    previous: zh ? "上一页" : "Previous page",
    next: zh ? "下一页" : "Next page",
    operationalAlerts: zh ? "采集运行告警" : "Collection alerts",
    overdue: zh ? "超期" : "Overdue",
    failureStreaks: zh ? "连续失败" : "Failure streaks",
    schedulerErrors: zh ? "调度异常" : "Scheduler errors",
    failing: zh ? "失败中" : "Failing",
    retrying: zh ? "重试中" : "Retrying",
    scope: zh ? "当前筛选范围" : "Filtered scope",
    latestFailure: zh ? "最近失败" : "Latest failure",
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

      {result?.collectionAlertSummary &&
      result.collectionAlertSummary.sourcesRequiringAttention > 0 ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 shrink-0 text-amber-700" size={18} />
              <div>
                <p className="text-sm font-semibold text-amber-950">
                  {zh
                    ? `${copy.operationalAlerts}：${result.collectionAlertSummary.sourcesRequiringAttention} 个来源需要关注`
                    : `${copy.operationalAlerts}: ${result.collectionAlertSummary.sourcesRequiringAttention} sources need attention`}
                </p>
                <p className="mt-1 text-xs text-amber-800">
                  {copy.scope} · {result.collectionAlertSummary.scopeSources} {copy.records} ·{" "}
                  {result.collectionAlertSummary.totalAlerts} {zh ? "条告警" : "alerts"}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 text-xs font-medium text-amber-900">
              <span className="rounded-full bg-white/70 px-2.5 py-1">
                {copy.overdue} {result.collectionAlertSummary.overdueCollections}
              </span>
              <span className="rounded-full bg-white/70 px-2.5 py-1">
                {copy.failureStreaks} {result.collectionAlertSummary.failureStreaks}
              </span>
              <span className="rounded-full bg-white/70 px-2.5 py-1">
                {copy.schedulerErrors} {result.collectionAlertSummary.schedulerErrors}
              </span>
              <span className="rounded-full bg-white/70 px-2.5 py-1">
                {copy.failing} {result.collectionAlertSummary.failingSources}
              </span>
              <span className="rounded-full bg-white/70 px-2.5 py-1">
                {copy.retrying} {result.collectionAlertSummary.retryingSources}
              </span>
            </div>
          </div>
          {result.collectionAttentionSources?.length ? (
            <div className="grid gap-2 border-t border-amber-200 pt-3 sm:grid-cols-2 xl:grid-cols-4">
              {result.collectionAttentionSources.map((item) => (
                <Link
                  key={item.sourceId}
                  href={`/sources/${item.sourceId}`}
                  className="rounded-xl border border-amber-200 bg-white/70 px-3 py-2 hover:bg-white"
                >
                  <p className="truncate text-xs font-semibold text-amber-950">{item.sourceName}</p>
                  <p className="mt-1 truncate text-[10px] text-amber-800">
                    {item.latestFailure
                      ? `${item.latestFailure.code}: ${item.latestFailure.message}`
                      : (item.alerts[0]?.message ?? collectionHealthLabel(item.state, zh))}
                  </p>
                </Link>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      <section className="rounded-2xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 p-4 sm:p-5">
          <div className="grid gap-3 lg:grid-cols-6">
            <label className="relative lg:col-span-2">
              <span className="sr-only">{copy.search}</span>
              <Search className="absolute left-3 top-3 text-slate-400" size={17} />
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
          <table className="w-full min-w-[1080px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3 font-medium">{copy.name}</th>
                <th className="px-5 py-3 font-medium">{copy.typeCategory}</th>
                <th className="px-5 py-3 font-medium">{copy.countries}</th>
                <th className="px-5 py-3 font-medium">{copy.sourceAuthority}</th>
                <th className="px-5 py-3 font-medium">{copy.sourceValue}</th>
                <th className="px-5 py-3 font-medium">{copy.collectionHealth}</th>
                <th className="px-5 py-3 font-medium">{copy.status}</th>
                <th className="px-5 py-3 font-medium">{copy.updated}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {result?.items.map((source) => {
                const assessment = result.assessments?.[source.id];
                const collectionHealth = result.collectionHealth?.[source.id];
                return (
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
                      <p className="mt-1 text-xs text-slate-500">
                        {enumLabel(source.category, zh)}
                      </p>
                    </td>
                    <td className="px-5 py-4 text-slate-700">
                      {source.jurisdictions.join(", ") || "—"}
                    </td>
                    <td className="px-5 py-4 text-slate-700">
                      <p>{enumLabel(source.authorityLevel, zh)}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {copy.languages}: {source.languages.join(", ") || "—"}
                      </p>
                    </td>
                    <td className="px-5 py-4">
                      {assessment ? (
                        <div title={assessment.sourceValue.summary}>
                          <span
                            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${sourceValueTone(assessment.sourceValue.priority)}`}
                          >
                            {sourceValueLabel(assessment.sourceValue.priority, zh)} ·{" "}
                            {assessment.sourceValue.score}
                          </span>
                          <p className="mt-1 text-[10px] text-slate-400">
                            {new Date(assessment.assessedAt).toLocaleDateString(locale)}
                          </p>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">{copy.notAssessed}</span>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      {collectionHealth ? (
                        <div
                          title={
                            collectionHealth.lastFailureAt
                              ? `${copy.failureHistory}: ${collectionHealth.failedRuns}`
                              : undefined
                          }
                        >
                          <span
                            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${collectionHealthTone(collectionHealth.state)}`}
                          >
                            {collectionHealthLabel(collectionHealth.state, zh)}
                          </span>
                          {collectionHealth.latestFailure ? (
                            <p
                              className="mt-1 max-w-[240px] truncate text-[10px] text-rose-600"
                              title={`${collectionHealth.latestFailure.code}: ${collectionHealth.latestFailure.message}`}
                            >
                              {copy.latestFailure}: {collectionHealth.latestFailure.code}
                            </p>
                          ) : null}
                          {collectionHealth.alerts?.length ? (
                            <div className="mt-1.5 flex max-w-[220px] flex-wrap gap-1">
                              {(collectionHealth.alerts ?? []).map((alert) => (
                                <span
                                  key={alert.code}
                                  title={alert.message}
                                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${collectionAlertTone(alert.severity)}`}
                                >
                                  <AlertTriangle size={10} />
                                  {collectionAlertLabel(alert.code, zh)}
                                </span>
                              ))}
                            </div>
                          ) : collectionHealth.state === "FAILING" ? (
                            <p className="mt-1 text-[10px] text-rose-500">
                              {zh
                                ? `连续失败 ${collectionHealth.consecutiveFailures} 次`
                                : `${collectionHealth.consecutiveFailures} consecutive failures`}
                            </p>
                          ) : collectionHealth.latestRunAt ? (
                            <p className="mt-1 text-[10px] text-slate-400">
                              {new Date(collectionHealth.latestRunAt).toLocaleString(locale)}
                            </p>
                          ) : null}
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <StatusBadge status={source.status} zh={zh} />
                    </td>
                    <td className="px-5 py-4 text-slate-500">
                      {new Date(source.updatedAt).toLocaleString(locale)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {!loading && result?.items.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <Archive className="mx-auto text-slate-400" size={30} />
            <h2 className="mt-4 font-semibold text-slate-950">{copy.noMatch}</h2>
            <p className="mt-2 text-sm text-slate-500">{copy.noMatchHint}</p>
          </div>
        ) : null}

        {loading ? (
          <div className="border-t border-slate-100 px-5 py-3 text-xs text-slate-400">
            {copy.loading}
          </div>
        ) : null}

        <div className="flex flex-col gap-3 border-t border-slate-200 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <p className="text-xs text-slate-500">
            {copy.page} {currentPage} / {totalPages} · {result?.total ?? 0} {copy.records}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              aria-label={copy.previous}
              disabled={offset === 0 || loading}
              onClick={() => changePage(Math.max(0, offset - PAGE_SIZE))}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 disabled:opacity-40"
            >
              <ChevronLeft size={14} /> {copy.previous}
            </button>
            <button
              type="button"
              aria-label={copy.next}
              disabled={offset + PAGE_SIZE >= (result?.total ?? 0) || loading}
              onClick={() => changePage(offset + PAGE_SIZE)}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 disabled:opacity-40"
            >
              {copy.next} <ChevronRight size={14} />
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
        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-700"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">{label}</option>
        {values.map((item) => (
          <option key={item} value={item}>
            {enumLabel(item, zh)}
          </option>
        ))}
      </select>
    </label>
  );
}
