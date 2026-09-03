"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowRightLeft,
  Inbox,
  RefreshCw,
  ShieldAlert,
  UserCheck,
  UserMinus,
  Users,
} from "lucide-react";
import type {
  SourceDefinition,
  SourceIntelligenceObservationOwnershipAction,
  SourceIntelligenceObservationOwnershipQueueItemV2,
  SourceIntelligenceObservationOwnershipQueueV2,
} from "@markorbit/contracts";
import type { SourceListResult } from "@markorbit/persistence";
import { adminBrowserMutationHeaders } from "@/lib/admin-browser-api-client";

const COHORT_LIMIT = 100;
type OwnershipView = "TEAM" | "MINE" | "UNASSIGNED";

type OwnershipSnapshot = {
  queue: SourceIntelligenceObservationOwnershipQueueV2 | null;
  sources: Record<string, SourceDefinition>;
};

const flagLabels: Record<
  SourceIntelligenceObservationOwnershipQueueItemV2["flag"]["kind"],
  string
> = {
  HIGH_VALUE_UNOBSERVED: "高价值但 Evidence Unobserved",
  EVIDENCE_MATURITY_REGRESSION: "Evidence Maturity 回退",
  SOURCE_VALUE_BAND_CHANGED: "Source Value 档位变化",
  ACQUISITION_COST_INCREASED: "Acquisition Cost 代理值明显上升",
};

const statusLabels = {
  PENDING: "待处理",
  ACKNOWLEDGED: "已确认",
  IGNORED: "已忽略",
} as const;

function statusClass(status: SourceIntelligenceObservationOwnershipQueueItemV2["status"]): string {
  return {
    PENDING: "border-amber-200 bg-amber-50 text-amber-800",
    ACKNOWLEDGED: "border-emerald-200 bg-emerald-50 text-emerald-800",
    IGNORED: "border-slate-200 bg-slate-100 text-slate-700",
  }[status];
}

async function readOwnership(signal?: AbortSignal): Promise<OwnershipSnapshot> {
  const sourceResponse = await fetch(`/api/sources?limit=${COHORT_LIMIT}&offset=0`, { signal });
  const sourceBody = (await sourceResponse.json()) as
    SourceListResult | { error?: { message?: string } };
  if (!sourceResponse.ok) {
    const message = "error" in sourceBody ? sourceBody.error?.message : undefined;
    throw new Error(message ?? "无法读取 Sources");
  }
  const sourceItems = (sourceBody as SourceListResult).items;
  const sources = Object.fromEntries(sourceItems.map((source) => [source.id, source]));
  if (sourceItems.length === 0) return { queue: null, sources };

  const params = new URLSearchParams({
    protocolVersion: "2.0",
    sourceIds: sourceItems.map((source) => source.id).join(","),
    ownershipEventLimit: "100",
  });
  const response = await fetch(`/api/source-intelligence/reviews/ownership?${params.toString()}`, {
    signal,
  });
  const body = (await response.json()) as {
    ownershipQueue?: SourceIntelligenceObservationOwnershipQueueV2;
    error?: { message?: string };
  };
  if (!response.ok || !body.ownershipQueue) {
    throw new Error(body.error?.message ?? "无法读取 D2.11 ownership queue");
  }
  return { queue: body.ownershipQueue, sources };
}

export function SourceIntelligenceReviewOwnership() {
  const [snapshot, setSnapshot] = useState<OwnershipSnapshot>({ queue: null, sources: {} });
  const [operator, setOperator] = useState("admin-console");
  const [view, setView] = useState<OwnershipView>("TEAM");
  const [handoffTargets, setHandoffTargets] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const applySnapshot = useCallback((next: OwnershipSnapshot) => {
    setSnapshot(next);
    setHandoffTargets((current) => {
      const nextTargets: Record<string, string> = {};
      for (const item of next.queue?.items ?? []) {
        nextTargets[item.observationKey] = current[item.observationKey] ?? "";
      }
      return nextTargets;
    });
  }, []);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      applySnapshot(await readOwnership());
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "无法读取 ownership queue");
    } finally {
      setLoading(false);
    }
  }, [applySnapshot]);

  useEffect(() => {
    const controller = new AbortController();
    void readOwnership(controller.signal)
      .then((next) => {
        applySnapshot(next);
        setError(null);
      })
      .catch((requestError: unknown) => {
        if (requestError instanceof DOMException && requestError.name === "AbortError") return;
        setError(requestError instanceof Error ? requestError.message : "无法读取 ownership queue");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [applySnapshot]);

  async function mutateOwnership(
    item: SourceIntelligenceObservationOwnershipQueueItemV2,
    action: SourceIntelligenceObservationOwnershipAction,
    owner?: string,
  ) {
    const actor = operator.trim();
    if (!actor) {
      setError("请先填写当前 Operator label");
      return;
    }
    if ((action === "CLAIMED" || action === "TRANSFERRED") && !owner?.trim()) {
      setError("领取或转交时必须填写目标 owner");
      return;
    }
    setSavingKey(item.observationKey);
    setError(null);
    try {
      const response = await fetch("/api/source-intelligence/reviews/ownership", {
        method: "POST",
        headers: await adminBrowserMutationHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({
          protocolVersion: "2.0",
          sourceId: item.sourceId,
          observationKey: item.observationKey,
          action,
          ...(owner?.trim() ? { owner: owner.trim() } : {}),
          expectedOwner: item.owner,
        }),
      });
      const body = (await response.json()) as { error?: { message?: string } };
      if (!response.ok) throw new Error(body.error?.message ?? "无法保存 ownership handoff");
      applySnapshot(await readOwnership());
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "无法保存 ownership handoff");
    } finally {
      setSavingKey(null);
    }
  }

  const { queue, sources } = snapshot;
  const visibleItems = useMemo(() => {
    const items = queue?.items ?? [];
    if (view === "UNASSIGNED") return items.filter((item) => item.owner === null);
    if (view === "MINE") {
      const label = operator.trim();
      return label ? items.filter((item) => item.owner === label) : [];
    }
    return items;
  }, [operator, queue, view]);

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="flex flex-col gap-4 border-b border-slate-200 p-5 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Users size={19} className="text-indigo-700" aria-hidden="true" />
            <h2 className="font-semibold text-slate-950">
              D2.11 · Operator Ownership &amp; Handoff
            </h2>
          </div>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">
            为当前 Observation occurrence 记录人工负责人，支持领取、转交、释放、团队视图和个人视图。
            Owner 只是运营 workflow label，不代表已认证账号、权限或任何执行授权。
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs font-medium text-slate-600">
            当前 Operator label
            <input
              value={operator}
              onChange={(event) => setOperator(event.target.value)}
              maxLength={120}
              className="mt-1 block w-44 rounded-xl border border-slate-300 px-3 py-2 text-sm font-normal text-slate-900"
            />
          </label>
          <select
            value={view}
            onChange={(event) => setView(event.target.value as OwnershipView)}
            className="rounded-xl border border-slate-300 px-3 py-2 text-sm"
            aria-label="Ownership 视图"
          >
            <option value="TEAM">团队视图</option>
            <option value="MINE">我的工作</option>
            <option value="UNASSIGNED">未领取</option>
          </select>
          <button
            type="button"
            onClick={() => void reload()}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-3.5 py-2 text-sm font-medium text-slate-700 disabled:opacity-50"
          >
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} aria-hidden="true" />
            重新读取
          </button>
        </div>
      </div>

      {error ? (
        <div className="m-5 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          {error}
        </div>
      ) : null}
      {loading ? <div className="p-6 text-sm text-slate-500">正在读取 ownership…</div> : null}
      {!loading && !queue ? (
        <div className="p-6 text-sm text-slate-500">当前没有可进入 Ownership Queue 的 Source。</div>
      ) : null}

      {queue ? (
        <div className="space-y-5 p-5">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {[
              ["当前 Items", queue.itemCount],
              ["已分配", queue.counts.assigned],
              ["未分配", queue.counts.unassigned],
              ["已分配待处理", queue.counts.assignedPending],
              ["未分配待处理", queue.counts.unassignedPending],
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

          {queue.workloads.length > 0 ? (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Team workload
              </p>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {queue.workloads.map((workload) => (
                  <div key={workload.operator} className="rounded-xl border border-slate-200 p-4">
                    <div className="flex items-center gap-2">
                      <UserCheck size={15} className="text-indigo-700" />
                      <p className="truncate text-sm font-semibold text-slate-950">
                        {workload.operator}
                      </p>
                    </div>
                    <p className="mt-2 text-xs leading-5 text-slate-500">
                      {workload.itemCount} items · {workload.pendingCount} pending ·{" "}
                      {workload.attentionCount} ATTENTION
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {visibleItems.length === 0 ? (
            <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 text-sm text-indigo-900">
              当前视图没有 Ownership item。
            </div>
          ) : (
            <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
              {visibleItems.map((item) => {
                const source = sources[item.sourceId];
                const saving = savingKey === item.observationKey;
                const target = handoffTargets[item.observationKey] ?? "";
                return (
                  <article
                    key={item.observationKey}
                    className="grid gap-4 p-4 xl:grid-cols-[1fr_420px]"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-slate-950">
                          {flagLabels[item.flag.kind]}
                        </p>
                        <span
                          className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClass(item.status)}`}
                        >
                          {statusLabels[item.status]}
                        </span>
                        <span className="text-xs text-slate-400">{item.flag.severity}</span>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                        {source ? (
                          <Link
                            href={`/sources/${source.id}`}
                            className="font-medium text-indigo-700 hover:underline"
                          >
                            {source.name}
                          </Link>
                        ) : (
                          <span>{item.sourceId}</span>
                        )}
                        <span>{new Date(item.flag.observedAt).toLocaleString("zh-CN")}</span>
                        <span
                          className={
                            item.owner
                              ? "font-semibold text-slate-700"
                              : "font-semibold text-amber-700"
                          }
                        >
                          {item.owner ? `owner: ${item.owner}` : "未领取"}
                        </span>
                      </div>
                      <p className="mt-2 font-mono text-[11px] text-slate-400">
                        {item.observationKey}
                      </p>
                    </div>

                    <div className="space-y-2">
                      {item.owner === null ? (
                        <button
                          type="button"
                          disabled={saving || !operator.trim()}
                          onClick={() => void mutateOwnership(item, "CLAIMED", operator)}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                        >
                          <Inbox size={14} /> 领取给我
                        </button>
                      ) : (
                        <>
                          <div className="flex gap-2">
                            <input
                              value={target}
                              onChange={(event) =>
                                setHandoffTargets((current) => ({
                                  ...current,
                                  [item.observationKey]: event.target.value,
                                }))
                              }
                              maxLength={120}
                              placeholder="转交给 operator label"
                              className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-xs"
                            />
                            <button
                              type="button"
                              disabled={saving || !target.trim() || target.trim() === item.owner}
                              onClick={() => void mutateOwnership(item, "TRANSFERRED", target)}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-800 disabled:opacity-50"
                            >
                              <ArrowRightLeft size={14} /> 转交
                            </button>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {item.owner !== operator.trim() && operator.trim() ? (
                              <button
                                type="button"
                                disabled={saving}
                                onClick={() => void mutateOwnership(item, "TRANSFERRED", operator)}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-300 px-3 py-2 text-xs font-semibold text-indigo-800 disabled:opacity-50"
                              >
                                <UserCheck size={14} /> 转给我
                              </button>
                            ) : null}
                            <button
                              type="button"
                              disabled={saving}
                              onClick={() => void mutateOwnership(item, "RELEASED")}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-50"
                            >
                              <UserMinus size={14} /> 释放
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          {queue.recentOwnershipEvents.length > 0 ? (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Recent handoffs
              </p>
              <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                {queue.recentOwnershipEvents.slice(0, 8).map((event) => (
                  <div
                    key={event.eventId}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 p-3 text-xs text-slate-600"
                  >
                    <span className="font-semibold text-slate-900">{event.action}</span>
                    <span>
                      {event.previousOwner ?? "unassigned"} → {event.owner ?? "unassigned"}
                    </span>
                    <span>by {event.actor}</span>
                    <span>{new Date(event.occurredAt).toLocaleString("zh-CN")}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
            <div className="flex gap-3">
              <ShieldAlert className="mt-0.5 shrink-0" size={18} aria-hidden="true" />
              <p className="leading-6">
                D2.11 的 owner / actor 是人工填写的 workflow
                label，当前系统不把它当作已认证身份或权限。 领取、转交和释放都不会改变 D2.9
                disposition、Source Value、Evidence Maturity 或 Observation evidence； Scheduler
                仍为 <strong>{queue.scheduling.policyStatus}</strong>，不会创建或修改
                CollectionPlan、启动采集或授予 MGSN 资格。
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
