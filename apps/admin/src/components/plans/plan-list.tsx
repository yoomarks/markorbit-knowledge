"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CalendarClock, ChevronLeft, ChevronRight, Plus, Search } from "lucide-react";
import {
  ARTIFACT_KINDS,
  COLLECTION_PLAN_STATUSES,
  COLLECTION_PRIORITIES,
  SCHEDULE_MODES,
  type CollectionPlan,
  type CollectionPlanStatus,
} from "@markorbit/contracts";
import type { CollectionPlanListResult } from "@markorbit/persistence/collection-plans";
import { adminBrowserWorkspaceHeaders } from "@/lib/admin-browser-api-client";

const PAGE_SIZE = 20;

type Filters = {
  q: string;
  status: string;
  scheduleMode: string;
  priority: string;
  artifactKind: string;
  connectorId: string;
};

const initialFilters: Filters = {
  q: "",
  status: "",
  scheduleMode: "",
  priority: "",
  artifactKind: "",
  connectorId: "",
};

function titleCase(value: string): string {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function scheduleLabel(schedule: CollectionPlan["schedule"]): string {
  switch (schedule.mode) {
    case "MANUAL":
      return "Manual";
    case "INTERVAL":
      return `Every ${schedule.intervalSeconds}s`;
    case "CRON":
      return `${schedule.expression} · ${schedule.timezone}`;
    case "CHANGE_WATCH":
      return `Watch every ${schedule.pollIntervalSeconds}s`;
  }
}

function StatusBadge({ status }: { status: CollectionPlanStatus }) {
  const classes: Record<CollectionPlanStatus, string> = {
    ACTIVE: "bg-emerald-50 text-emerald-700",
    PAUSED: "bg-amber-50 text-amber-800",
    ARCHIVED: "bg-slate-200 text-slate-600",
  };
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${classes[status]}`}>
      {status}
    </span>
  );
}

export function PlanList({ workspaceId }: { workspaceId: string }) {
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [offset, setOffset] = useState(0);
  const [result, setResult] = useState<CollectionPlanListResult | null>(null);
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
    fetch(`/api/plans?${query}`, {
      headers: adminBrowserWorkspaceHeaders(workspaceId),
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = (await response.json()) as
          CollectionPlanListResult | { error?: { message?: string } };
        if (!response.ok) {
          const message = "error" in body ? body.error?.message : undefined;
          throw new Error(message ?? "Unable to load collection plans");
        }
        setResult(body as CollectionPlanListResult);
      })
      .catch((requestError: unknown) => {
        if (requestError instanceof DOMException && requestError.name === "AbortError") return;
        setError(
          requestError instanceof Error ? requestError.message : "Unable to load collection plans",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [query, workspaceId]);

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
          ["计划总数", summary?.total ?? 0],
          ["启用", summary?.statuses.ACTIVE ?? 0],
          ["暂停", summary?.statuses.PAUSED ?? 0],
          ["归档", summary?.statuses.ARCHIVED ?? 0],
          [
            "定时 / 间隔",
            (summary?.scheduleModes.CRON ?? 0) + (summary?.scheduleModes.INTERVAL ?? 0),
          ],
          ["更新监测", summary?.scheduleModes.CHANGE_WATCH ?? 0],
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
              <span className="sr-only">搜索采集计划或数据源</span>
              <Search
                className="absolute left-3 top-3 text-slate-400"
                size={17}
                aria-hidden="true"
              />
              <input
                className="w-full rounded-xl border border-slate-300 py-2.5 pl-10 pr-3 text-sm"
                placeholder="搜索计划名称、数据源名称或 Slug"
                value={filters.q}
                onChange={(event) => updateFilter("q", event.target.value)}
              />
            </label>
            <FilterSelect
              label="状态"
              value={filters.status}
              values={COLLECTION_PLAN_STATUSES}
              onChange={(value) => updateFilter("status", value)}
            />
            <FilterSelect
              label="计划方式"
              value={filters.scheduleMode}
              values={SCHEDULE_MODES}
              onChange={(value) => updateFilter("scheduleMode", value)}
            />
            <FilterSelect
              label="优先级"
              value={filters.priority}
              values={COLLECTION_PRIORITIES}
              onChange={(value) => updateFilter("priority", value)}
            />
            <FilterSelect
              label="输出类型"
              value={filters.artifactKind}
              values={ARTIFACT_KINDS}
              onChange={(value) => updateFilter("artifactKind", value)}
            />
          </div>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <input
              className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm sm:max-w-sm"
              placeholder="按 Connector ID 筛选"
              value={filters.connectorId}
              onChange={(event) => updateFilter("connectorId", event.target.value)}
            />
            <Link
              href="/jobs/new"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-medium text-white"
            >
              <Plus size={17} aria-hidden="true" /> 新建采集计划
            </Link>
          </div>
        </div>

        <div className="border-b border-sky-100 bg-sky-50 px-5 py-3 text-sm text-sky-900">
          这里保存的是采集意图。手动运行历史已在“运行记录”中启用；调度器、Worker
          和下一次执行时间仍未启用。
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
                <th className="px-5 py-3 font-medium">计划 / 数据源</th>
                <th className="px-5 py-3 font-medium">计划方式</th>
                <th className="px-5 py-3 font-medium">策略</th>
                <th className="px-5 py-3 font-medium">输出</th>
                <th className="px-5 py-3 font-medium">Connector</th>
                <th className="px-5 py-3 font-medium">状态</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {result?.items.map((record) => (
                <tr key={record.plan.id} className="hover:bg-slate-50">
                  <td className="px-5 py-4">
                    <Link
                      href={`/jobs/${record.plan.id}`}
                      className="font-medium text-slate-950 hover:text-emerald-700"
                    >
                      {record.plan.name}
                    </Link>
                    <p className="mt-1 text-xs text-slate-500">
                      {record.source.name} · {record.source.slug}
                    </p>
                  </td>
                  <td className="px-5 py-4 text-slate-700">
                    <p>{scheduleLabel(record.plan.schedule)}</p>
                    <p className="mt-1 text-xs text-slate-500">Priority: {record.plan.priority}</p>
                  </td>
                  <td className="px-5 py-4 text-slate-700">
                    <p>
                      Depth {record.plan.policy.maxDepth} · Max {record.plan.policy.maxItems}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      JS {record.plan.policy.renderJavascript ? "on" : "off"} · Attachments{" "}
                      {record.plan.policy.fetchAttachments ? "on" : "off"}
                    </p>
                  </td>
                  <td className="px-5 py-4 text-slate-700">
                    {record.plan.output.artifactKinds.join(", ")}
                  </td>
                  <td className="px-5 py-4 text-slate-700">
                    <p>{record.source.connector.connectorId}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      v{record.source.connector.version}
                    </p>
                  </td>
                  <td className="px-5 py-4">
                    <StatusBadge status={record.plan.status} />
                    <p className="mt-2 text-xs text-slate-500">Runtime: not scheduled</p>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!loading && result?.items.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <CalendarClock className="mx-auto text-slate-400" size={30} aria-hidden="true" />
            <h2 className="mt-4 font-semibold text-slate-950">尚无匹配的采集计划</h2>
            <p className="mt-2 text-sm text-slate-500">
              创建一个暂停状态的计划，确认策略后再显式启用。
            </p>
          </div>
        ) : null}

        {loading ? (
          <div className="px-6 py-12 text-center text-sm text-slate-500">
            正在读取 CollectionPlan Registry…
          </div>
        ) : null}

        <div className="flex items-center justify-between border-t border-slate-200 px-5 py-4 text-sm">
          <p className="text-slate-500">
            第 {currentPage} / {totalPages} 页 · 共 {result?.total ?? 0} 个计划
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
  label,
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
      <span className="sr-only">{label}</span>
      <select
        className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">全部{label}</option>
        {values.map((option) => (
          <option key={option} value={option}>
            {titleCase(option)}
          </option>
        ))}
      </select>
    </label>
  );
}
