"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Archive, CheckCircle2, RefreshCw, Save } from "lucide-react";
import type { VaultBindingV1 } from "@markorbit/contracts";
import { adminBrowserMutationHeaders } from "@/lib/admin-browser-api-client";

type FilesystemReadiness = {
  configured: boolean;
  issueCode: string | null;
};

type VaultBindingResponse = {
  binding: VaultBindingV1 | null;
  filesystem: FilesystemReadiness;
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

async function requestBinding(
  workspaceId: string,
  signal?: AbortSignal,
): Promise<VaultBindingResponse> {
  const response = await fetch(`/api/workspaces/${encodeURIComponent(workspaceId)}/vault-binding`, {
    signal,
  });
  const body = (await response.json()) as VaultBindingResponse | ApiError;
  if (!response.ok) throw new Error(readError(body, "Unable to load Vault binding"));
  return body as VaultBindingResponse;
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function statusTone(binding: VaultBindingV1 | null): string {
  if (!binding) return "bg-slate-100 text-slate-700";
  return binding.status === "ACTIVE"
    ? "bg-emerald-50 text-emerald-800"
    : "bg-amber-50 text-amber-800";
}

export function VaultBindingControl({ workspaceId }: { workspaceId: string }) {
  const [binding, setBinding] = useState<VaultBindingV1 | null>(null);
  const [filesystem, setFilesystem] = useState<FilesystemReadiness>({
    configured: false,
    issueCode: null,
  });
  const [name, setName] = useState("Primary Review Vault");
  const [relativeRoot, setRelativeRoot] = useState("MarkOrbit/Global Public");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  function applyResponse(result: VaultBindingResponse): void {
    setBinding(result.binding);
    setFilesystem(result.filesystem);
    if (result.binding) {
      setName(result.binding.name);
      setRelativeRoot(result.binding.relativeRoot);
    }
  }

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      applyResponse(await requestBinding(workspaceId));
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "Unable to load Vault binding",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    void requestBinding(workspaceId, controller.signal)
      .then((result) => {
        applyResponse(result);
        setError(null);
      })
      .catch((requestError: unknown) => {
        if (isAbortError(requestError)) return;
        setError(
          requestError instanceof Error ? requestError.message : "Unable to load Vault binding",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [workspaceId]);

  async function saveBinding() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(
        `/api/workspaces/${encodeURIComponent(workspaceId)}/vault-binding`,
        {
          method: "PUT",
          headers: await adminBrowserMutationHeaders({ "content-type": "application/json" }),
          body: JSON.stringify({
            name,
            relativeRoot,
            ...(binding ? { expectedRevision: binding.revision } : {}),
          }),
        },
      );
      const body = (await response.json()) as VaultBindingResponse | ApiError;
      if (!response.ok) throw new Error(readError(body, "Unable to save Vault binding"));
      applyResponse(body as VaultBindingResponse);
      setMessage("Vault binding 已持久化；后续 Export/Import 只能在该 Workspace 绑定边界内执行。");
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "Unable to save Vault binding",
      );
    } finally {
      setSaving(false);
    }
  }

  async function toggleStatus() {
    if (!binding) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const nextStatus = binding.status === "ACTIVE" ? "DISABLED" : "ACTIVE";
      const response = await fetch(
        `/api/workspaces/${encodeURIComponent(workspaceId)}/vault-binding`,
        {
          method: "PATCH",
          headers: await adminBrowserMutationHeaders({ "content-type": "application/json" }),
          body: JSON.stringify({ status: nextStatus, expectedRevision: binding.revision }),
        },
      );
      const body = (await response.json()) as VaultBindingResponse | ApiError;
      if (!response.ok) throw new Error(readError(body, "Unable to update Vault binding status"));
      applyResponse(body as VaultBindingResponse);
      setMessage(
        nextStatus === "ACTIVE"
          ? "Vault binding 已启用。"
          : "Vault binding 已禁用。当前不会授权后续同步执行。",
      );
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to update Vault binding status",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryCard label="Binding" value={binding ? binding.status : "NOT_CONFIGURED"} />
        <SummaryCard label="Adapter" value={binding?.adapter ?? "LOCAL_FILESYSTEM"} />
        <SummaryCard
          label="Server root"
          value={filesystem.configured ? "CONFIGURED" : "NOT_CONFIGURED"}
        />
      </div>

      {error ? (
        <div className="flex gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          <AlertTriangle className="mt-0.5 shrink-0" size={18} aria-hidden="true" />
          <span>{error}</span>
        </div>
      ) : null}
      {message ? (
        <div className="flex gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          <CheckCircle2 className="mt-0.5 shrink-0" size={18} aria-hidden="true" />
          <span>{message}</span>
        </div>
      ) : null}

      <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-slate-950">
              <Archive size={19} aria-hidden="true" />
              <h2 className="font-semibold">Workspace Vault Binding</h2>
            </div>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
              这里只保存 Workspace 相对于服务器 Vault Root
              的安全目录映射；服务器绝对路径由环境配置持有，不通过浏览器 API 暴露。
            </p>
          </div>
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-3.5 py-2 text-sm font-medium text-slate-700 disabled:opacity-50"
            onClick={() => void refresh()}
            disabled={loading || saving}
          >
            <RefreshCw size={16} aria-hidden="true" />
            刷新
          </button>
        </div>

        {!filesystem.configured ? (
          <div className="mt-5 flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <AlertTriangle className="mt-0.5 shrink-0" size={18} aria-hidden="true" />
            <span>
              服务器 Vault Root 尚不可用（
              {filesystem.issueCode ?? "OBSIDIAN_VAULT_ROOT_NOT_CONFIGURED"}
              ）。可以先保存绑定，但实际文件系统 Export/Import 在配置修复前必须保持禁用。
            </span>
          </div>
        ) : null}

        <div className="mt-6 grid gap-5 md:grid-cols-2">
          <label className="space-y-2 text-sm">
            <span className="font-medium text-slate-800">名称</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-slate-950 outline-none focus:border-slate-500"
              placeholder="Primary Review Vault"
              disabled={loading || saving}
            />
          </label>
          <label className="space-y-2 text-sm">
            <span className="font-medium text-slate-800">Relative root</span>
            <input
              value={relativeRoot}
              onChange={(event) => setRelativeRoot(event.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 font-mono text-sm text-slate-950 outline-none focus:border-slate-500"
              placeholder="MarkOrbit/Global Public"
              disabled={loading || saving}
            />
            <span className="block text-xs leading-5 text-slate-500">
              仅允许便携的相对目录；禁止绝对路径、..、反斜杠、空目录段和 Windows 保留名称。
            </span>
          </label>
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-4">
          <EvidenceCard label="Workspace" value={workspaceId} />
          <EvidenceCard label="Binding ID" value={binding?.id ?? "—"} />
          <EvidenceCard label="Revision" value={binding ? String(binding.revision) : "—"} />
          <EvidenceCard
            label="Updated"
            value={binding ? new Date(binding.updatedAt).toLocaleString("zh-CN") : "—"}
          />
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-5">
          <div className="flex items-center gap-2">
            <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusTone(binding)}`}>
              {binding?.status ?? "NOT_CONFIGURED"}
            </span>
            <span className="text-xs text-slate-500">
              R1-K06 只建立绑定与授权边界，不自动扫描、导入、导出或处理冲突。
            </span>
          </div>
          <div className="flex gap-2">
            {binding ? (
              <button
                type="button"
                className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 disabled:opacity-40"
                onClick={() => void toggleStatus()}
                disabled={saving || loading}
              >
                {binding.status === "ACTIVE" ? "禁用绑定" : "启用绑定"}
              </button>
            ) : null}
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-40"
              onClick={() => void saveBinding()}
              disabled={saving || loading || !name.trim() || !relativeRoot.trim()}
            >
              <Save size={16} aria-hidden="true" />
              {saving ? "保存中…" : binding ? "保存配置" : "创建绑定"}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-2 break-all font-mono text-sm font-semibold text-slate-950">{value}</p>
    </div>
  );
}

function EvidenceCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 p-4">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-2 break-all font-mono text-xs font-semibold text-slate-900">{value}</p>
    </div>
  );
}
