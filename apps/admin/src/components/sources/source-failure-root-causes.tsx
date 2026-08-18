import { AlertTriangle } from "lucide-react";
import { DEFAULT_WORKSPACE } from "@markorbit/persistence";
import { listSourceFailureRootCauses } from "@/server/source-failure-root-causes";
import { getRegistryDatabase } from "@/server/source-registry";

export function SourceFailureRootCauses() {
  const summary = listSourceFailureRootCauses(getRegistryDatabase(), DEFAULT_WORKSPACE.id, 8);
  if (summary.sourcesWithFailureEvidence === 0) return null;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <AlertTriangle size={18} className="text-amber-600" />
            <h2 className="text-sm font-semibold text-slate-950">
              失败根因 / Failure root causes
            </h2>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            按最新持久化 Worker 失败的错误码、域名与可重试性聚类，帮助判断批量故障还是单站故障。
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-700">
            失败证据 {summary.sourcesWithFailureEvidence}
          </span>
          <span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-800">
            可重试 {summary.retryableSources}
          </span>
          <span className="rounded-full bg-rose-50 px-2.5 py-1 text-rose-700">
            终止型 {summary.terminalSources}
          </span>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {summary.clusters.map((cluster) => (
          <article
            key={`${cluster.code}:${cluster.domain}:${cluster.retryable}`}
            className="rounded-xl border border-slate-200 bg-slate-50/70 p-3"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold text-slate-950" title={cluster.code}>
                  {cluster.code}
                </p>
                <p className="mt-1 truncate text-[11px] text-slate-500" title={cluster.domain}>
                  {cluster.domain}
                </p>
              </div>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                  cluster.retryable
                    ? "bg-amber-100 text-amber-800"
                    : "bg-rose-100 text-rose-700"
                }`}
              >
                {cluster.retryable ? "Retryable" : "Terminal"}
              </span>
            </div>
            <p className="mt-3 text-2xl font-semibold text-slate-950">{cluster.sourceCount}</p>
            <p className="text-[10px] text-slate-500">affected sources / 受影响来源</p>
            <p
              className="mt-2 line-clamp-2 text-[11px] leading-5 text-slate-600"
              title={cluster.sampleMessage}
            >
              {cluster.sampleMessage}
            </p>
            <p className="mt-2 text-[10px] text-slate-400">
              {new Date(cluster.latestOccurredAt).toLocaleString("zh-CN")}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}
