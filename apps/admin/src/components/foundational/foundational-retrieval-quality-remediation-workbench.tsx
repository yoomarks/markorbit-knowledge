"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, RefreshCw, ShieldCheck, Wrench } from "lucide-react";
import type { FoundationalRemediationQueueSnapshot } from "@markorbit/worker-runtime/foundational-remediation-snapshot";
import { adminBrowserMutationHeaders } from "@/lib/admin-browser-api-client";
import { listControlledQualityRemediationActions } from "./foundational-operator-state";

type Jurisdiction = "US" | "WO";
type ActionCode =
  | "RESTORE_PROVENANCE_EVIDENCE"
  | "RECONCILE_CURRENT_VERSION"
  | "REBUILD_RETRIEVAL_INDEX"
  | "REVIEW_DUPLICATE_CHUNKING";
type ActionDisposition = "M17_EXECUTABLE" | "MANUAL_REVIEW_ONLY" | "CANONICAL_REINDEX_REQUIRED";

type Props = {
  workspaceId: string;
  jurisdiction: Jurisdiction;
  snapshot: FoundationalRemediationQueueSnapshot;
  onSnapshotRefresh: () => Promise<void>;
};

type QualityAction = {
  code: ActionCode;
  severity: "BLOCKING" | "REVIEW";
  gapCodes: string[];
  operatorInstruction: string;
  automaticExecution: false;
  disposition: ActionDisposition;
};

type QualityItem = {
  sourceId: string;
  documentId: string;
  stagingDocumentId: string;
  artifactVersion: number;
  title: string;
  auditState: "READY" | "DEGRADED" | "BLOCKED";
  auditGaps: string[];
  state: "NO_ACTION" | "REVIEW_REQUIRED" | "REMEDIATION_REQUIRED";
  actions: QualityAction[];
};

type QualitySnapshot = {
  objectType: "FOUNDATIONAL_RETRIEVAL_QUALITY_REMEDIATION_SNAPSHOT";
  targetId: string;
  sourceIds: string[];
  items: QualityItem[];
  summary: {
    total: number;
    executableActionCount: number;
    manualReviewActionCount: number;
    canonicalReindexRequiredCount: number;
  };
  executionPolicy: "M16_PLAN_M17_EXPLICIT_OPERATOR_ONLY";
  automaticExecution: false;
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

function qualityUrl(workspaceId: string, jurisdiction: Jurisdiction, targetId: string): string {
  const query = new URLSearchParams({ workspaceId, jurisdiction, targetId });
  return `/api/foundational/retrieval-quality-remediation?${query.toString()}`;
}

async function fetchSnapshots(input: {
  workspaceId: string;
  jurisdiction: Jurisdiction;
  targetIds: readonly string[];
}): Promise<Record<string, QualitySnapshot>> {
  const entries = await Promise.all(
    input.targetIds.map(async (targetId) => {
      const value = await requestJson<QualitySnapshot>(
        qualityUrl(input.workspaceId, input.jurisdiction, targetId),
      );
      return [targetId, value] as const;
    }),
  );
  return Object.fromEntries(entries);
}

function dispositionClass(disposition: ActionDisposition): string {
  if (disposition === "M17_EXECUTABLE") {
    return "border-emerald-200 bg-emerald-50 text-emerald-800";
  }
  if (disposition === "CANONICAL_REINDEX_REQUIRED") {
    return "border-amber-200 bg-amber-50 text-amber-800";
  }
  return "border-slate-200 bg-slate-100 text-slate-700";
}

function dispositionLabel(disposition: ActionDisposition): string {
  if (disposition === "M17_EXECUTABLE") return "M17 explicit execute";
  if (disposition === "CANONICAL_REINDEX_REQUIRED") return "M28 canonical reindex required";
  return "Manual review only";
}

function executionKey(stagingDocumentId: string, actionCode: ActionCode): string {
  return `m29:${stagingDocumentId}:${actionCode}:${crypto.randomUUID()}`.slice(0, 200);
}

export function FoundationalRetrievalQualityRemediationWorkbench({
  workspaceId,
  jurisdiction,
  snapshot,
  onSnapshotRefresh,
}: Props) {
  const actions = useMemo(() => listControlledQualityRemediationActions(snapshot), [snapshot]);
  const [snapshots, setSnapshots] = useState<Record<string, QualitySnapshot>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load(): Promise<void> {
    setLoading(true);
    setError(null);
    try {
      setSnapshots(
        await fetchSnapshots({
          workspaceId,
          jurisdiction,
          targetIds: actions.map((action) => action.targetId),
        }),
      );
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "Unable to load M16 remediation plans",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    void fetchSnapshots({
      workspaceId,
      jurisdiction,
      targetIds: actions.map((action) => action.targetId),
    })
      .then((nextSnapshots) => {
        if (!active) return;
        setSnapshots(nextSnapshots);
        setError(null);
        setLoading(false);
      })
      .catch((loadError: unknown) => {
        if (!active) return;
        setError(
          loadError instanceof Error ? loadError.message : "Unable to load M16 remediation plans",
        );
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [actions, jurisdiction, workspaceId]);

  async function executeM17(
    targetId: string,
    stagingDocumentId: string,
    actionCode: ActionCode,
  ): Promise<void> {
    const operation = `${stagingDocumentId}:${actionCode}`;
    setBusy(operation);
    setError(null);
    try {
      await requestJson(qualityUrl(workspaceId, jurisdiction, targetId), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          stagingDocumentId,
          actionCode,
          idempotencyKey: executionKey(stagingDocumentId, actionCode),
          approved: true,
        }),
      });
      const updated = await requestJson<QualitySnapshot>(
        qualityUrl(workspaceId, jurisdiction, targetId),
      );
      setSnapshots((current) => ({ ...current, [targetId]: updated }));
      await onSnapshotRefresh();
    } catch (executionError) {
      setError(
        executionError instanceof Error
          ? executionError.message
          : "M17 remediation execution failed",
      );
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
            <h2 className="font-semibold text-slate-950">Retrieval quality remediation</h2>
            <span className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-800">
              M16 plan → M17 explicit operator
            </span>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700">
              No automatic execution
            </span>
          </div>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">
            M29 只把 FOUNDATIONAL QUALITY 接到既有 M16/M17。M17 仅执行 policy-eligible projection
            repair；provenance restoration 与 duplicate review 保持人工，结构性 chunk drift
            继续要求通过既有 verified canonical reindex 边界修复。
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
            M17 actor · authenticated Workspace Principal
          </span>
          <button
            type="button"
            disabled={loading || busy !== null}
            onClick={() => void load()}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw size={15} aria-hidden="true" className={loading ? "animate-spin" : ""} />
            Refresh plans
          </button>
        </div>
      </div>

      <div className="space-y-4 p-5">
        {error ? (
          <div className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-rose-900">
            <AlertTriangle className="mt-0.5 shrink-0" size={17} aria-hidden="true" />
            <p className="text-sm leading-5">{error}</p>
          </div>
        ) : null}

        {actions.map((readinessAction) => {
          const targetSnapshot = snapshots[readinessAction.targetId];
          return (
            <article
              key={readinessAction.targetId}
              className="rounded-xl border border-slate-200 p-4"
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-800">
                      QUALITY
                    </span>
                    <span className="text-xs text-slate-500">OPEN_RETRIEVAL_REMEDIATION_PLAN</span>
                  </div>
                  <h3 className="mt-2 break-all font-semibold text-slate-950">
                    {readinessAction.targetId}
                  </h3>
                  <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
                    {readinessAction.operatorInstruction}
                  </p>
                </div>
                {targetSnapshot ? (
                  <span className="text-xs text-slate-500">
                    {targetSnapshot.summary.total} current M16 plan
                    {targetSnapshot.summary.total === 1 ? "" : "s"} ·{" "}
                    {targetSnapshot.summary.executableActionCount} M17 executable
                  </span>
                ) : null}
              </div>

              {!targetSnapshot && loading ? (
                <div className="mt-4 flex items-center gap-2 rounded-lg bg-slate-50 p-3 text-sm text-slate-500">
                  <RefreshCw className="animate-spin" size={15} aria-hidden="true" /> Loading M16
                  plans…
                </div>
              ) : targetSnapshot && targetSnapshot.items.length === 0 ? (
                <div className="mt-4 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900">
                  <AlertTriangle className="mt-0.5 shrink-0" size={16} aria-hidden="true" />
                  <div>
                    <p className="text-sm font-medium">
                      No current target-scoped M16 plan was produced.
                    </p>
                    <p className="mt-1 text-xs leading-5 text-amber-700">
                      Inspect retrieval audit coverage; M29 will not invent a remediation action.
                    </p>
                  </div>
                </div>
              ) : targetSnapshot ? (
                <div className="mt-4 space-y-3">
                  {targetSnapshot.items.map((item) => (
                    <div
                      key={item.stagingDocumentId}
                      className="rounded-lg border border-slate-200 bg-slate-50 p-3"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700">
                          {item.auditState}
                        </span>
                        <span className="text-xs text-slate-500">v{item.artifactVersion}</span>
                      </div>
                      <p className="mt-2 text-sm font-medium text-slate-900">{item.title}</p>
                      <p className="mt-1 break-all font-mono text-xs text-slate-600">
                        {item.stagingDocumentId}
                      </p>
                      <p className="mt-2 text-xs text-slate-500">
                        Audit gaps ·{" "}
                        {item.auditGaps.length > 0 ? item.auditGaps.join(", ") : "none"}
                      </p>

                      {item.actions.length === 0 ? (
                        <p className="mt-3 flex items-center gap-1.5 text-xs text-emerald-700">
                          <ShieldCheck size={14} aria-hidden="true" /> M16 reports no remediation
                          action.
                        </p>
                      ) : (
                        <div className="mt-3 space-y-2">
                          {item.actions.map((action) => {
                            const operation = `${item.stagingDocumentId}:${action.code}`;
                            return (
                              <div
                                key={action.code}
                                className="rounded-lg border border-slate-200 bg-white p-3"
                              >
                                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                  <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span className="font-mono text-xs text-slate-700">
                                        {action.code}
                                      </span>
                                      <span
                                        className={`rounded-full border px-2 py-1 text-xs font-semibold ${dispositionClass(action.disposition)}`}
                                      >
                                        {dispositionLabel(action.disposition)}
                                      </span>
                                    </div>
                                    <p className="mt-2 text-xs leading-5 text-slate-600">
                                      {action.operatorInstruction}
                                    </p>
                                    {action.disposition === "CANONICAL_REINDEX_REQUIRED" ? (
                                      <p className="mt-2 text-xs font-medium text-amber-700">
                                        M17 intentionally blocks this structural repair; use the
                                        existing M28 verified canonical reindex boundary.
                                      </p>
                                    ) : null}
                                  </div>
                                  {action.disposition === "M17_EXECUTABLE" ? (
                                    <button
                                      type="button"
                                      disabled={busy !== null}
                                      onClick={() =>
                                        void executeM17(
                                          readinessAction.targetId,
                                          item.stagingDocumentId,
                                          action.code,
                                        )
                                      }
                                      className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-violet-700 px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                      <Wrench size={14} aria-hidden="true" />
                                      {busy === operation ? "Executing…" : "Execute M17 action"}
                                    </button>
                                  ) : null}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}
