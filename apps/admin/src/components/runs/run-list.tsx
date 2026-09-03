"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Clock3, Search } from "lucide-react";
import {
  COLLECTION_RUN_STATUSES,
  JOB_TYPES,
  RUN_TRIGGER_TYPES,
  type CollectionRunStatus,
} from "@markorbit/contracts";
import type { ExecutionRunListResult } from "@markorbit/persistence/execution-ledger";
import { adminBrowserWorkspaceHeaders } from "@/lib/admin-browser-api-client";

const PAGE_SIZE = 20;

type Filters = {
  q: string;
  status: string;
  triggerType: string;
  jobType: string;
  connectorId: string;
};

const initialFilters: Filters = {
  q: "",
  status: "",
  triggerType: "",
  jobType: "",
  connectorId: "",
};

function titleCase(value: string): string {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function StatusBadge({ status }: { status: CollectionRunStatus }) {
  const classes: Record<CollectionRunStatus, string> = {
    PENDING: "bg-amber-50 text-amber-800",
    RUNNING: "bg-sky-50 text-sky-700",
    COMPLETED: "bg-emerald-50 text-emerald-700",
    FAILED: "bg-rose-50 text-rose-700",
    CANCELLED: "bg-slate-200 text-slate-600",
  };
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${classes[status]}`}>
      {status}
    </span>
  );
}

export function RunList({ workspaceId }: { workspaceId: string }) {
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [offset, setOffset] = useState(0);
  const [result, setResult] = useState<ExecutionRunListResult | null>(null);
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
    fetch(`/api/runs?${query}`, {
      headers: adminBrowserWorkspaceHeaders(workspaceId),
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = (await response.json()) as
          ExecutionRunListResult | { error?: { message?: string } };
        if (!response.ok) {
          const message = "error" in body ? body.error?.message : undefined;
          throw new Error(message ?? "Unable to load execution runs");
        }
        setResult(body as ExecutionRunListResult);
      })
      .catch((requestError: unknown) => {
        if (requestError instanceof DOMException && requestError.name === "AbortError") return;
        setError(requestError instanceof Error ? requestError.message : "Unable to load runs");
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
          ["运行总数", summary?.total ?? 0],
          ["等待 Worker", summary?.statuses.PENDING ?? 0],
          ["运行中", summary?.statuses.RUNNING ?? 0],
          ["完成", summary?.statuses.COMPLETED ?? 0],
          ["失败", summary?.statuses.FAILED ?? 0],
          ["已取消", summary?.statuses.CANCELLED ?? 0],
        ].map(([title, count]) => (
          <div key={String(title)} className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-xs font-medium text-slate-500">{title}</p>
            <p className="mt-2 text-2xl font-semibold text-slate-950">{count}</p>
          </div>
        ))}
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 p-4 sm:p-5">
          <div className="grid gap-3 lg:grid-cols-5">
            <label className="relative lg:col-span-2">
              <span className="sr-only">搜索运行记录</span>
              <Search
                className="absolute left-3 top-3 text-slate-400"
                size={17}
                aria-hidden="true"
              />
              <input
                className="w-full rounded-xl border border-slate-300 py-2.5 pl-10 pr-3 text-sm"
                placeholder="搜索运行 ID、计划或数据源"
                value={filters.q}
                onChange={(event) => updateFilter("q", event.target.value)}
              />
            </label>
            <FilterSelect
              label="状态"
              value={filters.status}
              values={COLLECTION_RUN_STATUSES}
              onChange={(value) => updateFilter("status", value)}
            />
            <FilterSelect
              label="触发方式"
              value={filters.triggerType}
              values={RUN_TRIGGER_TYPES}
              onChange={(value) => updateFilter("triggerType", value)}
            />
            <FilterSelect
              label="Job 类型"
              value={filters.jobType}
              values={JOB_TYPES}
              onChange={(value) => updateFilter("jobType", value)}
            />
          </div>
          <input
            className="mt-3 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm sm:max-w-sm"
            placeholder="按 Connector ID 筛选"
            value={filters.connectorId}
            onChange={(event) => updateFilter("connectorId", event.target.value)}
          />
        </div>

        <div className="border-b border-amber-100 bg-amber-50 px-5 py-3 text-sm text-amber-900">
          PENDING 仅表示控制平面已经记录待执行工作。当前没有 Worker 租约，也没有运行 Crawl4AI。
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
                <th className="px-5 py-3 font-medium">运行 / 请求时间</th>
                <th className="px-5 py-3 font-medium">计划 / 数据源</th>
                <th className="px-5 py-3 font-medium">Job</th>
                <th className="px-5 py-3 font-medium">Connector 快照</th>
                <th className="px-5 py-3 font-medium">触发</th>
                <th className="px-5 py-3 font-medium">状态</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {result?.items.map((record) => {
                const job = record.jobs[0];
                return (
                  <tr key={record.run.id} className="hover:bg-slate-50">
                    <td className="px-5 py-4">
                      <Link
                        href={`/runs/${record.run.id}`}
                        className="font-medium text-slate-950 hover:text-emerald-700"
                      >
                        {record.run.id}
                      </Link>
                      <p className="mt-1 text-xs text-slate-500">
                        {new Date(record.run.requestedAt).toLocaleString("zh-CN")}
                      </p>
                    </td>
                    <td className="px-5 py-4 text-slate-700">
                      <p>{record.run.planSnapshot.name}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {record.run.sourceSnapshot.name} · {record.run.sourceSnapshot.slug}
                      </p>
                    </td>
                    <td className="px-5 py-4 text-slate-700">
                      <p>{job?.jobType ?? "—"}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        Attempt {job?.attempt ?? 0} · {job?.status ?? "—"}
                      </p>
                    </td>
                    <td className="px-5 py-4 text-slate-700">
                      <p>{record.run.connectorSnapshot.connectorId}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        v{record.run.connectorSnapshot.version}
                      </p>
                    </td>
                    <td className="px-5 py-4 text-slate-700">
                      <p>{record.run.trigger.type}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {record.run.trigger.requestedBy.actorType}
                      </p>
                    </td>
                    <td className="px-5 py-4">
                      <StatusBadge status={record.run.status} />
                      {record.run.status === "PENDING" ? (
                        <p className="mt-2 text-xs text-slate-500">Awaiting Worker</p>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {!loading && result?.items.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <Clock3 className="mx-auto text-slate-400" size={30} aria-hidden="true" />
            <h2 className="mt-4 font-semibold text-slate-950">尚无运行记录</h2>
            <p className="mt-2 text-sm text-slate-500">
              在启用的采集计划详情中创建手动运行，系统会保存待执行快照。
            </p>
          </div>
        ) : null}

        {loading ? (
          <div className="px-6 py-12 text-center text-sm text-slate-500">
            正在读取 Execution Ledger…
          </div>
        ) : null}

        <div className="flex items-center justify-between border-t border-slate-200 px-5 py-4 text-sm">
          <p className="text-slate-500">
            第 {currentPage} / {totalPages} 页 · 共 {result?.total ?? 0} 条运行记录
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
