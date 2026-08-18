import { Activity } from "lucide-react";
import { DEFAULT_WORKSPACE } from "@markorbit/persistence";
import { listSourceChangeAlerts } from "@/server/source-change-alerts";
import { getRegistryDatabase } from "@/server/source-registry";

export function SourceChangeAlerts() {
  const summary = listSourceChangeAlerts(getRegistryDatabase(), DEFAULT_WORKSPACE.id, {
    windowHours: 24,
    limit: 8,
  });
  if (summary.updateEvents === 0) return null;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Activity size={18} className="text-blue-600" />
            <h2 className="text-sm font-semibold text-slate-950">来源变化 / Source changes</h2>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            最近 24 小时已进入检索索引的客观内容变化；这里只展示版本与章节变化事实，不判断业务重要性。
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-full bg-blue-50 px-2.5 py-1 text-blue-700">
            来源 {summary.changedSources}
          </span>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-700">
            文档 {summary.changedDocuments}
          </span>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-700">
            章节 {summary.changedSections}
          </span>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {summary.alerts.map((alert) => (
          <article
            key={alert.sourceId}
            className="rounded-xl border border-slate-200 bg-slate-50/70 p-3"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold text-slate-950" title={alert.sourceName}>
                  {alert.sourceName}
                </p>
                <p className="mt-1 truncate text-[10px] text-slate-400" title={alert.sourceId}>
                  {alert.sourceId}
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-700">
                v{alert.latestVersion}
              </span>
            </div>

            <div className="mt-3 flex gap-4">
              <div>
                <p className="text-xl font-semibold text-slate-950">{alert.changedDocuments}</p>
                <p className="text-[10px] text-slate-500">changed docs</p>
              </div>
              <div>
                <p className="text-xl font-semibold text-slate-950">{alert.changedSections}</p>
                <p className="text-[10px] text-slate-500">changed sections</p>
              </div>
            </div>

            <p className="mt-3 text-[11px] leading-5 text-slate-600">
              最新版本：+{alert.latestSummary.addedSections} / −{alert.latestSummary.removedSections} / ≈
              {alert.latestSummary.modifiedSections}
            </p>
            <p className="mt-2 text-[10px] text-slate-400">
              {new Date(alert.latestObservedAt).toLocaleString("zh-CN")}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}
