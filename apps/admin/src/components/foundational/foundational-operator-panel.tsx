"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Eye, RefreshCw, ShieldCheck } from "lucide-react";
import type { FoundationalRemediationQueueSnapshot } from "@markorbit/worker-runtime/foundational-remediation-snapshot";
import {
  asFullOperatorJurisdiction,
  type FoundationalAdvancedJurisdiction,
} from "./foundational-advanced-capabilities";
import { FoundationalCompatibilityReprobeWorkbench } from "./foundational-compatibility-reprobe-workbench";
import { FoundationalConversionRecoveryWorkbench } from "./foundational-conversion-recovery-workbench";
import { FoundationalLimitedDiagnostics } from "./foundational-limited-diagnostics";
import { FoundationalOperatorWorkbench } from "./foundational-operator-workbench";
import { FoundationalRelevanceAuditWorkbench } from "./foundational-relevance-audit-workbench";
import { FoundationalRetrievalQualityRemediationWorkbench } from "./foundational-retrieval-quality-remediation-workbench";
import { FoundationalSupplyHealthWorkbench } from "./foundational-supply-health-workbench";
import { FoundationalVerifiedCanonicalReindexWorkbench } from "./foundational-verified-canonical-reindex-workbench";

type ErrorEnvelope = {
  error?: {
    message?: string;
  };
};

const JURISDICTIONS: ReadonlyArray<{
  code: FoundationalAdvancedJurisdiction;
  label: string;
  scope: "FULL_OPERATOR" | "READ_ONLY";
}> = [
  { code: "US", label: "United States", scope: "FULL_OPERATOR" },
  { code: "WO", label: "WIPO", scope: "FULL_OPERATOR" },
  { code: "EU", label: "EUIPO", scope: "READ_ONLY" },
];

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
  jurisdiction: FoundationalAdvancedJurisdiction,
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
  const [jurisdiction, setJurisdiction] = useState<FoundationalAdvancedJurisdiction>("US");
  const [snapshot, setSnapshot] = useState<FoundationalRemediationQueueSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fullOperatorJurisdiction = asFullOperatorJurisdiction(jurisdiction);

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

  function chooseJurisdiction(code: FoundationalAdvancedJurisdiction) {
    if (code === jurisdiction) return;
    setSnapshot(null);
    setError(null);
    setLoading(true);
    setJurisdiction(code);
  }

  return (
    <div className="mb-6 space-y-3">
      <section
        className={`rounded-2xl border p-4 sm:p-5 ${fullOperatorJurisdiction ? "border-amber-200 bg-amber-50/60" : "border-sky-200 bg-sky-50/60"}`}
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full border bg-white px-2.5 py-1 text-xs font-semibold ${fullOperatorJurisdiction ? "border-amber-300 text-amber-900" : "border-sky-300 text-sky-900"}`}
              >
                {fullOperatorJurisdiction ? (
                  <ShieldCheck size={13} aria-hidden="true" />
                ) : (
                  <Eye size={13} aria-hidden="true" />
                )}
                {fullOperatorJurisdiction ? "Governed mutation surface" : "Read-only diagnostic scope"}
              </span>
              <span className={fullOperatorJurisdiction ? "text-xs text-amber-900/70" : "text-xs text-sky-900/70"}>
                Workspace · {workspaceId}
              </span>
            </div>
            {fullOperatorJurisdiction ? (
              <p className="mt-2 max-w-3xl text-sm leading-6 text-amber-950/80">
                COLLECT 使用 M25/M26 审批 + 显式派发；CONVERT 使用 M27 的既有 M11 operator
                retry；INDEX 使用 M28 verified canonical reindex；QUALITY 使用 M29 的 M16 plan + M17
                explicit operator execution；RELEVANCE 使用 M30 只读 M18 deterministic audit；HEALTH
                仍以 M31 target-scoped supply-health diagnostics 为只读诊断，同时 stale compatibility
                observation 可创建独立 re-probe approval intent 并交给受认证 Worker
                执行。浏览器不会持有 Worker bearer，也不会自动运行 canary、生成 probe 或调 ranking。
              </p>
            ) : (
              <p className="mt-2 max-w-3xl text-sm leading-6 text-sky-950/80">
                EUIPO 已进入 Foundational health，但 Advanced mutation path 尚未完成 EU 专项 live-run。
                因此当前只开放 readiness、supply health 与 deterministic relevance 诊断；所有采集、恢复、重建索引、quality remediation 与 compatibility re-probe 执行入口继续 fail-closed。
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div
              className={`inline-flex rounded-xl border bg-white p-1 ${fullOperatorJurisdiction ? "border-amber-200" : "border-sky-200"}`}
            >
              {JURISDICTIONS.map(({ code, label, scope }) => (
                <button
                  key={code}
                  type="button"
                  onClick={() => chooseJurisdiction(code)}
                  title={scope === "FULL_OPERATOR" ? "Full governed operator" : "Read-only diagnostics"}
                  className={`rounded-lg px-3 py-2 text-sm font-medium transition ${jurisdiction === code ? (fullOperatorJurisdiction ? "bg-amber-100 text-amber-950 shadow-sm" : "bg-sky-100 text-sky-950 shadow-sm") : "text-slate-500 hover:text-slate-800"}`}
                >
                  {label}
                  {scope === "READ_ONLY" ? " · read-only" : ""}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={loading}
              className={`inline-flex items-center gap-2 rounded-xl border bg-white px-3 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60 ${fullOperatorJurisdiction ? "border-amber-300 text-amber-950" : "border-sky-300 text-sky-950"}`}
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
        fullOperatorJurisdiction ? (
          <div className="space-y-3">
            <FoundationalOperatorWorkbench
              workspaceId={workspaceId}
              jurisdiction={fullOperatorJurisdiction}
              snapshot={snapshot}
              onSnapshotRefresh={refresh}
            />
            <FoundationalConversionRecoveryWorkbench
              workspaceId={workspaceId}
              jurisdiction={fullOperatorJurisdiction}
              snapshot={snapshot}
              onSnapshotRefresh={refresh}
            />
            <FoundationalVerifiedCanonicalReindexWorkbench
              workspaceId={workspaceId}
              jurisdiction={fullOperatorJurisdiction}
              snapshot={snapshot}
              onSnapshotRefresh={refresh}
            />
            <FoundationalRetrievalQualityRemediationWorkbench
              workspaceId={workspaceId}
              jurisdiction={fullOperatorJurisdiction}
              snapshot={snapshot}
              onSnapshotRefresh={refresh}
            />
            <FoundationalRelevanceAuditWorkbench
              workspaceId={workspaceId}
              jurisdiction={fullOperatorJurisdiction}
              snapshot={snapshot}
            />
            <FoundationalCompatibilityReprobeWorkbench
              workspaceId={workspaceId}
              jurisdiction={fullOperatorJurisdiction}
              snapshot={snapshot}
              onSnapshotRefresh={refresh}
            />
            <FoundationalSupplyHealthWorkbench
              workspaceId={workspaceId}
              jurisdiction={fullOperatorJurisdiction}
              snapshot={snapshot}
            />
          </div>
        ) : (
          <FoundationalLimitedDiagnostics jurisdiction={jurisdiction} snapshot={snapshot} />
        )
      ) : null}
    </div>
  );
}
