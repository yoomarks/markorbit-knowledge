"use client";

import { useEffect, useState } from "react";
import { ExternalLink, PackageCheck, RefreshCw, ShieldCheck } from "lucide-react";
import type { CanonicalDownstreamDocumentV1, ReadyPackageV2 } from "@markorbit/contracts";
import { adminBrowserMutationHeaders } from "@/lib/admin-browser-api-client";

type Overview = {
  candidates: CanonicalDownstreamDocumentV1[];
  readyPackages: ReadyPackageV2[];
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
    `/api/workspaces/${encodeURIComponent(workspaceId)}/ready-packages-v2`,
  );
  const body = (await response.json()) as Overview | ApiError;
  if (!response.ok) throw new Error(readError(body, "Unable to load ReadyPackage V2 state"));
  return body as Overview;
}

export function ReadyPackageV2Control({ workspaceId }: { workspaceId: string }) {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState<string | null>(null);
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

  async function createReadyPackage(canonicalDocumentId: string) {
    setCreating(canonicalDocumentId);
    setError(null);
    try {
      const response = await fetch(
        `/api/workspaces/${encodeURIComponent(workspaceId)}/ready-packages-v2`,
        {
          method: "POST",
          headers: await adminBrowserMutationHeaders({ "content-type": "application/json" }),
          body: JSON.stringify({ canonicalDocumentId }),
        },
      );
      const body = (await response.json()) as
        { readyPackage?: ReadyPackageV2; replayed?: boolean } | ApiError;
      if (!response.ok) throw new Error(readError(body, "ReadyPackage V2 creation failed"));
      applyLoaded(await loadOverview(workspaceId));
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "ReadyPackage V2 creation failed",
      );
    } finally {
      setCreating(null);
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-slate-950">
            <PackageCheck size={19} aria-hidden="true" />
            <h2 className="font-semibold">ReadyPackage V2</h2>
          </div>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
            将 K12 READY canonical document 显式封装为 provenance-aware ReadyPackage V2。V2 直接冻结
            Vault import 的 inspection、review、execution、verification、finalization 与 content
            evidence，不构造假的 ConversionRun。
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={loading || creating !== null}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-3.5 py-2 text-sm font-medium text-slate-700 disabled:opacity-40"
        >
          <RefreshCw size={16} aria-hidden="true" />
          刷新
        </button>
      </div>

      <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
        K13 不修改 ReadyPackage V1 / Content Export V1，也不会把 V2 发送给 Core。当前 Core
        接收边界仍然只有冻结的 V1；V2 Content Export 仅作为 Knowledge 内部可验证输出。
      </div>

      {error ? (
        <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          {error}
        </div>
      ) : null}

      <div className="mt-6 space-y-3 border-t border-slate-100 pt-5">
        <h3 className="text-sm font-semibold text-slate-900">K12 READY package candidates</h3>
        {!overview?.candidates.length ? (
          <div className="rounded-xl border border-dashed border-slate-300 p-5 text-sm text-slate-500">
            {loading ? "加载中…" : "目前没有待封装的 K12 canonical document。"}
          </div>
        ) : null}
        {overview?.candidates.map((document) => (
          <div key={document.id} className="rounded-xl border border-slate-200 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="break-all text-sm font-medium text-slate-900">{document.id}</p>
                <p className="mt-1 break-all text-xs text-slate-600">
                  {document.origin.bindingRelativePath} · {shortHash(document.content.sha256)} ·{" "}
                  {document.origin.verificationOutcome}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void createReadyPackage(document.id)}
                disabled={loading || creating !== null}
                className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
              >
                {creating === document.id ? "封装中…" : "创建 ReadyPackage V2"}
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 space-y-3 border-t border-slate-100 pt-5">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <ShieldCheck size={17} aria-hidden="true" />
          VERIFIED ReadyPackage V2
        </div>
        {!overview?.readyPackages.length ? (
          <p className="text-sm text-slate-500">尚未生成 ReadyPackage V2。</p>
        ) : null}
        {overview?.readyPackages.map((readyPackage) => (
          <div
            key={readyPackage.id}
            className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="break-all text-sm font-medium text-slate-900">{readyPackage.id}</p>
                <p className="mt-1 break-all text-xs text-slate-600">
                  {readyPackage.evidence.origin.bindingRelativePath} ·{" "}
                  {shortHash(readyPackage.evidence.content.sha256)}
                </p>
                <p className="mt-1 font-mono text-[11px] text-slate-500">
                  canonical {readyPackage.evidence.canonicalDocumentId} · digest{" "}
                  {shortHash(readyPackage.evidence.digest)}
                </p>
              </div>
              <a
                href={`/api/workspaces/${encodeURIComponent(workspaceId)}/ready-packages-v2/${encodeURIComponent(readyPackage.id)}/content-export`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-xl border border-emerald-300 bg-white px-3.5 py-2 text-sm font-medium text-emerald-900"
              >
                Content Export V2
                <ExternalLink size={15} aria-hidden="true" />
              </a>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
