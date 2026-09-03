"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, RefreshCw, ShieldCheck, XCircle } from "lucide-react";
import type {
  VaultOriginStagingDocumentV1,
  VaultOriginStagingFinalizationV1,
  VaultOriginStagingVerificationEvidenceV1,
} from "@markorbit/contracts";
import { adminBrowserMutationHeaders } from "@/lib/admin-browser-api-client";

type Overview = {
  documents: VaultOriginStagingDocumentV1[];
  verifications: VaultOriginStagingVerificationEvidenceV1[];
  finalizations: VaultOriginStagingFinalizationV1[];
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

async function loadOverview(workspaceId: string): Promise<Overview> {
  const response = await fetch(
    `/api/workspaces/${encodeURIComponent(workspaceId)}/vault-origin-staging-verifications`,
  );
  const body = (await response.json()) as Overview | ApiError;
  if (!response.ok) throw new Error(readError(body, "Unable to load Vault-origin verification"));
  return body as Overview;
}

function shortHash(value: string): string {
  return `${value.slice(0, 10)}…${value.slice(-8)}`;
}

export function VaultOriginStagingVerificationControl({ workspaceId }: { workspaceId: string }) {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
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
      setError(requestError instanceof Error ? requestError.message : "Unable to refresh");
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
        setError(requestError instanceof Error ? requestError.message : "Unable to load");
        setLoading(false);
      },
    );
    return () => {
      active = false;
    };
  }, [workspaceId]);

  const verificationByDocument = useMemo(
    () =>
      new Map(
        (overview?.verifications ?? []).map((verification) => [
          verification.vaultStagingDocumentId,
          verification,
        ]),
      ),
    [overview],
  );
  const finalizationByDocument = useMemo(
    () =>
      new Map(
        (overview?.finalizations ?? []).map((finalization) => [
          finalization.vaultStagingDocumentId,
          finalization,
        ]),
      ),
    [overview],
  );

  async function perform(documentId: string, action: "verify" | "finalize") {
    setWorking(`${action}:${documentId}`);
    setError(null);
    try {
      const endpoint =
        action === "verify"
          ? "vault-origin-staging-verifications"
          : "vault-origin-staging-finalizations";
      const response = await fetch(
        `/api/workspaces/${encodeURIComponent(workspaceId)}/${endpoint}`,
        {
          method: "POST",
          headers: await adminBrowserMutationHeaders({ "content-type": "application/json" }),
          body: JSON.stringify({
            vaultStagingDocumentId: documentId,
            idempotencyKey: `k11-${action}:${documentId}`,
          }),
        },
      );
      const body = (await response.json()) as unknown;
      if (!response.ok)
        throw new Error(readError(body, `Unable to ${action} Vault-origin Staging`));
      applyLoaded(await loadOverview(workspaceId));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : `Unable to ${action}`);
    } finally {
      setWorking(null);
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-slate-950">
            <ShieldCheck size={19} aria-hidden="true" />
            <h2 className="font-semibold">Vault-origin Staging Verification</h2>
          </div>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
            只验证 K10 已经写入 Staging CAS 的 immutable copy，不重新读取 Vault。验证会检查
            CAS、UTF-8、 frontmatter 安全边界，并阻止 Vault 内容伪造 markorbit.* 内部 provenance。
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={loading || working !== null}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-3.5 py-2 text-sm font-medium text-slate-700 disabled:opacity-40"
        >
          <RefreshCw size={16} aria-hidden="true" />
          刷新
        </button>
      </div>

      <div className="mt-5 rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm leading-6 text-sky-900">
        K11 不修改 K10 原始导入记录。最终只追加 VERIFIED / BLOCKED finalization evidence；即使
        VERIFIED， 也不会自动进入现有 Conversion Staging、ReadyPackage 或 Core。
      </div>

      {error ? (
        <div className="mt-4 flex gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          <AlertTriangle className="mt-0.5 shrink-0" size={18} aria-hidden="true" />
          <span>{error}</span>
        </div>
      ) : null}

      <div className="mt-6 space-y-3 border-t border-slate-100 pt-5">
        {!overview?.documents.length ? (
          <div className="rounded-xl border border-dashed border-slate-300 p-5 text-sm text-slate-500">
            {loading ? "加载中…" : "目前没有 K10 Vault-origin Staging 文档。"}
          </div>
        ) : null}
        {overview?.documents.map((document) => {
          const verification = verificationByDocument.get(document.id);
          const finalization = finalizationByDocument.get(document.id);
          return (
            <div key={document.id} className="rounded-xl border border-slate-200 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="break-all text-sm font-medium text-slate-900">
                    {document.bindingRelativePath}
                  </p>
                  <p className="mt-1 font-mono text-xs text-slate-500">
                    {document.id} · {shortHash(document.contentHash.value)} · {document.sizeBytes}{" "}
                    bytes
                  </p>
                </div>
                {finalization ? (
                  <span
                    className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium ${
                      finalization.state === "VERIFIED"
                        ? "bg-emerald-50 text-emerald-800"
                        : "bg-rose-50 text-rose-800"
                    }`}
                  >
                    {finalization.state === "VERIFIED" ? (
                      <CheckCircle2 size={14} aria-hidden="true" />
                    ) : (
                      <XCircle size={14} aria-hidden="true" />
                    )}
                    {finalization.state}
                  </span>
                ) : verification ? (
                  <button
                    type="button"
                    onClick={() => void perform(document.id, "finalize")}
                    disabled={working !== null}
                    className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
                  >
                    {working === `finalize:${document.id}` ? "固化中…" : "固化验证结论"}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void perform(document.id, "verify")}
                    disabled={working !== null}
                    className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
                  >
                    {working === `verify:${document.id}` ? "验证中…" : "验证 Staging copy"}
                  </button>
                )}
              </div>
              {verification ? (
                <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                  <span className="font-medium">{verification.outcome}</span> ·{" "}
                  {verification.checks.length} checks
                  {verification.warnings.length
                    ? ` · ${verification.warnings.length} warning(s)`
                    : ""}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
