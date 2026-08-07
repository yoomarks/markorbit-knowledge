"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, FileStack, Search } from "lucide-react";
import { ARTIFACT_KINDS, ARTIFACT_STATUSES } from "@markorbit/contracts";
import type { RawArtifactListResult } from "@markorbit/persistence/raw-artifacts";

const PAGE_SIZE = 20;

type Filters = {
  q: string;
  artifactKind: string;
  status: string;
  mimeType: string;
  sha256: string;
};
const initialFilters: Filters = { q: "", artifactKind: "", status: "", mimeType: "", sha256: "" };

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KiB`;
  return `${(value / 1024 / 1024).toFixed(1)} MiB`;
}

export function ArtifactList() {
  const [filters, setFilters] = useState(initialFilters);
  const [offset, setOffset] = useState(0);
  const [result, setResult] = useState<RawArtifactListResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const query = useMemo(() => {
    const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset) });
    for (const [key, value] of Object.entries(filters))
      if (value.trim()) params.set(key, value.trim());
    return params.toString();
  }, [filters, offset]);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/artifacts?${query}`, { signal: controller.signal })
      .then(async (response) => {
        const body = (await response.json()) as
          RawArtifactListResult | { error?: { message?: string } };
        if (!response.ok) {
          throw new Error(
            "error" in body
              ? (body.error?.message ?? "Unable to load artifacts")
              : "Unable to load artifacts",
          );
        }
        setResult(body as RawArtifactListResult);
      })
      .catch((requestError: unknown) => {
        if (requestError instanceof DOMException && requestError.name === "AbortError") return;
        setError(requestError instanceof Error ? requestError.message : "Unable to load artifacts");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [query]);

  function updateFilter(key: keyof Filters, value: string) {
    setLoading(true);
    setError(null);
    setOffset(0);
    setFilters((current) => ({ ...current, [key]: value }));
  }

  const summary = result?.summary;
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;
  const totalPages = Math.max(1, Math.ceil((result?.total ?? 0) / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {[
          ["文件总数", summary?.total ?? 0],
          ["已登记", summary?.REGISTERED ?? 0],
          ["待转换", summary?.READY_FOR_CONVERSION ?? 0],
          ["已转换", summary?.CONVERTED ?? 0],
          ["已归档", summary?.ARCHIVED ?? 0],
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
              <span className="sr-only">搜索文件</span>
              <Search
                className="absolute left-3 top-3 text-slate-400"
                size={17}
                aria-hidden="true"
              />
              <input
                className="w-full rounded-xl border border-slate-300 py-2.5 pl-10 pr-3 text-sm"
                placeholder="搜索文件名或 Canonical URI"
                value={filters.q}
                onChange={(event) => updateFilter("q", event.target.value)}
              />
            </label>
            <FilterSelect
              label="类型"
              value={filters.artifactKind}
              values={ARTIFACT_KINDS}
              onChange={(value) => updateFilter("artifactKind", value)}
            />
            <FilterSelect
              label="状态"
              value={filters.status}
              values={ARTIFACT_STATUSES}
              onChange={(value) => updateFilter("status", value)}
            />
            <input
              className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm"
              placeholder="MIME type"
              value={filters.mimeType}
              onChange={(event) => updateFilter("mimeType", event.target.value)}
            />
          </div>
          <input
            className="mt-3 w-full rounded-xl border border-slate-300 px-3 py-2.5 font-mono text-xs sm:max-w-xl"
            placeholder="SHA-256 精确筛选"
            value={filters.sha256}
            onChange={(event) => updateFilter("sha256", event.target.value)}
          />
        </div>

        <div className="border-b border-emerald-100 bg-emerald-50 px-5 py-3 text-sm text-emerald-900">
          RawArtifact 是不可变来源证据。相同字节只存储一次，但不同来源和执行记录保留独立
          Provenance。
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
                <th className="px-5 py-3 font-medium">文件 / 捕获时间</th>
                <th className="px-5 py-3 font-medium">类型</th>
                <th className="px-5 py-3 font-medium">来源 / 运行</th>
                <th className="px-5 py-3 font-medium">内容身份</th>
                <th className="px-5 py-3 font-medium">版本</th>
                <th className="px-5 py-3 font-medium">状态</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {result?.items.map((view) => (
                <tr key={view.artifact.id} className="hover:bg-slate-50">
                  <td className="px-5 py-4">
                    <Link
                      href={`/artifacts/${view.artifact.id}`}
                      className="font-medium text-slate-950 hover:text-emerald-700"
                    >
                      {view.artifact.originalName}
                    </Link>
                    <p className="mt-1 font-mono text-xs text-slate-500">{view.artifact.id}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {new Date(view.artifact.capturedAt).toLocaleString("zh-CN")}
                    </p>
                  </td>
                  <td className="px-5 py-4 text-slate-700">
                    <p>{view.artifact.artifactKind}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {view.artifact.mimeType} · {formatBytes(view.artifact.sizeBytes)}
                    </p>
                  </td>
                  <td className="px-5 py-4 text-slate-700">
                    <p className="font-mono text-xs">{view.artifact.sourceId}</p>
                    <Link
                      href={`/runs/${view.artifact.collectionRunId}`}
                      className="mt-1 block text-xs text-emerald-700 hover:underline"
                    >
                      {view.artifact.collectionRunId}
                    </Link>
                  </td>
                  <td className="px-5 py-4">
                    <p
                      className="max-w-48 truncate font-mono text-xs text-slate-700"
                      title={view.contentObject.sha256}
                    >
                      {view.contentObject.sha256}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {view.contentObject.referenceCount} provenance reference(s)
                    </p>
                  </td>
                  <td className="px-5 py-4 text-slate-700">
                    v{view.artifact.version}
                    {view.artifact.supersedesArtifactId ? (
                      <p className="mt-1 text-xs text-slate-500">supersedes prior</p>
                    ) : null}
                  </td>
                  <td className="px-5 py-4">
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                      {view.artifact.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!loading && result?.items.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <FileStack className="mx-auto text-slate-400" size={30} aria-hidden="true" />
            <h2 className="mt-4 font-semibold text-slate-950">尚无 RawArtifact</h2>
            <p className="mt-2 text-sm text-slate-500">
              Worker 必须通过受控流式上传、校验和 finalize 后，文件证据才会出现在这里。
            </p>
          </div>
        ) : null}
        {loading ? (
          <div className="px-6 py-12 text-center text-sm text-slate-500">
            正在读取 RawArtifact Registry…
          </div>
        ) : null}

        <div className="flex items-center justify-between border-t border-slate-200 px-5 py-4 text-sm">
          <p className="text-slate-500">
            第 {currentPage} / {totalPages} 页 · 共 {result?.total ?? 0} 条
          </p>
          <div className="flex gap-2">
            <button
              className="rounded-lg border border-slate-300 p-2 disabled:opacity-40"
              disabled={offset === 0 || loading}
              onClick={() => {
                setLoading(true);
                setOffset(Math.max(0, offset - PAGE_SIZE));
              }}
              aria-label="上一页"
            >
              <ChevronLeft size={17} />
            </button>
            <button
              className="rounded-lg border border-slate-300 p-2 disabled:opacity-40"
              disabled={loading || offset + PAGE_SIZE >= (result?.total ?? 0)}
              onClick={() => {
                setLoading(true);
                setOffset(offset + PAGE_SIZE);
              }}
              aria-label="下一页"
            >
              <ChevronRight size={17} />
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
        {values.map((item) => (
          <option key={item} value={item}>
            {item}
          </option>
        ))}
      </select>
    </label>
  );
}
