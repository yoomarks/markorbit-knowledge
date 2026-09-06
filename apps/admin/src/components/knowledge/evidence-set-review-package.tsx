"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Archive, ExternalLink, FileText, Loader2 } from "lucide-react";
import type {
  EvidenceSetDriftReportV1,
  EvidenceSetMemberDriftState,
  EvidenceSetV1,
} from "@markorbit/contracts";
import { useAdminI18n } from "@/lib/i18n";
import { knowledgeEvidenceContextHref } from "@/lib/knowledge-navigation-model";
import { knowledgeWorkspaceHref } from "@/lib/knowledge-workspace-model";

type ReviewResponse = {
  evidenceSet: EvidenceSetV1;
  drift: EvidenceSetDriftReportV1;
};

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: string }; message?: string };
    return body.error?.message ?? body.message ?? `Request failed (${response.status})`;
  } catch {
    return `Request failed (${response.status})`;
  }
}
function driftTone(state: EvidenceSetMemberDriftState): string {
  if (state === "CURRENT") return "bg-emerald-50 text-emerald-700";
  if (state === "NEWER_VERSION_AVAILABLE") return "bg-amber-50 text-amber-800";
  return "bg-rose-50 text-rose-700";
}

function driftLabel(state: EvidenceSetMemberDriftState, zh: boolean): string {
  const labels: Record<EvidenceSetMemberDriftState, [string, string]> = {
    CURRENT: ["当前版本", "Current"],
    NEWER_VERSION_AVAILABLE: ["存在新版本", "Newer version available"],
    SOURCE_MISSING: ["当前来源缺失", "Source currently missing"],
    SOURCE_ARCHIVED: ["当前来源已归档", "Source currently archived"],
    RAW_ARTIFACT_MISSING: ["当前 RawArtifact 缺失", "RawArtifact currently missing"],
    RAW_ARTIFACT_ARCHIVED: ["当前 RawArtifact 已归档", "RawArtifact currently archived"],
    CURRENT_DOCUMENT_UNRESOLVED: ["当前版本无法解析", "Current version unresolved"],
  };
  return labels[state][zh ? 0 : 1];
}

export function EvidenceSetReviewPackage({
  workspaceId,
  evidenceSetId,
}: {
  workspaceId: string;
  evidenceSetId: string;
}) {
  const { locale } = useAdminI18n();
  const zh = locale === "zh-CN";
  const [result, setResult] = useState<ReviewResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const params = new URLSearchParams({ workspaceId });
        const response = await fetch(
          `/api/evidence-sets/${encodeURIComponent(evidenceSetId)}?${params}`,
          { cache: "no-store" },
        );
        if (!response.ok) throw new Error(await readError(response));
        const body = (await response.json()) as ReviewResponse;
        if (active) {
          setResult(body);
          setError(null);
        }
      } catch (requestError) {
        if (active) {
          setError(
            requestError instanceof Error ? requestError.message : "Unable to load Review Package",
          );
        }
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [evidenceSetId, workspaceId]);

  const summary = useMemo(() => {
    if (!result) return null;
    const sources = new Map<string, number>();
    const jurisdictions = new Map<string, number>();
    for (const member of result.evidenceSet.members) {
      sources.set(member.sourceName, (sources.get(member.sourceName) ?? 0) + 1);
      for (const jurisdiction of member.jurisdictions) {
        jurisdictions.set(jurisdiction, (jurisdictions.get(jurisdiction) ?? 0) + 1);
      }
    }
    return {
      sources: [...sources.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
      jurisdictions: [...jurisdictions.entries()].sort(
        (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
      ),
    };
  }, [result]);

  if (error) {
    return (
      <section className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-800">
        {error}
      </section>
    );
  }
  if (!result || !summary) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
        <Loader2 className="mx-auto mb-3 animate-spin" size={20} />
        {zh ? "正在打开 Review Package…" : "Loading Review Package…"}
      </section>
    );
  }

  const { evidenceSet, drift } = result;
  const returnHref = knowledgeWorkspaceHref(
    `/knowledge/evidence-sets/${encodeURIComponent(evidenceSet.evidenceSetId)}`,
    workspaceId,
  );
  const exportHref = `/api/evidence-sets/${encodeURIComponent(evidenceSet.evidenceSetId)}/export?${new URLSearchParams({ workspaceId })}`;

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-indigo-50 text-indigo-700">
                <Archive size={18} />
              </span>
              <div className="min-w-0">
                <h1 className="text-lg font-semibold text-slate-950">{evidenceSet.title}</h1>
                <p className="mt-1 text-xs text-slate-500">
                  {zh
                    ? "不可变 Evidence Set / 人工复核包"
                    : "Immutable Evidence Set / human review package"}
                </p>
              </div>
            </div>
            {evidenceSet.note ? (
              <p className="mt-4 max-w-4xl text-sm leading-6 text-slate-600">{evidenceSet.note}</p>
            ) : null}
          </div>
          <a
            href={exportHref}
            className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-slate-300 px-3.5 py-2 text-xs font-semibold text-slate-700"
          >
            <ExternalLink size={14} /> {zh ? "导出冻结合同 JSON" : "Export frozen contract JSON"}
          </a>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl bg-slate-50 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              Evidence Set
            </p>
            <p className="mt-1 break-all font-mono text-[11px] text-slate-700">
              {evidenceSet.evidenceSetId}
            </p>
          </div>
          <div className="rounded-xl bg-slate-50 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              Revision / Digest
            </p>
            <p className="mt-1 font-mono text-[11px] text-slate-700">r{evidenceSet.revision}</p>
            <p className="mt-1 break-all font-mono text-[10px] text-slate-400">
              {evidenceSet.digest}
            </p>
          </div>
          <div className="rounded-xl bg-slate-50 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              Created
            </p>
            <p className="mt-1 text-xs text-slate-700">
              {new Date(evidenceSet.createdAt).toLocaleString(locale)}
            </p>
            <p className="mt-1 text-[10px] text-slate-400">
              {evidenceSet.creator.userId} · {evidenceSet.creator.role}
            </p>
          </div>
          <div className="rounded-xl bg-slate-50 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              Objective drift
            </p>
            <p className="mt-1 text-xl font-semibold text-slate-950">{drift.changedCount}</p>
            <p className="text-[10px] text-slate-400">
              {zh ? "发生客观变化的成员" : "members with factual drift"}
            </p>
          </div>
        </div>
      </section>
      <section className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-semibold text-slate-800">
            {zh ? "来源分布" : "Source distribution"}
          </p>
          <div className="mt-3 space-y-2">
            {summary.sources.map(([name, count]) => (
              <div
                key={name}
                className="flex items-center justify-between gap-3 text-xs text-slate-600"
              >
                <span className="truncate">{name}</span>
                <span className="font-semibold text-slate-800">{count}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-semibold text-slate-800">
            {zh ? "地区分布" : "Jurisdiction distribution"}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {summary.jurisdictions.length ? (
              summary.jurisdictions.map(([name, count]) => (
                <span
                  key={name}
                  className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-700"
                >
                  {name} · {count}
                </span>
              ))
            ) : (
              <span className="text-xs text-slate-400">—</span>
            )}
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="font-semibold text-slate-950">
            {zh
              ? `冻结成员 · ${evidenceSet.members.length}`
              : `Frozen members · ${evidenceSet.members.length}`}
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            {zh
              ? "以下内容只展示冻结事实与当前客观漂移，不做相关性或法律判断。"
              : "Only frozen facts and objective current drift are shown; no relevance or legal judgment is added."}
          </p>
        </div>
        <div className="divide-y divide-slate-100">
          {evidenceSet.members.map((member, index) => {
            const memberDrift = drift.members[index];
            const frozenHref = knowledgeEvidenceContextHref(
              `/knowledge/${encodeURIComponent(member.stagingDocumentId)}`,
              workspaceId,
              returnHref,
            );
            const currentHref = memberDrift?.currentStagingDocumentId
              ? knowledgeEvidenceContextHref(
                  `/knowledge/${encodeURIComponent(memberDrift.currentStagingDocumentId)}`,
                  workspaceId,
                  returnHref,
                )
              : null;
            return (
              <article key={`${member.ordinal}-${member.stagingDocumentId}`} className="p-5 sm:p-6">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start gap-3">
                      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-600">
                        <FileText size={16} />
                      </span>
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-950">{member.sourceName}</p>
                        <p className="mt-1 break-all text-xs text-slate-500">{member.sourceUri}</p>
                      </div>
                    </div>
                    <div className="mt-4 grid gap-2 text-[11px] text-slate-600 sm:grid-cols-2 xl:grid-cols-4">
                      <p>
                        <span className="text-slate-400">Frozen version · </span>v
                        {member.artifactVersion}
                      </p>
                      <p>
                        <span className="text-slate-400">RawArtifact · </span>
                        <span className="font-mono">{member.rawArtifactId}</span>
                      </p>
                      <p>
                        <span className="text-slate-400">Captured · </span>
                        {new Date(member.capturedAt).toLocaleString(locale)}
                      </p>
                      <p>
                        <span className="text-slate-400">Published · </span>
                        {member.publishedAt
                          ? new Date(member.publishedAt).toLocaleString(locale)
                          : "—"}
                      </p>
                    </div>
                    <details className="mt-3 rounded-xl bg-slate-50 p-3 text-[10px] leading-5 text-slate-500">
                      <summary className="cursor-pointer font-semibold text-slate-600">
                        {zh ? "精确冻结标识与摘要" : "Exact frozen identities and digests"}
                      </summary>
                      <div className="mt-2 break-all font-mono">
                        <div>documentId: {member.documentId}</div>
                        <div>stagingDocumentId: {member.stagingDocumentId}</div>
                        <div>readyPackageId: {member.readyPackageId}</div>
                        <div>sourceId: {member.sourceId}</div>
                        <div>source category: {member.sourceCategory}</div>
                        <div>authority: {member.authorityLevel}</div>
                        <div>canonicalUri: {member.canonicalUri ?? "—"}</div>
                        <div>jurisdictions: {member.jurisdictions.join(", ") || "—"}</div>
                        <div>languages: {member.languages.join(", ") || "—"}</div>
                        <div>raw status at freeze: {member.rawArtifactStatus}</div>
                        <div>staging sha256: {member.stagingContentSha256}</div>
                        <div>raw binary sha256: {member.rawBinarySha256}</div>
                        <div>raw content sha256: {member.rawContentSha256 ?? "—"}</div>
                      </div>
                    </details>
                  </div>
                  <div className="flex shrink-0 flex-col items-start gap-2 xl:items-end">
                    {memberDrift ? (
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold ${driftTone(memberDrift.state)}`}
                      >
                        {driftLabel(memberDrift.state, zh)}
                      </span>
                    ) : null}
                    <div className="flex flex-wrap gap-2 xl:justify-end">
                      <Link
                        href={frozenHref}
                        className="inline-flex items-center rounded-xl bg-slate-950 px-3.5 py-2 text-xs font-semibold text-white"
                      >
                        {zh ? "打开冻结证据" : "Open frozen evidence"}
                      </Link>
                      {currentHref && currentHref !== frozenHref ? (
                        <Link
                          href={currentHref}
                          className="inline-flex items-center rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-2 text-xs font-semibold text-amber-900"
                        >
                          {zh ? "打开当前版本" : "Open current version"}
                        </Link>
                      ) : null}
                      <a
                        href={member.sourceUri}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 px-3.5 py-2 text-xs font-semibold text-slate-700"
                      >
                        <ExternalLink size={13} /> {zh ? "来源" : "Source"}
                      </a>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
