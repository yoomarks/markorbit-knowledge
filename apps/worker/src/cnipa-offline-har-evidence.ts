import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  CNIPA_CANDIDATE_ENDPOINTS,
  type CnipaDocumentKind,
} from "@markorbit/worker-runtime";
import { assertPathOutsideWorkingTree } from "./cnipa-live-acceptance";

const CNIPA_HOST = "pub.sbj.cnipa.gov.cn";
const MAX_HAR_ENTRIES = 5_000;
const MAX_MATCHED_ENTRIES = 100;
const MAX_RESPONSE_BYTES = 20 * 1024 * 1024;
const MAX_TOTAL_RESPONSE_BYTES = 100 * 1024 * 1024;
const SENSITIVE_FIELD =
  /(authorization|cookie|token|secret|password|passwd|credential|api[-_.]?key|access[-_.]?key)/i;
const AUTH_FIELD = /(?:^|[-_.])auth(?:$|[-_.])/i;

type Surface = "LIST" | "DETAIL";

type Endpoint = {
  documentKind: CnipaDocumentKind;
  surface: Surface;
  path: string;
};

type HarResponseContent = {
  text?: string;
  encoding?: string;
  mimeType?: string;
};

type ParsedEvidenceEntry = {
  documentKind: CnipaDocumentKind;
  surface: Surface;
  method: "POST";
  path: string;
  queryKeys: string[];
  jsonBodyKeys: string[];
  requestBodyJsonValid: boolean | null;
  status: number;
  contentType: string;
  responseBody: Buffer | null;
  responseJsonValid: boolean | null;
};

export type CnipaOfflineHarManifestEntry = Omit<ParsedEvidenceEntry, "responseBody"> & {
  responseFile: string | null;
  responseSha256: string | null;
  responseBytes: number;
};

export type CnipaOfflineHarManifest = {
  schema: "markorbit-cnipa-offline-har-evidence-v1";
  generatedAt: string;
  sourceHarSha256: string;
  observedHost: typeof CNIPA_HOST;
  matchedEntryCount: number;
  entries: CnipaOfflineHarManifestEntry[];
};

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function endpoints(): Map<string, Endpoint> {
  const result = new Map<string, Endpoint>();
  for (const [documentKind, spec] of Object.entries(CNIPA_CANDIDATE_ENDPOINTS) as Array<
    [CnipaDocumentKind, (typeof CNIPA_CANDIDATE_ENDPOINTS)[CnipaDocumentKind]]
  >) {
    result.set(spec.listPath, { documentKind, surface: "LIST", path: spec.listPath });
    result.set(spec.detailPath, { documentKind, surface: "DETAIL", path: spec.detailPath });
  }
  return result;
}

const ENDPOINTS = endpoints();

function safeFieldNames(value: unknown): string[] {
  const input = record(value);
  if (!input) return [];
  const keys = Object.keys(input).sort();
  for (const key of keys) {
    if (SENSITIVE_FIELD.test(key) || AUTH_FIELD.test(key)) {
      throw new Error(`CNIPA HAR request body contains credential-like field name: ${key}`);
    }
  }
  return keys;
}

function parseRequestBody(postData: unknown): {
  keys: string[];
  jsonValid: boolean | null;
} {
  const input = record(postData);
  if (!input || typeof input.text !== "string" || input.text.length === 0) {
    return { keys: [], jsonValid: null };
  }
  try {
    const parsed = JSON.parse(input.text) as unknown;
    const parsedRecord = record(parsed);
    if (!parsedRecord) return { keys: [], jsonValid: false };
    return { keys: safeFieldNames(parsedRecord), jsonValid: true };
  } catch {
    return { keys: [], jsonValid: false };
  }
}

function parseResponseBody(content: unknown): {
  contentType: string;
  body: Buffer | null;
  jsonValid: boolean | null;
} {
  const input = record(content) as HarResponseContent | null;
  const contentType = typeof input?.mimeType === "string" ? input.mimeType : "application/octet-stream";
  if (!input || typeof input.text !== "string") {
    return { contentType, body: null, jsonValid: null };
  }
  if (input.encoding !== undefined && input.encoding !== "base64") {
    throw new Error(`CNIPA HAR response uses unsupported content encoding: ${String(input.encoding)}`);
  }
  const body = Buffer.from(input.text, input.encoding === "base64" ? "base64" : "utf8");
  if (body.byteLength > MAX_RESPONSE_BYTES) {
    throw new Error(`CNIPA HAR response exceeds ${MAX_RESPONSE_BYTES} bytes`);
  }
  let jsonValid: boolean | null = null;
  if (/json/i.test(contentType)) {
    try {
      JSON.parse(body.toString("utf8"));
      jsonValid = true;
    } catch {
      jsonValid = false;
    }
  }
  return { contentType, body, jsonValid };
}

function parseStatus(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value > 599) {
    throw new Error("CNIPA HAR response status must be an integer between 0 and 599");
  }
  return value;
}

function parseEntry(value: unknown): ParsedEvidenceEntry | null {
  const entry = record(value);
  const request = record(entry?.request);
  const response = record(entry?.response);
  if (!request || !response || typeof request.url !== "string") return null;

  let url: URL;
  try {
    url = new URL(request.url);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.hostname !== CNIPA_HOST) return null;
  const endpoint = ENDPOINTS.get(url.pathname);
  if (!endpoint) return null;
  if (request.method !== "POST") {
    throw new Error(`CNIPA HAR observed endpoint ${endpoint.path} must use POST`);
  }

  const queryKeys = [...new Set([...url.searchParams.keys()])].sort();
  if (endpoint.surface === "LIST" && queryKeys.length > 0) {
    throw new Error(`CNIPA HAR LIST endpoint ${endpoint.path} unexpectedly contains query parameters`);
  }
  if (endpoint.surface === "DETAIL" && (queryKeys.length !== 1 || queryKeys[0] !== "id")) {
    throw new Error(`CNIPA HAR DETAIL endpoint ${endpoint.path} must contain only the id query key`);
  }
  for (const key of queryKeys) {
    if (SENSITIVE_FIELD.test(key) || AUTH_FIELD.test(key)) {
      throw new Error(`CNIPA HAR query contains credential-like field name: ${key}`);
    }
  }

  const requestBody = parseRequestBody(request.postData);
  if (endpoint.surface === "DETAIL" && requestBody.keys.length > 0) {
    throw new Error(`CNIPA HAR DETAIL endpoint ${endpoint.path} unexpectedly contains a request body`);
  }
  const responseBody = parseResponseBody(response.content);

  return {
    documentKind: endpoint.documentKind,
    surface: endpoint.surface,
    method: "POST",
    path: endpoint.path,
    queryKeys,
    jsonBodyKeys: requestBody.keys,
    requestBodyJsonValid: requestBody.jsonValid,
    status: parseStatus(response.status),
    contentType: responseBody.contentType,
    responseBody: responseBody.body,
    responseJsonValid: responseBody.jsonValid,
  };
}

export function parseCnipaOfflineHarEvidence(value: unknown): ParsedEvidenceEntry[] {
  const root = record(value);
  const log = record(root?.log);
  if (!log || !Array.isArray(log.entries)) {
    throw new Error("CNIPA offline HAR evidence input must contain log.entries");
  }
  if (log.entries.length > MAX_HAR_ENTRIES) {
    throw new Error(`CNIPA offline HAR evidence input exceeds ${MAX_HAR_ENTRIES} entries`);
  }

  const result: ParsedEvidenceEntry[] = [];
  let totalResponseBytes = 0;
  for (const entry of log.entries) {
    const parsed = parseEntry(entry);
    if (!parsed) continue;
    result.push(parsed);
    totalResponseBytes += parsed.responseBody?.byteLength ?? 0;
    if (result.length > MAX_MATCHED_ENTRIES) {
      throw new Error(`CNIPA offline HAR evidence exceeds ${MAX_MATCHED_ENTRIES} matched entries`);
    }
    if (totalResponseBytes > MAX_TOTAL_RESPONSE_BYTES) {
      throw new Error(`CNIPA offline HAR evidence exceeds ${MAX_TOTAL_RESPONSE_BYTES} total response bytes`);
    }
  }
  if (result.length === 0) {
    throw new Error("CNIPA offline HAR evidence contains no frozen judgment endpoint entries");
  }
  return result;
}

function responseExtension(contentType: string): string {
  return /json/i.test(contentType) ? ".json" : ".bin";
}

export async function importCnipaOfflineHarEvidence(options: {
  inputPath: string;
  outputDirectory: string;
  workingDirectory?: string;
}): Promise<CnipaOfflineHarManifest> {
  const workingDirectory = options.workingDirectory ?? process.cwd();
  const inputPath = assertPathOutsideWorkingTree(options.inputPath, workingDirectory);
  const outputDirectory = assertPathOutsideWorkingTree(options.outputDirectory, workingDirectory);
  if (path.resolve(inputPath) === path.resolve(outputDirectory)) {
    throw new Error("CNIPA offline HAR input and output paths must be different");
  }

  const rawHar = await readFile(inputPath);
  let har: unknown;
  try {
    har = JSON.parse(rawHar.toString("utf8"));
  } catch {
    throw new Error("CNIPA offline HAR evidence input must be valid UTF-8 JSON");
  }
  const entries = parseCnipaOfflineHarEvidence(har);
  await mkdir(outputDirectory, { recursive: true });

  const manifestEntries: CnipaOfflineHarManifestEntry[] = [];
  for (const [index, entry] of entries.entries()) {
    const prefix = `${String(index + 1).padStart(3, "0")}-${entry.documentKind.toLowerCase()}-${entry.surface.toLowerCase()}`;
    let responseFile: string | null = null;
    let responseSha256: string | null = null;
    let responseBytes = 0;
    if (entry.responseBody) {
      responseFile = `${prefix}${responseExtension(entry.contentType)}`;
      responseSha256 = createHash("sha256").update(entry.responseBody).digest("hex");
      responseBytes = entry.responseBody.byteLength;
      await writeFile(path.join(outputDirectory, responseFile), entry.responseBody, { flag: "wx" });
    }
    const { responseBody: _responseBody, ...safeEntry } = entry;
    manifestEntries.push({
      ...safeEntry,
      responseFile,
      responseSha256,
      responseBytes,
    });
  }

  const manifest: CnipaOfflineHarManifest = {
    schema: "markorbit-cnipa-offline-har-evidence-v1",
    generatedAt: new Date().toISOString(),
    sourceHarSha256: createHash("sha256").update(rawHar).digest("hex"),
    observedHost: CNIPA_HOST,
    matchedEntryCount: manifestEntries.length,
    entries: manifestEntries,
  };
  await writeFile(path.join(outputDirectory, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, {
    flag: "wx",
  });
  return manifest;
}
