import { createHash } from "node:crypto";
import {
  tmclassRoute,
  tmclassSourcePageFromDomProjection,
  type TmclassDomProjection,
} from "@markorbit/worker-runtime";
import type { TmclassSourcePageV1 } from "@markorbit/contracts";

const DEFAULT_MAX_RESPONSE_BYTES = 5 * 1024 * 1024;
const DEFAULT_MAX_PAGES = 5_000;

export type TmclassHarHtmlEntry = {
  sourceUri: string;
  observedAt: string;
  responseSha256: string;
  html: string;
};

export type TmclassHarPageCapture = Omit<TmclassHarHtmlEntry, "html"> & {
  page: TmclassSourcePageV1;
};

export interface TmclassHarProjectionPage {
  setContent(
    html: string,
    options: { waitUntil: "domcontentloaded"; timeout: number },
  ): Promise<void>;
  project(): Promise<TmclassDomProjection>;
}

type JsonRecord = Record<string, unknown>;

function record(value: unknown, label: string): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`TMCLASS_HAR_${label}_INVALID`);
  }
  return value as JsonRecord;
}

function array(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`TMCLASS_HAR_${label}_INVALID`);
  return value;
}

function string(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`TMCLASS_HAR_${label}_INVALID`);
  }
  return value;
}

function responseText(content: JsonRecord): string {
  const raw = string(content.text, "RESPONSE_TEXT");
  const bytes =
    content.encoding === "base64" ? Buffer.from(raw, "base64") : Buffer.from(raw, "utf8");
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

function isSupportedUri(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    tmclassRoute(value);
    return true;
  } catch {
    return false;
  }
}

export function tmclassHtmlEntriesFromHar(
  value: unknown,
  options: { maxResponseBytes?: number; maxPages?: number } = {},
): TmclassHarHtmlEntry[] {
  const maxResponseBytes = options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;
  const maxPages = options.maxPages ?? DEFAULT_MAX_PAGES;
  if (!Number.isSafeInteger(maxResponseBytes) || maxResponseBytes < 1) {
    throw new Error("TMCLASS_HAR_MAX_RESPONSE_BYTES_INVALID");
  }
  if (!Number.isSafeInteger(maxPages) || maxPages < 1) {
    throw new Error("TMCLASS_HAR_MAX_PAGES_INVALID");
  }
  const root = record(value, "ROOT");
  const log = record(root.log, "LOG");
  const entries = array(log.entries, "ENTRIES");
  const seen = new Set<string>();
  const result: TmclassHarHtmlEntry[] = [];
  for (const rawEntry of entries) {
    const entry = record(rawEntry, "ENTRY");
    const request = record(entry.request, "REQUEST");
    if (request.method !== "GET" || !isSupportedUri(request.url)) continue;
    const response = record(entry.response, "RESPONSE");
    if (response.status !== 200) continue;
    const content = record(response.content, "CONTENT");
    const mimeType = typeof content.mimeType === "string" ? content.mimeType.toLowerCase() : "";
    if (!mimeType.includes("html")) continue;
    const html = responseText(content);
    const bytes = Buffer.byteLength(html, "utf8");
    if (bytes > maxResponseBytes) throw new Error("TMCLASS_HAR_RESPONSE_TOO_LARGE");
    const responseSha256 = createHash("sha256").update(html).digest("hex");
    const identity = `${request.url}\n${responseSha256}`;
    if (seen.has(identity)) continue;
    seen.add(identity);
    const observedAt = string(entry.startedDateTime, "OBSERVED_AT");
    if (!Number.isFinite(Date.parse(observedAt)))
      throw new Error("TMCLASS_HAR_OBSERVED_AT_INVALID");
    result.push({ sourceUri: request.url, observedAt, responseSha256, html });
    if (result.length > maxPages) throw new Error("TMCLASS_HAR_PAGE_LIMIT_EXCEEDED");
  }
  return result;
}

export async function extractTmclassHarPages(
  har: unknown,
  page: TmclassHarProjectionPage,
  options: { maxResponseBytes?: number; maxPages?: number } = {},
): Promise<TmclassHarPageCapture[]> {
  const entries = tmclassHtmlEntriesFromHar(har, options);
  const captures: TmclassHarPageCapture[] = [];
  for (const entry of entries) {
    await page.setContent(entry.html, { waitUntil: "domcontentloaded", timeout: 30_000 });
    captures.push({
      sourceUri: entry.sourceUri,
      observedAt: entry.observedAt,
      responseSha256: entry.responseSha256,
      page: tmclassSourcePageFromDomProjection(entry.sourceUri, await page.project()),
    });
  }
  return captures;
}
