"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { ConversionRun } from "@markorbit/contracts";
type Result = { items: ConversionRun[]; total: number; limit: number; offset: number };
export function ConversionRunList() {
  const [data, setData] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const c = new AbortController();
    fetch("/api/conversion-runs?limit=25", { signal: c.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error(await r.text());
        return r.json() as Promise<Result>;
      })
      .then(setData)
      .catch((e) => {
        if (!c.signal.aborted) setError(e instanceof Error ? e.message : "Failed");
      });
    return () => c.abort();
  }, []);
  if (error)
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        ConversionRun 加载失败：{error}
      </div>
    );
  if (!data)
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
        加载 ConversionRun ledger…
      </div>
    );
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <strong>Awaiting conversion runtime</strong> / 等待转换运行时处理。此模块只记录 PENDING
        intent 与 append-only events，不生成 Markdown、Staging 或 Obsidian 同步。
      </div>
      <div className="flex justify-end">
        <Link
          href="/conversion-runs/dispatch"
          className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-medium text-white"
        >
          Manual Dispatch
        </Link>
      </div>
      {data.items.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
          暂无真实 ConversionRun。请从 Manual Dispatch 创建 PENDING ConversionRun。
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="p-3">Run ID</th>
                <th>Artifact</th>
                <th>Profile</th>
                <th>Converter</th>
                <th>Status</th>
                <th>Trigger</th>
                <th>Created</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="p-3 font-mono">
                    <Link className="text-blue-700" href={`/conversion-runs/${r.id}`}>
                      {r.id}
                    </Link>
                  </td>
                  <td className="font-mono">{r.rawArtifactId}</td>
                  <td className="font-mono">{r.conversionProfileId}</td>
                  <td>
                    {r.converter.converterId}@{r.converter.version}
                  </td>
                  <td>{r.status}</td>
                  <td>{r.trigger}</td>
                  <td>{r.createdAt}</td>
                  <td>{r.updatedAt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
