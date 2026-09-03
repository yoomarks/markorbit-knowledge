"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Activity, ChevronLeft, ChevronRight, Plus, Recycle, Search, Server } from "lucide-react";
import {
  JOB_TYPES,
  WORKER_DESIRED_STATES,
  WORKER_STATUSES,
  type WorkerRuntimeView,
} from "@markorbit/contracts";
import type { WorkerListResult } from "@markorbit/persistence/workers";
import { adminBrowserMutationHeaders } from "@/lib/admin-browser-api-client";

const PAGE_SIZE = 20;

type Filters = {
  q: string;
  desiredState: string;
  effectiveStatus: string;
  connectorId: string;
  jobType: string;
};

const initialFilters: Filters = {
  q: "",
  desiredState: "",
  effectiveStatus: "",
  connectorId: "",
  jobType: "",
};

function label(value: string): string {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function StatusBadge({ status }: { status: WorkerRuntimeView["effectiveStatus"] }) {
  const classes: Record<WorkerRuntimeView["effectiveStatus"], string> = {
    ONLINE: "bg-emerald-50 text-emerald-700",
    BUSY: "bg-blue-50 text-blue-700",
    DRAINING: "bg-amber-50 text-amber-800",
    OFFLINE: "bg-slate-100 text-slate-700",
    DISABLED: "bg-slate-200 text-slate-600",
    ERROR: "bg-rose-50 text-rose-700",
  };
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${classes[status]}`}>
      {status}
    </span>
  );
}

export function WorkerList() {
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [offset, setOffset] = useState(0);
  const [result, setResult] = useState<WorkerListResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const query = useMemo(() => {
    const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset) });
    for (const [key, value] of Object.entries(filters)) {
      if (value.trim()) params.set(key, value.trim());
    }
    return params.toString();
  }, [filters, offset]);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/workers?${query}`, { signal: controller.signal })
      .then(async (response) => {
        const body = (await response.json()) as WorkerListResult | { error?: { message?: string } };
        if (!response.ok) {
          const message = "error" in body ? body.error?.message : undefined;
          throw new Error(message ?? "Unable to load Workers");
        }
        setResult(body as WorkerListResult);
      })
      .catch((requestError: unknown) => {
        if (requestError instanceof DOMException && requestError.name === "AbortError") return;
        setError(requestError instanceof Error ? requestError.message : "Unable to load Workers");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [query]);

  function beginRequest() {
    setLoading(true);
    setError(null);
    setNotice(null);
  }

  function updateFilter(key: keyof Filters, value: string) {
    beginRequest();
    setOffset(0);
    setFilters((current) => ({ ...current, [key]: value }));
  }

  async function reapExpired() {
    beginRequest();
    try {
      const response = await fetch("/api/leases/reap", {
        method: "POST",
        headers: await adminBrowserMutationHeaders(),
      });
      const body = (await response.json()) as { reaped?: number; error?: { message?: string } };
      if (!response.ok) throw new Error(body.error?.message ?? "Unable to reap leases");
      setNotice(`已回收 ${body.reaped ?? 0} 个过期租约。`);
      const refreshed = await fetch(`/api/workers?${query}`);
      setResult((await refreshed.json()) as WorkerListResult);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to reap leases");
    } finally {
      setLoading(false);
    }
  }

  const summary = result?.summary;
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;
  const totalPages = Math.max(1, Math.ceil((result?.total ?? 0) / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-9">
        {[
          ["全部", summary?.total ?? 0],
          ["在线", summary?.ONLINE ?? 0],
          ["繁忙", summary?.BUSY ?? 0],
          ["排空", summary?.DRAINING ?? 0],
          ["离线", summary?.OFFLINE ?? 0],
          ["禁用", summary?.DISABLED ?? 0],
          ["异常", summary?.ERROR ?? 0],
          ["活动租约", summary?.activeLeases ?? 0],
          ["过期租约", summary?.expiredLeases ?? 0],
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
              <span className="sr-only">搜索 Worker</span>
              <Search
                className="absolute left-3 top-3 text-slate-400"
                size={17}
                aria-hidden="true"
              />
              <input
                className="w-full rounded-xl border border-slate-300 py-2.5 pl-10 pr-3 text-sm"
                placeholder="搜索名称或 Worker ID"
                value={filters.q}
                onChange={(event) => updateFilter("q", event.target.value)}
              />
            </label>
            <FilterSelect
              label="期望状态"
              value={filters.desiredState}
              values={WORKER_DESIRED_STATES}
              onChange={(value) => updateFilter("desiredState", value)}
            />
            <FilterSelect
              label="有效状态"
              value={filters.effectiveStatus}
              values={WORKER_STATUSES}
              onChange={(value) => updateFilter("effectiveStatus", value)}
            />
            <FilterSelect
              label="JobType"
              value={filters.jobType}
              values={JOB_TYPES}
              onChange={(value) => updateFilter("jobType", value)}
            />
          </div>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <input
              className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm sm:max-w-sm"
              placeholder="精确 Connector ID，例如 crawl4ai-web"
              value={filters.connectorId}
              onChange={(event) => updateFilter("connectorId", event.target.value.toLowerCase())}
            />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={reapExpired}
                disabled={loading}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 disabled:opacity-50"
              >
                <Recycle size={17} aria-hidden="true" /> 回收过期租约
              </button>
              <Link
                href="/workers/new"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-medium text-white"
              >
                <Plus size={17} aria-hidden="true" /> 新建 Worker
              </Link>
            </div>
          </div>
        </div>

        {error ? (
          <div className="m-5 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
            {error}
          </div>
        ) : null}
        {notice ? (
          <div className="m-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
            {notice}
          </div>
        ) : null}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1050px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3 font-medium">Worker</th>
                <th className="px-5 py-3 font-medium">有效状态</th>
                <th className="px-5 py-3 font-medium">Runtime</th>
                <th className="px-5 py-3 font-medium">Connector 绑定</th>
                <th className="px-5 py-3 font-medium">并发</th>
                <th className="px-5 py-3 font-medium">最近心跳</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {result?.items.map((view) => (
                <tr key={view.worker.id} className="hover:bg-slate-50">
                  <td className="px-5 py-4">
                    <Link
                      href={`/workers/${view.worker.id}`}
                      className="font-medium text-slate-950 hover:text-emerald-700"
                    >
                      {view.worker.displayName}
                    </Link>
                    <p className="mt-1 font-mono text-xs text-slate-500">{view.worker.id}</p>
                  </td>
                  <td className="px-5 py-4">
                    <StatusBadge status={view.effectiveStatus} />
                    <p className="mt-2 text-xs text-slate-500">
                      Desired: {view.worker.desiredState}
                    </p>
                  </td>
                  <td className="px-5 py-4 text-slate-700">
                    <p>{view.worker.runtime.runtimeId}</p>
                    <p className="mt-1 text-xs text-slate-500">v{view.worker.runtime.version}</p>
                  </td>
                  <td className="px-5 py-4 text-slate-700">
                    {view.worker.connectorBindings.map((binding) => (
                      <p key={`${binding.connectorId}@${binding.version}`}>
                        {binding.connectorId}@{binding.version}
                      </p>
                    ))}
                  </td>
                  <td className="px-5 py-4 text-slate-700">
                    {view.activeLeaseCount} / {view.worker.maxConcurrency}
                  </td>
                  <td className="px-5 py-4 text-slate-500">
                    {view.latestHeartbeat ? (
                      <>
                        <p>{new Date(view.latestHeartbeat.receivedAt).toLocaleString("zh-CN")}</p>
                        <p className="mt-1 text-xs">{view.latestHeartbeat.health}</p>
                      </>
                    ) : (
                      "尚无心跳"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!loading && result?.items.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <Server className="mx-auto text-slate-400" size={32} aria-hidden="true" />
            <h2 className="mt-4 font-semibold text-slate-950">尚无匹配的 Worker</h2>
            <p className="mt-2 text-sm text-slate-500">
              创建 Worker 后，凭证只会展示一次；Worker 必须先发送新鲜心跳才能领取任务。
            </p>
          </div>
        ) : null}

        {loading ? (
          <div className="flex items-center justify-center gap-2 px-6 py-12 text-sm text-slate-500">
            <Activity className="animate-pulse" size={17} aria-hidden="true" />
            正在读取 Worker Registry…
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
              onClick={() => {
                beginRequest();
                setOffset(Math.max(0, offset - PAGE_SIZE));
              }}
              aria-label="上一页"
            >
              <ChevronLeft size={17} aria-hidden="true" />
            </button>
            <button
              className="rounded-lg border border-slate-300 p-2 disabled:cursor-not-allowed disabled:opacity-40"
              disabled={loading || offset + PAGE_SIZE >= (result?.total ?? 0)}
              onClick={() => {
                beginRequest();
                setOffset(offset + PAGE_SIZE);
              }}
              aria-label="下一页"
            >
              <ChevronRight size={17} aria-hidden="true" />
            </button>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-blue-200 bg-blue-50 p-5 text-sm leading-6 text-blue-900">
        <strong>状态边界：</strong> `LEASED` 只表示 Worker 已保留任务。当前阶段没有执行
        Connector、没有启动 Crawl4AI，也没有生成 RawArtifact。
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
