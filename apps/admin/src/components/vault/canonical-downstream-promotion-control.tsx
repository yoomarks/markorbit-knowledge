"use client";

import { useEffect, useState } from "react";
import { ArrowRightCircle, CheckCircle2, RefreshCw, ShieldCheck } from "lucide-react";
import type {
  CanonicalDownstreamDocumentV1,
  VaultOriginStagingDocumentV1,
  VaultOriginStagingFinalizationV1,
  VaultOriginStagingVerificationEvidenceV1,
} from "@markorbit/contracts";
import { adminBrowserMutationHeaders } from "@/lib/admin-browser-api-client";

type Candidate = {
  staging: VaultOriginStagingDocumentV1;
  verification: VaultOriginStagingVerificationEvidenceV1;
  finalization: VaultOriginStagingFinalizationV1;
};

type Overview = {
  candidates: Candidate[];
  documents: CanonicalDownstreamDocumentV1[];
};

type ApiError = { error?: { message?: string } };

function readError(body: unknown, fallback: string): string {
  if (
    body &&
    typeof body === "object" &&
    "error" in body &&
    body.error &&
    typeof body.error === "object" &&
    "message" in body.error &&
    typeof body.error.message === "string"
  ) {
    return body.error.message;
  }
  return fallback;
}

function shortHash(value: string): string {
  return `${value.slice(0, 10)}…${value.slice(-8)}`;
}

async function loadOverview(workspaceId: string): Promise<Overview> {
  const response = await fetch(
    `/api/workspaces/${encodeURIComponent(workspaceId)}/canonical-downstream-documents`,
  );
  const body = (await response.json()) as Overview | ApiError;
  if (!response.ok) throw new Error(readError(body, "Unable to load canonical downstream state"));
  return body as Overview;
}

export function CanonicalDownstreamPromotionControl({ workspaceId }: { workspaceId: string }) {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [promoting, setPromoting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function applyLoaded(value: Overview) {
    setOverview(value);
    setError(null);
    setLoading(false);
  }

  async function refresh() {
    setLoading(true);
    try {
      applyLoaded(await loadOverview(workspaceId));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to refresh state");
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    void loadOverview(workspaceId).then(
      (value) => {
        if (active) applyLoaded(value);
      },
      (requestError: unknown) => {
        if (!active) return;
        setError(requestError instanceof Error ? requestError.message : "Unable to load state");
        setLoading(false);
      },
    );
    return () => {
      active = false;
    };
  }, [workspaceId]);

  async function promote(vaultStagingDocumentId: string) {
    setPromoting(vaultStagingDocumentId);
    setError(null);
    try {
      const response = await fetch(
        `/api/workspaces/${encodeURIComponent(workspaceId)}/canonical-downstream-documents`,
        {
          method: "POST",
          headers: await adminBrowserMutationHeaders({ "content-type": "application/json" }),
          body: JSON.stringify({ vaultStagingDocumentId }),
        },
      );
      const body = (await response.json()) as
        { document?: CanonicalDownstreamDocumentV1; replayed?: boolean } | ApiError;
      if (!response.ok) throw new Error(readError(body, "Canonical promotion failed"));
      applyLoaded(await loadOverview(workspaceId));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Canonical promotion failed");
    } finally {
      setPromoting(null);
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-slate-950">
            <ArrowRightCircle size={19} aria-hidden="true" />
            <h2 className="font-semibold">Canonical Downstream Promotion</h2>
          </div>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
            仅允许 K11 已 VERIFIED 的 Vault-origin Staging 进入 canonical downstream。推广对象保留
            inspection、review、execution、verification 与 finalization 的真实 provenance，不伪造
            ConversionRun / Worker / RawArtifact。
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={loading || promoting !== null}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-3.5 py-2 text-sm font-medium text-slate-700 disabled:opacity-40"
        >
          <RefreshCw size={16} aria-hidden="true" />
          刷新
        </button>
      </div>

      <div className="mt-5 rounded-xl border border-indigo-200 bg-indigo-50 p-4 text-sm leading-6 text-indigo-900">
        K12 不会创建旧的 ReadyPackage V1，也不会调用 Core。旧 V1 仍保持 conversion-only；此层只建立
        provenance-safe 的 canonical downstream substrate。
      </div>

      {error ? (
        <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          {error}
        </div>
      ) : null}

      <div className="mt-6 space-y-3 border-t border-slate-100 pt-5">
        <h3 className="text-sm font-semibold text-slate-900">VERIFIED promotion candidates</h3>
        {!overview?.candidates.length ? (
          <div className="rounded-xl border border-dashed border-slate-300 p-5 text-sm text-slate-500">
            {loading ? "加载中…" : "目前没有待推广的 VERIFIED Vault-origin 文档。"}
          </div>
        ) : null}
        {overview?.candidates.map((candidate) => (
          <div key={candidate.staging.id} className="rounded-xl border border-slate-200 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="break-all text-sm font-medium text-slate-900">
                  {candidate.staging.bindingRelativePath}
                </p>
                <p className="mt-1 font-mono text-xs text-slate-500">
                  {shortHash(candidate.staging.contentHash.value)} · {candidate.staging.sizeBytes}{" "}
                  bytes · {candidate.verification.outcome}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void promote(candidate.staging.id)}
                disabled={loading || promoting !== null}
                className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
              >
                {promoting === candidate.staging.id ? "推广中…" : "推广到 Canonical"}
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 space-y-3 border-t border-slate-100 pt-5">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <ShieldCheck size={17} aria-hidden="true" />
          Canonical downstream documents
        </div>
        {!overview?.documents.length ? (
          <p className="text-sm text-slate-500">尚未生成 canonical downstream document。</p>
        ) : null}
        {overview?.documents.map((document) => (
          <div
            key={document.id}
            className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4"
          >
            <div className="flex items-start gap-3">
              <CheckCircle2
                className="mt-0.5 shrink-0 text-emerald-700"
                size={18}
                aria-hidden="true"
              />
              <div className="min-w-0">
                <p className="break-all text-sm font-medium text-slate-900">{document.id}</p>
                <p className="mt-1 break-all text-xs text-slate-600">
                  {document.origin.bindingRelativePath} · {shortHash(document.content.sha256)} ·{" "}
                  {document.origin.verificationOutcome}
                </p>
                <p className="mt-1 font-mono text-[11px] text-slate-500">
                  {document.origin.importIntentId} → {document.origin.importExecutionId} →{" "}
                  {document.origin.verificationId} → {document.origin.finalizationId}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
