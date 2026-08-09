"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import type { FoundationalRemediationQueueSnapshot } from "@markorbit/worker-runtime/foundational-remediation-snapshot";
import { FoundationalOperatorWorkbench } from "./foundational-operator-workbench";

type Jurisdiction = "US" | "WO";

type ErrorEnvelope = {
  error?: {
    message?: string;
  };
};

function isSnapshot(value: unknown): value is FoundationalRemediationQueueSnapshot {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<FoundationalRemediationQueueSnapshot>;
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

async function requestSnapshot(
  workspaceId: string,
  jurisdiction: Jurisdiction,
): Promise<FoundationalRemediationQueueSnapshot> {
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
  return payload;
}

export function FoundationalOperatorPanel({ workspaceId }: { workspaceId: string }) {
  const [jurisdiction, setJurisdiction] = useState<Jurisdiction>("US");
  const [snapshot, setSnapshot] = useState<FoundationalRemediationQueueSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function refresh(): Promise<void> {
    setLoading(true);
    setError(null);
    try {
      setSnapshot(await requestSnapshot(workspaceId, jurisdiction));
    } catch (loadError) {
      setSnapshot(null);
      setError(loadError instanceof Error ? loadError.message : "Unable to load operator snapshot");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    void requestSnapshot(workspaceId, jurisdiction)
      .then((nextSnapshot) => {
        if (!active) return;
        setSnapshot(nextSnapshot);
        setLoading(false);
      })
      .catch((loadError: unknown) => {
        if (!active) return;
        setSnapshot(null);
        setError(
          loadError instanceof Error ? loadError.message : "Unable to load operator snapshot",
        );
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [jurisdiction, workspaceId]);

  function chooseJurisdiction(code: Jurisdiction) {
    if (code === jurisdiction) return;
    setSnapshot(null);
    setError(null);
    setLoading(true);
    setJurisdiction(code);
  }

  return (
    <div className="mb-6 space-y-3">
      <section className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4 sm:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-amber-300 bg-white px-2.5 py-1 text-xs font-semibold text-amber-900">
                Governed mutation surface
              </span>
              <span className="text-xs text-amber-900/70">Workspace · {workspaceId}</span>
            </div>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-amber-950/80">
              M25 将 M23/M24 的受控 COLLECT 流程接入 UI；M26 再把 exact CollectionRun
              结果回流到操作面。审批不会自动执行，运行中禁止并发重复派发，失败/取消后的重试必须重新审批。
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-xl border border-amber-200 bg-white p-1">
              {(
                [
                  ["US", "United States"],
                  ["WO", "WIPO"],
                ] as const
              ).map(([code, label]) => (
                <button
                  key={code}
                  type="button"
                  onClick={() => chooseJurisdiction(code)}
                  className={`rounded-lg px-3 py-2 text-sm font-medium transition ${jurisdiction === code ? "bg-amber-100 text-amber-950 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-xl border border-amber-300 bg-white px-3 py-2 text-sm font-medium text-amber-950 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw size={15} aria-hidden="true" className={loading ? "animate-spin" : ""} />
              Refresh
            </button>
          </div>
        </div>
      </section>

      {error ? (
        <section className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-rose-900">
          <AlertTriangle className="mt-0.5 shrink-0" size={18} aria-hidden="true" />
          <p className="text-sm">{error}</p>
        </section>
      ) : null}

      {loading && !snapshot ? (
        <section className="flex min-h-28 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white text-sm text-slate-500">
          <RefreshCw className="animate-spin" size={16} aria-hidden="true" /> Loading governed
          operator snapshot…
        </section>
      ) : null}

      {snapshot ? (
        <FoundationalOperatorWorkbench
          workspaceId={workspaceId}
          jurisdiction={jurisdiction}
          snapshot={snapshot}
          onSnapshotRefresh={refresh}
        />
      ) : null}
    </div>
  );
}
