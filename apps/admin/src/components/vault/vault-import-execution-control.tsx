"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Play, RefreshCw, XCircle } from "lucide-react";
import type { VaultImportExecutionV1, VaultImportIntentV1 } from "@markorbit/contracts";
import { adminBrowserMutationHeaders } from "@/lib/admin-browser-api-client";

type Overview = {
  rootConfigured: boolean;
  pendingIntents: VaultImportIntentV1[];
  executions: VaultImportExecutionV1[];
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
    `/api/workspaces/${encodeURIComponent(workspaceId)}/vault-import-executions`,
  );
  const body = (await response.json()) as Overview | ApiError;
  if (!response.ok) throw new Error(readError(body, "Unable to load Vault import executions"));
  return body as Overview;
}

function shortHash(value: string): string {
  return `${value.slice(0, 10)}…${value.slice(-8)}`;
}

export function VaultImportExecutionControl({ workspaceId }: { workspaceId: string }) {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [executing, setExecuting] = useState<string | null>(null);
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
      setError(
        requestError instanceof Error ? requestError.message : "Unable to refresh executions",
      );
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
        setError(
          requestError instanceof Error ? requestError.message : "Unable to load executions",
        );
        setLoading(false);
      },
    );
    return () => {
      active = false;
    };
  }, [workspaceId]);

  const executionsByIntent = useMemo(() => {
    const result = new Map<string, VaultImportExecutionV1>();
    for (const execution of overview?.executions ?? [])
      result.set(execution.importIntentId, execution);
    return result;
  }, [overview]);

  async function execute(importIntentId: string) {
    setExecuting(importIntentId);
    setError(null);
    try {
      const response = await fetch(
        `/api/workspaces/${encodeURIComponent(workspaceId)}/vault-import-executions`,
        {
          method: "POST",
          headers: await adminBrowserMutationHeaders({ "content-type": "application/json" }),
          body: JSON.stringify({ importIntentId }),
        },
      );
      const body = (await response.json()) as { execution?: VaultImportExecutionV1 } | ApiError;
      if (!response.ok) throw new Error(readError(body, "Vault import execution failed"));
      applyLoaded(await loadOverview(workspaceId));
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "Vault import execution failed",
      );
    } finally {
      setExecuting(null);
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-slate-950">
            <Play size={19} aria-hidden="true" />
            <h2 className="font-semibold">Vault Import Execution</h2>
          </div>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
            仅执行已经人工批准的 K09 intent。执行前重新读取原 Vault 路径并核对 byte size +
            SHA-256；通过后写入独立 Vault-origin Staging，不伪造 Worker 或 Conversion provenance。
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={loading || executing !== null}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-3.5 py-2 text-sm font-medium text-slate-700 disabled:opacity-40"
        >
          <RefreshCw size={16} aria-hidden="true" />
          刷新
        </button>
      </div>

      <div className="mt-5 rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm leading-6 text-sky-900">
        K10 仍是显式人工执行，不会自动扫描或同步。Vault 内容若在审批后改变/消失，本次执行会终止为
        REJECTED，需要重新 K08 inspection + K09 review。
      </div>

      {error ? (
        <div className="mt-4 flex gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          <AlertTriangle className="mt-0.5 shrink-0" size={18} aria-hidden="true" />
          <span>{error}</span>
        </div>
      ) : null}

      {!overview?.rootConfigured ? (
        <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          当前服务器未配置 Vault root。已完成/已拒绝执行仍可本地重放，但新的文件读取不能开始。
        </p>
      ) : null}

      <div className="mt-6 space-y-3 border-t border-slate-100 pt-5">
        <h3 className="text-sm font-semibold text-slate-900">Reviewed intents</h3>
        {!overview?.pendingIntents.length ? (
          <div className="rounded-xl border border-dashed border-slate-300 p-5 text-sm text-slate-500">
            {loading ? "加载中…" : "目前没有已批准的 Vault import intent。"}
          </div>
        ) : null}
        {overview?.pendingIntents.map((intent) => {
          const execution = executionsByIntent.get(intent.id);
          return (
            <div key={intent.id} className="rounded-xl border border-slate-200 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="break-all text-sm font-medium text-slate-900">
                    {intent.candidate.bindingRelativePath}
                  </p>
                  <p className="mt-1 font-mono text-xs text-slate-500">
                    {shortHash(intent.candidate.observedSha256)} · {intent.candidate.sizeBytes}{" "}
                    bytes
                  </p>
                </div>
                {execution?.state === "SUCCEEDED" ? (
                  <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-800">
                    <CheckCircle2 size={14} aria-hidden="true" />
                    SUCCEEDED
                  </span>
                ) : execution?.state === "REJECTED" ? (
                  <span className="inline-flex items-center gap-2 rounded-full bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-800">
                    <XCircle size={14} aria-hidden="true" />
                    {execution.rejection?.code ?? "REJECTED"}
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => void execute(intent.id)}
                    disabled={loading || executing !== null || !overview.rootConfigured}
                    className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
                  >
                    {executing === intent.id
                      ? "执行中…"
                      : execution?.state === "PENDING"
                        ? "继续安全重试"
                        : "执行已批准导入"}
                  </button>
                )}
              </div>
              {execution?.result ? (
                <p className="mt-3 break-all rounded-lg bg-slate-50 px-3 py-2 font-mono text-xs text-slate-600">
                  {execution.result.vaultStagingDocumentId} · {execution.result.contentAddressedRef}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
