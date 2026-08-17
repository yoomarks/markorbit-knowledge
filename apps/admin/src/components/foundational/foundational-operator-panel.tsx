"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Eye, RefreshCw, ShieldCheck } from "lucide-react";
import type { FoundationalRemediationQueueSnapshot } from "@markorbit/worker-runtime/foundational-remediation-snapshot";
import {
  asFullOperatorJurisdiction,
  hasFoundationalAdvancedCapability,
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

type JurisdictionScope = "FULL_OPERATOR" | "CONTROLLED_REPROBE" | "READ_ONLY";

const JURISDICTIONS: ReadonlyArray<{
  code: FoundationalAdvancedJurisdiction;
  label: string;
  scope: JurisdictionScope;
}> = [
  { code: "US", label: "United States", scope: "FULL_OPERATOR" },
  { code: "WO", label: "WIPO", scope: "FULL_OPERATOR" },
  { code: "EU", label: "EUIPO", scope: "CONTROLLED_REPROBE" },
  { code: "CN", label: "China", scope: "READ_ONLY" },
  { code: "IN", label: "India", scope: "READ_ONLY" },
  { code: "JP", label: "Japan", scope: "READ_ONLY" },
  { code: "KR", label: "Korea", scope: "READ_ONLY" },
  { code: "GB", label: "United Kingdom", scope: "READ_ONLY" },
  { code: "CA", label: "Canada", scope: "READ_ONLY" },
  { code: "AU", label: "Australia", scope: "READ_ONLY" },
  { code: "BR", label: "Brazil", scope: "READ_ONLY" },
  { code: "AE", label: "UAE", scope: "READ_ONLY" },
  { code: "CI", label: "OAPI / Côte d’Ivoire", scope: "READ_ONLY" },
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
  const compatibilityReprobeEnabled = hasFoundationalAdvancedCapability(
    jurisdiction,
    "COMPATIBILITY_REPROBE",
  );
  const currentScope =
    JURISDICTIONS.find((candidate) => candidate.code === jurisdiction)?.scope ?? "READ_ONLY";

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
                {currentScope === "FULL_OPERATOR"
                  ? "Governed mutation surface"
                  : currentScope === "CONTROLLED_REPROBE"
                    ? "Diagnostics + controlled compatibility re-probe"
                    : "Read-only representative diagnostics"}
              </span>
              <span
                className={
                  fullOperatorJurisdiction ? "text-xs text-amber-900/70" : "text-xs text-sky-900/70"
                }
              >
                Workspace · {workspaceId}
              </span>
            </div>
            {currentScope === "FULL_OPERATOR" ? (
              <p className="mt-2 max-w-3xl text-sm leading-6 text-amber-950/80">
                US/WIPO 保持已验证的 governed operator：采集、恢复、重建索引、quality remediation 与
                compatibility re-probe 均经过独立授权路径；浏览器不会持有 Worker bearer。
              </p>
            ) : currentScope === "CONTROLLED_REPROBE" ? (
              <p className="mt-2 max-w-3xl text-sm leading-6 text-sky-950/80">
                EUIPO 已通过独立 re-probe promotion proof，因此开放诊断与 controlled
                re-probe；其余内容写路径仍 fail-closed。当前健康状态仍由真实 observation 决定，不因
                capability 晋级而改变。
              </p>
            ) : (
              <p className="mt-2 max-w-3xl text-sm leading-6 text-sky-950/80">
                该辖区已进入 representative live-canary 覆盖与 Foundational 诊断范围。当前只开放
                readiness、 supply health 与 relevance 等只读视图；所有 mutation capability 继续
                fail-closed，待专项 proof 后逐项晋级。
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div
              className={`inline-flex max-w-full flex-wrap rounded-xl border bg-white p-1 ${fullOperatorJurisdiction ? "border-amber-200" : "border-sky-200"}`}
            >
              {JURISDICTIONS.map(({ code, label, scope }) => (
                <button
                  key={code}
                  type="button"
                  onClick={() => chooseJurisdiction(code)}
                  title={
                    scope === "FULL_OPERATOR"
                      ? "Full governed operator"
                      : scope === "CONTROLLED_REPROBE"
                        ? "Diagnostics plus controlled compatibility re-probe"
                        : "Read-only representative diagnostics"
                  }
                  className={`rounded-lg px-3 py-2 text-sm font-medium transition ${jurisdiction === code ? (fullOperatorJurisdiction ? "bg-amber-100 text-amber-950 shadow-sm" : "bg-sky-100 text-sky-950 shadow-sm") : "text-slate-500 hover:text-slate-800"}`}
                >
                  {label}
                  {scope === "CONTROLLED_REPROBE"
                    ? " · re-probe"
                    : scope === "READ_ONLY"
                      ? " · read"
                      : ""}
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
          <div className="space-y-3">
            <FoundationalLimitedDiagnostics jurisdiction={jurisdiction} snapshot={snapshot} />
            {compatibilityReprobeEnabled ? (
              <FoundationalCompatibilityReprobeWorkbench
                workspaceId={workspaceId}
                jurisdiction={jurisdiction}
                snapshot={snapshot}
                onSnapshotRefresh={refresh}
              />
            ) : null}
          </div>
        )
      ) : null}
    </div>
  );
}
