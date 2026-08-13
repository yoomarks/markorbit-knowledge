"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { CheckCircle2, FileUp, LoaderCircle } from "lucide-react";
import type { SourceDefinition } from "@markorbit/contracts";
import type { SourceListResult } from "@markorbit/persistence";

type ManualUploadPolicy = {
  maxBytes: number;
  supportedMimeTypes: string[];
};

type ManualUploadResponse = {
  artifact: {
    id: string;
    originalName: string;
    status: string;
  };
  replayed: boolean;
  runId: string;
  sourceId: string;
  sourceName: string;
  autoConversion: {
    status: string;
    code?: string;
  };
};

type UploadIntent = {
  fingerprint: string;
  idempotencyKey: string;
  storageKey: string;
};

const ACCEPTED_EXTENSIONS =
  ".md,.html,.htm,.pdf,.docx,.xlsx,.csv,.json,.xml,.eml,.txt,.png,.jpg,.jpeg,.webp,.tif,.tiff";
const INTENT_STORAGE_PREFIX = "markorbit:source-file-intent:";

const MIME_BY_EXTENSION: Record<string, string> = {
  md: "text/markdown",
  html: "text/html",
  htm: "text/html",
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  csv: "text/csv",
  json: "application/json",
  xml: "application/xml",
  eml: "message/rfc822",
  txt: "text/plain",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  tif: "image/tiff",
  tiff: "image/tiff",
};

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KiB`;
  return `${(value / 1024 / 1024).toFixed(1)} MiB`;
}

function hex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (value) => value.toString(16).padStart(2, "0")).join("");
}

async function sha256(value: ArrayBuffer | Uint8Array): Promise<string> {
  let buffer: ArrayBuffer;
  if (value instanceof Uint8Array) {
    const copy = new Uint8Array(value.byteLength);
    copy.set(value);
    buffer = copy.buffer;
  } else {
    buffer = value;
  }
  return hex(await crypto.subtle.digest("SHA-256", buffer));
}

function resolvedMimeType(file: File): string {
  const browserType = file.type.trim().toLowerCase();
  if (browserType) return browserType;
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  return MIME_BY_EXTENSION[extension] ?? "";
}

function sourceNameFromFilename(filename: string): string {
  const dot = filename.lastIndexOf(".");
  const base = dot > 0 ? filename.slice(0, dot) : filename;
  return base.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim() || filename;
}

function errorMessage(body: unknown, fallback: string): string {
  if (!body || typeof body !== "object") return fallback;
  const error = (body as { error?: unknown }).error;
  if (!error || typeof error !== "object") return fallback;
  const message = (error as { message?: unknown }).message;
  return typeof message === "string" && message.trim() ? message : fallback;
}

function uploadIntent(fingerprint: string): UploadIntent {
  const storageKey = `${INTENT_STORAGE_PREFIX}${fingerprint}`;
  const stored = sessionStorage.getItem(storageKey)?.trim();
  const idempotencyKey = stored || `source-file-ui:${crypto.randomUUID()}`;
  if (!stored) sessionStorage.setItem(storageKey, idempotencyKey);
  return { fingerprint, idempotencyKey, storageKey };
}

export function SourceFileImport({ workspaceId }: { workspaceId: string }) {
  const [policy, setPolicy] = useState<ManualUploadPolicy | null>(null);
  const [policyError, setPolicyError] = useState<string | null>(null);
  const [sources, setSources] = useState<SourceDefinition[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [result, setResult] = useState<ManualUploadResponse | null>(null);
  const [activeIntent, setActiveIntent] = useState<UploadIntent | null>(null);
  const [sourceName, setSourceName] = useState("");
  const [jurisdictions, setJurisdictions] = useState("");
  const [languages, setLanguages] = useState("zh-CN");
  const [relatedSourceId, setRelatedSourceId] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      fetch("/api/manual-uploads", { signal: controller.signal }).then(async (response) => {
        const body = (await response.json()) as ManualUploadPolicy | unknown;
        if (!response.ok) throw new Error(errorMessage(body, "无法读取文件导入策略"));
        return body as ManualUploadPolicy;
      }),
      fetch(`/api/sources?workspaceId=${encodeURIComponent(workspaceId)}&limit=100`, {
        signal: controller.signal,
      }).then(async (response) => {
        const body = (await response.json()) as SourceListResult | unknown;
        if (!response.ok) throw new Error(errorMessage(body, "无法读取已有来源"));
        return body as SourceListResult;
      }),
    ])
      .then(([nextPolicy, sourceResult]) => {
        setPolicy(nextPolicy);
        setSources(
          sourceResult.items.filter(
            (source) =>
              !(source.sourceType === "MANUAL_UPLOAD" && source.slug === "manual-uploads"),
          ),
        );
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setPolicyError(error instanceof Error ? error.message : "无法初始化文件导入");
      });
    return () => controller.abort();
  }, [workspaceId]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setUploadError(null);
    setResult(null);
    const form = event.currentTarget;
    const input = form.elements.namedItem("source-file");
    if (!(input instanceof HTMLInputElement) || !input.files?.[0]) {
      setUploadError("请选择一个文件。");
      return;
    }
    const file = input.files[0];
    const mimeType = resolvedMimeType(file);
    if (!policy) {
      setUploadError("文件导入策略尚未加载完成。");
      return;
    }
    if (!mimeType || !policy.supportedMimeTypes.includes(mimeType)) {
      setUploadError(`不支持的文件类型：${mimeType || "浏览器未识别 MIME type"}`);
      return;
    }
    if (!sourceName.trim()) {
      setUploadError("请填写来源名称。");
      return;
    }
    if (file.size <= 0) {
      setUploadError("空文件不能上传。");
      return;
    }
    if (file.size > policy.maxBytes) {
      setUploadError(`文件超过 ${formatBytes(policy.maxBytes)} 的上传限制。`);
      return;
    }

    setUploading(true);
    try {
      const contentBytes = await file.arrayBuffer();
      const contentSha256 = await sha256(contentBytes);
      const fingerprintBytes = new TextEncoder().encode(
        [
          workspaceId,
          file.name,
          mimeType,
          String(file.size),
          contentSha256,
          sourceName.trim(),
          jurisdictions.trim().toUpperCase(),
          languages.trim(),
          relatedSourceId,
        ].join("\n"),
      );
      const fingerprint = await sha256(fingerprintBytes);
      const intent =
        activeIntent?.fingerprint === fingerprint ? activeIntent : uploadIntent(fingerprint);
      setActiveIntent(intent);

      const headers: Record<string, string> = {
        "content-type": mimeType,
        "idempotency-key": intent.idempotencyKey,
        "x-markorbit-workspace-id": workspaceId,
        "x-markorbit-filename": encodeURIComponent(file.name),
        "x-markorbit-content-size": String(file.size),
        "x-markorbit-content-sha256": contentSha256,
        "x-markorbit-source-name": encodeURIComponent(sourceName.trim()),
      };
      if (jurisdictions.trim()) {
        headers["x-markorbit-jurisdictions"] = encodeURIComponent(
          jurisdictions.trim().toUpperCase(),
        );
      }
      if (languages.trim()) {
        headers["x-markorbit-languages"] = encodeURIComponent(languages.trim());
      }
      if (relatedSourceId) headers["x-markorbit-related-source-id"] = relatedSourceId;

      const response = await fetch("/api/manual-uploads", {
        method: "POST",
        headers,
        body: file,
      });
      const body = (await response.json()) as ManualUploadResponse | unknown;
      if (!response.ok) throw new Error(errorMessage(body, "文件来源导入失败"));

      sessionStorage.removeItem(intent.storageKey);
      setActiveIntent(null);
      setResult(body as ManualUploadResponse);
      form.reset();
      setSourceName("");
      setJurisdictions("");
      setRelatedSourceId("");
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "文件来源导入失败");
    } finally {
      setUploading(false);
    }
  }

  function startNewIntent() {
    if (activeIntent) sessionStorage.removeItem(activeIntent.storageKey);
    setActiveIntent(null);
    setUploadError(null);
    setResult(null);
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-700">
          <FileUp size={19} aria-hidden="true" />
        </span>
        <div>
          <h2 className="font-semibold text-slate-950">导入文件来源</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
            每份文件会建立自己的 Source，并自动创建默认采集计划和不可变 RawArtifact 证据。Raw
            Artifacts 只保存证据，不再作为另一条来源创建路径。
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {policy
              ? `单文件上限 ${formatBytes(policy.maxBytes)} · 支持 PDF、DOCX、XLSX、CSV、JSON、XML、文本、Markdown、HTML、EML 和常见图片。`
              : "正在读取导入策略…"}
          </p>
        </div>
      </div>

      <form onSubmit={submit} className="mt-5 grid gap-4 lg:grid-cols-2">
        <label className="lg:col-span-2">
          <span className="text-sm font-medium text-slate-800">文件</span>
          <input
            name="source-file"
            type="file"
            accept={ACCEPTED_EXTENSIONS}
            disabled={uploading || !policy}
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              if (file) setSourceName(sourceNameFromFilename(file.name));
              setActiveIntent(null);
              setUploadError(null);
              setResult(null);
            }}
            className="mt-2 block w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium disabled:opacity-60"
          />
        </label>
        <label>
          <span className="text-sm font-medium text-slate-800">来源名称</span>
          <input
            value={sourceName}
            onChange={(event) => setSourceName(event.target.value)}
            placeholder="例如：中华人民共和国商标法"
            className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm"
          />
        </label>
        <label>
          <span className="text-sm font-medium text-slate-800">关联已有来源（可选）</span>
          <select
            value={relatedSourceId}
            onChange={(event) => setRelatedSourceId(event.target.value)}
            className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm"
          >
            <option value="">不关联</option>
            {sources.map((source) => (
              <option key={source.id} value={source.id}>
                {source.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="text-sm font-medium text-slate-800">国家 / 地区</span>
          <input
            value={jurisdictions}
            onChange={(event) => setJurisdictions(event.target.value)}
            placeholder="例如 CN，多个用逗号分隔"
            className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm"
          />
        </label>
        <label>
          <span className="text-sm font-medium text-slate-800">语言</span>
          <input
            value={languages}
            onChange={(event) => setLanguages(event.target.value)}
            placeholder="例如 zh-CN"
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
            {uploading ? "创建来源并导入…" : "创建来源并导入文件"}
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
          {activeIntent ? (
            <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
              <span>再次提交会复用同一幂等意图进行核对。</span>
              <button
                type="button"
                onClick={startNewIntent}
                className="font-medium underline underline-offset-2"
              >
                改为新的导入意图
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
      {result ? (
        <div className="mt-4 flex flex-col gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2">
            <CheckCircle2 size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
            <div>
              <p className="font-medium">
                {result.replayed ? "已确认同一导入记录" : "来源已建立，文件已进入证据链"}
              </p>
              <p className="mt-1 text-xs text-emerald-800">
                {result.sourceName} · {result.artifact.originalName} · Auto conversion:{" "}
                {result.autoConversion.status}
              </p>
            </div>
          </div>
          <Link
            href={`/sources/${result.sourceId}`}
            className="text-xs font-semibold hover:underline"
          >
            查看来源 →
          </Link>
        </div>
      ) : null}
    </section>
  );
}
