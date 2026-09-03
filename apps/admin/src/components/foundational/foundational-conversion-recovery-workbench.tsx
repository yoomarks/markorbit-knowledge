"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ExternalLink, RefreshCw, RotateCcw, ShieldCheck } from "lucide-react";
import type { FoundationalRemediationQueueSnapshot } from "@markorbit/worker-runtime/foundational-remediation-snapshot";
import { adminBrowserMutationHeaders } from "@/lib/admin-browser-api-client";
import {
  conversionRecoveryStateAllowsOperatorRetry,
  listControlledConversionRecoveryActions,
} from "./foundational-operator-state";

type Jurisdiction = "US" | "WO";

type Props = {
  workspaceId: string;
  jurisdiction: Jurisdiction;
  snapshot: FoundationalRemediationQueueSnapshot;
  onSnapshotRefresh: () => Promise<void>;
};

type RecoveryState = "WAITING" | "RUNNING" | "RESOLVED" | "DEAD_LETTERED";

type RecoveryCase = {
  id: string;
  rootRunId: string;
  latestRunId: string;
  rawArtifactId: string;
  state: RecoveryState;
  retryCount: number;
  maxRetries: number;
  operatorOverrideCount: number;
  lastFailure: {
    kind?: string;
    code?: string;
    message?: string;
  };
  nextRetryAt?: string;
  deadLetterReason?: string;
  updatedAt: string;
};

type RecoverySnapshot = {
  objectType: "FOUNDATIONAL_CONVERSION_RECOVERY_SNAPSHOT";
  targetId: string;
  sourceIds: string[];
  items: RecoveryCase[];
  summary: Record<RecoveryState, number> & { total: number };
  executionPolicy: "EXISTING_M11_OPERATOR_RETRY_ONLY";
  automaticReconcile: false;
  automaticRetry: false;
};

type ErrorEnvelope = { error?: { message?: string } };

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

function recoveryUrl(workspaceId: string, jurisdiction: Jurisdiction, targetId: string): string {
  const query = new URLSearchParams({ workspaceId, jurisdiction, targetId });
  return `/api/foundational/conversion-recovery?${query.toString()}`;
}

async function fetchRecoverySnapshots(input: {
  workspaceId: string;
  jurisdiction: Jurisdiction;
  targetIds: readonly string[];
}): Promise<Record<string, RecoverySnapshot>> {
  const entries = await Promise.all(
    input.targetIds.map(async (targetId) => {
      const value = await requestJson<RecoverySnapshot>(
        recoveryUrl(input.workspaceId, input.jurisdiction, targetId),
      );
      return [targetId, value] as const;
    }),
  );
  return Object.fromEntries(entries);
}

function stateClass(state: RecoveryState): string {
  if (state === "RESOLVED") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (state === "RUNNING") return "border-blue-200 bg-blue-50 text-blue-800";
  if (state === "DEAD_LETTERED") return "border-rose-200 bg-rose-50 text-rose-800";
  return "border-amber-200 bg-amber-50 text-amber-800";
}

function timeLabel(value: string | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return value;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function FoundationalConversionRecoveryWorkbench({
  workspaceId,
  jurisdiction,
  snapshot,
  onSnapshotRefresh,
}: Props) {
  const actions = useMemo(() => listControlledConversionRecoveryActions(snapshot), [snapshot]);
  const [recoveries, setRecoveries] = useState<Record<string, RecoverySnapshot>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadRecoveries(): Promise<void> {
    setLoading(true);
    setError(null);
    try {
      setRecoveries(
        await fetchRecoverySnapshots({
          workspaceId,
          jurisdiction,
          targetIds: actions.map((action) => action.targetId),
        }),
      );
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "Unable to load conversion recovery state",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    void fetchRecoverySnapshots({
      workspaceId,
      jurisdiction,
      targetIds: actions.map((action) => action.targetId),
    })
      .then((nextRecoveries) => {
        if (!active) return;
        setRecoveries(nextRecoveries);
        setError(null);
        setLoading(false);
      })
      .catch((loadError: unknown) => {
        if (!active) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load conversion recovery state",
        );
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [actions, jurisdiction, workspaceId]);

  async function retry(targetId: string, recoveryCaseId: string): Promise<void> {
    setBusy(recoveryCaseId);
    setError(null);
    try {
      await requestJson(`/api/conversion-recovery/${encodeURIComponent(recoveryCaseId)}/retry`, {
        method: "POST",
      });
      await onSnapshotRefresh();
      const updated = await requestJson<RecoverySnapshot>(
        recoveryUrl(workspaceId, jurisdiction, targetId),
      );
      setRecoveries((current) => ({ ...current, [targetId]: updated }));
    } catch (retryError) {
      setError(retryError instanceof Error ? retryError.message : "Conversion retry failed");
    } finally {
      setBusy(null);
    }
  }

  if (actions.length === 0) return null;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white">
      <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-semibold text-slate-950">Controlled conversion recovery</h2>
            <span className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-800">
              Existing M11 operator retry
            </span>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700">
              Auto reconcile disabled here
            </span>
          </div>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">
            M27 只把 FOUNDATIONAL CONVERT target 精确映射到已有 Conversion Recovery
            case。本操作面不会调用 reconcile，也不会启动自动 retry；只有 WAITING / DEAD_LETTERED
            case 可由操作员显式调用现有 M11 retry。
          </p>
        </div>
        <button
          type="button"
          disabled={loading || busy !== null}
          onClick={() => void loadRecoveries()}
          className="inline-flex items-center gap-2 self-start rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RefreshCw size={15} aria-hidden="true" className={loading ? "animate-spin" : ""} />
          Refresh recovery
        </button>
      </div>

      <div className="space-y-4 p-5">
        <div className="max-w-xl rounded-xl border border-slate-200 bg-slate-50 p-3">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Retry actor
          </span>
          <p className="mt-2 text-sm leading-5 text-slate-700">
            Derived from the authenticated Workspace Principal. Browser-supplied actor and workspace
            fields are not accepted by the retry endpoint.
          </p>
        </div>

        {error ? (
          <div className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-rose-900">
            <AlertTriangle className="mt-0.5 shrink-0" size={17} aria-hidden="true" />
            <p className="text-sm leading-5">{error}</p>
          </div>
        ) : null}

        {actions.map((action) => {
          const recovery = recoveries[action.targetId];
          return (
            <article key={action.targetId} className="rounded-xl border border-slate-200 p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-800">
                      CONVERT
                    </span>
                    <span className="text-xs text-slate-500">RUN_CONVERSION_RECOVERY</span>
                  </div>
                  <h3 className="mt-2 break-all font-semibold text-slate-950">{action.targetId}</h3>
                  <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
                    {action.operatorInstruction}
                  </p>
                </div>
                {recovery ? (
                  <span className="text-xs text-slate-500">
                    {recovery.summary.total} recovery case
                    {recovery.summary.total === 1 ? "" : "s"}
                  </span>
                ) : null}
              </div>

              {!recovery && loading ? (
                <div className="mt-4 flex items-center gap-2 rounded-lg bg-slate-50 p-3 text-sm text-slate-500">
                  <RefreshCw className="animate-spin" size={15} aria-hidden="true" /> Loading M11
                  cases…
                </div>
              ) : recovery && recovery.items.length === 0 ? (
                <div className="mt-4 flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-slate-700">
                  <ShieldCheck className="mt-0.5 shrink-0" size={16} aria-hidden="true" />
                  <div>
                    <p className="text-sm font-medium">
                      No tracked M11 recovery case for this target.
                    </p>
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      M27 does not auto-create or reconcile a case. Inspect the conversion run
                      ledger before taking any separate recovery action.
                    </p>
                  </div>
                </div>
              ) : recovery ? (
                <div className="mt-4 space-y-3">
                  {recovery.items.map((item) => {
                    const retryable = conversionRecoveryStateAllowsOperatorRetry(item.state);
                    return (
                      <div
                        key={item.id}
                        className="rounded-lg border border-slate-200 bg-slate-50 p-3"
                      >
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span
                                className={`rounded-full border px-2 py-1 text-xs font-semibold ${stateClass(item.state)}`}
                              >
                                {item.state}
                              </span>
                              <span className="text-xs text-slate-500">
                                retry {item.retryCount}/{item.maxRetries} · operator overrides{" "}
                                {item.operatorOverrideCount}
                              </span>
                            </div>
                            <p className="mt-2 break-all font-mono text-xs text-slate-700">
                              {item.id}
                            </p>
                            <p className="mt-1 break-all text-xs text-slate-500">
                              latest run · <span className="font-mono">{item.latestRunId}</span>
                            </p>
                            <p className="mt-2 text-xs leading-5 text-slate-600">
                              {item.lastFailure.code ||
                                item.lastFailure.kind ||
                                "Conversion failure"}
                              {item.lastFailure.message ? ` · ${item.lastFailure.message}` : ""}
                            </p>
                            {item.nextRetryAt ? (
                              <p className="mt-1 text-xs text-slate-500">
                                M11 next retry schedule · {timeLabel(item.nextRetryAt)} (not
                                executed by this view)
                              </p>
                            ) : null}
                            {item.deadLetterReason ? (
                              <p className="mt-1 text-xs font-medium text-rose-700">
                                {item.deadLetterReason}
                              </p>
                            ) : null}
                          </div>
                          <div className="flex shrink-0 flex-wrap items-center gap-2">
                            <a
                              href={`/conversion-runs?q=${encodeURIComponent(item.latestRunId)}`}
                              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700"
                            >
                              Open run <ExternalLink size={14} aria-hidden="true" />
                            </a>
                            {retryable ? (
                              <button
                                type="button"
                                disabled={busy !== null}
                                onClick={() => void retry(action.targetId, item.id)}
                                className="inline-flex items-center gap-2 rounded-xl bg-violet-700 px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                <RotateCcw size={14} aria-hidden="true" />
                                {busy === item.id ? "Retrying…" : "Retry with M11"}
                              </button>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}
