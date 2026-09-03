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
  RotateCcw,
  ShieldCheck,
} from "lucide-react";
import type { FoundationalActionExecution } from "@markorbit/worker-runtime/foundational-action-execution";
import type { FoundationalActionIntent } from "@markorbit/worker-runtime/foundational-action-intent";
import type { FoundationalCollectionOutcome } from "@markorbit/worker-runtime/foundational-collection-outcome";
import type { FoundationalRemediationQueueSnapshot } from "@markorbit/worker-runtime/foundational-remediation-snapshot";
import { adminBrowserMutationHeaders } from "@/lib/admin-browser-api-client";
import {
  executionForIntent,
  foundationalOperatorPhase,
  latestIntentForAction,
  listControlledCollectionActions,
  operatorExecutionIdempotencyKey,
  operatorIntentIdempotencyKey,
  outcomeForExecution,
} from "./foundational-operator-state";

type Jurisdiction = "US" | "WO";

type Props = {
  workspaceId: string;
  jurisdiction: Jurisdiction;
  snapshot: FoundationalRemediationQueueSnapshot;
  onSnapshotRefresh: () => Promise<void>;
};

type IntentListEnvelope = { items?: FoundationalActionIntent[] };
type ExecutionListEnvelope = { items?: FoundationalActionExecution[] };
type OutcomeListEnvelope = { items?: FoundationalCollectionOutcome[] };
type ErrorEnvelope = { error?: { message?: string } };

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const method = (init?.method ?? "GET").toUpperCase();
  const headers =
    method === "GET" || method === "HEAD"
      ? init?.headers
      : await adminBrowserMutationHeaders(init?.headers ?? {});
  const response = await fetch(url, { cache: "no-store", ...init, headers });
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok) {
    const message = (payload as ErrorEnvelope | null)?.error?.message;
    throw new Error(message || `HTTP ${response.status}`);
  }
  return payload as T;
}

async function loadHistory(workspaceId: string, jurisdiction: Jurisdiction) {
  const query = new URLSearchParams({ workspaceId, jurisdiction, limit: "20" });
  const [intentPayload, executionPayload, outcomePayload] = await Promise.all([
    requestJson<IntentListEnvelope>(`/api/foundational/action-intents?${query.toString()}`),
    requestJson<ExecutionListEnvelope>(`/api/foundational/action-executions?${query.toString()}`),
    requestJson<OutcomeListEnvelope>(`/api/foundational/collection-outcomes?${query.toString()}`),
  ]);
  return {
    intents: Array.isArray(intentPayload.items) ? intentPayload.items : [],
    executions: Array.isArray(executionPayload.items) ? executionPayload.items : [],
    outcomes: Array.isArray(outcomePayload.items) ? outcomePayload.items : [],
  };
}

function timeLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return value;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function runStatusClass(status: string): string {
  if (status === "COMPLETED") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (status === "FAILED" || status === "CANCELLED" || status === "MISSING") {
    return "border-rose-200 bg-rose-50 text-rose-800";
  }
  if (status === "RUNNING") return "border-blue-200 bg-blue-50 text-blue-800";
  return "border-amber-200 bg-amber-50 text-amber-800";
}

function outcomeLabel(outcome: FoundationalCollectionOutcome | null): string {
  if (!outcome) return "Dispatch recorded";
  switch (outcome.retryDisposition) {
    case "BLOCKED_ACTIVE_RUN":
      return "Active run · duplicate dispatch blocked";
    case "REQUIRES_NEW_APPROVAL":
      return "Terminal failure · new approval required";
    case "REVIEW_COMPLETED_COLLECTION":
      return "Completed · COLLECT still required";
    case "NO_ACTION_REQUIRED":
      return "Collection complete · no COLLECT action required";
    case "BLOCKED_MISSING_RUN":
      return "Integrity issue · CollectionRun missing";
  }
}

export function FoundationalOperatorWorkbench({
  workspaceId,
  jurisdiction,
  snapshot,
  onSnapshotRefresh,
}: Props) {
  const actions = useMemo(() => listControlledCollectionActions(snapshot), [snapshot]);
  const [intents, setIntents] = useState<FoundationalActionIntent[]>([]);
  const [executions, setExecutions] = useState<FoundationalActionExecution[]>([]);
  const [outcomes, setOutcomes] = useState<FoundationalCollectionOutcome[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [armedIntentId, setArmedIntentId] = useState<string | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);

  async function refreshHistory(): Promise<void> {
    const history = await loadHistory(workspaceId, jurisdiction);
    setIntents(history.intents);
    setExecutions(history.executions);
    setOutcomes(history.outcomes);
  }

  useEffect(() => {
    let active = true;
    void loadHistory(workspaceId, jurisdiction)
      .then((history) => {
        if (!active) return;
        setIntents(history.intents);
        setExecutions(history.executions);
        setOutcomes(history.outcomes);
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

  async function mutate(key: string, operation: () => Promise<unknown>): Promise<void> {
    setBusy(key);
    setError(null);
    try {
      await operation();
      await onSnapshotRefresh();
      await refreshHistory();
    } catch (mutationError) {
      setError(
        mutationError instanceof Error ? mutationError.message : "Controlled operation failed",
      );
    } finally {
      setBusy(null);
    }
  }

  async function createIntent(targetId: string): Promise<void> {
    const previousIntent = latestIntentForAction(intents, targetId, "DISPATCH_GOVERNED_COLLECTION");
    const nonce = previousIntent
      ? `${previousIntent.intentId}:${previousIntent.updatedAt}`
      : "first";
    const idempotencyKey = operatorIntentIdempotencyKey({
      jurisdiction,
      targetId,
      observedAt: snapshot.observedAt,
      nonce,
    });
    await mutate(`create:${targetId}`, () =>
      requestJson("/api/foundational/action-intents", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          jurisdiction,
          targetId,
          actionCode: "DISPATCH_GOVERNED_COLLECTION",
          idempotencyKey,
          topK: snapshot.topK ?? 5,
        }),
      }),
    );
  }

  async function transitionIntent(
    intentId: string,
    operation: "APPROVE" | "CANCEL",
  ): Promise<void> {
    await mutate(`${operation}:${intentId}`, () =>
      requestJson(`/api/foundational/action-intents/${encodeURIComponent(intentId)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ operation }),
      }),
    );
  }

  async function executeIntent(intentId: string): Promise<void> {
    await mutate(`EXECUTE:${intentId}`, () =>
      requestJson(`/api/foundational/action-intents/${encodeURIComponent(intentId)}/execute`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          idempotencyKey: operatorExecutionIdempotencyKey(intentId),
          execute: true,
        }),
      }),
    );
    setArmedIntentId(null);
    setAcknowledged(false);
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
            <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-800">
              Outcome feedback enabled
            </span>
          </div>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">
            这里只开放 COLLECT 单目标派发。M26 会读取 exact CollectionRun 结果：运行中禁止重复派发；
            FAILED / CANCELLED 需要创建新的 approval intent；COMPLETED 但仍处于 COLLECT
            时要求再次人工复核。所有 requester / reviewer / executor 身份均来自当前认证 Workspace
            Principal，浏览器不能覆盖。
          </p>
        </div>
        <button
          type="button"
          disabled={busy !== null || loading}
          onClick={() => void mutate("REFRESH", refreshHistory)}
          className="inline-flex items-center gap-2 self-start rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RefreshCw size={15} aria-hidden="true" className={loading ? "animate-spin" : ""} />
          Refresh operator state
        </button>
      </div>

      <div className="space-y-5 p-5">
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
        ) : actions.length === 0 ? (
          <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-slate-700">
            <ShieldCheck className="mt-0.5 shrink-0" size={18} aria-hidden="true" />
            <div>
              <p className="text-sm font-semibold">
                No executable COLLECT action is currently exposed.
              </p>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                REGISTER、INGEST、CONVERT、INDEX、QUALITY、RELEVANCE 与 HEALTH 仍保持非执行状态。
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {actions.map((action) => {
              const intent = latestIntentForAction(intents, action.targetId, action.actionCode);
              const execution = intent ? executionForIntent(executions, intent.intentId) : null;
              const outcome = execution
                ? outcomeForExecution(outcomes, execution.executionId)
                : null;
              const phase = foundationalOperatorPhase(intent, execution, outcome);
              const armed = intent?.intentId === armedIntentId;
              const liveStatus = outcome?.runStatus ?? execution?.runStatusAtDispatch ?? null;

              return (
                <article key={action.targetId} className="rounded-xl border border-slate-200 p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                          COLLECT
                        </span>
                        <span className="text-xs font-medium text-slate-500">{phase}</span>
                        {outcome ? (
                          <span className="text-xs text-slate-400">{outcomeLabel(outcome)}</span>
                        ) : null}
                      </div>
                      <h3 className="mt-2 break-all font-semibold text-slate-950">
                        {action.targetId}
                      </h3>
                      <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
                        {action.operatorInstruction}
                      </p>
                    </div>
                    {intent ? (
                      <div className="text-xs text-slate-500 lg:text-right">
                        <p className="break-all font-mono">{intent.intentId}</p>
                        <p className="mt-1">Updated {timeLabel(intent.updatedAt)}</p>
                      </div>
                    ) : null}
                  </div>

                  <div className="mt-4 border-t border-slate-100 pt-4">
                    {phase === "REQUEST_APPROVAL" ? (
                      <div className="flex flex-wrap items-center gap-3">
                        <button
                          type="button"
                          disabled={busy !== null}
                          onClick={() => void createIntent(action.targetId)}
                          className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-3.5 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <ShieldCheck size={15} aria-hidden="true" /> Create approval intent
                        </button>
                        <span className="text-xs text-slate-500">
                          Intent only · no CollectionRun is created.
                        </span>
                      </div>
                    ) : null}

                    {phase === "PENDING_APPROVAL" && intent ? (
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-xs leading-5 text-slate-500">
                          Requested by{" "}
                          <strong className="text-slate-700">{intent.requestedByActorId}</strong>.
                          Execution authorization remains NONE.
                        </p>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={busy !== null}
                            onClick={() => void transitionIntent(intent.intentId, "APPROVE")}
                            className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-3.5 py-2 text-sm font-semibold text-white disabled:opacity-50"
                          >
                            <CheckCircle2 size={15} aria-hidden="true" /> Approve intent
                          </button>
                          <button
                            type="button"
                            disabled={busy !== null}
                            onClick={() => void transitionIntent(intent.intentId, "CANCEL")}
                            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50"
                          >
                            <Ban size={15} aria-hidden="true" /> Cancel
                          </button>
                        </div>
                      </div>
                    ) : null}

                    {phase === "READY_TO_EXECUTE" && intent ? (
                      <div className="space-y-3">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <p className="text-xs leading-5 text-slate-500">
                            Approved by{" "}
                            <strong className="text-slate-700">{intent.approvedByActorId}</strong>.
                            Approval alone has not dispatched collection.
                          </p>
                          {!armed ? (
                            <button
                              type="button"
                              disabled={busy !== null}
                              onClick={() => {
                                setArmedIntentId(intent.intentId);
                                setAcknowledged(false);
                              }}
                              className="inline-flex items-center gap-2 rounded-xl bg-amber-600 px-3.5 py-2 text-sm font-semibold text-white disabled:opacity-50"
                            >
                              <Play size={15} aria-hidden="true" /> Review dispatch
                            </button>
                          ) : null}
                        </div>

                        {armed ? (
                          <div className="rounded-xl border border-amber-300 bg-amber-50 p-4">
                            <p className="text-sm font-semibold text-amber-950">
                              Final explicit dispatch confirmation
                            </p>
                            <p className="mt-1 text-xs leading-5 text-amber-900">
                              This creates one real CollectionRun + Job for only {action.targetId}.
                              The server revalidates the queue, source and prepared MANUAL plan and
                              now also rejects any already-active foundational run for this target.
                            </p>
                            <label className="mt-3 flex items-start gap-2 text-sm text-amber-950">
                              <input
                                type="checkbox"
                                checked={acknowledged}
                                onChange={(event) => setAcknowledged(event.target.checked)}
                                className="mt-0.5 size-4"
                              />
                              <span>
                                I understand this performs a real single-target collection dispatch.
                              </span>
                            </label>
                            <div className="mt-4 flex flex-wrap gap-2">
                              <button
                                type="button"
                                disabled={busy !== null || !acknowledged}
                                onClick={() => void executeIntent(intent.intentId)}
                                className="inline-flex items-center gap-2 rounded-xl bg-amber-700 px-3.5 py-2 text-sm font-semibold text-white disabled:opacity-50"
                              >
                                <Play size={15} aria-hidden="true" /> Confirm single-target dispatch
                              </button>
                              <button
                                type="button"
                                disabled={busy !== null}
                                onClick={() => {
                                  setArmedIntentId(null);
                                  setAcknowledged(false);
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

                    {(phase === "DISPATCHED" || phase === "RUN_ACTIVE") && execution ? (
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="text-xs leading-5 text-slate-500">
                          <p>
                            Run{" "}
                            <strong className="font-mono text-slate-700">{execution.runId}</strong>
                          </p>
                          <p>
                            Dispatched {timeLabel(execution.dispatchedAt)} by{" "}
                            {execution.executedByActorId}
                          </p>
                          {phase === "RUN_ACTIVE" ? (
                            <p className="font-medium text-blue-700">
                              A second dispatch is blocked until this run reaches a terminal state.
                            </p>
                          ) : null}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${runStatusClass(liveStatus ?? "PENDING")}`}
                          >
                            Run · {liveStatus ?? "PENDING"}
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

                    {phase === "RETRY_APPROVAL_REQUIRED" && execution && outcome ? (
                      <div className="flex flex-col gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-sm font-semibold text-rose-950">
                            Previous collection ended {outcome.runStatus ?? outcome.state}
                          </p>
                          <p className="mt-1 text-xs leading-5 text-rose-800">
                            Automatic retry is disabled. Because COLLECT is still required, retrying
                            must start with a brand-new approval intent and a second explicit
                            execute.
                          </p>
                        </div>
                        <button
                          type="button"
                          disabled={busy !== null}
                          onClick={() => void createIntent(action.targetId)}
                          className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-rose-700 px-3.5 py-2 text-sm font-semibold text-white disabled:opacity-50"
                        >
                          <RotateCcw size={15} aria-hidden="true" /> Request retry approval
                        </button>
                      </div>
                    ) : null}

                    {phase === "REVIEW_COMPLETED_COLLECTION" && execution && outcome ? (
                      <div className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-sm font-semibold text-amber-950">
                            CollectionRun completed, but readiness still requires COLLECT
                          </p>
                          <p className="mt-1 text-xs leading-5 text-amber-900">
                            Review the run/evidence first. Another collection is never automatic and
                            still requires a new approval intent.
                          </p>
                        </div>
                        <button
                          type="button"
                          disabled={busy !== null}
                          onClick={() => void createIntent(action.targetId)}
                          className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-amber-700 px-3.5 py-2 text-sm font-semibold text-white disabled:opacity-50"
                        >
                          <RotateCcw size={15} aria-hidden="true" /> Request another approval
                        </button>
                      </div>
                    ) : null}

                    {phase === "EXECUTION_INTEGRITY_BLOCKED" && execution ? (
                      <div className="flex items-start gap-3 rounded-xl border border-rose-300 bg-rose-50 p-4 text-rose-950">
                        <AlertTriangle className="mt-0.5 shrink-0" size={17} aria-hidden="true" />
                        <div>
                          <p className="text-sm font-semibold">Execution integrity check failed</p>
                          <p className="mt-1 text-xs leading-5 text-rose-800">
                            The foundational execution references {execution.runId}, but the exact
                            CollectionRun could not be loaded. Retry is blocked until the ledger is
                            repaired or investigated.
                          </p>
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
              {executions.slice(0, 5).map((execution) => {
                const outcome = outcomeForExecution(outcomes, execution.executionId);
                const status = outcome?.runStatus ?? execution.runStatusAtDispatch;
                return (
                  <div
                    key={execution.executionId}
                    className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <p className="break-all font-medium text-slate-800">{execution.targetId}</p>
                      <p className="mt-0.5 break-all font-mono text-slate-500">{execution.runId}</p>
                      <p className="mt-1 text-slate-500">{outcomeLabel(outcome)}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded-full border px-2 py-1 font-semibold ${runStatusClass(status ?? "MISSING")}`}
                      >
                        {status ?? "MISSING"}
                      </span>
                      <span className="text-slate-500">
                        {timeLabel(outcome?.runUpdatedAt ?? execution.dispatchedAt)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
