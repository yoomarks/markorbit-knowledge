import { Gauge } from "lucide-react";
import { DEFAULT_WORKSPACE } from "@markorbit/persistence";
import { listSourceChangeWatchEfficiency } from "@/server/source-change-watch-efficiency";
import { getRegistryDatabase } from "@/server/source-registry";

export function SourceChangeWatchEfficiency() {
  const summary = listSourceChangeWatchEfficiency(getRegistryDatabase(), DEFAULT_WORKSPACE.id, {
    windowHours: 24,
    limit: 6,
  });
  if (summary.completedRuns === 0 && summary.activeValidatorEndpoints === 0) return null;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Gauge size={18} className="text-blue-600" />
            <h2 className="text-sm font-semibold text-slate-950">
              变更监控效率 / Change-watch efficiency
            </h2>
          </div>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">
            最近 24 小时的客观执行结果。304 no-body 表示远端在正文下载前确认未变化；SHA no-change
            表示正文已获取，但内容身份与最新 RawArtifact 一致，因此未生成新版本。
          </p>
        </div>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">
          Active validators {summary.activeValidatorEndpoints}
        </span>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Metric label="Completed watches" value={summary.completedRuns} />
        <Metric
          label="No-change"
          value={summary.metadataOnlyRuns}
          note={`${summary.noChangeRatePercent}%`}
        />
        <Metric label="304 no-body" value={summary.http304NoBodyRuns} />
        <Metric label="SHA no-change" value={summary.bodyComparedNoChangeRuns} />
        <Metric label="Produced artifacts" value={summary.artifactProducingRuns} />
      </div>

      {summary.sources.length > 0 ? (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-xs">
            <thead className="text-slate-400">
              <tr>
                <th className="pb-2 font-medium">Source</th>
                <th className="pb-2 font-medium">Runs</th>
                <th className="pb-2 font-medium">No-change</th>
                <th className="pb-2 font-medium">304</th>
                <th className="pb-2 font-medium">SHA same</th>
                <th className="pb-2 font-medium">Validators</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {summary.sources.map((source) => (
                <tr key={source.sourceId}>
                  <td className="py-2.5 pr-4">
                    <p className="font-medium text-slate-900">{source.sourceName}</p>
                    <p className="mt-0.5 text-[10px] text-slate-400">{source.sourceId}</p>
                  </td>
                  <td className="py-2.5 text-slate-700">{source.completedRuns}</td>
                  <td className="py-2.5 text-slate-700">
                    {source.metadataOnlyRuns} ({source.noChangeRatePercent}%)
                  </td>
                  <td className="py-2.5 text-slate-700">{source.http304NoBodyRuns}</td>
                  <td className="py-2.5 text-slate-700">{source.bodyComparedNoChangeRuns}</td>
                  <td className="py-2.5 text-slate-700">{source.activeValidatorEndpoints}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}

function Metric({ label, value, note }: { label: string; value: number; note?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
      <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <div className="mt-1 flex items-baseline gap-2">
        <p className="text-2xl font-semibold text-slate-950">{value}</p>
        {note ? <span className="text-xs text-slate-500">{note}</span> : null}
      </div>
    </div>
  );
}
