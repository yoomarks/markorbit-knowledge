"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, RefreshCw, RotateCcw, ShieldCheck } from "lucide-react";
import type { FoundationalRemediationQueueSnapshot } from "@markorbit/worker-runtime/foundational-remediation-snapshot";
import { adminBrowserMutationHeaders } from "@/lib/admin-browser-api-client";
import { listControlledVerifiedCanonicalReindexActions } from "./foundational-operator-state";

type Jurisdiction = "US" | "WO";

type Props = {
  workspaceId: string;
  jurisdiction: Jurisdiction;
  snapshot: FoundationalRemediationQueueSnapshot;
  onSnapshotRefresh: () => Promise<void>;
};

type IndexState = "MISSING_INDEX" | "INDEXED" | "MISSING_READY_PACKAGE" | "EVIDENCE_MISMATCH";

type Candidate = {
  stagingDocumentId: string;
  sourceId: string;
  rawArtifactId: string;
  conversionRunId: string;
  title: string;
  targetPath: string;
  contentSha256: string;
  generatedAt: string;
  readyPackageId: string | null;
  readyPackageStatus: "VERIFIED" | "HANDED_OFF" | null;
  state: IndexState;
  indexedDocumentId: string | null;
  indexedArtifactVersion: number | null;
  indexedAt: string | null;
  isCurrent: boolean;
};

type ReindexSnapshot = {
  objectType: "FOUNDATIONAL_VERIFIED_CANONICAL_REINDEX_SNAPSHOT";
  targetId: string;
  sourceIds: string[];
  items: Candidate[];
  summary: Record<IndexState, number> & { total: number };
  executionPolicy: "EXPLICIT_VERIFIED_CANONICAL_REINDEX_ONLY";
  automaticExecution: false;
  createsReadyPackage: false;
  mutatesRawArtifact: false;
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

function reindexUrl(workspaceId: string, jurisdiction: Jurisdiction, targetId: string): string {
  const query = new URLSearchParams({ workspaceId, jurisdiction, targetId });
  return `/api/foundational/verified-canonical-reindex?${query.toString()}`;
}

async function fetchSnapshots(input: {
  workspaceId: string;
  jurisdiction: Jurisdiction;
  targetIds: readonly string[];
}): Promise<Record<string, ReindexSnapshot>> {
  const entries = await Promise.all(
    input.targetIds.map(async (targetId) => {
      const value = await requestJson<ReindexSnapshot>(
        reindexUrl(input.workspaceId, input.jurisdiction, targetId),
      );
      return [targetId, value] as const;
    }),
  );
  return Object.fromEntries(entries);
}

function stateClass(state: IndexState): string {
  if (state === "INDEXED") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (state === "MISSING_INDEX") return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-rose-200 bg-rose-50 text-rose-800";
}

export function FoundationalVerifiedCanonicalReindexWorkbench({
  workspaceId,
  jurisdiction,
  snapshot,
  onSnapshotRefresh,
}: Props) {
  const actions = useMemo(
    () => listControlledVerifiedCanonicalReindexActions(snapshot),
    [snapshot],
  );
  const [snapshots, setSnapshots] = useState<Record<string, ReindexSnapshot>>({});
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
        loadError instanceof Error ? loadError.message : "Unable to load verified canonical state",
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
          loadError instanceof Error
            ? loadError.message
            : "Unable to load verified canonical state",
        );
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [actions, jurisdiction, workspaceId]);

  async function reindex(targetId: string, stagingDocumentId: string): Promise<void> {
    setBusy(stagingDocumentId);
    setError(null);
    try {
      await requestJson(reindexUrl(workspaceId, jurisdiction, targetId), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ stagingDocumentId, execute: true }),
      });
      await onSnapshotRefresh();
      const updated = await requestJson<ReindexSnapshot>(
        reindexUrl(workspaceId, jurisdiction, targetId),
      );
      setSnapshots((current) => ({ ...current, [targetId]: updated }));
    } catch (reindexError) {
      setError(
        reindexError instanceof Error ? reindexError.message : "Verified canonical reindex failed",
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
            <h2 className="font-semibold text-slate-950">Verified canonical reindex</h2>
            <span className="rounded-full border border-cyan-200 bg-cyan-50 px-2.5 py-1 text-xs font-semibold text-cyan-800">
              Existing retrieval index only
            </span>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700">
              Explicit execute only
            </span>
          </div>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">
            M28 只修复已有 READY canonical + ReadyPackage 的 INDEX 缺口。正常 conversion
            完成时本来就会自动索引；这里不会创建 ReadyPackage、不会重新验证或生成
            canonical，也不会修改 RawArtifact。
          </p>
        </div>
        <button
          type="button"
          disabled={loading || busy !== null}
          onClick={() => void load()}
          className="inline-flex items-center gap-2 self-start rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RefreshCw size={15} aria-hidden="true" className={loading ? "animate-spin" : ""} />
          Refresh index state
        </button>
      </div>

      <div className="space-y-4 p-5">
        {error ? (
          <div className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-rose-900">
            <AlertTriangle className="mt-0.5 shrink-0" size={17} aria-hidden="true" />
            <p className="text-sm leading-5">{error}</p>
          </div>
        ) : null}

        {actions.map((action) => {
          const targetSnapshot = snapshots[action.targetId];
          return (
            <article key={action.targetId} className="rounded-xl border border-slate-200 p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-cyan-50 px-2.5 py-1 text-xs font-semibold text-cyan-800">
                      INDEX
                    </span>
                    <span className="text-xs text-slate-500">REINDEX_VERIFIED_CANONICAL</span>
                  </div>
                  <h3 className="mt-2 break-all font-semibold text-slate-950">{action.targetId}</h3>
                  <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
                    {action.operatorInstruction}
                  </p>
                </div>
                {targetSnapshot ? (
                  <span className="text-xs text-slate-500">
                    {targetSnapshot.summary.total} READY canonical candidate
                    {targetSnapshot.summary.total === 1 ? "" : "s"}
                  </span>
                ) : null}
              </div>

              {!targetSnapshot && loading ? (
                <div className="mt-4 flex items-center gap-2 rounded-lg bg-slate-50 p-3 text-sm text-slate-500">
                  <RefreshCw className="animate-spin" size={15} aria-hidden="true" /> Loading
                  verified canonical evidence…
                </div>
              ) : targetSnapshot && targetSnapshot.items.length === 0 ? (
                <div className="mt-4 flex items-start gap-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-rose-900">
                  <AlertTriangle className="mt-0.5 shrink-0" size={16} aria-hidden="true" />
                  <div>
                    <p className="text-sm font-medium">
                      No READY canonical candidate exists for this target.
                    </p>
                    <p className="mt-1 text-xs leading-5 text-rose-700">
                      M28 will not synthesize canonical bytes or a ReadyPackage. Inspect the
                      normalization evidence instead.
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
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={`rounded-full border px-2 py-1 text-xs font-semibold ${stateClass(item.state)}`}
                            >
                              {item.state}
                            </span>
                            {item.readyPackageStatus ? (
                              <span className="text-xs text-slate-500">
                                ReadyPackage · {item.readyPackageStatus}
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-2 text-sm font-medium text-slate-900">{item.title}</p>
                          <p className="mt-1 break-all font-mono text-xs text-slate-600">
                            {item.stagingDocumentId}
                          </p>
                          <p className="mt-1 break-all text-xs text-slate-500">{item.targetPath}</p>
                          {item.state === "EVIDENCE_MISMATCH" ? (
                            <p className="mt-2 text-xs font-medium text-rose-700">
                              Existing ReadyPackage/index evidence conflicts with this staging
                              document. Reindex is blocked.
                            </p>
                          ) : null}
                          {item.state === "MISSING_READY_PACKAGE" ? (
                            <p className="mt-2 text-xs font-medium text-rose-700">
                              READY staging exists without matching ReadyPackage evidence. M28 will
                              not create one.
                            </p>
                          ) : null}
                          {item.state === "INDEXED" ? (
                            <p className="mt-2 flex items-center gap-1.5 text-xs text-emerald-700">
                              <ShieldCheck size={14} aria-hidden="true" /> Indexed document{" "}
                              {item.indexedDocumentId} · version {item.indexedArtifactVersion}
                            </p>
                          ) : null}
                        </div>
                        {item.state === "MISSING_INDEX" ? (
                          <button
                            type="button"
                            disabled={busy !== null}
                            onClick={() => void reindex(action.targetId, item.stagingDocumentId)}
                            className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-cyan-700 px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <RotateCcw size={14} aria-hidden="true" />
                            {busy === item.stagingDocumentId
                              ? "Indexing…"
                              : "Reindex verified canonical"}
                          </button>
                        ) : null}
                      </div>
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
