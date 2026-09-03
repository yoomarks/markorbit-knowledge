"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, FileOutput, RefreshCw } from "lucide-react";
import type { VaultBindingV1, VaultExportRunV1 } from "@markorbit/contracts";
import { adminBrowserMutationHeaders } from "@/lib/admin-browser-api-client";

type FilesystemReadiness = {
  configured: boolean;
  issueCode: string | null;
};

type EligibleStaging = {
  stagingDocumentId: string;
  targetPath: string;
  contentSha256: string;
};

type Overview = {
  binding: VaultBindingV1 | null;
  filesystem: FilesystemReadiness;
  eligible: EligibleStaging[];
  runs: VaultExportRunV1[];
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

async function requestOverview(workspaceId: string): Promise<Overview> {
  const response = await fetch(`/api/workspaces/${encodeURIComponent(workspaceId)}/vault-exports`);
  const body = (await response.json()) as Overview | ApiError;
  if (!response.ok) throw new Error(readError(body, "Unable to load Vault exports"));
  return body as Overview;
}

function stateTone(state: VaultExportRunV1["state"]): string {
  return state === "SUCCEEDED" ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800";
}

function shortHash(value: string): string {
  return `${value.slice(0, 10)}…${value.slice(-8)}`;
}

export function VaultExportControl({ workspaceId }: { workspaceId: string }) {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [selected, setSelected] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void requestOverview(workspaceId)
      .then((result) => {
        if (!active) return;
        setOverview(result);
        setSelected((current) => current || result.eligible[0]?.stagingDocumentId || "");
        setError(null);
      })
      .catch((requestError: unknown) => {
        if (!active) return;
        setError(
          requestError instanceof Error ? requestError.message : "Unable to load Vault exports",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [workspaceId]);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const result = await requestOverview(workspaceId);
      setOverview(result);
      if (!result.eligible.some((item) => item.stagingDocumentId === selected)) {
        setSelected(result.eligible[0]?.stagingDocumentId ?? "");
      }
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "Unable to load Vault exports",
      );
    } finally {
      setLoading(false);
    }
  }

  async function submit() {
    if (!selected) return;
    setSubmitting(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(
        `/api/workspaces/${encodeURIComponent(workspaceId)}/vault-exports`,
        {
          method: "POST",
          headers: await adminBrowserMutationHeaders({ "content-type": "application/json" }),
          body: JSON.stringify({ stagingDocumentId: selected }),
        },
      );
      const body = (await response.json()) as { run?: VaultExportRunV1 } | ApiError;
      if (!response.ok) throw new Error(readError(body, "Vault export failed"));
      const run = "run" in body ? body.run : undefined;
      setMessage(
        run?.state === "SUCCEEDED"
          ? `Vault export ${run.id} 已确认完成。`
          : "Vault export 已记录为 PENDING，可再次显式核对 / 重试。",
      );
      await refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Vault export failed");
      await refresh().catch(() => undefined);
    } finally {
      setSubmitting(false);
    }
  }

  const selectedPending = useMemo(
    () =>
      overview?.runs.find(
        (run) => run.state === "PENDING" && run.staging.stagingDocumentId === selected,
      ) ?? null,
    [overview, selected],
  );
  const canWrite = Boolean(
    selected && overview?.binding?.status === "ACTIVE" && overview.filesystem.configured,
  );

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-slate-950">
            <FileOutput size={19} aria-hidden="true" />
            <h2 className="font-semibold">Explicit Vault Export</h2>
          </div>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
            只允许人工显式触发 READY Staging → 当前 Workspace Vault。先持久化
            PENDING，再执行文件系统投影；
            文件写入已发生但本地确认中断时，同一请求会核对现有内容并安全收敛。
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={loading || submitting}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-3.5 py-2 text-sm font-medium text-slate-700 disabled:opacity-40"
        >
          <RefreshCw size={16} aria-hidden="true" />
          刷新
        </button>
      </div>

      {error ? (
        <div className="mt-5 flex gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          <AlertTriangle className="mt-0.5 shrink-0" size={18} aria-hidden="true" />
          <span>{error}</span>
        </div>
      ) : null}
      {message ? (
        <div className="mt-5 flex gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          <CheckCircle2 className="mt-0.5 shrink-0" size={18} aria-hidden="true" />
          <span>{message}</span>
        </div>
      ) : null}

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <SummaryCard
          label="Binding"
          value={overview?.binding?.status ?? (loading ? "LOADING" : "NOT_CONFIGURED")}
        />
        <SummaryCard
          label="Server root"
          value={overview?.filesystem.configured ? "READY" : "NOT_READY"}
        />
        <SummaryCard label="READY staging" value={String(overview?.eligible.length ?? 0)} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <label className="space-y-2 text-sm">
          <span className="font-medium text-slate-800">READY Staging document</span>
          <select
            value={selected}
            onChange={(event) => setSelected(event.target.value)}
            disabled={loading || submitting || !overview?.eligible.length}
            className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-slate-950 outline-none focus:border-slate-500 disabled:bg-slate-50"
          >
            {!overview?.eligible.length ? <option value="">暂无 READY Staging</option> : null}
            {overview?.eligible.map((item) => (
              <option key={item.stagingDocumentId} value={item.stagingDocumentId}>
                {item.targetPath} · {item.stagingDocumentId}
              </option>
            ))}
          </select>
          {selected ? (
            <span className="block break-all font-mono text-xs leading-5 text-slate-500">
              {
                overview?.eligible.find((item) => item.stagingDocumentId === selected)
                  ?.contentSha256
              }
            </span>
          ) : null}
        </label>
        <button
          type="button"
          onClick={() => void submit()}
          disabled={submitting || loading || (!selectedPending && !canWrite) || !selected}
          className="inline-flex min-w-44 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-40"
        >
          <FileOutput size={16} aria-hidden="true" />
          {submitting ? "处理中…" : selectedPending ? "核对 / 重试 PENDING" : "显式导出到 Vault"}
        </button>
      </div>

      {!overview?.filesystem.configured || overview?.binding?.status !== "ACTIVE" ? (
        <div className="mt-5 flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 shrink-0" size={18} aria-hidden="true" />
          <span>
            新导出要求 ACTIVE Vault binding 与可用服务器 Vault Root。已有 PENDING
            只允许按冻结目的地核对； 不会因为当前配置变化而静默改写到新目录。
          </span>
        </div>
      ) : null}

      <div className="mt-7 border-t border-slate-100 pt-5">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-slate-900">最近 Export Runs</h3>
          <span className="text-xs text-slate-500">PENDING 不代表失败，也不代表文件一定未写入</span>
        </div>
        <div className="mt-3 space-y-3">
          {!overview?.runs.length ? (
            <div className="rounded-xl border border-dashed border-slate-300 p-5 text-sm text-slate-500">
              暂无 Vault Export 记录。
            </div>
          ) : null}
          {overview?.runs.map((run) => (
            <div key={run.id} className="rounded-xl border border-slate-200 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-semibold text-slate-900">{run.id}</span>
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-medium ${stateTone(run.state)}`}
                    >
                      {run.state}
                    </span>
                    {run.result ? (
                      <span className="text-xs text-slate-500">{run.result.disposition}</span>
                    ) : null}
                  </div>
                  <p className="mt-2 break-all text-sm text-slate-700">{run.staging.targetPath}</p>
                  <p className="mt-1 break-all font-mono text-xs text-slate-500">
                    {run.staging.stagingDocumentId} · {shortHash(run.staging.contentSha256)}
                  </p>
                </div>
                <div className="text-right text-xs text-slate-500">
                  <p>binding rev {run.binding.revision}</p>
                  <p className="mt-1">{new Date(run.updatedAt).toLocaleString("zh-CN")}</p>
                </div>
              </div>
              {run.result ? (
                <p className="mt-3 break-all rounded-lg bg-slate-50 px-3 py-2 font-mono text-xs text-slate-600">
                  {run.result.vaultRelativePath}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 p-4">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-2 font-mono text-sm font-semibold text-slate-950">{value}</p>
    </div>
  );
}
