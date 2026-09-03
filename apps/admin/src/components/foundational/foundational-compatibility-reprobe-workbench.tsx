"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Ban,
  Check,
  CheckCircle2,
  Clipboard,
  Clock3,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Terminal,
} from "lucide-react";
import type { SourceCompatibilityReprobeExecution } from "@markorbit/persistence/source-compatibility-reprobe-executions";
import type { FoundationalActionIntent } from "@markorbit/worker-runtime/foundational-action-intent";
import type { FoundationalRemediationQueueSnapshot } from "@markorbit/worker-runtime/foundational-remediation-snapshot";
import { adminBrowserMutationHeaders } from "@/lib/admin-browser-api-client";
import type { FoundationalAdvancedJurisdiction } from "./foundational-advanced-capabilities";
import {
  compatibilityReprobeExecutionForIntent,
  compatibilityReprobeIntentIdempotencyKey,
  compatibilityReprobePhase,
  compatibilityReprobeWorkerCommand,
  latestCompatibilityReprobeIntent,
  listControlledCompatibilityReprobeActions,
} from "./foundational-compatibility-reprobe-state";

type IntentListEnvelope = { items?: FoundationalActionIntent[] };
type ExecutionListEnvelope = { items?: SourceCompatibilityReprobeExecution[] };
type ErrorEnvelope = { error?: { message?: string } };

type Props = {
  workspaceId: string;
  jurisdiction: FoundationalAdvancedJurisdiction;
  snapshot: FoundationalRemediationQueueSnapshot;
  onSnapshotRefresh: () => Promise<void>;
};

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const requestInit: RequestInit = { cache: "no-store", ...init };
  const method = init?.method?.toUpperCase() ?? "GET";
  if (method !== "GET" && method !== "HEAD") {
    requestInit.headers = await adminBrowserMutationHeaders(init?.headers);
  }
  const response = await fetch(url, requestInit);
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

async function loadHistory(workspaceId: string, jurisdiction: FoundationalAdvancedJurisdiction) {
  const query = new URLSearchParams({ workspaceId, jurisdiction, limit: "50" });
  const [intentPayload, executionPayload] = await Promise.all([
    requestJson<IntentListEnvelope>(`/api/foundational/action-intents?${query.toString()}`),
    requestJson<ExecutionListEnvelope>(
      `/api/foundational/compatibility-reprobe-executions?${query.toString()}`,
    ),
  ]);
  return {
    intents: Array.isArray(intentPayload.items) ? intentPayload.items : [],
    executions: Array.isArray(executionPayload.items) ? executionPayload.items : [],
  };
}

function timeLabel(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return value;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function statusClass(status: SourceCompatibilityReprobeExecution["status"]): string {
  if (status === "COMPLETED") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (status === "FAILED") return "border-rose-200 bg-rose-50 text-rose-800";
  return "border-blue-200 bg-blue-50 text-blue-800";
}

export function FoundationalCompatibilityReprobeWorkbench({
  workspaceId,
  jurisdiction,
  snapshot,
  onSnapshotRefresh,
}: Props) {
  const actions = useMemo(() => listControlledCompatibilityReprobeActions(snapshot), [snapshot]);
  const [intents, setIntents] = useState<FoundationalActionIntent[]>([]);
  const [executions, setExecutions] = useState<SourceCompatibilityReprobeExecution[]>([]);
  const [executorActorId, setExecutorActorId] = useState("operator:local-admin");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedIntentId, setCopiedIntentId] = useState<string | null>(null);

  async function refreshHistory(): Promise<void> {
    const history = await loadHistory(workspaceId, jurisdiction);
    setIntents(history.intents);
    setExecutions(history.executions);
  }

  useEffect(() => {
    let active = true;
    void loadHistory(workspaceId, jurisdiction)
      .then((history) => {
        if (!active) return;
        setIntents(history.intents);
        setExecutions(history.executions);
        setError(null);
        setLoading(false);
      })
      .catch((loadError: unknown) => {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : "Unable to load re-probe state");
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
        mutationError instanceof Error
          ? mutationError.message
          : "Compatibility re-probe operation failed",
      );
    } finally {
      setBusy(null);
    }
  }

  async function createIntent(targetId: string): Promise<void> {
    const previousIntent = latestCompatibilityReprobeIntent(intents, targetId);
    const nonce = previousIntent
      ? `${previousIntent.intentId}:${previousIntent.updatedAt}`
      : "first";
    const idempotencyKey = compatibilityReprobeIntentIdempotencyKey({
      jurisdiction,
      targetId,
      observedAt: snapshot.observedAt,
      nonce,
    });
    await mutate(`CREATE:${targetId}`, () =>
      requestJson("/api/foundational/action-intents", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          jurisdiction,
          targetId,
          actionCode: "REPROBE_SOURCE_COMPATIBILITY",
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

  async function copyCommand(intentId: string): Promise<void> {
    const command = compatibilityReprobeWorkerCommand({
      intentId,
      executedByActorId: executorActorId,
    });
    try {
      await navigator.clipboard.writeText(command);
      setCopiedIntentId(intentId);
      window.setTimeout(() => setCopiedIntentId(null), 1800);
    } catch {
      setError("Unable to copy the Worker command. Select and copy it manually.");
    }
  }

  return (
    <section className="rounded-2xl border border-cyan-200 bg-white">
      <div className="flex flex-col gap-3 border-b border-cyan-100 bg-cyan-50/50 px-5 py-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-semibold text-slate-950">Compatibility re-probe operations</h2>
            <span className="rounded-full border border-cyan-200 bg-white px-2.5 py-1 text-xs font-semibold text-cyan-800">
              Approval + controlled Worker handoff
            </span>
            <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600">
              Browser has no Worker credential
            </span>
          </div>
          <p className="mt-2 max-w-3xl text-xs leading-5 text-slate-600">
            仅处理过期 compatibility observation。页面可以创建、审批或取消 re-probe intent，并查看
            STARTED / COMPLETED / FAILED receipt；真正的网络探针仍由受认证 Worker
            执行。页面不会直接运行 canary、不会持有 Worker bearer，也不会创建 CollectionRun。
          </p>
        </div>
        <button
          type="button"
          disabled={busy !== null || loading}
          onClick={() => void mutate("REFRESH", refreshHistory)}
          className="inline-flex items-center gap-2 self-start rounded-xl border border-cyan-300 bg-white px-3 py-2 text-sm font-medium text-cyan-900 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RefreshCw size={15} aria-hidden="true" className={loading ? "animate-spin" : ""} />
          Refresh re-probe state
        </button>
      </div>

      <div className="space-y-5 p-5">
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Browser mutation identity
            </span>
            <p className="mt-2 text-sm leading-5 text-slate-700">
              Request, approval and cancellation actors come from the authenticated Workspace
              Principal. Browser-supplied actor fields are not accepted.
            </p>
          </div>
          <label className="block rounded-xl border border-slate-200 bg-slate-50 p-3">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Worker execution actor
            </span>
            <input
              value={executorActorId}
              onChange={(event) => setExecutorActorId(event.target.value)}
              className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-500"
              spellCheck={false}
            />
            <span className="mt-1 block text-xs text-slate-500">
              Embedded only in the controlled Worker command; it is not a browser API identity.
            </span>
          </label>
        </div>

        {error ? (
          <div className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-rose-900">
            <AlertTriangle className="mt-0.5 shrink-0" size={17} aria-hidden="true" />
            <p className="text-sm leading-5">{error}</p>
          </div>
        ) : null}

        {loading ? (
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
            <RefreshCw className="animate-spin" size={16} aria-hidden="true" /> Loading
            compatibility re-probe state…
          </div>
        ) : actions.length === 0 ? (
          <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900">
            <CheckCircle2 className="mt-0.5 shrink-0" size={18} aria-hidden="true" />
            <div>
              <p className="text-sm font-semibold">
                No stale compatibility re-probe is currently required.
              </p>
              <p className="mt-1 text-xs leading-5 text-emerald-800">
                Historical receipts remain visible below. Fresh BLOCKED / DEGRADED observations are
                handled as current supply-health remediation, not stale re-probes.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {actions.map((action) => {
              const intent = latestCompatibilityReprobeIntent(intents, action.targetId);
              const execution = intent
                ? compatibilityReprobeExecutionForIntent(executions, intent.intentId)
                : null;
              const phase = compatibilityReprobePhase(intent, execution);
              const command = intent
                ? compatibilityReprobeWorkerCommand({
                    intentId: intent.intentId,
                    executedByActorId: executorActorId,
                  })
                : null;

              return (
                <article key={action.targetId} className="rounded-xl border border-slate-200 p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-cyan-50 px-2.5 py-1 text-xs font-semibold text-cyan-800">
                          HEALTH · REPROBE
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
                      <div className="text-xs text-slate-500 lg:text-right">
                        <p className="break-all font-mono">{intent.intentId}</p>
                        <p className="mt-1">Intent · {intent.status}</p>
                      </div>
                    ) : null}
                  </div>

                  <div className="mt-4 border-t border-slate-100 pt-4">
                    {phase === "REQUEST_APPROVAL" || phase === "FAILED_REAPPROVAL_REQUIRED" ? (
                      <div className="flex flex-wrap items-center gap-3">
                        <button
                          type="button"
                          disabled={busy !== null}
                          onClick={() => void createIntent(action.targetId)}
                          className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-3.5 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {phase === "FAILED_REAPPROVAL_REQUIRED" ? (
                            <RotateCcw size={15} aria-hidden="true" />
                          ) : (
                            <ShieldCheck size={15} aria-hidden="true" />
                          )}
                          {phase === "FAILED_REAPPROVAL_REQUIRED"
                            ? "Create replacement approval intent"
                            : "Create re-probe approval intent"}
                        </button>
                        <span className="text-xs text-slate-500">
                          Intent only · no canary runs in the browser.
                        </span>
                      </div>
                    ) : null}

                    {phase === "PENDING_APPROVAL" && intent ? (
                      <div className="flex flex-wrap items-center gap-3">
                        <button
                          type="button"
                          disabled={busy !== null}
                          onClick={() => void transitionIntent(intent.intentId, "APPROVE")}
                          className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-3.5 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <Check size={15} aria-hidden="true" /> Approve re-probe
                        </button>
                        <button
                          type="button"
                          disabled={busy !== null}
                          onClick={() => void transitionIntent(intent.intentId, "CANCEL")}
                          className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <Ban size={15} aria-hidden="true" /> Cancel intent
                        </button>
                      </div>
                    ) : null}

                    {phase === "READY_FOR_WORKER" && intent && command ? (
                      <div className="space-y-3">
                        <div className="flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4 text-blue-950">
                          <Terminal className="mt-0.5 shrink-0" size={18} aria-hidden="true" />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold">
                              Run on an authenticated Worker host
                            </p>
                            <p className="mt-1 text-xs leading-5 text-blue-800">
                              MARKORBIT_CONTROL_PLANE_URL、MARKORBIT_WORKER_ID 与
                              MARKORBIT_WORKER_CREDENTIAL 必须仅存在于 Worker 环境。命令本身不包含
                              credential。
                            </p>
                            <code className="mt-3 block overflow-x-auto rounded-lg bg-slate-950 px-3 py-2.5 text-xs leading-5 text-slate-100">
                              {command}
                            </code>
                          </div>
                        </div>
                        <button
                          type="button"
                          disabled={!executorActorId.trim()}
                          onClick={() => void copyCommand(intent.intentId)}
                          className="inline-flex items-center gap-2 rounded-xl border border-blue-300 bg-white px-3.5 py-2 text-sm font-semibold text-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {copiedIntentId === intent.intentId ? (
                            <Check size={15} aria-hidden="true" />
                          ) : (
                            <Clipboard size={15} aria-hidden="true" />
                          )}
                          {copiedIntentId === intent.intentId ? "Copied" : "Copy Worker command"}
                        </button>
                      </div>
                    ) : null}

                    {phase === "RUNNING" && execution ? (
                      <div className="flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4 text-blue-900">
                        <Clock3 className="mt-0.5 shrink-0" size={18} aria-hidden="true" />
                        <div>
                          <p className="text-sm font-semibold">Worker re-probe is STARTED</p>
                          <p className="mt-1 text-xs leading-5 text-blue-800">
                            Worker {execution.workerId} · started {timeLabel(execution.startedAt)} ·
                            receipt {execution.executionId}
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

        <div className="border-t border-slate-100 pt-5">
          <div className="flex items-end justify-between gap-3">
            <div>
              <h3 className="font-semibold text-slate-950">Recent re-probe receipts</h3>
              <p className="mt-1 text-xs text-slate-500">
                Read-only audit history. A BLOCKED/DEGRADED observation can still be a COMPLETED
                probe execution.
              </p>
            </div>
            <span className="text-xs text-slate-500">{executions.length} loaded</span>
          </div>

          {executions.length === 0 ? (
            <p className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
              No compatibility re-probe execution receipt has been recorded for this jurisdiction.
            </p>
          ) : (
            <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200">
              <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Target</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold">Observation</th>
                    <th className="px-4 py-3 font-semibold">Worker</th>
                    <th className="px-4 py-3 font-semibold">Timing</th>
                    <th className="px-4 py-3 font-semibold">Signal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {executions.map((execution) => (
                    <tr key={execution.executionId} className="align-top">
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-900">{execution.targetId}</p>
                        <p className="mt-1 break-all font-mono text-[11px] text-slate-400">
                          {execution.executionId}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full border px-2 py-1 font-semibold ${statusClass(execution.status)}`}
                        >
                          {execution.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {execution.observationState ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{execution.workerId}</td>
                      <td className="px-4 py-3 text-slate-500">
                        <p>Start · {timeLabel(execution.startedAt)}</p>
                        <p className="mt-1">End · {timeLabel(execution.completedAt)}</p>
                      </td>
                      <td className="max-w-xs px-4 py-3 text-slate-500">
                        {execution.status === "FAILED"
                          ? `${execution.errorCode ?? "FAILED"}: ${execution.errorMessage ?? "No error message"}`
                          : execution.observationObservedAt
                            ? `Observed ${timeLabel(execution.observationObservedAt)}`
                            : "Awaiting observation evidence"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
