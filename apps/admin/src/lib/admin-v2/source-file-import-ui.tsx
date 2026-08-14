"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { CheckCircle2, FileUp, LoaderCircle } from "lucide-react";
import type { SourceDefinition } from "@markorbit/contracts";
import type { SourceListResult } from "@markorbit/persistence";
import { useAdminI18n } from "@/lib/i18n";
import { intakeT, type IntakeMessageKey, type IntakeMessageParams } from "@/lib/intake-i18n";
import {
  ACCEPTED_SOURCE_FILE_EXTENSIONS,
  formatSourceFileBytes,
  resolvedSourceFileMime,
  sourceNameFromFile,
  uploadManualSource,
  type ManualUploadResult,
} from "@/lib/admin-v2/manual-upload-request";
import { newManualUploadRequestKey } from "@/lib/admin-v2/manual-upload-key";

type ManualUploadPolicy = {
  maxBytes: number;
  supportedMimeTypes: string[];
};

async function responseError(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: string }; message?: string };
    return body.error?.message ?? body.message ?? fallback;
  } catch {
    return fallback;
  }
}

export function SourceFileImportUi({ workspaceId }: { workspaceId: string }) {
  const { locale } = useAdminI18n();
  const t = useCallback(
    (key: IntakeMessageKey, params?: IntakeMessageParams) => intakeT(locale, key, params),
    [locale],
  );
  const [policy, setPolicy] = useState<ManualUploadPolicy | null>(null);
  const [sources, setSources] = useState<SourceDefinition[]>([]);
  const [policyError, setPolicyError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<ManualUploadResult | null>(null);
  const [sourceName, setSourceName] = useState("");
  const [jurisdictions, setJurisdictions] = useState("");
  const [languages, setLanguages] = useState("zh-CN");
  const [relatedSourceId, setRelatedSourceId] = useState("");
  const [idempotencyKey, setIdempotencyKey] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      fetch("/api/manual-uploads", { signal: controller.signal }).then(async (response) => {
        if (!response.ok) throw new Error(await responseError(response, t("errorPolicy")));
        return (await response.json()) as ManualUploadPolicy;
      }),
      fetch(
        `/api/sources?workspaceId=${encodeURIComponent(workspaceId)}&limit=100&hideLegacySystem=true`,
        { signal: controller.signal },
      ).then(async (response) => {
        if (!response.ok) throw new Error(await responseError(response, t("errorSources")));
        return (await response.json()) as SourceListResult;
      }),
    ])
      .then(([nextPolicy, sourceResult]) => {
        setPolicy(nextPolicy);
        setSources(sourceResult.items);
        setPolicyError(null);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setPolicyError(error instanceof Error ? error.message : t("errorInit"));
      });
    return () => controller.abort();
  }, [t, workspaceId]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setUploadError(null);
    setResult(null);
    const form = event.currentTarget;
    const fileInput = form.elements.namedItem("source-file");
    if (!(fileInput instanceof HTMLInputElement) || !fileInput.files?.[0]) {
      setUploadError(t("errorChooseFile"));
      return;
    }
    const file = fileInput.files[0];
    if (!policy) {
      setUploadError(t("errorPolicyPending"));
      return;
    }
    const mimeType = resolvedSourceFileMime(file);
    if (!mimeType || !policy.supportedMimeTypes.includes(mimeType)) {
      setUploadError(t("errorUnsupported", { type: mimeType || t("unknownMime") }));
      return;
    }
    if (!sourceName.trim()) {
      setUploadError(t("errorSourceName"));
      return;
    }
    if (file.size <= 0) {
      setUploadError(t("errorEmptyFile"));
      return;
    }
    if (file.size > policy.maxBytes) {
      setUploadError(t("errorTooLarge", { size: formatSourceFileBytes(policy.maxBytes) }));
      return;
    }

    const requestKey = idempotencyKey || newManualUploadRequestKey();
    if (!idempotencyKey) setIdempotencyKey(requestKey);
    setUploading(true);
    try {
      const nextResult = await uploadManualSource({
        workspaceId,
        file,
        sourceName,
        jurisdictions,
        languages,
        relatedSourceId,
        idempotencyKey: requestKey,
      });
      setResult(nextResult);
      setIdempotencyKey("");
      setSourceName("");
      setJurisdictions("");
      setRelatedSourceId("");
      form.reset();
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : t("errorUpload"));
    } finally {
      setUploading(false);
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-700">
          <FileUp size={19} aria-hidden="true" />
        </span>
        <div>
          <h2 className="font-semibold text-slate-950">{t("importTitle")}</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
            {t("importDescription")}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {policy
              ? t("importPolicy", { size: formatSourceFileBytes(policy.maxBytes) })
              : t("importPolicyLoading")}
          </p>
        </div>
      </div>

      <form onSubmit={submit} className="mt-5 grid gap-4 lg:grid-cols-2">
        <label className="lg:col-span-2">
          <span className="text-sm font-medium text-slate-800">{t("file")}</span>
          <input
            name="source-file"
            type="file"
            accept={ACCEPTED_SOURCE_FILE_EXTENSIONS}
            disabled={uploading || !policy}
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              if (file) setSourceName(sourceNameFromFile(file.name));
              setIdempotencyKey("");
              setUploadError(null);
              setResult(null);
            }}
            className="mt-2 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium disabled:opacity-60"
          />
        </label>
        <label>
          <span className="text-sm font-medium text-slate-800">{t("sourceName")}</span>
          <input
            value={sourceName}
            onChange={(event) => {
              setSourceName(event.target.value);
              setIdempotencyKey("");
            }}
            placeholder={t("sourceNamePlaceholder")}
            className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm"
          />
        </label>
        <label>
          <span className="text-sm font-medium text-slate-800">{t("relatedSource")}</span>
          <select
            value={relatedSourceId}
            onChange={(event) => {
              setRelatedSourceId(event.target.value);
              setIdempotencyKey("");
            }}
            className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm"
          >
            <option value="">{t("noRelatedSource")}</option>
            {sources.map((source) => (
              <option key={source.id} value={source.id}>
                {source.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="text-sm font-medium text-slate-800">{t("jurisdictions")}</span>
          <input
            value={jurisdictions}
            onChange={(event) => {
              setJurisdictions(event.target.value);
              setIdempotencyKey("");
            }}
            placeholder={t("jurisdictionsPlaceholder")}
            className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm"
          />
        </label>
        <label>
          <span className="text-sm font-medium text-slate-800">{t("language")}</span>
          <input
            value={languages}
            onChange={(event) => {
              setLanguages(event.target.value);
              setIdempotencyKey("");
            }}
            placeholder={t("languagePlaceholder")}
            className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm"
          />
        </label>
        <div className="lg:col-span-2">
          <button
            type="submit"
            disabled={uploading || !policy}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {uploading ? (
              <LoaderCircle size={17} className="animate-spin" aria-hidden="true" />
            ) : (
              <FileUp size={17} aria-hidden="true" />
            )}
            {uploading ? t("importing") : t("importFile")}
          </button>
        </div>
      </form>

      {policyError ? (
        <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
          {policyError}
        </div>
      ) : null}
      {uploadError ? (
        <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
          <p>{uploadError}</p>
          {idempotencyKey ? <p className="mt-2 text-xs">{t("intentHint")}</p> : null}
        </div>
      ) : null}
      {result ? (
        <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 shrink-0 text-emerald-700" size={18} />
            <div className="min-w-0 flex-1">
              <p className="font-medium">{t("importSuccess")}</p>
              <p className="mt-1 text-xs text-emerald-800/80">
                {result.sourceName} · {result.artifact.originalName}
              </p>
              {result.replayed ? <p className="mt-2 text-xs">{t("replayed")}</p> : null}
              <div className="mt-3 flex flex-wrap gap-3 text-xs font-semibold">
                <Link
                  href={`/sources/${result.sourceId}`}
                  className="text-emerald-800 hover:underline"
                >
                  {t("viewImportedSource")} →
                </Link>
                <Link
                  href={`/artifacts/${result.artifact.id}`}
                  className="text-emerald-800 hover:underline"
                >
                  {t("viewArtifact")} →
                </Link>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
