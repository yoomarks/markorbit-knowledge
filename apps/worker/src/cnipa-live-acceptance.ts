import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  CNIPA_CANDIDATE_ENDPOINTS,
  type CnipaAuthenticatedRequest,
  type CnipaAuthenticatedSessionExecutor,
  type CnipaDocumentKind,
  type CnipaSessionSecurityState,
} from "@markorbit/worker-runtime";
import type { CnipaAuthenticatedSessionExecutorFactory } from "@markorbit/worker-runtime/cnipa-artifact-acquirer";

const PROBE_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const FIELD_NAME_PATTERN = /^[A-Za-z0-9_.-]{1,128}$/;
const SENSITIVE_FIELD = /(?:^|[-_.])(authorization|cookie|token|secret|password|passwd|credential|auth|api[-_.]?key|access[-_.]?key)(?:$|[-_.])/i;
const MAX_PROBES = 50;
const MAX_FIELDS = 30;
const MAX_STRING_VALUE_LENGTH = 4_096;

export type CnipaLiveAcceptanceProbe = {
  id: string;
  documentKind: CnipaDocumentKind;
  surface: "LIST" | "DETAIL";
  method: "GET" | "POST";
  path: string;
  query?: Record<string, string>;
  jsonBody?: Record<string, string | number>;
};

export type CnipaLiveAcceptancePlan = {
  version: 1;
  probes: CnipaLiveAcceptanceProbe[];
};

export type CnipaLiveAcceptanceManifestEntry = {
  probeId: string;
  documentKind: CnipaDocumentKind;
  surface: "LIST" | "DETAIL";
  method: "GET" | "POST";
  path: string;
  requestSha256: string;
  queryKeys: string[];
  jsonBodyKeys: string[];
  responseFile: string | null;
  responseSha256: string | null;
  responseBytes: number;
  status: number;
  securityState: CnipaSessionSecurityState;
  sourceUri: string;
  observedAt: string;
  contentType: string;
  jsonValid: boolean | null;
};

export type CnipaLiveAcceptanceManifest = {
  schema: "markorbit-cnipa-live-acceptance-v1";
  generatedAt: string;
  planSha256: string;
  probeCount: number;
  successfulProbeCount: number;
  failedProbeCount: number;
  entries: CnipaLiveAcceptanceManifestEntry[];
};

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function fail(message: string): never {
  throw new Error(`CNIPA live acceptance plan invalid: ${message}`);
}

function assertOnlyKeys(input: Record<string, unknown>, allowed: readonly string[], label: string) {
  const allowedSet = new Set(allowed);
  const unexpected = Object.keys(input).filter((key) => !allowedSet.has(key));
  if (unexpected.length > 0) fail(`${label} contains unsupported keys: ${unexpected.join(", ")}`);
}

function fieldName(value: string, label: string): string {
  if (!FIELD_NAME_PATTERN.test(value) || SENSITIVE_FIELD.test(value)) {
    fail(`${label} is invalid or credential-like`);
  }
  return value;
}

function boundedString(value: unknown, label: string): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > MAX_STRING_VALUE_LENGTH ||
    /[\u0000\r\n]/.test(value)
  ) {
    fail(`${label} must be a non-empty bounded string without control characters`);
  }
  return value;
}

function query(value: unknown, label: string): Record<string, string> | undefined {
  if (value === undefined) return undefined;
  const input = record(value);
  if (!input) fail(`${label} must be an object`);
  const entries = Object.entries(input);
  if (entries.length === 0 || entries.length > MAX_FIELDS) fail(`${label} has an invalid field count`);
  const result: Record<string, string> = {};
  for (const [key, raw] of entries) {
    result[fieldName(key, `${label} key`)] = boundedString(raw, `${label}.${key}`);
  }
  return result;
}

function jsonBody(value: unknown, label: string): Record<string, string | number> | undefined {
  if (value === undefined) return undefined;
  const input = record(value);
  if (!input) fail(`${label} must be an object`);
  const entries = Object.entries(input);
  if (entries.length === 0 || entries.length > MAX_FIELDS) fail(`${label} has an invalid field count`);
  const result: Record<string, string | number> = {};
  for (const [key, raw] of entries) {
    const safeKey = fieldName(key, `${label} key`);
    if (typeof raw === "number") {
      if (!Number.isSafeInteger(raw)) fail(`${label}.${key} must be a safe integer or string`);
      result[safeKey] = raw;
    } else {
      result[safeKey] = boundedString(raw, `${label}.${key}`);
    }
  }
  return result;
}

function documentKind(value: unknown): CnipaDocumentKind {
  if (
    value !== "REGISTRATION_EXAMINATION" &&
    value !== "OPPOSITION_DECISION" &&
    value !== "REVIEW_ADJUDICATION"
  ) {
    fail(`unsupported documentKind ${String(value)}`);
  }
  return value;
}

function probe(value: unknown, index: number): CnipaLiveAcceptanceProbe {
  const input = record(value);
  if (!input) fail(`probes[${index}] must be an object`);
  assertOnlyKeys(
    input,
    ["id", "documentKind", "surface", "method", "path", "query", "jsonBody"],
    `probes[${index}]`,
  );
  if (typeof input.id !== "string" || !PROBE_ID_PATTERN.test(input.id)) {
    fail(`probes[${index}].id must be a lowercase slug`);
  }
  const kind = documentKind(input.documentKind);
  const endpoint = CNIPA_CANDIDATE_ENDPOINTS[kind];
  if (input.surface !== "LIST" && input.surface !== "DETAIL") {
    fail(`probes[${index}].surface must be LIST or DETAIL`);
  }
  const expectedMethod = input.surface === "LIST" ? "POST" : "GET";
  const expectedPath = input.surface === "LIST" ? endpoint.listPath : endpoint.detailPath;
  if (input.method !== expectedMethod) {
    fail(`probes[${index}] ${input.surface} must use ${expectedMethod}`);
  }
  if (input.path !== expectedPath) {
    fail(`probes[${index}] path must exactly match the frozen candidate ${input.surface} endpoint`);
  }
  const parsedQuery = query(input.query, `probes[${index}].query`);
  const parsedBody = jsonBody(input.jsonBody, `probes[${index}].jsonBody`);
  if (input.surface === "LIST") {
    if (parsedQuery) fail(`probes[${index}] LIST probes cannot use query parameters`);
    if (!parsedBody) fail(`probes[${index}] LIST probes require jsonBody`);
  } else {
    if (parsedBody) fail(`probes[${index}] DETAIL probes cannot use jsonBody`);
    if (!parsedQuery || Object.keys(parsedQuery).length !== 1 || !parsedQuery.id) {
      fail(`probes[${index}] DETAIL probes require exactly one id query parameter`);
    }
  }
  return {
    id: input.id,
    documentKind: kind,
    surface: input.surface,
    method: expectedMethod,
    path: expectedPath,
    ...(parsedQuery ? { query: parsedQuery } : {}),
    ...(parsedBody ? { jsonBody: parsedBody } : {}),
  };
}

export function parseCnipaLiveAcceptancePlan(value: unknown): CnipaLiveAcceptancePlan {
  const input = record(value);
  if (!input) fail("root must be an object");
  assertOnlyKeys(input, ["version", "probes"], "root");
  if (input.version !== 1) fail("version must be 1");
  if (!Array.isArray(input.probes) || input.probes.length === 0 || input.probes.length > MAX_PROBES) {
    fail(`probes must contain between 1 and ${MAX_PROBES} entries`);
  }
  const probes = input.probes.map(probe);
  const ids = new Set<string>();
  for (const item of probes) {
    if (ids.has(item.id)) fail(`duplicate probe id ${item.id}`);
    ids.add(item.id);
  }
  return { version: 1, probes };
}

export function assertPathOutsideWorkingTree(target: string, workingDirectory = process.cwd()): string {
  if (!path.isAbsolute(target)) throw new Error("CNIPA live acceptance path must be absolute");
  const resolvedTarget = path.resolve(target);
  const resolvedWorkingDirectory = path.resolve(workingDirectory);
  const relative = path.relative(resolvedWorkingDirectory, resolvedTarget);
  const inside = relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
  if (inside) throw new Error("CNIPA live acceptance plan/evidence paths must be outside the repository working tree");
  return resolvedTarget;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  }
  return value;
}

function stableJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function requestFor(item: CnipaLiveAcceptanceProbe): CnipaAuthenticatedRequest {
  return {
    method: item.method,
    path: item.path,
    documentKind: item.documentKind,
    surface: item.surface,
    ...(item.query ? { query: item.query } : {}),
    ...(item.jsonBody ? { jsonBody: item.jsonBody } : {}),
  };
}

function safeEvidenceName(index: number, probeId: string, contentType: string): string {
  const extension = contentType.toLowerCase().includes("json") ? "json" : "bin";
  return `${String(index + 1).padStart(2, "0")}-${probeId}.${extension}`;
}

function jsonValidity(contentType: string, body: Uint8Array): boolean | null {
  if (!contentType.toLowerCase().includes("json")) return null;
  try {
    JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body));
    return true;
  } catch {
    return false;
  }
}

export async function loadCnipaLiveAcceptancePlanFile(
  planPath: string,
  workingDirectory = process.cwd(),
): Promise<{ plan: CnipaLiveAcceptancePlan; planSha256: string; absolutePath: string }> {
  const absolutePath = assertPathOutsideWorkingTree(planPath, workingDirectory);
  const bytes = await readFile(absolutePath);
  const parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
  const plan = parseCnipaLiveAcceptancePlan(parsed);
  return { plan, planSha256: sha256(stableJson(plan)), absolutePath };
}

export async function runCnipaLiveAcceptancePlan(input: {
  plan: CnipaLiveAcceptancePlan;
  planSha256?: string;
  outputDirectory: string;
  sessionFactory: CnipaAuthenticatedSessionExecutorFactory;
  workingDirectory?: string;
  now?: () => Date;
}): Promise<{ manifest: CnipaLiveAcceptanceManifest; manifestPath: string }> {
  const plan = parseCnipaLiveAcceptancePlan(input.plan);
  const outputDirectory = assertPathOutsideWorkingTree(
    input.outputDirectory,
    input.workingDirectory ?? process.cwd(),
  );
  await mkdir(outputDirectory, { recursive: true });
  const now = input.now ?? (() => new Date());
  const entries: CnipaLiveAcceptanceManifestEntry[] = [];
  let session: (CnipaAuthenticatedSessionExecutor & { close(): Promise<void> }) | undefined;
  try {
    session = await input.sessionFactory.create();
    for (const [index, item] of plan.probes.entries()) {
      const request = requestFor(item);
      const response = await session.execute(request);
      const body = new Uint8Array(response.body);
      const responseFile = body.byteLength
        ? safeEvidenceName(index, item.id, response.contentType)
        : null;
      if (responseFile) await writeFile(path.join(outputDirectory, responseFile), body);
      entries.push({
        probeId: item.id,
        documentKind: item.documentKind,
        surface: item.surface,
        method: item.method,
        path: item.path,
        requestSha256: sha256(stableJson(request)),
        queryKeys: Object.keys(item.query ?? {}).sort(),
        jsonBodyKeys: Object.keys(item.jsonBody ?? {}).sort(),
        responseFile,
        responseSha256: body.byteLength ? sha256(body) : null,
        responseBytes: body.byteLength,
        status: response.status,
        securityState: response.securityState,
        sourceUri: response.sourceUri,
        observedAt: response.observedAt,
        contentType: response.contentType,
        jsonValid: jsonValidity(response.contentType, body),
      });
    }
  } finally {
    if (session) await session.close();
  }

  const successfulProbeCount = entries.filter(
    (entry) =>
      entry.securityState === "OK" &&
      entry.status >= 200 &&
      entry.status < 300 &&
      entry.jsonValid !== false,
  ).length;
  const manifest: CnipaLiveAcceptanceManifest = {
    schema: "markorbit-cnipa-live-acceptance-v1",
    generatedAt: now().toISOString(),
    planSha256: input.planSha256 ?? sha256(stableJson(plan)),
    probeCount: entries.length,
    successfulProbeCount,
    failedProbeCount: entries.length - successfulProbeCount,
    entries,
  };
  const manifestPath = path.join(outputDirectory, "manifest.json");
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return { manifest, manifestPath };
}
