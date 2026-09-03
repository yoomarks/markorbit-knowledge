"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { CheckCircle2, FileUp, LoaderCircle } from "lucide-react";
import { adminBrowserMutationHeaders } from "@/lib/admin-browser-api-client";

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
const INTENT_STORAGE_PREFIX = "markorbit:manual-upload-intent:";

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
  const idempotencyKey = stored || `manual-ui:${crypto.randomUUID()}`;
  if (!stored) sessionStorage.setItem(storageKey, idempotencyKey);
  return { fingerprint, idempotencyKey, storageKey };
}

export function ManualUploadControl({ workspaceId }: { workspaceId: string }) {
  const [policy, setPolicy] = useState<ManualUploadPolicy | null>(null);
  const [policyError, setPolicyError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [result, setResult] = useState<ManualUploadResponse | null>(null);
  const [activeIntent, setActiveIntent] = useState<UploadIntent | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/manual-uploads", { signal: controller.signal })
      .then(async (response) => {
        const body = (await response.json()) as ManualUploadPolicy | unknown;
        if (!response.ok)
          throw new Error(errorMessage(body, "Unable to load Manual Upload policy"));
        setPolicy(body as ManualUploadPolicy);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setPolicyError(
          error instanceof Error ? error.message : "Unable to load Manual Upload policy",
        );
      });
    return () => controller.abort();
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setUploadError(null);
    setResult(null);
    const form = event.currentTarget;
    const input = form.elements.namedItem("manual-upload-file");
    if (!(input instanceof HTMLInputElement) || !input.files?.[0]) {
      setUploadError("请选择一个文件。");
      return;
    }
    const file = input.files[0];
    const mimeType = resolvedMimeType(file);
    if (!policy) {
      setUploadError("Manual Upload policy 尚未加载完成。");
      return;
    }
    if (!mimeType || !policy.supportedMimeTypes.includes(mimeType)) {
      setUploadError(`不支持的文件类型：${mimeType || "浏览器未识别 MIME type"}`);
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
        `${workspaceId}\n${file.name}\n${mimeType}\n${file.size}\n${contentSha256}`,
      );
      const fingerprint = await sha256(fingerprintBytes);
      const intent =
        activeIntent?.fingerprint === fingerprint ? activeIntent : uploadIntent(fingerprint);
      setActiveIntent(intent);

      const headers = await adminBrowserMutationHeaders({
        "content-type": mimeType,
        "idempotency-key": intent.idempotencyKey,
        "x-markorbit-workspace-id": workspaceId,
        "x-markorbit-filename": encodeURIComponent(file.name),
        "x-markorbit-content-size": String(file.size),
        "x-markorbit-content-sha256": contentSha256,
      });
      const response = await fetch("/api/manual-uploads", {
        method: "POST",
        headers,
        body: file,
      });
      const body = (await response.json()) as ManualUploadResponse | unknown;
      if (!response.ok) throw new Error(errorMessage(body, "Manual Upload failed"));

      sessionStorage.removeItem(intent.storageKey);
      setActiveIntent(null);
      setResult(body as ManualUploadResponse);
      form.reset();
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Manual Upload failed");
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
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <FileUp size={19} className="text-emerald-700" aria-hidden="true" />
            <h2 className="font-semibold text-slate-950">Manual Upload</h2>
          </div>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            文件会进入受控 Run / Job、流式校验与内容寻址存储，最终登记为不可变
            RawArtifact；不会绕过现有来源证据链。
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {policy
              ? `单文件上限 ${formatBytes(policy.maxBytes)} · 支持 PDF、DOCX、XLSX、CSV、JSON、XML、文本、Markdown、HTML、EML 和常见图片。`
              : "正在读取上传策略…"}
          </p>
        </div>

        <form onSubmit={submit} className="w-full max-w-xl space-y-3">
          <input
            name="manual-upload-file"
            type="file"
            accept={ACCEPTED_EXTENSIONS}
            disabled={uploading || !policy}
            onChange={() => {
              setActiveIntent(null);
              setUploadError(null);
              setResult(null);
            }}
            className="block w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium disabled:opacity-60"
          />
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
            {uploading ? "校验并上传中…" : "上传到 RawArtifact"}
          </button>
        </form>
      </div>

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
              <span>直接再次上传会复用同一幂等意图进行核对。</span>
              <button
                type="button"
                onClick={startNewIntent}
                className="font-medium underline underline-offset-2"
              >
                确认旧 Run 已失败，改为新的上传意图
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
      {result ? (
        <div className="mt-4 flex flex-col gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2">
            <CheckCircle2 size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
            <div>
              <p className="font-medium">
                {result.replayed ? "已确认同一上传记录" : "上传已完成并登记为 RawArtifact"}
              </p>
              <p className="mt-1 text-xs text-emerald-800">
                {result.artifact.originalName} · {result.artifact.status} · Auto conversion:{" "}
                {result.autoConversion.status}
              </p>
            </div>
          </div>
          <div className="flex gap-3 text-xs font-medium">
            <Link href={`/artifacts/${result.artifact.id}`} className="hover:underline">
              查看 Artifact
            </Link>
            <Link href={`/runs/${result.runId}`} className="hover:underline">
              查看 Run
            </Link>
          </div>
        </div>
      ) : null}
    </section>
  );
}
