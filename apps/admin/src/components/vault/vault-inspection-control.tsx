"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { AlertTriangle, RefreshCw, ScanSearch } from "lucide-react";
import type { VaultBindingV1, VaultInspectionRunV1 } from "@markorbit/contracts";
import { adminBrowserMutationHeaders } from "@/lib/admin-browser-api-client";

type FilesystemReadiness = { configured: boolean; issueCode: string | null };
type Overview = {
  binding: VaultBindingV1 | null;
  filesystem: FilesystemReadiness;
  recentRuns: VaultInspectionRunV1[];
};
type ApiError = { error?: { message?: string } };
type InboxFocus = { inspectionId: string; path: string };

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
    `/api/workspaces/${encodeURIComponent(workspaceId)}/vault-inspections`,
  );
  const body = (await response.json()) as Overview | ApiError;
  if (!response.ok) throw new Error(readError(body, "Unable to load Vault inspection state"));
  return body as Overview;
}

function badge(classification: string): string {
  if (classification === "UNCHANGED") return "bg-emerald-50 text-emerald-800";
  if (classification === "IMPORT_CANDIDATE") return "bg-sky-50 text-sky-800";
  if (classification === "CONFLICT") return "bg-rose-50 text-rose-800";
  return "bg-amber-50 text-amber-800";
}

function shortHash(value?: string): string {
  if (!value) return "—";
  return `${value.slice(0, 10)}…${value.slice(-8)}`;
}

function subscribeLocationSearch(): () => void {
  return () => undefined;
}

function readLocationSearch(): string {
  return window.location.search;
}

function readServerLocationSearch(): string {
  return "";
}

export function VaultInspectionControl({ workspaceId }: { workspaceId: string }) {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const locationSearch = useSyncExternalStore(
    subscribeLocationSearch,
    readLocationSearch,
    readServerLocationSearch,
  );
  const inboxFocus = useMemo<InboxFocus | null>(() => {
    const parameters = new URLSearchParams(locationSearch);
    const inspectionId = parameters.get("inspectionId")?.trim();
    const path = parameters.get("path")?.trim();
    return inspectionId && path ? { inspectionId, path } : null;
  }, [locationSearch]);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      setOverview(await loadOverview(workspaceId));
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to load Vault inspection state",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    void loadOverview(workspaceId).then(
      (result) => {
        if (!active) return;
        setOverview(result);
        setError(null);
        setLoading(false);
      },
      (requestError: unknown) => {
        if (!active) return;
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Unable to load Vault inspection state",
        );
        setLoading(false);
      },
    );
    return () => {
      active = false;
    };
  }, [workspaceId]);

  async function inspect() {
    setScanning(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/workspaces/${encodeURIComponent(workspaceId)}/vault-inspections`,
        { method: "POST", headers: await adminBrowserMutationHeaders() },
      );
      const body = (await response.json()) as { run?: VaultInspectionRunV1 } | ApiError;
      if (!response.ok) throw new Error(readError(body, "Vault inspection failed"));
      await refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Vault inspection failed");
    } finally {
      setScanning(false);
    }
  }

  const latest = overview?.recentRuns[0] ?? null;
  const displayedRun = useMemo(() => {
    if (!inboxFocus) return latest;
    return overview?.recentRuns.find((run) => run.id === inboxFocus.inspectionId) ?? null;
  }, [inboxFocus, latest, overview?.recentRuns]);
  const visibleCandidates = useMemo(() => {
    const candidates = displayedRun?.candidates ?? [];
    if (!inboxFocus) return candidates;
    return candidates.filter((candidate) => candidate.vaultRelativePath === inboxFocus.path);
  }, [displayedRun, inboxFocus]);
  const focusMissing = Boolean(inboxFocus && (!displayedRun || visibleCandidates.length === 0));
  const counts = useMemo(() => {
    const result = { UNCHANGED: 0, IMPORT_CANDIDATE: 0, CONFLICT: 0, MISSING: 0 };
    for (const candidate of displayedRun?.candidates ?? []) result[candidate.classification] += 1;
    return result;
  }, [displayedRun]);
  const canInspect = Boolean(
    overview?.binding?.status === "ACTIVE" && overview?.filesystem.configured,
  );

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-slate-950">
            <ScanSearch size={19} aria-hidden="true" />
            <h2 className="font-semibold">Read-only Vault Inspection</h2>
          </div>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
            显式只读扫描当前 ACTIVE Binding 下的 Markdown。只记录 hash、受限 YAML frontmatter、Wiki
            Link 与上一份成功 Export 的差异证据；不会创建 Staging、修改 Vault 文件或自动导入。
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading || scanning}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-3.5 py-2 text-sm font-medium text-slate-700 disabled:opacity-40"
          >
            <RefreshCw size={16} aria-hidden="true" />
            刷新
          </button>
          <button
            type="button"
            onClick={() => void inspect()}
            disabled={loading || scanning || !canInspect}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            <ScanSearch size={16} aria-hidden="true" />
            {scanning ? "扫描中…" : "显式只读扫描"}
          </button>
        </div>
      </div>

      {error ? (
        <div className="mt-5 flex gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          <AlertTriangle className="mt-0.5 shrink-0" size={18} aria-hidden="true" />
          <span>{error}</span>
        </div>
      ) : null}

      {inboxFocus ? (
        <div
          className={`mt-5 rounded-xl border px-4 py-3 text-sm ${
            focusMissing
              ? "border-rose-200 bg-rose-50 text-rose-800"
              : "border-sky-200 bg-sky-50 text-sky-800"
          }`}
        >
          <p className="font-semibold">Operator Inbox evidence focus</p>
          <p className="mt-1 break-all text-xs">
            {inboxFocus.inspectionId} · {inboxFocus.path}
          </p>
          {focusMissing ? (
            <p className="mt-1 text-xs">
              指定的持久化 inspection/path 当前不在最近证据窗口中；未回退显示其他记录。
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Summary label="Unchanged" value={String(counts.UNCHANGED)} />
        <Summary label="Import candidates" value={String(counts.IMPORT_CANDIDATE)} />
        <Summary label="Conflicts" value={String(counts.CONFLICT)} />
        <Summary label="Missing" value={String(counts.MISSING)} />
      </div>

      {!canInspect ? (
        <div className="mt-5 flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 shrink-0" size={18} aria-hidden="true" />
          <span>
            只读扫描要求 ACTIVE Vault Binding 与可读取的服务器 Vault Root；扫描不会创建缺失目录。
          </span>
        </div>
      ) : null}

      <div className="mt-7 border-t border-slate-100 pt-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-slate-900">
            {inboxFocus ? "Focused inspection evidence" : "Latest inspection evidence"}
          </h3>
          <span className="text-xs text-slate-500">
            {displayedRun
              ? `${displayedRun.id} · ${new Date(displayedRun.observedAt).toLocaleString("zh-CN")}`
              : inboxFocus
                ? "指定 inspection 不在最近证据窗口中"
                : "尚未执行只读扫描"}
          </span>
        </div>
        <div className="mt-3 space-y-3">
          {!visibleCandidates.length ? (
            <div className="rounded-xl border border-dashed border-slate-300 p-5 text-sm text-slate-500">
              {inboxFocus
                ? "没有与 Operator Inbox 深链完全匹配的 Vault inspection candidate。"
                : displayedRun
                  ? "本次扫描没有发现 Markdown 候选或已管理缺失项。"
                  : "执行一次显式只读扫描后显示证据。"}
            </div>
          ) : null}
          {visibleCandidates.map((candidate) => (
            <div
              key={candidate.vaultRelativePath}
              className="rounded-xl border border-slate-200 p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-medium ${badge(candidate.classification)}`}
                    >
                      {candidate.classification}
                    </span>
                    <span className="break-all text-sm font-medium text-slate-900">
                      {candidate.bindingRelativePath}
                    </span>
                  </div>
                  <p className="mt-2 break-all font-mono text-xs text-slate-500">
                    observed {shortHash(candidate.observedSha256)}
                    {candidate.managedExport
                      ? ` · exported ${shortHash(candidate.managedExport.contentSha256)}`
                      : " · untracked"}
                  </p>
                </div>
                <div className="text-right text-xs text-slate-500">
                  <p>
                    {candidate.sizeBytes === undefined ? "missing" : `${candidate.sizeBytes} bytes`}
                  </p>
                  <p className="mt-1">frontmatter {candidate.frontmatter.status}</p>
                </div>
              </div>
              {candidate.frontmatter.keys.length ? (
                <p className="mt-3 text-xs text-slate-600">
                  YAML keys: {candidate.frontmatter.keys.join(", ")}
                </p>
              ) : null}
              {candidate.wikiLinks.length ? (
                <p className="mt-1 break-words text-xs text-slate-600">
                  Wiki links: {candidate.wikiLinks.join(", ")}
                </p>
              ) : null}
              {candidate.classification === "IMPORT_CANDIDATE" ||
              candidate.classification === "CONFLICT" ? (
                <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600">
                  仅形成 review candidate；R1-K08 不提供任何 Import / Apply / Merge 动作。
                </p>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 p-4">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-2 font-mono text-lg font-semibold text-slate-950">{value}</p>
    </div>
  );
}
