"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, FileDiff, Loader2, RefreshCw } from "lucide-react";
import type { DocumentChangeEvidence } from "@markorbit/contracts";

type ChangeReviewResponse = {
  workspaceId: string;
  documentId: string;
  evidence: DocumentChangeEvidence[];
  complete: boolean;
};

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as {
      error?: { message?: string };
      message?: string;
    };
    return (
      body.error?.message ??
      body.message ??
      `Request failed (${response.status})`
    );
  } catch {
    return `Request failed (${response.status})`;
  }
}

function shortHash(value: string | null | undefined): string {
  if (!value) return "—";
  return value.length > 20
    ? `${value.slice(0, 10)}…${value.slice(-8)}`
    : value;
}

function excerpt(value: string | null, limit = 800): string {
  if (!value) return "—";
  return value.length <= limit ? value : `${value.slice(0, limit)}…`;
}

function evidenceTime(value: string | null | undefined): string {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? value
    : parsed.toLocaleString("zh-CN", { hour12: false });
}

function RawArtifactEvidence({
  title,
  evidence,
}: {
  title: string;
  evidence: DocumentChangeEvidence["rawArtifacts"]["before"];
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-600">
      <p className="font-semibold text-slate-800">{title}</p>
      {evidence ? (
        <div className="mt-2 space-y-1">
          <p className="break-all">RawArtifact {evidence.artifactId}</p>
          <p>binary {shortHash(evidence.binarySha256)}</p>
          <p>content {shortHash(evidence.contentSha256)}</p>
          <p>captured {evidenceTime(evidence.capturedAt)}</p>
          <p>published {evidenceTime(evidence.publishedAt)}</p>
          <p className="break-all">source {evidence.sourceUri}</p>
        </div>
      ) : (
        <p className="mt-2">No predecessor evidence</p>
      )}
    </div>
  );
}

function ChangeEvidenceCard({ evidence }: { evidence: DocumentChangeEvidence }) {
  const changedSections = evidence.sections;
  return (
    <article className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700">
              {evidence.changeKind}
            </span>
            <span className="text-xs text-slate-500">
              v{evidence.after.artifactVersion}
            </span>
            {evidence.before ? (
              <span className="text-xs text-slate-500">
                from v{evidence.before.artifactVersion}
              </span>
            ) : (
              <span className="text-xs text-slate-500">
                first durable version
              </span>
            )}
          </div>
          <p className="mt-2 text-sm font-semibold text-slate-900">
            {evidence.dimensions.length
              ? evidence.dimensions.join(" · ")
              : "No objective change dimension"}
          </p>
        </div>
        <time className="text-xs text-slate-500">
          {evidenceTime(evidence.observedAt)}
        </time>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <RawArtifactEvidence
          title="Previous raw evidence"
          evidence={evidence.rawArtifacts.before}
        />
        <RawArtifactEvidence
          title="Current raw evidence"
          evidence={evidence.rawArtifacts.after}
        />
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-600">
          <p className="font-semibold text-slate-800">
            Previous normalized version
          </p>
          <p className="mt-2 break-all">
            Staging {evidence.before?.stagingDocumentId ?? "—"}
          </p>
          <p className="mt-1">
            content {shortHash(evidence.before?.contentSha256)}
          </p>
          <p className="mt-1 break-all">
            source {evidence.before?.sourceUri ?? "—"}
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-600">
          <p className="font-semibold text-slate-800">
            Current normalized version
          </p>
          <p className="mt-2 break-all">
            Staging {evidence.after.stagingDocumentId}
          </p>
          <p className="mt-1">
            content {shortHash(evidence.after.contentSha256)}
          </p>
          <p className="mt-1 break-all">source {evidence.after.sourceUri}</p>
        </div>
      </div>

      {evidence.metadataChanges.length ? (
        <div className="mt-4 rounded-lg border border-slate-200 bg-white p-3">
          <p className="text-xs font-semibold text-slate-800">
            Metadata changes
          </p>
          <div className="mt-2 space-y-2">
            {evidence.metadataChanges.map((change) => (
              <div
                key={change.field}
                className="grid gap-1 text-xs md:grid-cols-[140px_1fr_1fr]"
              >
                <span className="font-medium text-slate-600">
                  {change.field}
                </span>
                <span className="break-words text-rose-700">
                  − {JSON.stringify(change.before)}
                </span>
                <span className="break-words text-emerald-700">
                  + {JSON.stringify(change.after)}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {evidence.links.added.length || evidence.links.removed.length ? (
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div className="rounded-lg border border-slate-200 bg-white p-3 text-xs">
            <p className="font-semibold text-slate-800">Links removed</p>
            <div className="mt-2 space-y-1 text-rose-700">
              {evidence.links.removed.length ? (
                evidence.links.removed.map((link) => (
                  <p key={link}>− {link}</p>
                ))
              ) : (
                <p>—</p>
              )}
            </div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-3 text-xs">
            <p className="font-semibold text-slate-800">Links added</p>
            <div className="mt-2 space-y-1 text-emerald-700">
              {evidence.links.added.length ? (
                evidence.links.added.map((link) => (
                  <p key={link}>+ {link}</p>
                ))
              ) : (
                <p>—</p>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {changedSections.length ? (
        <div className="mt-4 rounded-lg border border-slate-200 bg-white p-3">
          <p className="text-xs font-semibold text-slate-800">
            Bounded text / structure diff
          </p>
          <div className="mt-3 space-y-3">
            {changedSections.slice(0, 20).map((section, index) => (
              <div
                key={`${section.changeKind}:${section.ordinal}:${index}`}
                className="rounded-lg bg-slate-50 p-3 text-xs"
              >
                <p className="font-semibold text-slate-700">
                  {section.changeKind} ·{" "}
                  {section.headingPath.length
                    ? section.headingPath.join(" / ")
                    : "untitled section"}
                </p>
                <div className="mt-2 grid gap-2 md:grid-cols-2">
                  <pre className="whitespace-pre-wrap break-words rounded bg-rose-50 p-2 font-sans leading-5 text-rose-800">
                    − {excerpt(section.beforeText)}
                  </pre>
                  <pre className="whitespace-pre-wrap break-words rounded bg-emerald-50 p-2 font-sans leading-5 text-emerald-800">
                    + {excerpt(section.afterText)}
                  </pre>
                </div>
              </div>
            ))}
            {changedSections.length > 20 ? (
              <p className="text-xs text-slate-500">
                + {changedSections.length - 20} more sections
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      <p className="mt-4 text-[11px] leading-5 text-slate-500">
        Objective evidence only. This view does not assess legal significance,
        case materiality, or recommended action.
      </p>
    </article>
  );
}

export function EvidenceChangeReview({
  documentId,
  workspaceId,
}: {
  documentId: string;
  workspaceId: string;
}) {
  const [state, setState] = useState<ChangeReviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(
        `/api/knowledge/${encodeURIComponent(documentId)}/change-review?workspaceId=${encodeURIComponent(workspaceId)}`,
        { cache: "no-store" },
      );
      if (!response.ok) throw new Error(await readError(response));
      setState((await response.json()) as ChangeReviewResponse);
      setError(null);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to load change evidence",
      );
    } finally {
      setLoading(false);
    }
  }, [documentId, workspaceId]);

  useEffect(() => {
    void load();
  }, [load]);

  const evidence = useMemo(
    () =>
      [...(state?.evidence ?? [])].sort(
        (left, right) => right.sequence - left.sequence,
      ),
    [state?.evidence],
  );

  return (
    <section
      id="evidence-change-review"
      className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-slate-950">
            <FileDiff size={19} aria-hidden="true" />
            <h2 className="font-semibold">Evidence Change Review</h2>
          </div>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
            Compare durable Knowledge versions using immutable lineage, hashes,
            source identity, metadata, links and bounded text / structure
            changes.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-3.5 py-2 text-sm font-medium text-slate-700 disabled:opacity-40"
        >
          <RefreshCw
            size={16}
            className={loading ? "animate-spin" : ""}
            aria-hidden="true"
          />
          刷新
        </button>
      </div>

      {error ? (
        <div className="mt-5 flex gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          <AlertTriangle
            className="mt-0.5 shrink-0"
            size={18}
            aria-hidden="true"
          />
          <span>{error}</span>
        </div>
      ) : null}

      {loading && !state ? (
        <div className="mt-5 rounded-xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">
          <Loader2 className="mx-auto mb-3 animate-spin" size={20} />
          正在读取持久化变更证据…
        </div>
      ) : evidence.length === 0 ? (
        <div className="mt-5 rounded-xl border border-dashed border-slate-200 p-6 text-sm text-slate-500">
          当前文档没有可比较的持久化变更证据。首个版本或未发生客观变化时这是正常状态。
        </div>
      ) : (
        <div className="mt-5 space-y-4">
          {!state?.complete ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
              当前只显示最近 25 条持久化证据；没有把截断结果表示为完整历史。
            </div>
          ) : null}
          {evidence.map((item) => (
            <ChangeEvidenceCard key={item.id} evidence={item} />
          ))}
        </div>
      )}
    </section>
  );
}
