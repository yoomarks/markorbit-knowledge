"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Clock3,
  ExternalLink,
  Play,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import type { FoundationalActionExecution } from "@markorbit/worker-runtime/foundational-action-execution";
import type { FoundationalActionIntent } from "@markorbit/worker-runtime/foundational-action-intent";
import type { FoundationalRemediationQueueSnapshot } from "@markorbit/worker-runtime/foundational-remediation-snapshot";
import {
  executionForIntent,
  foundationalOperatorPhase,
  latestIntentForAction,
  listControlledCollectionActions,
  operatorExecutionIdempotencyKey,
  operatorIntentIdempotencyKey,
} from "./foundational-operator-state";

type Jurisdiction = "US" | "WO";

type Props = {
  workspaceId: string;
  jurisdiction: Jurisdiction;
  snapshot: FoundationalRemediationQueueSnapshot;
  onSnapshotRefresh: () => Promise<void>;
};

type IntentListEnvelope = {
  items?: FoundationalActionIntent[];
};

type ExecutionListEnvelope = {
  items?: FoundationalActionExecution[];
};

type RunListEnvelope = {
  items?: Array<{
    run?: {
      id?: string;
      status?: string;
    };
  }>;
};

type ErrorEnvelope = {
  error?: {
    message?: string;
  };
};

type ActorIds = {
  requester: string;
  reviewer: string;
  executor: string;
};

const DEFAULT_ACTORS: ActorIds = {
  requester: "operator:local-admin",
  reviewer: "reviewer:local-admin",
  executor: "operator:local-admin",
};

function messageFromPayload(payload: unknown, fallback: string): string {
  if (typeof payload !== "object" || payload === null) return fallback;
  const message = (payload as ErrorEnvelope).error?.message;
  return typeof message === "string" && message.trim() ? message : fallback;
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init });
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok) {
    throw new Error(messageFromPayload(payload, `HTTP ${response.status}`));
  }
  return payload as T;
}

async function loadOperatorHistory(workspaceId: string, jurisdiction: Jurisdiction) {
  const query = new URLSearchParams({ workspaceId, jurisdiction, limit: "20" });
  const [intentEnvelope, executionEnvelope] = await Promise.all([
    requestJson<IntentListEnvelope>(`/api/foundational/action-intents?${query.toString()}`),
    requestJson<ExecutionListEnvelope>(`/api/foundational/action-executions?${query.toString()}`),
  ]);
  return {
    intents: Array.isArray(intentEnvelope.items) ? intentEnvelope.items : [],
    executions: Array.isArray(executionEnvelope.items) ? executionEnvelope.items : [],
  };
}

async function loadRunStatuses(
  workspaceId: string,
  executions: readonly FoundationalActionExecution[],
): Promise<Record<string, string>> {
  const pairs = await Promise.all(
    executions.slice(0, 20).map(async (execution) => {
      const query = new URLSearchParams({
        workspaceId,
        q: execution.runId,
        limit: "1",
      });
      try {
        const envelope = await requestJson<RunListEnvelope>(`/api/runs?${query.toString()}`);
        const status = envelope.items?.[0]?.run?.status;
        return [execution.runId, typeof status === "string" ? status : execution.runStatusAtDispatch];
      } catch {
        return [execution.runId, execution.runStatusAtDispatch];
      }
    }),
  );
  return Object.fromEntries(pairs);
}

function timestampLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return value;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function statusClass(status: string): string {
  if (status === "COMPLETED") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (status === "FAILED" || status === "DEAD_LETTER" || status === "CANCELLED") {
    return "border-rose-200 bg-rose-50 text-rose-800";
  }
  if (status === "RUNNING" || status === "LEASED" || status === "VERIFYING") {
    return "border-blue-200 bg-blue-50 text-blue-800";
  }
  return "border-amber-200 bg-amber-50 text-amber-800";
}

export function FoundationalOperatorWorkbench({
  workspaceId,
  jurisdiction,
  snapshot,
  onSnapshotRefresh,
}: Props) {
  const controlledActions = useMemo(() => listControlledCollectionActions(snapshot), [snapshot]);
  const [intents, setIntents] = useState<FoundationalActionIntent[]>([]);
  const [executions, setExecutions] = useState<FoundationalActionExecution[]>([]);
  const [runStatuses, setRunStatuses] = useState<Record<string, string>>({});
  const [actors, setActors] = useState<ActorIds>(DEFAULT_ACTORS);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [armedIntentId, setArmedIntentId] = useState<string | null>(null);
  const [dispatchAcknowledged, setDispatchAcknowledged] = useState(false);

  async function refreshHistory() {
    const history = await loadOperatorHistory(workspaceId, jurisdiction);
    setIntents(history.intents);
    setExecutions(history.executions);
    setRunStatuses(await loadRunStatuses(workspaceId, history.executions));
  }

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    void loadOperatorHistory(workspaceId, jurisdiction)
      .then(async (history) => {
        const statuses = await loadRunStatuses(workspaceId, history.executions);
        if (!active) return;
        setIntents(history.intents);
        setExecutions(history.executions);
        setRunStatuses(statuses);
        setLoading(false);
      })
      .catch((loadError: unknown) => {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : "Unable to load operator state");
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [jurisdiction, workspaceId, snapshot.observedAt]);

  async function runMutation(key: string, mutation: () => Promise<unknown>) {
    setBusyKey(key);
    setError(null);
    try {
      await mutation();
      await refreshHistory();
      await onSnapshotRefresh();
    } catch (mutationError) {
      setError(
        mutationError instanceof Error ? mutationError.message : "Controlled operation failed",
      );
    } finally {
      setBusyKey(null);
    }
  }

  async function requestApproval(targetId: string) {
    const nonce = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const idempotencyKey = operatorIntentIdempotencyKey({
      jurisdiction,
      targetId,
      observedAt: snapshot.observedAt,
      nonce,
    });
    await runMutation(`request:${targetId}`, () =>
      requestJson("/api/foundational/action-intents", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          jurisdiction,
          targetId,
          actionCode: "DISPATCH_GOVERNED_COLLECTION",
          requestedByActorId: actors.requester,
          idempotencyKey,
          topK: snapshot.topK ?? 5,
        }),
      }),
    );
  }

  async function transitionIntent(intentId: string, operation: "APPROVE" | "CANCEL") {
    const actorId = operation === "APPROVE" ? actors.reviewer : actors.requester;
    await runMutation(`${operation.toLowerCase()}:${intentId}`, () =>
      requestJson(`/api/foundational/action-intents/${encodeURIComponent(intentId)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ operation, actorId }),
      }),
    );
  }

  async function executeIntent(intentId: string) {
    await runMutation(`execute:${intentId}`, () =>
      requestJson(
        `/api/foundational/action-intents/${encodeURIComponent(intentId)}/execute`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            executedByActorId: actors.executor,
            idempotencyKey: operatorExecutionIdempotencyKey(intentId),
            execute: true,
          }),
        },
      ),
    );
    setArmedIntentId(null);
    setDispatchAcknowledged(false);
  }

  function updateActor(field: keyof ActorIds, value: string) {
    setActors((current) => ({ ...current, [field]: value }));
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white">
      <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-semibold text-slate-950">Controlled collection operations</h2>
            <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800">
              Explicit approval + explicit execute
            </span>
          </div>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">
            这里只开放 M24 的 COLLECT 单目标派发。创建 intent、审批 intent、真正 dispatch
            是三个独立动作；任何一步都不会自动推进下一步。执行前服务端会重新校验当前 remediation
            queue、source 与 MANUAL plan。
          </p>
        </div>
        <button
          type="button"
          onClick={() => void runMutation("history-refresh", async () => refreshHistory())}
          disabled={busyKey !== null || loading}
          className="inline-flex items-center gap-2 self-start rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RefreshCw size={15} aria-hidden="true" className={loading ? "animate-spin" : ""} />
          Refresh operator state
        </button>
      </div>

      <div className="space-y-5 p-5">
        <div className="grid gap-3 lg:grid-cols-3">
          {(
            [
              ["requester", "Request actor", "Creates approval intent"],
              ["reviewer", "Approval actor", "Approves pending intent"],
              ["executor", "Execution actor", "Performs explicit dispatch"],
            ] as const
          ).map(([field, label, help]) => (
            <label key={field} className="block rounded-xl border border-slate-200 bg-slate-50 p-3">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {label}
              </span>
              <input
                value={actors[field]}
                onChange={(event) => updateActor(field, event.target.value)}
                className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-500"
                spellCheck={false}
              />
              <span className="mt-1 block text-xs text-slate-500">{help}</span>
            </label>
          ))}
        </div>

        {error ? (
          <div className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-rose-900">
            <AlertTriangle className="mt-0.5 shrink-0" size={17} aria-hidden="true" />
            <p className="text-sm leading-5">{error}</p>
          </div>
        ) : null}

        {loading ? (
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
            <RefreshCw className="animate-spin" size={16} aria-hidden="true" /> Loading controlled
            operator state…
          </div>
        ) : controlledActions.length === 0 ? (
          <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-slate-700">
            <ShieldCheck className="mt-0.5 shrink-0" size={18} aria-hidden="true" />
            <div>
              <p className="text-sm font-semibold">No executable COLLECT action is currently exposed.</p>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                REGISTER、INGEST、CONVERT、INDEX、QUALITY、RELEVANCE 与 HEALTH 仍只显示人工处理路径，
                不会在这里执行。
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {controlledActions.map((action) => {
              const intent = latestIntentForAction(intents, action.targetId, action.actionCode);
              const execution = intent ? executionForIntent(executions, intent.intentId) : null;
              const phase = foundationalOperatorPhase(intent, execution);
              const isArmed = intent?.intentId === armedIntentId;
              const busy =
                busyKey?.includes(action.targetId) === true ||
                (intent ? busyKey?.includes(intent.intentId) === true : false);
              const liveRunStatus = execution
                ? (runStatuses[execution.runId] ?? execution.runStatusAtDispatch)
                : null;

              return (
                <article key={action.targetId} className="rounded-xl border border-slate-200 p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                          COLLECT
                        </span>
                        <span className="text-xs font-medium text-slate-500">{phase}</span>
                      </div>
                      <h3 className="mt-2 break-all font-semibold text-slate-950">
                        {action.targetId}
                      </h3>
                      <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
                        {action.operatorInstruction}
                      </p>
                    </div>
                    {intent ? (
                      <div className="text-right text-xs text-slate-500">
                        <p className="font-mono">{intent.intentId}</p>
                        <p className="mt-1">Updated {timestampLabel(intent.updatedAt)}</p>
                      </div>
                    ) : null}
                  </div>

                  <div className="mt-4 border-t border-slate-100 pt-4">
                    {phase === "REQUEST_APPROVAL" ? (
                      <div className="flex flex-wrap items-center gap-3">
                        <button
                          type="button"
                          disabled={busy || busyKey !== null || !actors.requester.trim()}
                          onClick={() => void requestApproval(action.targetId)}
                          className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-3.5 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <ShieldCheck size={15} aria-hidden="true" /> Create approval intent
                        </button>
                        <span className="text-xs text-slate-500">
                          This records intent only. No collection run is created.
                        </span>
                      </div>
                    ) : null}

                    {phase === "PENDING_APPROVAL" && intent ? (
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="text-xs leading-5 text-slate-500">
                          Requested by <strong className="text-slate-700">{intent.requestedByActorId}</strong>
                          <br />Approval is still required; execution authorization remains NONE.
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={busyKey !== null || !actors.reviewer.trim()}
                            onClick={() => void transitionIntent(intent.intentId, "APPROVE")}
                            className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-3.5 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <CheckCircle2 size={15} aria-hidden="true" /> Approve intent
                          </button>
                          <button
                            type="button"
                            disabled={busyKey !== null || !actors.requester.trim()}
                            onClick={() => void transitionIntent(intent.intentId, "CANCEL")}
                            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <Ban size={15} aria-hidden="true" /> Cancel
                          </button>
                        </div>
                      </div>
                    ) : null}

                    {phase === "READY_TO_EXECUTE" && intent ? (
                      <div className="space-y-3">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div className="text-xs leading-5 text-slate-500">
                            Approved by <strong className="text-slate-700">{intent.approvedByActorId}</strong>.
                            Approval alone has not dispatched collection.
                          </div>
                          {!isArmed ? (
                            <button
                              type="button"
                              disabled={busyKey !== null || !actors.executor.trim()}
                              onClick={() => {
                                setArmedIntentId(intent.intentId);
                                setDispatchAcknowledged(false);
                              }}
                              className="inline-flex items-center gap-2 rounded-xl bg-amber-600 px-3.5 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              <Play size={15} aria-hidden="true" /> Review dispatch
                            </button>
                          ) : null}
                        </div>

                        {isArmed ? (
                          <div className="rounded-xl border border-amber-300 bg-amber-50 p-4">
                            <p className="text-sm font-semibold text-amber-950">
                              Final explicit dispatch confirmation
                            </p>
                            <p className="mt-1 text-xs leading-5 text-amber-900">
                              Confirming will create one real CollectionRun + Job for only {action.targetId}.
                              The server will revalidate the current queue, registered source and prepared MANUAL
                              plan before writing execution state.
                            </p>
                            <label className="mt-3 flex items-start gap-2 text-sm text-amber-950">
                              <input
                                type="checkbox"
                                checked={dispatchAcknowledged}
                                onChange={(event) => setDispatchAcknowledged(event.target.checked)}
                                className="mt-0.5 size-4"
                              />
                              <span>I understand this performs a real single-target collection dispatch.</span>
                            </label>
                            <div className="mt-4 flex flex-wrap gap-2">
                              <button
                                type="button"
                                disabled={busyKey !== null || !dispatchAcknowledged}
                                onClick={() => void executeIntent(intent.intentId)}
                                className="inline-flex items-center gap-2 rounded-xl bg-amber-700 px-3.5 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                <Play size={15} aria-hidden="true" /> Confirm single-target dispatch
                              </button>
                              <button
                                type="button"
                                disabled={busyKey !== null}
                                onClick={() => {
                                  setArmedIntentId(null);
                                  setDispatchAcknowledged(false);
                                }}
                                className="rounded-xl border border-amber-300 bg-white px-3.5 py-2 text-sm font-semibold text-amber-900"
                              >
                                Back
                              </button>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    ) : null}

                    {phase === "DISPATCHED" && execution ? (
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="text-xs leading-5 text-slate-500">
                          <p>
                            Run <strong className="font-mono text-slate-700">{execution.runId}</strong>
                          </p>
                          <p>
                            Dispatched {timestampLabel(execution.dispatchedAt)} by {execution.executedByActorId}
                          </p>
                          <p>{execution.jobIds.length} job(s) recorded</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClass(liveRunStatus ?? execution.runStatusAtDispatch)}`}
                          >
                            Run · {liveRunStatus ?? execution.runStatusAtDispatch}
                          </span>
                          <a
                            href={`/runs?q=${encodeURIComponent(execution.runId)}`}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700"
                          >
                            Open run <ExternalLink size={14} aria-hidden="true" />
                          </a>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {executions.length > 0 ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center gap-2">
              <Clock3 size={16} aria-hidden="true" className="text-slate-500" />
              <h3 className="text-sm font-semibold text-slate-900">Recent controlled dispatches</h3>
            </div>
            <div className="mt-3 space-y-2">
              {executions.slice(0, 5).map((execution) => (
                <div
                  key={execution.executionId}
                  className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="break-all font-medium text-slate-800">{execution.targetId}</p>
                    <p className="mt-0.5 break-all font-mono text-slate-500">{execution.runId}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-full border px-2 py-1 font-semibold ${statusClass(runStatuses[execution.runId] ?? execution.runStatusAtDispatch)}`}
                    >
                      {runStatuses[execution.runId] ?? execution.runStatusAtDispatch}
                    </span>
                    <span className="text-slate-500">{timestampLabel(execution.dispatchedAt)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
