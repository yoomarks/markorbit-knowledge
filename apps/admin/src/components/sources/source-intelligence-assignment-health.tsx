"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Activity, Clock3, RefreshCw, Scale, UserRoundCheck, UsersRound } from "lucide-react";
import type {
  SourceDefinition,
  SourceIntelligenceAssignmentHealthAndCapacityV2,
} from "@markorbit/contracts";
import type { SourceListResult } from "@markorbit/persistence";

const COHORT_LIMIT = 100;

type AssignmentHealthSnapshot = {
  health: SourceIntelligenceAssignmentHealthAndCapacityV2 | null;
  sources: Record<string, SourceDefinition>;
};

const flagLabels: Record<
  SourceIntelligenceAssignmentHealthAndCapacityV2["unassignedBacklog"]["oldestItems"][number]["flagKind"],
  string
> = {
  HIGH_VALUE_UNOBSERVED: "高价值但 Evidence Unobserved",
  EVIDENCE_MATURITY_REGRESSION: "Evidence Maturity 回退",
  SOURCE_VALUE_BAND_CHANGED: "Source Value 档位变化",
  ACQUISITION_COST_INCREASED: "Acquisition Cost 代理值明显上升",
};

function hoursLabel(value: number | null): string {
  if (value === null) return "—";
  if (value < 24) return `${value.toFixed(value < 10 ? 1 : 0)}h`;
  return `${(value / 24).toFixed(value < 72 ? 1 : 0)}d`;
}

function ratioLabel(value: number | null): string {
  if (value === null) return "—";
  return `${Math.round(value * 100)}%`;
}

async function readAssignmentHealth(signal?: AbortSignal): Promise<AssignmentHealthSnapshot> {
  const sourceResponse = await fetch(`/api/sources?limit=${COHORT_LIMIT}&offset=0`, { signal });
  const sourceBody = (await sourceResponse.json()) as
    SourceListResult | { error?: { message?: string } };
  if (!sourceResponse.ok) {
    const message = "error" in sourceBody ? sourceBody.error?.message : undefined;
    throw new Error(message ?? "无法读取 Sources");
  }
  const sourceItems = (sourceBody as SourceListResult).items;
  const sources = Object.fromEntries(sourceItems.map((source) => [source.id, source]));
  if (sourceItems.length === 0) return { health: null, sources };

  const params = new URLSearchParams({
    protocolVersion: "2.0",
    sourceIds: sourceItems.map((source) => source.id).join(","),
    ownershipEventLimit: "500",
  });
  const response = await fetch(
    `/api/source-intelligence/reviews/assignment-health?${params.toString()}`,
    { signal },
  );
  const body = (await response.json()) as {
    assignmentHealth?: SourceIntelligenceAssignmentHealthAndCapacityV2;
    error?: { message?: string };
  };
  if (!response.ok || !body.assignmentHealth) {
    throw new Error(body.error?.message ?? "无法读取 D2.12 assignment health");
  }
  return { health: body.assignmentHealth, sources };
}

export function SourceIntelligenceAssignmentHealth() {
  const [snapshot, setSnapshot] = useState<AssignmentHealthSnapshot>({
    health: null,
    sources: {},
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setSnapshot(await readAssignmentHealth());
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "无法读取 assignment health");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void readAssignmentHealth(controller.signal)
      .then((next) => {
        setSnapshot(next);
        setError(null);
      })
      .catch((requestError: unknown) => {
        if (requestError instanceof DOMException && requestError.name === "AbortError") return;
        setError(
          requestError instanceof Error ? requestError.message : "无法读取 assignment health",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  const { health, sources } = snapshot;

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="flex flex-col gap-4 border-b border-slate-200 p-5 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Activity size={19} className="text-violet-700" aria-hidden="true" />
            <h2 className="font-semibold text-slate-950">
              D2.12 · Assignment Health &amp; Capacity
            </h2>
          </div>
          <p className="mt-1 max-w-4xl text-sm leading-6 text-slate-500">
            观察未领取时长、当前 assignment tenure、首次领取耗时、handoff 事件与 Operator workload
            shape。这里的“Capacity”只表示当前可见工作负载，不代表人员真实可用产能，也不会自动派单。
          </p>
        </div>
        <button
          type="button"
          onClick={() => void reload()}
          disabled={loading}
          className="inline-flex items-center gap-2 self-start rounded-xl border border-slate-300 px-3.5 py-2 text-sm font-medium text-slate-700 disabled:opacity-50"
        >
          <RefreshCw size={15} className={loading ? "animate-spin" : ""} aria-hidden="true" />
          重新读取
        </button>
      </div>

      {error ? (
        <div className="m-5 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          {error}
        </div>
      ) : null}
      {loading ? (
        <div className="p-6 text-sm text-slate-500">正在读取 assignment health…</div>
      ) : null}
      {!loading && !health ? (
        <div className="p-6 text-sm text-slate-500">
          当前没有可进入 Assignment Health 的 Source。
        </div>
      ) : null}

      {health ? (
        <div className="space-y-6 p-5">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {[
              ["未领取待处理", health.unassignedBacklog.pendingCount],
              ["最老未领取", hoursLabel(health.unassignedBacklog.oldestPendingAgeHours)],
              ["首次领取中位", hoursLabel(health.firstClaimLatency.medianHours)],
              ["Transfer events", health.handoffs.transferCount],
              ["Pending spread", health.workloadShape.pendingSpread ?? "—"],
            ].map(([label, value]) => (
              <div
                key={String(label)}
                className="rounded-xl border border-slate-200 bg-slate-50 p-4"
              >
                <p className="text-xs font-medium text-slate-500">{label}</p>
                <p className="mt-2 text-2xl font-semibold text-slate-950">{value}</p>
              </div>
            ))}
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
            <div className="rounded-xl border border-slate-200 p-4">
              <div className="flex items-center gap-2">
                <UsersRound size={16} className="text-violet-700" aria-hidden="true" />
                <h3 className="text-sm font-semibold text-slate-950">Operator workload shape</h3>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  ["Operators", health.workloadShape.operatorCount],
                  ["Assigned pending", health.workloadShape.assignedPendingCount],
                  ["Max share", ratioLabel(health.workloadShape.maxPendingShare)],
                  ["CV", health.workloadShape.coefficientOfVariation ?? "—"],
                ].map(([label, value]) => (
                  <div key={String(label)} className="rounded-lg bg-slate-50 p-3">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                      {label}
                    </p>
                    <p className="mt-1 text-lg font-semibold text-slate-900">{value}</p>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-xs leading-5 text-slate-500">
                Spread、Max share 与 CV 只是当前 workload 的描述性形状，不是人员能力评分、SLA
                判断或自动 routing policy。
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 p-4">
              <div className="flex items-center gap-2">
                <Clock3 size={16} className="text-violet-700" aria-hidden="true" />
                <h3 className="text-sm font-semibold text-slate-950">Unassigned age buckets</h3>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                {[
                  ["< 24h", health.unassignedBacklog.ageBuckets.under24Hours],
                  ["24–72h", health.unassignedBacklog.ageBuckets.from24To72Hours],
                  ["3–7d", health.unassignedBacklog.ageBuckets.from72HoursTo7Days],
                  ["≥ 7d", health.unassignedBacklog.ageBuckets.atLeast7Days],
                ].map(([label, value]) => (
                  <div key={String(label)} className="rounded-lg bg-slate-50 p-3">
                    <p className="text-xs text-slate-500">{label}</p>
                    <p className="mt-1 text-xl font-semibold text-slate-900">{value}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {health.operators.length > 0 ? (
            <div>
              <div className="mb-2 flex items-center gap-2">
                <UserRoundCheck size={16} className="text-violet-700" aria-hidden="true" />
                <h3 className="text-sm font-semibold text-slate-950">Current operator load</h3>
              </div>
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Operator</th>
                      <th className="px-4 py-3 font-semibold">Pending</th>
                      <th className="px-4 py-3 font-semibold">ATTENTION</th>
                      <th className="px-4 py-3 font-semibold">Oldest pending</th>
                      <th className="px-4 py-3 font-semibold">Oldest assignment</th>
                      <th className="px-4 py-3 font-semibold">Handoff in / out</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {health.operators.map((operator) => (
                      <tr key={operator.operator}>
                        <td className="px-4 py-3 font-semibold text-slate-900">
                          {operator.operator}
                        </td>
                        <td className="px-4 py-3 text-slate-700">
                          {operator.pendingCount} / {operator.assignedItemCount}
                        </td>
                        <td className="px-4 py-3 text-slate-700">
                          {operator.attentionPendingCount}
                        </td>
                        <td className="px-4 py-3 text-slate-700">
                          {hoursLabel(operator.oldestPendingAgeHours)}
                        </td>
                        <td className="px-4 py-3 text-slate-700">
                          {hoursLabel(operator.oldestCurrentAssignmentAgeHours)}
                        </td>
                        <td className="px-4 py-3 text-slate-700">
                          {operator.transferInEventCount} / {operator.transferOutEventCount}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-violet-200 bg-violet-50 p-4 text-sm text-violet-900">
              当前没有已分配给 Operator 的 Observation occurrence。
            </div>
          )}

          {health.unassignedBacklog.oldestItems.length > 0 ? (
            <div>
              <div className="mb-2 flex items-center gap-2">
                <Scale size={16} className="text-amber-700" aria-hidden="true" />
                <h3 className="text-sm font-semibold text-slate-950">Oldest unassigned pending</h3>
              </div>
              <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                {health.unassignedBacklog.oldestItems.slice(0, 8).map((item) => {
                  const source = sources[item.sourceId];
                  return (
                    <div
                      key={item.observationKey}
                      className="flex flex-col gap-2 p-4 md:flex-row md:items-center md:justify-between"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold text-slate-900">
                            {flagLabels[item.flagKind]}
                          </p>
                          <span className="text-xs font-semibold text-amber-700">
                            {item.severity}
                          </span>
                        </div>
                        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
                          {source ? (
                            <Link
                              href={`/sources/${source.id}`}
                              className="font-medium text-violet-700 hover:underline"
                            >
                              {source.name}
                            </Link>
                          ) : (
                            <span>{item.sourceId}</span>
                          )}
                          <span>{new Date(item.observedAt).toLocaleString("zh-CN")}</span>
                        </div>
                      </div>
                      <p className="text-sm font-semibold text-slate-900">
                        {hoursLabel(item.ageHours)}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          <div className="rounded-xl border border-violet-200 bg-violet-50 p-4 text-xs leading-5 text-violet-900">
            D2.12 的年龄全部是人工工作流年龄，不会降低 Evidence Maturity；首次领取耗时只统计当前
            occurrence 中、在 bounded ownership event window 内能看到首个 CLAIMED 事件的样本。Owner
            label 不是认证身份，Capacity 不是人员可用性，所有指标都不授权 Scheduler、CollectionPlan
            或自动派单。
          </div>
        </div>
      ) : null}
    </section>
  );
}
