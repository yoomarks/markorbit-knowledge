"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { History, RefreshCw, ScrollText, UserRound } from "lucide-react";
import type {
  SourceDefinition,
  SourceIntelligencePolicyAuditChangeV2,
  SourceIntelligencePolicyAuditEventV2,
  SourceIntelligencePolicyAuditHistoryV2,
  SourceIntelligencePolicyAuditValue,
} from "@markorbit/contracts";
import type { SourceListResult } from "@markorbit/persistence";

const SOURCE_LIMIT = 100;

const actionLabels: Record<SourceIntelligencePolicyAuditEventV2["action"], string> = {
  SNAPSHOT_BACKFILL: "Snapshot backfill",
  GLOBAL_POLICY_CHANGED: "Global policy changed",
  COHORT_CREATED: "Cohort created",
  COHORT_UPDATED: "Cohort updated",
  MEMBERSHIP_ADDED: "Membership added",
  MEMBERSHIP_REMOVED: "Membership removed",
};

const fieldLabels: Record<SourceIntelligencePolicyAuditChangeV2["field"], string> = {
  claimTargetHours: "领取目标",
  reviewTargetHours: "复核目标",
  name: "名称",
  description: "说明",
  priority: "Priority",
  enabled: "启用状态",
  membershipPresent: "成员关系",
};

type Snapshot = {
  policyAudit: SourceIntelligencePolicyAuditHistoryV2;
  sources: Record<string, SourceDefinition>;
};

function displayValue(value: SourceIntelligencePolicyAuditValue): string {
  if (value === null) return "∅";
  if (typeof value === "boolean") return value ? "是" : "否";
  return String(value);
}

function changeText(change: SourceIntelligencePolicyAuditChangeV2): string {
  const before = displayValue(change.before);
  const after = displayValue(change.after);
  return `${fieldLabels[change.field]}：${before} → ${after}`;
}

function eventScope(event: SourceIntelligencePolicyAuditEventV2): string {
  if (event.scope === "GLOBAL_POLICY") return "Global";
  if (event.scope === "COHORT") return event.cohortId ?? "Cohort";
  return `${event.cohortId ?? "Cohort"} / ${event.sourceId ?? "Source"}`;
}

async function readPolicyAudit(signal?: AbortSignal): Promise<Snapshot> {
  const sourceResponse = await fetch(`/api/sources?limit=${SOURCE_LIMIT}&offset=0`, { signal });
  const sourceBody = (await sourceResponse.json()) as
    | SourceListResult
    | { error?: { message?: string } };
  if (!sourceResponse.ok) {
    const message = "error" in sourceBody ? sourceBody.error?.message : undefined;
    throw new Error(message ?? "无法读取 Sources");
  }
  const sourceItems = (sourceBody as SourceListResult).items;
  const sources = Object.fromEntries(sourceItems.map((source) => [source.id, source]));
  const params = new URLSearchParams({ protocolVersion: "2.0", eventLimit: "200" });
  if (sourceItems.length) params.set("sourceIds", sourceItems.map((source) => source.id).join(","));
  const response = await fetch(`/api/source-intelligence/reviews/policy-audit?${params.toString()}`, {
    signal,
  });
  const body = (await response.json()) as {
    policyAudit?: SourceIntelligencePolicyAuditHistoryV2;
    error?: { message?: string };
  };
  if (!response.ok || !body.policyAudit) {
    throw new Error(body.error?.message ?? "无法读取 D2.15 policy audit history");
  }
  return { policyAudit: body.policyAudit, sources };
}

export function SourceIntelligencePolicyAudit() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setSnapshot(await readPolicyAudit());
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "无法读取 D2.15 policy audit history",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void readPolicyAudit(controller.signal)
      .then((next) => {
        setSnapshot(next);
        setError(null);
      })
      .catch((requestError: unknown) => {
        if (requestError instanceof DOMException && requestError.name === "AbortError") return;
        setError(
          requestError instanceof Error
            ? requestError.message
            : "无法读取 D2.15 policy audit history",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  const recentActors = useMemo(() => {
    const labels = [...new Set(snapshot?.policyAudit.events.map((event) => event.actorLabel) ?? [])];
    return labels.slice(0, 4);
  }, [snapshot]);

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="flex flex-col gap-4 border-b border-slate-200 p-5 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <History size={19} className="text-violet-700" aria-hidden="true" />
            <h2 className="font-semibold text-slate-950">D2.15 · Policy Audit &amp; Change History</h2>
          </div>
          <p className="mt-1 max-w-4xl text-sm leading-6 text-slate-500">
            记录 Global Policy、Cohort、Priority 与 Source membership 的 append-only workflow
            audit。Actor 只是记录的 operator label，不代表已认证身份；Snapshot backfill
            只保留启用审计时的当前状态，不会伪造 D2.15 之前缺失的历史。
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
      {loading ? <div className="p-6 text-sm text-slate-500">正在读取 Policy Audit…</div> : null}

      {!loading && snapshot ? (
        <div className="space-y-5 p-5">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {[
              ["可见事件", snapshot.policyAudit.eventCount],
              ["Global 变更", snapshot.policyAudit.counts.globalPolicyEvents],
              ["Cohort 变更", snapshot.policyAudit.counts.cohortEvents],
              ["Membership 变更", snapshot.policyAudit.counts.membershipEvents],
              ["Snapshot backfill", snapshot.policyAudit.counts.snapshotBackfills],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-medium text-slate-500">{label}</p>
                <p className="mt-2 text-2xl font-semibold text-slate-950">{value}</p>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <UserRound size={14} aria-hidden="true" />
            <span>最近可见 operator labels：</span>
            <span>{recentActors.length ? recentActors.join(" · ") : "暂无事件"}</span>
          </div>

          {snapshot.policyAudit.events.length === 0 ? (
            <div className="rounded-xl border border-violet-200 bg-violet-50 p-4 text-sm text-violet-900">
              当前还没有 Policy Audit event。D2.15 只记录显式 workflow configuration
              变化，不根据 Source 属性生成或推断历史。
            </div>
          ) : (
            <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
              {snapshot.policyAudit.events.map((event) => {
                const source = event.sourceId ? snapshot.sources[event.sourceId] : undefined;
                return (
                  <article key={event.eventId} className="p-4">
                    <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-xs font-semibold text-violet-800">
                            {actionLabels[event.action]}
                          </span>
                          <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-600">
                            {event.scope}
                          </span>
                          {event.historicalCompleteness === "SNAPSHOT_BACKFILL" ? (
                            <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs text-amber-800">
                              历史不完整 · snapshot only
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-2 text-sm font-medium text-slate-900">
                          {eventScope(event)}
                          {source ? ` · ${source.name}` : ""}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {event.changes.map((change) => (
                            <span
                              key={`${event.eventId}-${change.field}`}
                              className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs text-slate-700"
                            >
                              {changeText(change)}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="shrink-0 text-left text-xs text-slate-500 xl:text-right">
                        <p className="font-medium text-slate-700">{event.actorLabel}</p>
                        <p className="mt-1">{new Date(event.occurredAt).toLocaleString("zh-CN")}</p>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          <div className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs leading-5 text-slate-600">
            <ScrollText size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
            <p>
              Audit history 是运营配置的可追溯记录，不修改 D2.14 precedence、D2.13 SLA clocks、review
              disposition、ownership 或证据状态，也不会触发通知、路由、采集、Scheduler 或任何自动执行。
            </p>
          </div>
        </div>
      ) : null}
    </section>
  );
}
