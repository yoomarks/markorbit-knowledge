"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, RefreshCw, Search, ShieldCheck } from "lucide-react";
import type { FoundationalRemediationQueueSnapshot } from "@markorbit/worker-runtime/foundational-remediation-snapshot";
import {
  listControlledRelevanceAuditActions,
  type ControlledRelevanceAuditAction,
} from "./foundational-operator-state";

type Jurisdiction = "US" | "WO";
type AuditState = "READY" | "DEGRADED" | "BLOCKED" | "NOT_APPLICABLE";

type ProbeResult = {
  probeId: string;
  query: string;
  state: Exclude<AuditState, "NOT_APPLICABLE">;
  sourceFilteredHitCount: number;
  matchedSourceIds: string[];
  globalTopSourceIds: string[];
  expectedSourceInGlobalTopK: boolean;
  gaps: string[];
};

type AuditRecord = {
  targetId: string;
  displayName: string;
  sourceIds: string[];
  currentDocumentCount: number;
  topK: number;
  state: AuditState;
  gaps: string[];
  probes: ProbeResult[];
  auditedAt: string;
};

type AuditResult = {
  objectType: "RETRIEVAL_RELEVANCE_AUDIT_LIST";
  items: AuditRecord[];
  auditedAt: string;
  scoringMode: "SQLITE_FTS5_BM25_DETERMINISTIC_SMOKE";
  semanticJudgment: false;
};

type ErrorEnvelope = { error?: { message?: string } };

type Props = {
  workspaceId: string;
  jurisdiction: Jurisdiction;
  snapshot: FoundationalRemediationQueueSnapshot;
};

async function requestJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store" });
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

function auditUrl(workspaceId: string, jurisdiction: Jurisdiction, targetId: string): string {
  const query = new URLSearchParams({ workspaceId, jurisdiction, targetId, topK: "5" });
  return `/api/retrieval/relevance-audit?${query.toString()}`;
}

async function fetchAudits(input: {
  workspaceId: string;
  jurisdiction: Jurisdiction;
  targetIds: readonly string[];
}): Promise<Record<string, AuditResult>> {
  const entries = await Promise.all(
    input.targetIds.map(async (targetId) => {
      const audit = await requestJson<AuditResult>(
        auditUrl(input.workspaceId, input.jurisdiction, targetId),
      );
      return [targetId, audit] as const;
    }),
  );
  return Object.fromEntries(entries);
}

function stateClass(state: AuditState): string {
  if (state === "READY") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (state === "DEGRADED") return "border-amber-200 bg-amber-50 text-amber-800";
  if (state === "BLOCKED") return "border-rose-200 bg-rose-50 text-rose-800";
  return "border-slate-200 bg-slate-100 text-slate-700";
}

function targetActions(
  actions: readonly ControlledRelevanceAuditAction[],
  targetId: string,
): ControlledRelevanceAuditAction[] {
  return actions.filter((action) => action.targetId === targetId);
}

export function FoundationalRelevanceAuditWorkbench({
  workspaceId,
  jurisdiction,
  snapshot,
}: Props) {
  const actions = useMemo(() => listControlledRelevanceAuditActions(snapshot), [snapshot]);
  const targetIds = useMemo(
    () => [...new Set(actions.map((action) => action.targetId))],
    [actions],
  );
  const [audits, setAudits] = useState<Record<string, AuditResult>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load(): Promise<void> {
    setLoading(true);
    setError(null);
    try {
      setAudits(await fetchAudits({ workspaceId, jurisdiction, targetIds }));
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "Unable to load M18 relevance audit",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    void fetchAudits({ workspaceId, jurisdiction, targetIds })
      .then((nextAudits) => {
        if (!active) return;
        setAudits(nextAudits);
        setError(null);
        setLoading(false);
      })
      .catch((loadError: unknown) => {
        if (!active) return;
        setError(
          loadError instanceof Error ? loadError.message : "Unable to load M18 relevance audit",
        );
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [jurisdiction, targetIds, workspaceId]);

  if (actions.length === 0) return null;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white">
      <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-semibold text-slate-950">Retrieval relevance audit</h2>
            <span className="rounded-full border border-cyan-200 bg-cyan-50 px-2.5 py-1 text-xs font-semibold text-cyan-800">
              M18 deterministic smoke audit
            </span>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700">
              Read-only · no auto tuning
            </span>
          </div>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">
            M30 复用既有 M18 target-scoped relevance audit。这里只展示确定性 FTS5/BM25 smoke
            证据，不做语义判断、不自动修改 probe、不自动调 ranking，也不会把 retrieval plumbing
            结果解释成法律相关性。
          </p>
        </div>
        <button
          type="button"
          disabled={loading}
          onClick={() => void load()}
          className="inline-flex items-center gap-2 self-start rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RefreshCw size={15} aria-hidden="true" className={loading ? "animate-spin" : ""} />
          Refresh M18 audit
        </button>
      </div>

      <div className="space-y-4 p-5">
        {error ? (
          <div className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-rose-900">
            <AlertTriangle className="mt-0.5 shrink-0" size={17} aria-hidden="true" />
            <p className="text-sm leading-5">{error}</p>
          </div>
        ) : null}

        {targetIds.map((targetId) => {
          const audit = audits[targetId];
          const requestedActions = targetActions(actions, targetId);
          return (
            <article key={targetId} className="rounded-xl border border-slate-200 p-4">
              <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-cyan-50 px-2.5 py-1 text-xs font-semibold text-cyan-800">
                      RELEVANCE
                    </span>
                    {requestedActions.map((action) => (
                      <span
                        key={action.actionCode}
                        className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 font-mono text-[11px] text-slate-600"
                      >
                        {action.actionCode}
                      </span>
                    ))}
                  </div>
                  <h3 className="mt-2 break-all font-semibold text-slate-950">{targetId}</h3>
                  <div className="mt-2 space-y-1">
                    {requestedActions.map((action) => (
                      <p
                        key={action.actionCode}
                        className="max-w-3xl text-xs leading-5 text-slate-600"
                      >
                        {action.operatorInstruction}
                      </p>
                    ))}
                  </div>
                </div>
                <span className="text-xs text-slate-500">M18 only · automaticExecution=false</span>
              </div>

              {!audit && loading ? (
                <div className="mt-4 flex items-center gap-2 rounded-lg bg-slate-50 p-3 text-sm text-slate-500">
                  <RefreshCw className="animate-spin" size={15} aria-hidden="true" /> Loading target
                  audit…
                </div>
              ) : audit && audit.items.length === 0 ? (
                <div className="mt-4 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900">
                  <AlertTriangle className="mt-0.5 shrink-0" size={16} aria-hidden="true" />
                  <div>
                    <p className="text-sm font-medium">
                      No target-scoped M18 audit record was returned.
                    </p>
                    <p className="mt-1 text-xs leading-5 text-amber-700">
                      Treat this as audit coverage evidence. M30 does not invent a result or bypass
                      M19 coverage checks.
                    </p>
                  </div>
                </div>
              ) : audit ? (
                <div className="mt-4 space-y-3">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span>{audit.scoringMode}</span>
                    <span>·</span>
                    <span>semanticJudgment=false</span>
                    <span>·</span>
                    <span>{audit.items.length} record(s)</span>
                  </div>

                  {audit.items.map((record) => (
                    <div
                      key={`${record.targetId}:${record.auditedAt}`}
                      className="rounded-lg border border-slate-200 bg-slate-50 p-3"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-full border px-2 py-1 text-xs font-semibold ${stateClass(record.state)}`}
                        >
                          {record.state}
                        </span>
                        <span className="text-xs text-slate-500">
                          {record.currentDocumentCount} current document(s) · topK {record.topK}
                        </span>
                      </div>
                      <p className="mt-2 text-sm font-medium text-slate-900">
                        {record.displayName}
                      </p>
                      <p className="mt-1 break-all text-xs text-slate-500">
                        Sources ·{" "}
                        {record.sourceIds.length > 0 ? record.sourceIds.join(", ") : "none"}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        Gaps · {record.gaps.length > 0 ? record.gaps.join(", ") : "none"}
                      </p>

                      {record.gaps.includes("PROBE_NOT_CONFIGURED") ? (
                        <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800">
                          <AlertTriangle className="mt-0.5 shrink-0" size={14} aria-hidden="true" />
                          Curated probe configuration is code-reviewed configuration. M30 will not
                          generate or write a replacement probe at runtime.
                        </div>
                      ) : null}

                      {record.probes.length === 0 && record.state === "READY" ? (
                        <p className="mt-3 flex items-center gap-1.5 text-xs text-emerald-700">
                          <ShieldCheck size={14} aria-hidden="true" /> No probe remediation evidence
                          reported.
                        </p>
                      ) : null}

                      {record.probes.length > 0 ? (
                        <div className="mt-3 space-y-2">
                          {record.probes.map((probe) => (
                            <div
                              key={probe.probeId}
                              className="rounded-lg border border-slate-200 bg-white p-3"
                            >
                              <div className="flex flex-wrap items-center gap-2">
                                <Search size={14} aria-hidden="true" className="text-slate-500" />
                                <span className="font-mono text-xs text-slate-700">
                                  {probe.probeId}
                                </span>
                                <span
                                  className={`rounded-full border px-2 py-1 text-xs font-semibold ${stateClass(probe.state)}`}
                                >
                                  {probe.state}
                                </span>
                              </div>
                              <p className="mt-2 text-sm text-slate-800">Query · {probe.query}</p>
                              <div className="mt-2 grid gap-2 text-xs leading-5 text-slate-600 md:grid-cols-2">
                                <p>Source-filtered hits · {probe.sourceFilteredHitCount}</p>
                                <p>
                                  Expected source in global top-K ·{" "}
                                  {probe.expectedSourceInGlobalTopK ? "yes" : "no"}
                                </p>
                                <p className="break-all">
                                  Matched source IDs ·{" "}
                                  {probe.matchedSourceIds.length > 0
                                    ? probe.matchedSourceIds.join(", ")
                                    : "none"}
                                </p>
                                <p className="break-all">
                                  Global top source IDs ·{" "}
                                  {probe.globalTopSourceIds.length > 0
                                    ? probe.globalTopSourceIds.join(", ")
                                    : "none"}
                                </p>
                              </div>
                              <p className="mt-2 text-xs text-slate-500">
                                Probe gaps ·{" "}
                                {probe.gaps.length > 0 ? probe.gaps.join(", ") : "none"}
                              </p>
                            </div>
                          ))}
                        </div>
                      ) : null}
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
