"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Cable, ChevronLeft, ChevronRight, Plus, Search } from "lucide-react";
import {
  CONNECTOR_CAPABILITIES,
  CONNECTOR_RUNTIMES,
  CONNECTOR_STATUSES,
  SOURCE_TYPES,
  type ConnectorStatus,
} from "@markorbit/contracts";
import type { ConnectorListResult } from "@markorbit/persistence/connectors";
import { adminBrowserWorkspaceHeaders } from "@/lib/admin-browser-api-client";

const PAGE_SIZE = 20;

type Filters = {
  q: string;
  runtime: string;
  status: string;
  sourceType: string;
  capability: string;
};

const initialFilters: Filters = {
  q: "",
  runtime: "",
  status: "",
  sourceType: "",
  capability: "",
};

function titleCase(value: string): string {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function StatusBadge({ status }: { status: ConnectorStatus }) {
  const classes: Record<ConnectorStatus, string> = {
    ACTIVE: "bg-emerald-50 text-emerald-700",
    DEPRECATED: "bg-amber-50 text-amber-800",
    DISABLED: "bg-slate-200 text-slate-600",
  };
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${classes[status]}`}>
      {status}
    </span>
  );
}

export function ConnectorList({ workspaceId }: { workspaceId: string }) {
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [offset, setOffset] = useState(0);
  const [result, setResult] = useState<ConnectorListResult | null>(null);
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
    fetch(`/api/connectors?${query}`, {
      headers: adminBrowserWorkspaceHeaders(workspaceId),
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = (await response.json()) as
          ConnectorListResult | { error?: { message?: string } };
        if (!response.ok) {
          const message = "error" in body ? body.error?.message : undefined;
          throw new Error(message ?? "Unable to load connectors");
        }
        setResult(body as ConnectorListResult);
      })
      .catch((requestError: unknown) => {
        if (requestError instanceof DOMException && requestError.name === "AbortError") return;
        setError(
          requestError instanceof Error ? requestError.message : "Unable to load connectors",
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
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {[
          ["Connector IDs", summary?.connectorIds ?? 0],
          ["版本总数", summary?.totalVersions ?? 0],
          ["启用", summary?.ACTIVE ?? 0],
          ["已弃用", summary?.DEPRECATED ?? 0],
          ["已禁用", summary?.DISABLED ?? 0],
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
              <span className="sr-only">搜索 Connector</span>
              <Search
                className="absolute left-3 top-3 text-slate-400"
                size={17}
                aria-hidden="true"
              />
              <input
                className="w-full rounded-xl border border-slate-300 py-2.5 pl-10 pr-3 text-sm"
                placeholder="搜索 Connector ID 或显示名称"
                value={filters.q}
                onChange={(event) => updateFilter("q", event.target.value)}
              />
            </label>
            <FilterSelect
              label="Runtime"
              value={filters.runtime}
              values={CONNECTOR_RUNTIMES}
              onChange={(value) => updateFilter("runtime", value)}
            />
            <FilterSelect
              label="状态"
              value={filters.status}
              values={CONNECTOR_STATUSES}
              onChange={(value) => updateFilter("status", value)}
            />
            <FilterSelect
              label="来源类型"
              value={filters.sourceType}
              values={SOURCE_TYPES}
              onChange={(value) => updateFilter("sourceType", value)}
            />
          </div>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="w-full sm:max-w-sm">
              <FilterSelect
                label="Capability"
                value={filters.capability}
                values={CONNECTOR_CAPABILITIES}
                onChange={(value) => updateFilter("capability", value)}
              />
            </div>
            <Link
              href="/connectors/new"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-medium text-white"
            >
              <Plus size={17} aria-hidden="true" />
              注册新版本
            </Link>
          </div>
        </div>

        {error ? (
          <div className="m-5 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
            {error}
          </div>
        ) : null}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3 font-medium">Connector</th>
                <th className="px-5 py-3 font-medium">Runtime</th>
                <th className="px-5 py-3 font-medium">来源类型</th>
                <th className="px-5 py-3 font-medium">Capabilities</th>
                <th className="px-5 py-3 font-medium">绑定来源</th>
                <th className="px-5 py-3 font-medium">Registry</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {result?.items.map((record) => {
                const manifest = record.manifest;
                return (
                  <tr
                    key={`${manifest.connectorId}@${manifest.version}`}
                    className="hover:bg-slate-50"
                  >
                    <td className="px-5 py-4">
                      <Link
                        href={`/connectors/${encodeURIComponent(manifest.connectorId)}/${encodeURIComponent(manifest.version)}`}
                        className="font-medium text-slate-950 hover:text-emerald-700"
                      >
                        {manifest.displayName}
                      </Link>
                      <p className="mt-1 text-xs text-slate-500">
                        {manifest.connectorId}@{manifest.version}
                      </p>
                    </td>
                    <td className="px-5 py-4 text-slate-700">
                      <p>{manifest.runtime}</p>
                      <p className="mt-1 text-xs text-slate-500">Health: not evaluated</p>
                    </td>
                    <td className="px-5 py-4 text-slate-700">{manifest.sourceTypes.join(", ")}</td>
                    <td className="px-5 py-4 text-slate-700">
                      <p>{manifest.capabilities.slice(0, 3).join(", ") || "—"}</p>
                      {manifest.capabilities.length > 3 ? (
                        <p className="mt-1 text-xs text-slate-500">
                          +{manifest.capabilities.length - 3} more
                        </p>
                      ) : null}
                    </td>
                    <td className="px-5 py-4 text-slate-700">{record.boundSourceCount}</td>
                    <td className="px-5 py-4">
                      <StatusBadge status={manifest.status} />
                      <p className="mt-2 text-xs text-slate-500">
                        {new Date(record.updatedAt).toLocaleString("zh-CN")}
                      </p>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {!loading && result?.items.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <Cable className="mx-auto text-slate-400" size={30} aria-hidden="true" />
            <h2 className="mt-4 font-semibold text-slate-950">尚无匹配的 Connector 版本</h2>
            <p className="mt-2 text-sm text-slate-500">
              清除筛选条件，或登记一个新的不可变 Manifest 版本。
            </p>
          </div>
        ) : null}

        {loading ? (
          <div className="px-6 py-12 text-center text-sm text-slate-500">
            正在读取 Connector Registry…
          </div>
        ) : null}

        <div className="flex items-center justify-between border-t border-slate-200 px-5 py-4 text-sm">
          <p className="text-slate-500">
            第 {currentPage} / {totalPages} 页 · 共 {result?.total ?? 0} 个版本
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
