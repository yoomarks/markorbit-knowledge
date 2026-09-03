import { adminBrowserMutationHeaders } from "@/lib/admin-browser-api-client";
import { sha256Hex } from "@/lib/admin-v2/manual-upload-client";

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

export const ACCEPTED_SOURCE_FILE_EXTENSIONS =
  ".md,.html,.htm,.pdf,.docx,.xlsx,.csv,.json,.xml,.eml,.txt,.png,.jpg,.jpeg,.webp,.tif,.tiff";

export function formatSourceFileBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KiB`;
  return `${(value / 1024 / 1024).toFixed(1)} MiB`;
}

export function resolvedSourceFileMime(file: File): string {
  const browserType = file.type.trim().toLowerCase();
  if (browserType) return browserType;
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  return MIME_BY_EXTENSION[extension] ?? "";
}

export function sourceNameFromFile(filename: string): string {
  const dot = filename.lastIndexOf(".");
  const base = dot > 0 ? filename.slice(0, dot) : filename;
  return base.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim() || filename;
}

export type ManualUploadResult = {
  artifact: { id: string; originalName: string; status: string };
  replayed: boolean;
  runId: string;
  sourceId: string;
  sourceName: string;
  autoConversion: { status: string; code?: string };
};

export async function uploadManualSource(input: {
  workspaceId: string;
  file: File;
  sourceName: string;
  jurisdictions: string;
  languages: string;
  relatedSourceId: string;
  idempotencyKey: string;
}): Promise<ManualUploadResult> {
  const mimeType = resolvedSourceFileMime(input.file);
  const bytes = await input.file.arrayBuffer();
  const contentSha256 = await sha256Hex(bytes);
  const headers = await adminBrowserMutationHeaders({
    "content-type": mimeType,
    "idempotency-key": input.idempotencyKey,
    "x-markorbit-workspace-id": input.workspaceId,
    "x-markorbit-filename": encodeURIComponent(input.file.name),
    "x-markorbit-content-size": String(input.file.size),
    "x-markorbit-content-sha256": contentSha256,
    "x-markorbit-source-name": encodeURIComponent(input.sourceName.trim()),
  });
  if (input.jurisdictions.trim()) {
    headers.set(
      "x-markorbit-jurisdictions",
      encodeURIComponent(input.jurisdictions.trim().toUpperCase()),
    );
  }
  if (input.languages.trim()) {
    headers.set("x-markorbit-languages", encodeURIComponent(input.languages.trim()));
  }
  if (input.relatedSourceId) {
    headers.set("x-markorbit-related-source-id", input.relatedSourceId);
  }

  const response = await fetch("/api/manual-uploads", {
    method: "POST",
    headers,
    body: input.file,
  });
  const body = (await response.json()) as ManualUploadResult | { error?: { message?: string } };
  if (!response.ok) {
    const message = "error" in body ? body.error?.message : undefined;
    throw new Error(message ?? `Request failed (${response.status})`);
  }
  return body as ManualUploadResult;
}
