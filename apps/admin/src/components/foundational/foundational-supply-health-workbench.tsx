"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, RefreshCw, ShieldCheck } from "lucide-react";
import type { FoundationalRemediationQueueSnapshot } from "@markorbit/worker-runtime/foundational-remediation-snapshot";

type Jurisdiction = "US" | "WO";
type HealthState = "READY" | "DEGRADED" | "BLOCKED";
type FreshnessState = "FRESH" | "STALE" | "UNOBSERVED";

type HealthRecord = {
  targetId: string;
  displayName: string;
  canonicalUri: string;
  family: string;
  coverageTier: string;
  changeSensitivity: string;
  registrationState: "REGISTERED" | "UNREGISTERED";
  sourceIds: string[];
  latestRun: {
    runId: string;
    status: string;
    requestedAt: string;
    updatedAt: string;
  } | null;
  acquisition: {
    artifactCount: number;
    artifactKinds: string[];
    latestArtifactAt: string | null;
  };
  normalization: {
    stagingDocumentCount: number;
    readyDocumentCount: number;
    latestDocumentAt: string | null;
    latestStatus: string | null;
  };
  retrieval: {
    indexedDocumentCount: number;
    currentDocumentCount: number;
    currentArtifactVersion: number | null;
    currentChunkCount: number;
    latestIndexedAt: string | null;
  };
  freshness: {
    state: FreshnessState;
    lastObservedAt: string | null;
    ageHours: number | null;
    maxAgeHours: number;
  };
  gaps: string[];
  state: HealthState;
  observedAt: string;
};

type HealthResult = {
  observedAt: string;
  items: HealthRecord[];
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

function healthUrl(workspaceId: string, jurisdiction: Jurisdiction, targetId: string): string {
  const query = new URLSearchParams({
    workspaceId,
    jurisdiction,
    targetId,
    coverageTier: "FOUNDATIONAL",
    catalogState: "ACTIVE",
  });
  return `/api/source-supply-health?${query.toString()}`;
}

async function fetchHealth(input: {
  workspaceId: string;
  jurisdiction: Jurisdiction;
  targetIds: readonly string[];
}): Promise<Record<string, HealthResult>> {
  const entries = await Promise.all(
    input.targetIds.map(async (targetId) => {
      const result = await requestJson<HealthResult>(
        healthUrl(input.workspaceId, input.jurisdiction, targetId),
      );
      return [targetId, result] as const;
    }),
  );
  return Object.fromEntries(entries);
}

function stateClass(state: HealthState): string {
  if (state === "READY") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (state === "DEGRADED") return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-rose-200 bg-rose-50 text-rose-800";
}

function freshnessClass(state: FreshnessState): string {
  if (state === "FRESH") return "text-emerald-700";
  if (state === "STALE") return "text-rose-700";
  return "text-slate-500";
}

function timeLabel(value: string | null): string {
  if (!value) return "none";
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return value;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function FoundationalSupplyHealthWorkbench({ workspaceId, jurisdiction, snapshot }: Props) {
  const healthQueueItems = useMemo(
    () =>
      snapshot.remediationQueue.items.filter(
        (item) =>
          item.stage === "HEALTH" &&
          item.actions.some(
            (action) =>
              action.code === "REVIEW_SUPPLY_HEALTH" &&
              action.executionPath === "MANUAL_OPERATOR" &&
              action.collectionAuthorizationRequired === false &&
              action.automaticExecution === false,
          ),
      ),
    [snapshot],
  );
  const targetIds = useMemo(
    () => [...new Set(healthQueueItems.map((item) => item.targetId))],
    [healthQueueItems],
  );
  const [health, setHealth] = useState<Record<string, HealthResult>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load(): Promise<void> {
    setLoading(true);
    setError(null);
    try {
      setHealth(await fetchHealth({ workspaceId, jurisdiction, targetIds }));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load supply health");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    void fetchHealth({ workspaceId, jurisdiction, targetIds })
      .then((nextHealth) => {
        if (!active) return;
        setHealth(nextHealth);
        setError(null);
        setLoading(false);
      })
      .catch((loadError: unknown) => {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : "Unable to load supply health");
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [jurisdiction, targetIds, workspaceId]);

  if (healthQueueItems.length === 0) return null;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white">
      <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-semibold text-slate-950">Foundational supply health diagnostics</h2>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700">
              HEALTH fallback · read-only
            </span>
          </div>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">
            M31 复用现有 source-supply-health，只查看单个 FOUNDATIONAL target 的注册、采集、规范化、索引和 freshness 证据。HEALTH 是完整性兜底诊断层，不新增自动执行、审批或修复捷径。
          </p>
        </div>
        <button
          type="button"
          disabled={loading}
          onClick={() => void load()}
          className="inline-flex items-center gap-2 self-start rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RefreshCw size={15} aria-hidden="true" className={loading ? "animate-spin" : ""} />
          Refresh health
        </button>
      </div>

      <div className="space-y-4 p-5">
        {error ? (
          <div className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-rose-900">
            <AlertTriangle className="mt-0.5 shrink-0" size={17} aria-hidden="true" />
            <p className="text-sm leading-5">{error}</p>
          </div>
        ) : null}

        {healthQueueItems.map((queueItem) => {
          const result = health[queueItem.targetId];
          const record = result?.items[0];
          return (
            <article key={queueItem.targetId} className="rounded-xl border border-slate-200 p-4">
              <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                      HEALTH
                    </span>
                    <span className="rounded-full border border-slate-200 bg-white px-2 py-1 font-mono text-[11px] text-slate-600">
                      REVIEW_SUPPLY_HEALTH
                    </span>
                  </div>
                  <h3 className="mt-2 break-all font-semibold text-slate-950">
                    {queueItem.targetId}
                  </h3>
                  <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-600">
                    {queueItem.actions[0]?.operatorInstruction}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Readiness reason · {queueItem.reason || "unspecified"}
                  </p>
                </div>
                <span className="text-xs text-slate-500">automaticExecution=false</span>
              </div>

              {!result && loading ? (
                <div className="mt-4 flex items-center gap-2 rounded-lg bg-slate-50 p-3 text-sm text-slate-500">
                  <RefreshCw className="animate-spin" size={15} aria-hidden="true" /> Loading target health…
                </div>
              ) : result && result.items.length === 0 ? (
                <div className="mt-4 flex items-start gap-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-rose-900">
                  <AlertTriangle className="mt-0.5 shrink-0" size={16} aria-hidden="true" />
                  <div>
                    <p className="text-sm font-medium">No target-scoped supply-health record was returned.</p>
                    <p className="mt-1 text-xs leading-5 text-rose-700">
                      Treat this as HEALTH_RECORD_MISSING integrity evidence. M31 does not synthesize a record or bypass the readiness gate.
                    </p>
                  </div>
                </div>
              ) : record ? (
                <div className="mt-4 space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full border px-2 py-1 text-xs font-semibold ${stateClass(record.state)}`}
                    >
                      {record.state}
                    </span>
                    <span className="text-xs text-slate-500">
                      {record.family} · {record.coverageTier} · sensitivity {record.changeSensitivity}
                    </span>
                  </div>

                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <p className="text-sm font-medium text-slate-900">{record.displayName}</p>
                    <p className="mt-1 break-all text-xs text-slate-500">{record.canonicalUri}</p>
                    <p className="mt-2 text-xs text-slate-600">
                      Registration · {record.registrationState} · Sources ·{" "}
                      {record.sourceIds.length > 0 ? record.sourceIds.join(", ") : "none"}
                    </p>
                    <p className="mt-1 text-xs text-slate-600">
                      Gaps · {record.gaps.length > 0 ? record.gaps.join(", ") : "none"}
                    </p>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-lg border border-slate-200 p-3 text-xs leading-5 text-slate-600">
                      <p className="font-semibold text-slate-800">Acquisition</p>
                      <p>Artifacts · {record.acquisition.artifactCount}</p>
                      <p>
                        Kinds ·{" "}
                        {record.acquisition.artifactKinds.length > 0
                          ? record.acquisition.artifactKinds.join(", ")
                          : "none"}
                      </p>
                      <p>Latest · {timeLabel(record.acquisition.latestArtifactAt)}</p>
                    </div>
                    <div className="rounded-lg border border-slate-200 p-3 text-xs leading-5 text-slate-600">
                      <p className="font-semibold text-slate-800">Normalization</p>
                      <p>Staging · {record.normalization.stagingDocumentCount}</p>
                      <p>Ready · {record.normalization.readyDocumentCount}</p>
                      <p>Status · {record.normalization.latestStatus || "none"}</p>
                      <p>Latest · {timeLabel(record.normalization.latestDocumentAt)}</p>
                    </div>
                    <div className="rounded-lg border border-slate-200 p-3 text-xs leading-5 text-slate-600">
                      <p className="font-semibold text-slate-800">Retrieval</p>
                      <p>Indexed · {record.retrieval.indexedDocumentCount}</p>
                      <p>Current · {record.retrieval.currentDocumentCount}</p>
                      <p>Chunks · {record.retrieval.currentChunkCount}</p>
                      <p>
                        Artifact version · {record.retrieval.currentArtifactVersion ?? "none"}
                      </p>
                    </div>
                    <div className="rounded-lg border border-slate-200 p-3 text-xs leading-5 text-slate-600">
                      <p className="font-semibold text-slate-800">Freshness</p>
                      <p className={freshnessClass(record.freshness.state)}>{record.freshness.state}</p>
                      <p>Age · {record.freshness.ageHours ?? "none"}h</p>
                      <p>Max · {record.freshness.maxAgeHours}h</p>
                      <p>Observed · {timeLabel(record.freshness.lastObservedAt)}</p>
                    </div>
                  </div>

                  <div className="rounded-lg border border-slate-200 p-3 text-xs leading-5 text-slate-600">
                    <p className="font-semibold text-slate-800">Latest collection run</p>
                    {record.latestRun ? (
                      <>
                        <p className="break-all">Run · {record.latestRun.runId}</p>
                        <p>Status · {record.latestRun.status}</p>
                        <p>Requested · {timeLabel(record.latestRun.requestedAt)}</p>
                        <p>Updated · {timeLabel(record.latestRun.updatedAt)}</p>
                      </>
                    ) : (
                      <p>none</p>
                    )}
                  </div>

                  {record.state === "READY" && record.gaps.length === 0 ? (
                    <p className="flex items-center gap-1.5 text-xs text-emerald-700">
                      <ShieldCheck size={14} aria-hidden="true" /> Current supply-health evidence is clear; refresh the parent readiness snapshot before any manual conclusion.
                    </p>
                  ) : null}
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}
