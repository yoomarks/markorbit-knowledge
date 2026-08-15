from pathlib import Path

path = Path("apps/admin/src/components/sources/source-list.tsx")
text = path.read_text()


def replace_once(old: str, new: str) -> None:
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"expected one exact match, got {count}: {old[:120]!r}")
    text = text.replace(old, new, 1)


replace_once(
    'import { Archive, ChevronLeft, ChevronRight, Search } from "lucide-react";',
    'import { AlertTriangle, Archive, ChevronLeft, ChevronRight, Search } from "lucide-react";',
)

replace_once(
    '''type CollectionHealthSummary = {
  state: CollectionHealthState;
  latestRunStatus: string | null;
  latestRunAt: string | null;
  lastFailureAt: string | null;
  consecutiveFailures: number;
  failedRuns: number;
};

type SourceListPayload = SourceListResult & {
  assessments?: Record<string, SourceValueSummary>;
  collectionHealth?: Record<string, CollectionHealthSummary>;
};''',
    '''type CollectionAlertCode = "COLLECTION_OVERDUE" | "FAILURE_STREAK" | "SCHEDULER_ERROR";

type CollectionHealthAlert = {
  code: CollectionAlertCode;
  severity: "WARNING" | "CRITICAL";
  sinceAt: string | null;
  message: string;
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
  attentionRequired: boolean;
  alerts: CollectionHealthAlert[];
};

type CollectionAlertSummary = {
  sourcesRequiringAttention: number;
  totalAlerts: number;
  overdueCollections: number;
  failureStreaks: number;
  schedulerErrors: number;
};

type SourceListPayload = SourceListResult & {
  assessments?: Record<string, SourceValueSummary>;
  collectionHealth?: Record<string, CollectionHealthSummary>;
  collectionAlertSummary?: CollectionAlertSummary;
};''',
)

marker = '''function collectionHealthTone(value: CollectionHealthState): string {
  if (value === "HEALTHY") return "bg-emerald-50 text-emerald-700";
  if (value === "RETRYING" || value === "COLLECTING") return "bg-amber-50 text-amber-800";
  if (value === "FAILING") return "bg-rose-50 text-rose-700";
  return "bg-slate-100 text-slate-600";
}
'''
replace_once(
    marker,
    marker
    + '''
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
''',
)

replace_once(
    '    next: zh ? "下一页" : "Next page",\n  };',
    '''    next: zh ? "下一页" : "Next page",
    operationalAlerts: zh ? "采集运行告警" : "Collection alerts",
    overdue: zh ? "超期" : "Overdue",
    failureStreaks: zh ? "连续失败" : "Failure streaks",
    schedulerErrors: zh ? "调度异常" : "Scheduler errors",
  };''',
)

section = '      <section className="rounded-2xl border border-slate-200 bg-white">'
replace_once(
    section,
    '''      {result?.collectionAlertSummary &&
      result.collectionAlertSummary.sourcesRequiringAttention > 0 ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 shrink-0 text-amber-700" size={18} />
            <div>
              <p className="text-sm font-semibold text-amber-950">
                {zh
                  ? `${copy.operationalAlerts}：${result.collectionAlertSummary.sourcesRequiringAttention} 个来源需要关注`
                  : `${copy.operationalAlerts}: ${result.collectionAlertSummary.sourcesRequiringAttention} sources need attention`}
              </p>
              <p className="mt-1 text-xs text-amber-800">
                {zh
                  ? `当前页 · ${result.collectionAlertSummary.totalAlerts} 条告警`
                  : `Current page · ${result.collectionAlertSummary.totalAlerts} alerts`}
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
          </div>
        </div>
      ) : null}

'''
    + section,
)

replace_once(
    '''                          {collectionHealth.state === "FAILING" ? (
                            <p className="mt-1 text-[10px] text-rose-500">
                              {zh
                                ? `连续失败 ${collectionHealth.consecutiveFailures} 次`
                                : `${collectionHealth.consecutiveFailures} consecutive failures`}
                            </p>
                          ) : collectionHealth.latestRunAt ? (
                            <p className="mt-1 text-[10px] text-slate-400">
                              {new Date(collectionHealth.latestRunAt).toLocaleString(locale)}
                            </p>
                          ) : null}''',
    '''                          {collectionHealth.alerts?.length ? (
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
                          ) : null}''',
)

path.write_text(text)
