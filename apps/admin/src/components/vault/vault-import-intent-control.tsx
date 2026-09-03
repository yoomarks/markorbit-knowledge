"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, ClipboardCheck, RefreshCw, ShieldAlert } from "lucide-react";
import type {
  VaultBindingV1,
  VaultImportIntentV1,
  VaultInspectionRunV1,
} from "@markorbit/contracts";
import { adminBrowserMutationHeaders } from "@/lib/admin-browser-api-client";

type InspectionOverview = {
  binding: VaultBindingV1 | null;
  recentRuns: VaultInspectionRunV1[];
};
type IntentOverview = {
  binding: VaultBindingV1 | null;
  intents: VaultImportIntentV1[];
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

async function readJson<T>(response: Response, fallback: string): Promise<T> {
  const body = (await response.json()) as T | ApiError;
  if (!response.ok) throw new Error(readError(body, fallback));
  return body as T;
}

async function loadAll(workspaceId: string) {
  const encoded = encodeURIComponent(workspaceId);
  const [inspectionResponse, intentResponse] = await Promise.all([
    fetch(`/api/workspaces/${encoded}/vault-inspections`),
    fetch(`/api/workspaces/${encoded}/vault-import-intents`),
  ]);
  return Promise.all([
    readJson<InspectionOverview>(inspectionResponse, "Unable to load Vault inspection evidence"),
    readJson<IntentOverview>(intentResponse, "Unable to load Vault import review state"),
  ]);
}

function shortHash(value: string): string {
  return `${value.slice(0, 10)}…${value.slice(-8)}`;
}

function intentKey(inspectionRunId: string, vaultRelativePath: string): string {
  return `${inspectionRunId}\n${vaultRelativePath}`;
}

export function VaultImportIntentControl({ workspaceId }: { workspaceId: string }) {
  const [inspection, setInspection] = useState<InspectionOverview | null>(null);
  const [intentOverview, setIntentOverview] = useState<IntentOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [approvingPath, setApprovingPath] = useState<string | null>(null);
  const [reviewNote, setReviewNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  function applyLoaded(result: [InspectionOverview, IntentOverview]) {
    setInspection(result[0]);
    setIntentOverview(result[1]);
    setError(null);
    setLoading(false);
  }

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      applyLoaded(await loadAll(workspaceId));
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "Unable to refresh import review",
      );
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    void loadAll(workspaceId).then(
      (result) => {
        if (!active) return;
        applyLoaded(result);
      },
      (requestError: unknown) => {
        if (!active) return;
        setError(
          requestError instanceof Error ? requestError.message : "Unable to load import review",
        );
        setLoading(false);
      },
    );
    return () => {
      active = false;
    };
  }, [workspaceId]);

  const latest = inspection?.recentRuns[0] ?? null;
  const candidates = useMemo(
    () =>
      latest?.candidates.filter((candidate) => candidate.classification === "IMPORT_CANDIDATE") ??
      [],
    [latest],
  );
  const approved = useMemo(() => {
    const map = new Map<string, VaultImportIntentV1>();
    for (const intent of intentOverview?.intents ?? []) {
      map.set(
        intentKey(intent.inspection.inspectionRunId, intent.candidate.vaultRelativePath),
        intent,
      );
    }
    return map;
  }, [intentOverview]);

  async function approve(vaultRelativePath: string) {
    if (!latest) return;
    setApprovingPath(vaultRelativePath);
    setError(null);
    try {
      const response = await fetch(
        `/api/workspaces/${encodeURIComponent(workspaceId)}/vault-import-intents`,
        {
          method: "POST",
          headers: await adminBrowserMutationHeaders({ "content-type": "application/json" }),
          body: JSON.stringify({
            inspectionRunId: latest.id,
            vaultRelativePath,
            ...(reviewNote.trim() ? { reviewNote: reviewNote.trim() } : {}),
          }),
        },
      );
      await readJson(response, "Vault import intent approval failed");
      setReviewNote("");
      applyLoaded(await loadAll(workspaceId));
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Vault import intent approval failed",
      );
    } finally {
      setApprovingPath(null);
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-slate-950">
            <ClipboardCheck size={19} aria-hidden="true" />
            <h2 className="font-semibold">Reviewed Vault Import Intent</h2>
          </div>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
            对最新 K08 inspection 中的 IMPORT_CANDIDATE
            建立人工批准证据。这里只冻结路径、hash、大小和 Binding；不会读取 Vault
            文件，也不会创建或修改 Staging。
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={loading || approvingPath !== null}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-3.5 py-2 text-sm font-medium text-slate-700 disabled:opacity-40"
        >
          <RefreshCw size={16} aria-hidden="true" />
          刷新
        </button>
      </div>

      <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
        <div className="flex gap-3">
          <ShieldAlert className="mt-0.5 shrink-0" size={18} aria-hidden="true" />
          <span>
            批准 ≠ 导入。K09 仅生成 PENDING_EXECUTION
            intent；未来执行前必须重新读取同一路径并验证实时 SHA-256 仍与本次 inspection 完全一致。
          </span>
        </div>
      </div>

      {error ? (
        <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          {error}
        </div>
      ) : null}

      <label className="mt-5 block text-sm font-medium text-slate-700">
        Review note（可选，应用于下一次批准）
        <textarea
          value={reviewNote}
          onChange={(event) => setReviewNote(event.target.value)}
          maxLength={1000}
          rows={2}
          className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
          placeholder="记录人工判断依据；批准后该证据不可修改。"
        />
      </label>

      <div className="mt-6 space-y-3 border-t border-slate-100 pt-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-900">Latest import candidates</h3>
          <span className="text-xs text-slate-500">
            {latest ? `${latest.id} · ${candidates.length} candidates` : "尚无 inspection evidence"}
          </span>
        </div>

        {!candidates.length ? (
          <div className="rounded-xl border border-dashed border-slate-300 p-5 text-sm text-slate-500">
            {loading ? "加载中…" : "最新 inspection 没有可批准的 IMPORT_CANDIDATE。"}
          </div>
        ) : null}

        {candidates.map((candidate) => {
          const existing = approved.get(intentKey(latest!.id, candidate.vaultRelativePath));
          return (
            <div
              key={candidate.vaultRelativePath}
              className="rounded-xl border border-slate-200 p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="break-all text-sm font-medium text-slate-900">
                    {candidate.bindingRelativePath}
                  </p>
                  <p className="mt-1 font-mono text-xs text-slate-500">
                    {candidate.observedSha256
                      ? shortHash(candidate.observedSha256)
                      : "missing hash"}{" "}
                    · {candidate.sizeBytes ?? 0} bytes
                  </p>
                </div>
                {existing ? (
                  <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-800">
                    <CheckCircle2 size={14} aria-hidden="true" />
                    已批准 · {existing.state}
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => void approve(candidate.vaultRelativePath)}
                    disabled={loading || approvingPath !== null}
                    className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
                  >
                    {approvingPath === candidate.vaultRelativePath ? "批准中…" : "批准导入意图"}
                  </button>
                )}
              </div>
              {existing?.reviewNote ? (
                <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600">
                  Review: {existing.reviewNote}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
