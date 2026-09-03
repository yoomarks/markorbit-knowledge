"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlarmClock,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  RefreshCw,
  Save,
  ShieldAlert,
} from "lucide-react";
import type {
  SourceDefinition,
  SourceIntelligenceManualEscalationAction,
  SourceIntelligenceManualSlaAndEscalationV2,
  SourceIntelligenceManualSlaItemV2,
  SourceIntelligenceManualSlaState,
} from "@markorbit/contracts";
import type { SourceListResult } from "@markorbit/persistence";
import { adminBrowserMutationHeaders } from "@/lib/admin-browser-api-client";

const COHORT_LIMIT = 100;

type Snapshot = {
  manualSla: SourceIntelligenceManualSlaAndEscalationV2 | null;
  sources: Record<string, SourceDefinition>;
};

const stateLabels: Record<SourceIntelligenceManualSlaState, string> = {
  DISABLED: "未启用",
  NOT_STARTED: "未开始",
  WITHIN_TARGET: "目标内",
  OVER_TARGET: "已超目标",
  COMPLETED: "已完成",
};

function stateClass(state: SourceIntelligenceManualSlaState): string {
  return {
    DISABLED: "border-slate-200 bg-slate-100 text-slate-600",
    NOT_STARTED: "border-slate-200 bg-white text-slate-600",
    WITHIN_TARGET: "border-emerald-200 bg-emerald-50 text-emerald-800",
    OVER_TARGET: "border-rose-200 bg-rose-50 text-rose-800",
    COMPLETED: "border-indigo-200 bg-indigo-50 text-indigo-800",
  }[state];
}

function formatHours(value: number | null): string {
  if (value === null) return "—";
  if (value < 24) return `${value}h`;
  return `${Math.round((value / 24) * 10) / 10}d`;
}

function targetInput(value: number | null | undefined): string {
  return value === null || value === undefined ? "" : String(value);
}

async function readManualSla(signal?: AbortSignal): Promise<Snapshot> {
  const sourceResponse = await fetch(`/api/sources?limit=${COHORT_LIMIT}&offset=0`, { signal });
  const sourceBody = (await sourceResponse.json()) as
    SourceListResult | { error?: { message?: string } };
  if (!sourceResponse.ok) {
    const message = "error" in sourceBody ? sourceBody.error?.message : undefined;
    throw new Error(message ?? "无法读取 Sources");
  }
  const sourceItems = (sourceBody as SourceListResult).items;
  const sources = Object.fromEntries(sourceItems.map((source) => [source.id, source]));
  if (sourceItems.length === 0) return { manualSla: null, sources };

  const params = new URLSearchParams({
    protocolVersion: "2.0",
    sourceIds: sourceItems.map((source) => source.id).join(","),
    escalationEventLimit: "200",
  });
  const response = await fetch(`/api/source-intelligence/reviews/manual-sla?${params.toString()}`, {
    signal,
  });
  const body = (await response.json()) as {
    manualSla?: SourceIntelligenceManualSlaAndEscalationV2;
    error?: { message?: string };
  };
  if (!response.ok || !body.manualSla) {
    throw new Error(body.error?.message ?? "无法读取 D2.13 manual SLA");
  }
  return { manualSla: body.manualSla, sources };
}

function clockText(clock: SourceIntelligenceManualSlaItemV2["claim"]): string {
  if (clock.state === "OVER_TARGET") {
    return `已用 ${formatHours(clock.elapsedHours)} · 超 ${formatHours(clock.overdueHours)}`;
  }
  if (clock.state === "WITHIN_TARGET") {
    return `已用 ${formatHours(clock.elapsedHours)} / ${formatHours(clock.targetHours)}`;
  }
  if (clock.state === "NOT_STARTED") return `目标 ${formatHours(clock.targetHours)} · 等待领取`;
  if (clock.state === "COMPLETED") return `目标 ${formatHours(clock.targetHours)} · 已结束计时`;
  return "未配置目标";
}

export function SourceIntelligenceManualSla() {
  const [snapshot, setSnapshot] = useState<Snapshot>({ manualSla: null, sources: {} });
  const [actor, setActor] = useState("admin-console");
  const [claimTarget, setClaimTarget] = useState("");
  const [reviewTarget, setReviewTarget] = useState("");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [savingPolicy, setSavingPolicy] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const applySnapshot = useCallback((next: Snapshot) => {
    setSnapshot(next);
    setClaimTarget(targetInput(next.manualSla?.policy?.claimTargetHours));
    setReviewTarget(targetInput(next.manualSla?.policy?.reviewTargetHours));
    setNotes((current) => {
      const nextNotes: Record<string, string> = {};
      for (const item of next.manualSla?.items ?? []) {
        nextNotes[item.observationKey] =
          current[item.observationKey] ?? item.escalation?.note ?? "";
      }
      return nextNotes;
    });
  }, []);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      applySnapshot(await readManualSla());
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "无法读取 D2.13 manual SLA");
    } finally {
      setLoading(false);
    }
  }, [applySnapshot]);

  useEffect(() => {
    const controller = new AbortController();
    void readManualSla(controller.signal)
      .then((next) => {
        applySnapshot(next);
        setError(null);
      })
      .catch((requestError: unknown) => {
        if (requestError instanceof DOMException && requestError.name === "AbortError") return;
        setError(
          requestError instanceof Error ? requestError.message : "无法读取 D2.13 manual SLA",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [applySnapshot]);

  const parseTarget = (value: string, label: string): number | null => {
    if (!value.trim()) return null;
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 8760) {
      throw new Error(`${label}必须是 1–8760 的整数小时，留空表示关闭`);
    }
    return parsed;
  };

  async function savePolicy() {
    const operator = actor.trim();
    if (!operator) {
      setError("请先填写当前 Operator label");
      return;
    }
    setSavingPolicy(true);
    setError(null);
    try {
      const response = await fetch("/api/source-intelligence/reviews/manual-sla", {
        method: "PUT",
        headers: await adminBrowserMutationHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({
          protocolVersion: "2.0",
          claimTargetHours: parseTarget(claimTarget, "领取目标"),
          reviewTargetHours: parseTarget(reviewTarget, "复核目标"),
          expectedUpdatedAt: snapshot.manualSla?.policy?.updatedAt ?? null,
        }),
      });
      const body = (await response.json()) as { error?: { message?: string } };
      if (!response.ok) throw new Error(body.error?.message ?? "无法保存 Manual SLA policy");
      applySnapshot(await readManualSla());
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "无法保存 Manual SLA policy");
    } finally {
      setSavingPolicy(false);
    }
  }

  async function mutateEscalation(
    item: SourceIntelligenceManualSlaItemV2,
    action: SourceIntelligenceManualEscalationAction,
  ) {
    const operator = actor.trim();
    if (!operator) {
      setError("请先填写当前 Operator label");
      return;
    }
    setSavingKey(item.observationKey);
    setError(null);
    try {
      const response = await fetch("/api/source-intelligence/reviews/manual-sla", {
        method: "POST",
        headers: await adminBrowserMutationHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({
          protocolVersion: "2.0",
          sourceId: item.sourceId,
          observationKey: item.observationKey,
          action,
          note: notes[item.observationKey] ?? "",
          expectedEscalated: item.escalated,
        }),
      });
      const body = (await response.json()) as { error?: { message?: string } };
      if (!response.ok) throw new Error(body.error?.message ?? "无法保存 escalation state");
      applySnapshot(await readManualSla());
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "无法保存 escalation state");
    } finally {
      setSavingKey(null);
    }
  }

  const { manualSla, sources } = snapshot;
  const targetSummary = useMemo(() => {
    const policy = manualSla?.policy;
    if (!policy) return "尚未配置人工 workflow targets";
    return `领取 ${formatHours(policy.claimTargetHours)} · 复核 ${formatHours(policy.reviewTargetHours)}`;
  }, [manualSla?.policy]);

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="flex flex-col gap-4 border-b border-slate-200 p-5 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <AlarmClock size={19} className="text-rose-700" aria-hidden="true" />
            <h2 className="font-semibold text-slate-950">
              D2.13 · Manual SLA &amp; Escalation Policy
            </h2>
          </div>
          <p className="mt-1 max-w-4xl text-sm leading-6 text-slate-500">
            人工定义领取与复核的运营目标，并对当前 occurrence 手动标记升级。这里的 SLA 只是内部
            workflow target， 不是 Evidence freshness、法律时限或合同
            SLA；超目标不会自动升级、通知、转交或执行。
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
      {loading ? <div className="p-6 text-sm text-slate-500">正在读取 Manual SLA…</div> : null}
      {!loading && !manualSla ? (
        <div className="p-6 text-sm text-slate-500">
          当前没有 Source 可用于计算 Manual SLA 状态。
        </div>
      ) : null}

      {manualSla ? (
        <div className="space-y-5 p-5">
          <div className="rounded-xl border border-rose-100 bg-rose-50/60 p-4">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-rose-700">
                  Human-configured workflow targets
                </p>
                <p className="mt-1 text-sm text-slate-700">{targetSummary}</p>
                {manualSla.policy ? (
                  <p className="mt-1 text-xs text-slate-500">
                    最近由 {manualSla.policy.updatedBy} 于{" "}
                    {new Date(manualSla.policy.updatedAt).toLocaleString("zh-CN")} 更新
                  </p>
                ) : null}
              </div>
              <div className="flex flex-wrap items-end gap-2">
                <label className="text-xs font-medium text-slate-600">
                  Operator label
                  <input
                    value={actor}
                    onChange={(event) => setActor(event.target.value)}
                    maxLength={120}
                    className="mt-1 block w-40 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-900"
                  />
                </label>
                <label className="text-xs font-medium text-slate-600">
                  领取目标（小时）
                  <input
                    inputMode="numeric"
                    value={claimTarget}
                    onChange={(event) => setClaimTarget(event.target.value)}
                    placeholder="留空关闭"
                    className="mt-1 block w-32 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-900"
                  />
                </label>
                <label className="text-xs font-medium text-slate-600">
                  复核目标（小时）
                  <input
                    inputMode="numeric"
                    value={reviewTarget}
                    onChange={(event) => setReviewTarget(event.target.value)}
                    placeholder="留空关闭"
                    className="mt-1 block w-32 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-900"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => void savePolicy()}
                  disabled={savingPolicy || !actor.trim()}
                  className="inline-flex items-center gap-2 rounded-lg bg-rose-700 px-3.5 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  <Save size={15} /> 保存人工目标
                </button>
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {[
              ["未领取 Pending", manualSla.counts.unassignedPending],
              ["领取超目标", manualSla.counts.claimOverTarget],
              ["复核超目标", manualSla.counts.reviewOverTarget],
              ["人工升级", manualSla.counts.escalated],
              ["超目标未升级", manualSla.counts.overTargetAndNotEscalated],
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

          {manualSla.items.length === 0 ? (
            <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 text-sm text-indigo-900">
              当前没有进入 D2.13 的 Observation occurrence。
            </div>
          ) : (
            <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
              {manualSla.items.map((item) => {
                const source = sources[item.sourceId];
                const saving = savingKey === item.observationKey;
                return (
                  <article
                    key={item.observationKey}
                    className="grid gap-4 p-4 xl:grid-cols-[1fr_420px]"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        {source ? (
                          <Link
                            href={`/sources/${source.id}`}
                            className="text-sm font-semibold text-indigo-700 hover:underline"
                          >
                            {source.name}
                          </Link>
                        ) : (
                          <p className="text-sm font-semibold text-slate-950">{item.sourceId}</p>
                        )}
                        <span className="text-xs text-slate-400">{item.flagKind}</span>
                        {item.escalated ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-rose-300 bg-rose-100 px-2.5 py-1 text-xs font-semibold text-rose-800">
                            <ShieldAlert size={12} /> 人工升级
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-2 text-xs leading-5 text-slate-500">
                        {item.owner ? `owner: ${item.owner}` : "未领取"} · Review{" "}
                        {item.reviewStatus} · observed{" "}
                        {new Date(item.observedAt).toLocaleString("zh-CN")}
                      </p>
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        <div className="rounded-lg border border-slate-200 p-3">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-semibold text-slate-600">领取目标</span>
                            <span
                              className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${stateClass(item.claim.state)}`}
                            >
                              {stateLabels[item.claim.state]}
                            </span>
                          </div>
                          <p className="mt-2 text-xs text-slate-500">{clockText(item.claim)}</p>
                        </div>
                        <div className="rounded-lg border border-slate-200 p-3">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-semibold text-slate-600">复核目标</span>
                            <span
                              className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${stateClass(item.review.state)}`}
                            >
                              {stateLabels[item.review.state]}
                            </span>
                          </div>
                          <p className="mt-2 text-xs text-slate-500">{clockText(item.review)}</p>
                        </div>
                      </div>
                      <p className="mt-2 font-mono text-[11px] text-slate-400">
                        {item.observationKey}
                      </p>
                    </div>

                    <div className="space-y-2">
                      <textarea
                        value={notes[item.observationKey] ?? ""}
                        onChange={(event) =>
                          setNotes((current) => ({
                            ...current,
                            [item.observationKey]: event.target.value,
                          }))
                        }
                        maxLength={2000}
                        rows={3}
                        placeholder="人工升级说明（可选）"
                        className="w-full resize-none rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900"
                      />
                      {item.escalated ? (
                        <button
                          type="button"
                          disabled={saving || !actor.trim()}
                          onClick={() => void mutateEscalation(item, "CLEARED")}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 disabled:opacity-50"
                        >
                          <CheckCircle2 size={14} /> 清除人工升级
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={saving || !actor.trim()}
                          onClick={() => void mutateEscalation(item, "ESCALATED")}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-800 disabled:opacity-50"
                        >
                          <AlertTriangle size={14} /> 人工升级
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          {manualSla.recentEscalationEvents.length > 0 ? (
            <div>
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <Clock3 size={14} /> Recent manual escalation activity
              </div>
              <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                {manualSla.recentEscalationEvents.slice(0, 12).map((event) => (
                  <div
                    key={event.eventId}
                    className="flex flex-wrap items-center justify-between gap-2 p-3 text-xs"
                  >
                    <span className="font-medium text-slate-700">
                      {event.action} · {event.actor} · {event.sourceId}
                    </span>
                    <span className="text-slate-400">
                      {new Date(event.occurredAt).toLocaleString("zh-CN")}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-900">
            <ShieldAlert size={16} className="mt-0.5 shrink-0" />
            <p>
              D2.13 只提供人工 workflow target 与人工 escalation
              state。超目标不会触发通知、自动升级、自动转交、 CollectionPlan、采集、Scheduler
              或任何执行行为；Operator label 仍不是经过认证的身份。
            </p>
          </div>
        </div>
      ) : null}
    </section>
  );
}
