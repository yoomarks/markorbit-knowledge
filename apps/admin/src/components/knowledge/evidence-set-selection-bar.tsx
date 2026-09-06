"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Archive, Loader2, X } from "lucide-react";
import { adminBrowserWorkspaceMutationHeaders } from "@/lib/admin-browser-api-client";
import { useAdminI18n } from "@/lib/i18n";
import { knowledgeWorkspaceHref } from "@/lib/knowledge-workspace-model";

export function EvidenceSetSelectionBar({
  workspaceId,
  selectedIds,
  onClear,
}: {
  workspaceId: string;
  selectedIds: string[];
  onClear?: () => void;
}) {
  const { locale } = useAdminI18n();
  const zh = locale === "zh-CN";
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const keyRef = useRef<{ fingerprint: string; key: string } | null>(null);

  if (selectedIds.length === 0) return null;

  const requestKey = () => {
    const fingerprint = JSON.stringify({
      workspaceId,
      title: title.trim(),
      note: note.trim(),
      selectedIds,
    });
    if (keyRef.current?.fingerprint === fingerprint) return keyRef.current.key;
    const key = `evidence-set-${crypto.randomUUID()}`;
    keyRef.current = { fingerprint, key };
    return key;
  };

  const create = async () => {
    if (!title.trim() || loading) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ workspaceId });
      const response = await fetch(`/api/evidence-sets?${params}`, {
        method: "POST",
        headers: await adminBrowserWorkspaceMutationHeaders(workspaceId, {
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({
          title: title.trim(),
          note: note.trim() || null,
          stagingDocumentIds: selectedIds,
          idempotencyKey: requestKey(),
        }),
      });
      const body = (await response.json()) as {
        evidenceSet?: { evidenceSetId: string };
        error?: { message?: string };
        message?: string;
      };
      if (!response.ok || !body.evidenceSet) {
        throw new Error(
          body.error?.message ?? body.message ?? `Request failed (${response.status})`,
        );
      }
      router.push(
        knowledgeWorkspaceHref(
          `/knowledge/evidence-sets/${encodeURIComponent(body.evidenceSet.evidenceSetId)}`,
          workspaceId,
        ),
      );
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : zh
            ? "无法创建 Evidence Set"
            : "Unable to create Evidence Set",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="rounded-2xl border border-indigo-200 bg-indigo-50/60 p-4 sm:p-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <Archive size={16} className="text-indigo-700" />
            {zh
              ? `已选择 ${selectedIds.length} 项证据`
              : `${selectedIds.length} evidence items selected`}
          </div>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            {zh
              ? "冻结当前选中项的精确版本、RawArtifact 与 SHA-256；不会自动补充、判断相关性或改写内容。"
              : "Freeze exact selected versions, RawArtifacts, and SHA-256 facts. No automatic expansion, relevance judgment, or rewriting."}
          </p>
        </div>
        <label className="min-w-64 flex-1">
          <span className="mb-1 block text-[11px] font-semibold text-slate-500">
            {zh ? "Evidence Set 名称" : "Evidence Set title"}
          </span>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={200}
            placeholder={zh ? "例如：9 月规则复核证据" : "e.g. September rules review"}
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm"
          />
        </label>
        <label className="min-w-64 flex-1">
          <span className="mb-1 block text-[11px] font-semibold text-slate-500">
            {zh ? "备注（可选）" : "Note (optional)"}
          </span>
          <input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            maxLength={1000}
            placeholder={
              zh ? "只记录操作背景，不写结论" : "Operational context only; no conclusion"
            }
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm"
          />
        </label>
        <div className="flex shrink-0 gap-2">
          {onClear ? (
            <button
              type="button"
              onClick={onClear}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-xs font-semibold text-slate-600 disabled:opacity-50"
            >
              <X size={14} /> {zh ? "清空" : "Clear"}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => void create()}
            disabled={!title.trim() || loading}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-700 px-4 py-2.5 text-xs font-semibold text-white disabled:opacity-50"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Archive size={14} />}
            {zh ? "冻结 Evidence Set" : "Freeze Evidence Set"}
          </button>
        </div>
      </div>
      {error ? (
        <p role="alert" className="mt-3 text-xs font-medium text-rose-700">
          {error}
        </p>
      ) : null}
    </section>
  );
}
