"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, CheckCircle2, ExternalLink, RefreshCw } from "lucide-react";
import type { FoundationalRemediationQueueSnapshot } from "@markorbit/worker-runtime/foundational-remediation-snapshot";

const STAGE_ORDER = [
  "REGISTER",
  "COLLECT",
  "INGEST",
  "CONVERT",
  "INDEX",
  "QUALITY",
  "RELEVANCE",
  "HEALTH",
  "READY",
] as const;

const STAGE_LABELS: Record<(typeof STAGE_ORDER)[number], string> = {
  REGISTER: "Register",
  COLLECT: "Collect",
  INGEST: "Ingest",
  CONVERT: "Convert",
  INDEX: "Index",
  QUALITY: "Quality",
  RELEVANCE: "Relevance",
  HEALTH: "Health",
  READY: "Ready",
};

type Jurisdiction = "US" | "WO";
type Snapshot = FoundationalRemediationQueueSnapshot;
type QueueItem = Snapshot["remediationQueue"]["items"][number];

type ErrorEnvelope = {
  error?: {
    message?: string;
  };
};

function isSnapshot(value: unknown): value is Snapshot {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<Snapshot>;
  return (
    candidate.objectType === "FOUNDATIONAL_REMEDIATION_QUEUE_SNAPSHOT" &&
    typeof candidate.workspaceId === "string" &&
    typeof candidate.jurisdiction === "string" &&
    typeof candidate.observedAt === "string" &&
    typeof candidate.readiness === "object" &&
    candidate.readiness !== null &&
    typeof candidate.remediationQueue === "object" &&
    candidate.remediationQueue !== null
  );
}

function stateClass(state: string): string {
  if (state === "READY" || state === "CLEAR") {
    return "border-emerald-200 bg-emerald-50 text-emerald-800";
  }
  if (state === "DEGRADED" || state === "MISSING" || state === "NOT_APPLICABLE") {
    return "border-amber-200 bg-amber-50 text-amber-800";
  }
  return "border-rose-200 bg-rose-50 text-rose-800";
}

function stageClass(stage: string): string {
  if (stage === "READY") return "bg-emerald-50 text-emerald-800";
  if (stage === "QUALITY" || stage === "RELEVANCE" || stage === "HEALTH") {
    return "bg-amber-50 text-amber-800";
  }
  return "bg-slate-100 text-slate-700";
}

function endpointLabel(endpoint: string): string {
  if (endpoint.includes("relevance-audit")) return "Inspect relevance audit";
  if (endpoint.includes("retrieval/remediation")) return "Inspect remediation plan";
  if (endpoint.includes("source-supply-health")) return "Inspect supply health";
  if (endpoint.includes("conversion-recovery")) return "Inspect conversion recovery";
  return "Inspect endpoint";
}

function observedAtLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return value;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(date);
}

function queueMap(snapshot: Snapshot): Map<string, QueueItem> {
  return new Map(snapshot.remediationQueue.items.map((item) => [item.targetId, item]));
}

export function FoundationalRemediationConsole({ workspaceId }: { workspaceId: string }) {
  const [jurisdiction, setJurisdiction] = useState<Jurisdiction>("US");
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const query = new URLSearchParams({ workspaceId, jurisdiction, topK: "5" });
      const response = await fetch(`/api/foundational/remediation-queue?${query.toString()}`, {
        cache: "no-store",
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        const message = (payload as ErrorEnvelope)?.error?.message;
        throw new Error(message || `HTTP ${response.status}`);
      }
      if (!isSnapshot(payload)) throw new Error("Invalid foundational remediation snapshot");
      setSnapshot(payload);
    } catch (loadError) {
      setSnapshot(null);
      setError(
        loadError instanceof Error ? loadError.message : "Unable to load foundational status",
      );
    } finally {
      setLoading(false);
    }
  }, [jurisdiction, workspaceId]);

  useEffect(() => {
    void load();
  }, [load]);

  const actionsByTarget = useMemo(() => (snapshot ? queueMap(snapshot) : new Map()), [snapshot]);

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800">
                Read-only control plane
              </span>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600">
                Workspace · {workspaceId}
              </span>
              {snapshot ? (
                <span className="text-xs text-slate-500">
                  Observed {observedAtLabel(snapshot.observedAt)}
                </span>
              ) : null}
            </div>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
              这里汇总 ACTIVE + FOUNDATIONAL 来源的供给、结构质量和检索 smoke relevance
              gate，并把未通过目标映射为 M20 建议动作。页面不会派发采集、执行修复或修改证据。
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1">
              {(
                [
                  ["US", "United States"],
                  ["WO", "WIPO"],
                ] as const
              ).map(([code, label]) => (
                <button
                  key={code}
                  type="button"
                  onClick={() => setJurisdiction(code)}
                  className={`rounded-lg px-3 py-2 text-sm font-medium transition ${jurisdiction === code ? "bg-white text-slate-950 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw size={16} aria-hidden="true" className={loading ? "animate-spin" : ""} />
              Refresh
            </button>
          </div>
        </div>
      </section>

      {error ? (
        <section className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-rose-900">
          <AlertTriangle className="mt-0.5 shrink-0" size={18} aria-hidden="true" />
          <div>
            <p className="text-sm font-semibold">Unable to load foundational readiness</p>
            <p className="mt-1 text-sm text-rose-800">{error}</p>
          </div>
        </section>
      ) : null}

      {loading && !snapshot ? (
        <section className="grid min-h-56 place-items-center rounded-2xl border border-slate-200 bg-white text-sm text-slate-500">
          <span className="inline-flex items-center gap-2">
            <RefreshCw className="animate-spin" size={17} aria-hidden="true" /> Loading
            control-plane snapshot…
          </span>
        </section>
      ) : null}

      {snapshot ? (
        <>
          <section
            className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
            aria-label="Readiness summary"
          >
            <article className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-sm text-slate-500">Readiness gate</p>
              <div className="mt-3 flex items-end justify-between gap-3">
                <strong className="text-3xl font-semibold tracking-tight text-slate-950">
                  {snapshot.readiness.readyPercent}%
                </strong>
                <span
                  className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${stateClass(snapshot.readiness.state)}`}
                >
                  {snapshot.readiness.state}
                </span>
              </div>
              <p className="mt-3 text-xs text-slate-500">
                {snapshot.readiness.readyCount} of {snapshot.readiness.totalCount} targets READY
              </p>
            </article>
            <article className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-sm text-slate-500">Actionable targets</p>
              <strong className="mt-3 block text-3xl font-semibold tracking-tight text-slate-950">
                {snapshot.remediationQueue.actionableTargetCount}
              </strong>
              <p className="mt-3 text-xs text-slate-500">
                Advisory queue only · no automatic execution
              </p>
            </article>
            <article className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-sm text-slate-500">Blocking targets</p>
              <strong className="mt-3 block text-3xl font-semibold tracking-tight text-slate-950">
                {snapshot.readiness.blockingCount}
              </strong>
              <p className="mt-3 text-xs text-slate-500">
                Lowest failing gate wins stage precedence
              </p>
            </article>
            <article className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-sm text-slate-500">Authorization</p>
              <strong className="mt-3 block text-xl font-semibold tracking-tight text-slate-950">
                {snapshot.collectionAuthorization}
              </strong>
              <p className="mt-3 text-xs text-slate-500">mutationPerformed = false</p>
            </article>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white">
            <div className="border-b border-slate-200 px-5 py-4">
              <h2 className="font-semibold text-slate-950">Gate pipeline</h2>
              <p className="mt-1 text-xs text-slate-500">
                REGISTER → COLLECT → INGEST → CONVERT → INDEX → QUALITY → RELEVANCE → HEALTH → READY
              </p>
            </div>
            <div className="grid gap-2 p-4 sm:grid-cols-3 xl:grid-cols-9">
              {STAGE_ORDER.map((stage) => {
                const count = snapshot.readiness.byStage[stage] ?? 0;
                return (
                  <div key={stage} className={`rounded-xl px-3 py-3 ${stageClass(stage)}`}>
                    <p className="text-xs font-semibold uppercase tracking-wide">
                      {STAGE_LABELS[stage]}
                    </p>
                    <p className="mt-2 text-2xl font-semibold">{count}</p>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white">
            <div className="flex flex-col gap-2 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="font-semibold text-slate-950">Foundational targets</h2>
                <p className="mt-1 text-xs text-slate-500">
                  每个目标同时显示当前 stage、supply health、retrieval quality 与 relevance smoke
                  状态。
                </p>
              </div>
              <span className="text-xs text-slate-500">topK = {snapshot.topK ?? "default"}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-5 py-3 font-semibold">Target</th>
                    <th className="px-4 py-3 font-semibold">Stage</th>
                    <th className="px-4 py-3 font-semibold">Supply</th>
                    <th className="px-4 py-3 font-semibold">Quality</th>
                    <th className="px-4 py-3 font-semibold">Relevance</th>
                    <th className="px-5 py-3 font-semibold">Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {snapshot.readiness.targets.map((target) => (
                    <tr key={target.targetId} className="align-top">
                      <td className="px-5 py-4 font-medium text-slate-900">{target.targetId}</td>
                      <td className="px-4 py-4">
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${stageClass(target.stage)}`}
                        >
                          {target.stage}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <span
                          className={`rounded-full border px-2 py-1 text-xs font-medium ${stateClass(target.healthState)}`}
                        >
                          {target.healthState}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <span
                          className={`rounded-full border px-2 py-1 text-xs font-medium ${stateClass(target.retrievalQualityState)}`}
                        >
                          {target.retrievalQualityState}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <span
                          className={`rounded-full border px-2 py-1 text-xs font-medium ${stateClass(target.retrievalRelevanceState)}`}
                        >
                          {target.retrievalRelevanceState}
                        </span>
                      </td>
                      <td className="max-w-md px-5 py-4 text-xs leading-5 text-slate-500">
                        {target.reason ?? "No blocking reason"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="space-y-3">
            <div className="flex items-end justify-between gap-3">
              <div>
                <h2 className="font-semibold text-slate-950">Operator remediation queue</h2>
                <p className="mt-1 text-xs text-slate-500">
                  仅给出下一步人工处理路径；所有 action 均保持 automaticExecution = false。
                </p>
              </div>
              <span
                className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${stateClass(snapshot.remediationQueue.state)}`}
              >
                {snapshot.remediationQueue.state}
              </span>
            </div>

            {snapshot.remediationQueue.items.length === 0 ? (
              <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-900">
                <CheckCircle2 size={20} aria-hidden="true" />
                <div>
                  <p className="font-semibold">No foundational remediation is required.</p>
                  <p className="mt-1 text-sm text-emerald-800">
                    All targets currently pass the readiness gate.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {snapshot.readiness.targets
                  .filter((target) => actionsByTarget.has(target.targetId))
                  .map((target) => {
                    const item = actionsByTarget.get(target.targetId);
                    if (!item) return null;
                    return (
                      <article
                        key={item.targetId}
                        className="rounded-2xl border border-slate-200 bg-white p-5"
                      >
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span
                                className={`rounded-full px-2.5 py-1 text-xs font-semibold ${stageClass(item.stage)}`}
                              >
                                {item.stage}
                              </span>
                              <span className="text-xs font-medium text-slate-500">
                                Priority {item.priority}
                              </span>
                            </div>
                            <h3 className="mt-2 break-all font-semibold text-slate-950">
                              {item.targetId}
                            </h3>
                            {item.reason ? (
                              <p className="mt-1 break-words text-xs leading-5 text-slate-500">
                                {item.reason}
                              </p>
                            ) : null}
                          </div>
                          <div className="flex flex-wrap gap-2 text-xs">
                            <span
                              className={`rounded-full border px-2 py-1 font-medium ${stateClass(item.retrievalQualityState)}`}
                            >
                              Quality · {item.retrievalQualityState}
                            </span>
                            <span
                              className={`rounded-full border px-2 py-1 font-medium ${stateClass(item.retrievalRelevanceState)}`}
                            >
                              Relevance · {item.retrievalRelevanceState}
                            </span>
                          </div>
                        </div>

                        <div className="mt-4 grid gap-3 xl:grid-cols-2">
                          {item.actions.map((action) => (
                            <div
                              key={`${item.targetId}-${action.code}`}
                              className="rounded-xl border border-slate-200 bg-slate-50 p-4"
                            >
                              <div className="flex items-start gap-3">
                                <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-white text-slate-600 shadow-sm">
                                  <Activity size={16} aria-hidden="true" />
                                </span>
                                <div className="min-w-0 flex-1">
                                  <p className="break-words text-sm font-semibold text-slate-900">
                                    {action.code}
                                  </p>
                                  <p className="mt-1 text-xs text-slate-500">
                                    {action.executionPath}
                                  </p>
                                  <p className="mt-3 text-sm leading-6 text-slate-600">
                                    {action.operatorInstruction}
                                  </p>
                                  <div className="mt-3 flex flex-wrap items-center gap-2">
                                    {action.collectionAuthorizationRequired ? (
                                      <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800">
                                        Explicit collection approval required
                                      </span>
                                    ) : null}
                                    <span className="rounded-full border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-600">
                                      automaticExecution: false
                                    </span>
                                  </div>
                                  {action.endpoint ? (
                                    <a
                                      href={action.endpoint}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700 hover:text-emerald-800"
                                    >
                                      {endpointLabel(action.endpoint)}{" "}
                                      <ExternalLink size={14} aria-hidden="true" />
                                    </a>
                                  ) : null}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </article>
                    );
                  })}
              </div>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
