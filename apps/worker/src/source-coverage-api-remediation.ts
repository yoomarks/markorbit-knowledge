import { createHash } from "node:crypto";
import { API_CONNECTOR_ID, API_CONNECTOR_VERSION } from "@markorbit/worker-runtime";
import type { CoverageTarget } from "./source-coverage-bootstrap";
import {
  foundationalSupplyCapabilityGaps,
  type SupplyCapabilityGap,
} from "./source-coverage-capability-gaps";

const BINDING_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SENSITIVE_QUERY_KEY =
  /(?:^|[-_.])(token|secret|password|passwd|credential|authorization|auth|api[-_.]?key|access[-_.]?key)(?:$|[-_.])/i;
const MIME_BY_ARTIFACT_KIND: Readonly<Record<string, string>> = {
  JSON: "application/json",
  XML: "application/xml",
  CSV: "text/csv",
  TEXT: "text/plain",
};

type JsonRecord = Record<string, unknown>;
type FetchLike = typeof fetch;

export type FoundationalApiBindingSpec = {
  targetId: string;
  endpointBinding: string;
  resourcePath: string;
  query?: Record<string, string>;
  timeoutMs?: number;
  maxResponseBytes?: number;
};

export type FoundationalApiRemediationEntry = {
  targetId: string;
  endpointBinding: string;
  artifactKinds: string[];
  sourceState: "PLANNED" | "CREATED" | "REUSED";
  sourceId: string | null;
  planState: "PLANNED" | "CREATED" | "REUSED";
  planId: string | null;
  workerEndpointBindingRequired: true;
};

export type PrepareFoundationalApiRemediationOptions = {
  baseUrl: string;
  workspaceId: string;
  jurisdiction: string;
  bindings: FoundationalApiBindingSpec[];
  apply?: boolean;
  fetchImpl?: FetchLike;
};

function record(value: unknown): JsonRecord | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`Missing ${field}`);
  return value;
}

function normalizedBaseUrl(raw: string): string {
  const url = new URL(raw);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Control-plane URL must use http or https");
  }
  return url.toString().replace(/\/$/u, "");
}

async function requestJson(
  fetchImpl: FetchLike,
  baseUrl: string,
  path: string,
  init: RequestInit = {},
  allowedStatuses: number[] = [],
): Promise<{ status: number; body: unknown }> {
  const response = await fetchImpl(`${baseUrl}${path}`, init);
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  if (!response.ok && !allowedStatuses.includes(response.status)) {
    const error = record(record(body)?.error);
    const message = typeof error?.message === "string" ? error.message : `HTTP ${response.status}`;
    throw new Error(`${path}: ${message}`);
  }
  return { status: response.status, body };
}

function jsonPost(body: unknown): RequestInit {
  return {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}

function normalizeResourcePath(value: string): string {
  if (
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.length > 2_048 ||
    value.includes("\\") ||
    value.includes("?") ||
    value.includes("#") ||
    value.includes("\u0000")
  ) {
    throw new Error("API remediation resourcePath must be one bounded absolute path");
  }
  for (const segment of value.split("/").slice(1)) {
    if (!segment) continue;
    let decoded: string;
    try {
      decoded = decodeURIComponent(segment);
    } catch {
      throw new Error("API remediation resourcePath contains invalid percent encoding");
    }
    if (
      decoded === "." ||
      decoded === ".." ||
      decoded.includes("/") ||
      decoded.includes("\\") ||
      /[\u0000-\u001f\u007f]/u.test(decoded)
    ) {
      throw new Error("API remediation resourcePath contains an unsafe encoded path segment");
    }
  }
  return value;
}

function normalizeQuery(value: Record<string, string> | undefined): Record<string, string> {
  if (!value) return {};
  const entries = Object.entries(value);
  if (entries.length > 50) throw new Error("API remediation query may contain at most 50 entries");
  const normalized: Record<string, string> = {};
  for (const [key, queryValue] of entries) {
    if (
      !key ||
      key.length > 100 ||
      SENSITIVE_QUERY_KEY.test(key) ||
      /[\u0000-\u001f\u007f]/u.test(key)
    ) {
      throw new Error("API remediation query contains an invalid or credential-like key");
    }
    if (
      typeof queryValue !== "string" ||
      queryValue.length > 2_048 ||
      /[\u0000\r\n]/u.test(queryValue)
    ) {
      throw new Error(`API remediation query value for ${key} must be a bounded string`);
    }
    normalized[key] = queryValue;
  }
  const serialized = new URLSearchParams(
    Object.entries(normalized).sort(([left], [right]) => left.localeCompare(right)),
  ).toString();
  if (serialized.length > 8_192) throw new Error("API remediation query exceeds serialized bound");
  return normalized;
}

function boundedInteger(
  value: number | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
  field: string,
): number {
  if (value === undefined) return fallback;
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${field} must be an integer between ${minimum} and ${maximum}`);
  }
  return value;
}

function normalizedBinding(spec: FoundationalApiBindingSpec): Required<FoundationalApiBindingSpec> {
  const targetId = spec.targetId.trim();
  if (!targetId) throw new Error("API remediation targetId is required");
  const endpointBinding = spec.endpointBinding.trim();
  if (!BINDING_ID_PATTERN.test(endpointBinding)) {
    throw new Error(`API remediation endpointBinding for ${targetId} must be a lowercase slug`);
  }
  return {
    targetId,
    endpointBinding,
    resourcePath: normalizeResourcePath(spec.resourcePath),
    query: normalizeQuery(spec.query),
    timeoutMs: boundedInteger(spec.timeoutMs, 30_000, 1_000, 120_000, "timeoutMs"),
    maxResponseBytes: boundedInteger(
      spec.maxResponseBytes,
      10 * 1024 * 1024,
      1,
      100 * 1024 * 1024,
      "maxResponseBytes",
    ),
  };
}

function logicalApiUri(spec: Required<FoundationalApiBindingSpec>): string {
  const digest = createHash("sha256")
    .update(
      JSON.stringify({
        binding: spec.endpointBinding,
        path: spec.resourcePath,
        query: Object.entries(spec.query).sort(([left], [right]) => left.localeCompare(right)),
      }),
    )
    .digest("hex");
  return `api://${spec.endpointBinding}/${digest}`;
}

function sourceSlug(targetId: string, endpointBinding: string): string {
  const suffix = createHash("sha256").update(endpointBinding).digest("hex").slice(0, 10);
  const slug = `coverage-api-${targetId}-${suffix}`.toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(slug)) {
    throw new Error(`Coverage target ${targetId} cannot be converted to a valid API source slug`);
  }
  return slug;
}

function apiGapForTarget(target: CoverageTarget, gaps: SupplyCapabilityGap[]): SupplyCapabilityGap {
  const gap = gaps.find((item) => item.targetId === target.id);
  if (!gap?.remediation.apiBinding) {
    throw new Error(`Foundational target ${target.id} does not require API remediation`);
  }
  return gap;
}

export function foundationalApiSourcePayload(
  target: CoverageTarget,
  workspaceId: string,
  rawSpec: FoundationalApiBindingSpec,
): JsonRecord {
  const spec = normalizedBinding(rawSpec);
  if (spec.targetId !== target.id) throw new Error("API remediation binding targetId mismatch");
  const gap = apiGapForTarget(target, foundationalSupplyCapabilityGaps([target]));
  const artifactKinds = gap.remediation.apiBinding!.artifactKinds;
  const acceptedMimeTypes = artifactKinds
    .map((kind) => MIME_BY_ARTIFACT_KIND[kind])
    .filter(Boolean);
  const uri = logicalApiUri(spec);
  return {
    workspaceId,
    name: `${target.displayName} — Structured API Evidence`,
    slug: sourceSlug(target.id, spec.endpointBinding),
    sourceType: "API",
    category: target.category,
    authorityLevel: target.authorityLevel,
    status: "ACTIVE",
    jurisdictions: [target.jurisdiction],
    languages: target.languages,
    connector: { connectorId: API_CONNECTOR_ID, version: API_CONNECTOR_VERSION },
    connectorConfig: {
      endpointBinding: spec.endpointBinding,
      resourcePath: spec.resourcePath,
      query: spec.query,
      timeoutMs: spec.timeoutMs,
      maxResponseBytes: spec.maxResponseBytes,
      acceptedMimeTypes,
    },
    canonicalUri: uri,
    entrypoints: [{ uri, label: `${target.displayName} structured endpoint` }],
    tags: [
      "official",
      "source-coverage-api-remediation",
      target.coverageTier.toLowerCase(),
      target.jurisdiction.toLowerCase(),
    ],
    extensions: {
      "x-markorbit-source-coverage-remediation-target-id": target.id,
      "x-markorbit-source-coverage-protocol": target.protocolVersion,
      "x-markorbit-acquisition-mode": "API",
      "x-markorbit-remediation-artifact-kinds": artifactKinds,
      "x-markorbit-endpoint-binding-required": true,
      "x-markorbit-network-locator-persisted": false,
      "x-markorbit-credential-persisted": false,
      "x-markorbit-collection-authorization": false,
    },
  };
}

export function foundationalApiPlanPayload(target: CoverageTarget, sourceId: string): JsonRecord {
  const gap = apiGapForTarget(target, foundationalSupplyCapabilityGaps([target]));
  const artifactKinds = gap.remediation.apiBinding!.artifactKinds;
  return {
    sourceId,
    name: `Foundational API Evidence — ${target.id}`,
    status: "ACTIVE",
    schedule: { mode: "MANUAL" },
    priority: "HIGH",
    policy: {
      includePatterns: [],
      excludePatterns: [],
      maxDepth: 0,
      maxItems: 1,
      renderJavascript: false,
      fetchAttachments: false,
      respectRobots: false,
      rateLimitPerMinute: 12,
      timeoutSeconds: 120,
      retry: { maxAttempts: 1, backoffSeconds: 10 },
    },
    output: { artifactKinds },
    extensions: {
      "x-markorbit-source-coverage-remediation-target-id": target.id,
      "x-markorbit-purpose": "foundational-structured-api-evidence",
      "x-markorbit-collection-authorization": false,
    },
  };
}

async function ensureApiConnector(fetchImpl: FetchLike, baseUrl: string): Promise<void> {
  const existing = await requestJson(
    fetchImpl,
    baseUrl,
    `/api/connectors/${API_CONNECTOR_ID}/${API_CONNECTOR_VERSION}`,
    {},
    [404],
  );
  if (existing.status !== 404) return;
  await requestJson(
    fetchImpl,
    baseUrl,
    "/api/connectors",
    jsonPost({
      connectorId: API_CONNECTOR_ID,
      displayName: "Governed HTTPS API Worker",
      version: API_CONNECTOR_VERSION,
      sourceTypes: ["API"],
      runtime: "NODE",
      capabilities: ["COLLECT", "CHECK_UPDATE"],
      supportedJobTypes: ["API_COLLECTION"],
      configurationSchema: {
        type: "object",
        additionalProperties: false,
        required: ["endpointBinding", "resourcePath"],
        properties: {
          endpointBinding: { type: "string", pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$" },
          resourcePath: { type: "string", maxLength: 2048 },
          query: { type: "object", additionalProperties: { type: "string", maxLength: 2048 } },
          timeoutMs: { type: "integer", minimum: 1000, maximum: 120000 },
          maxResponseBytes: { type: "integer", minimum: 1, maximum: 104857600 },
          acceptedMimeTypes: {
            type: "array",
            minItems: 1,
            maxItems: 20,
            items: { type: "string", maxLength: 200 },
          },
        },
      },
      secretSchema: { type: "object", properties: {}, additionalProperties: false },
      outputArtifactKinds: ["JSON", "XML", "CSV", "TEXT", "MARKDOWN"],
      healthCheck: { mode: "WORKER_PROBE", timeoutSeconds: 30 },
      status: "ACTIVE",
      extensions: {
        "x-markorbit-production-provider": true,
        "x-markorbit-transport": "https-only",
        "x-markorbit-auth-policy": "worker-env-binding-only",
      },
    }),
  );
}

async function loadCoverageTargets(
  fetchImpl: FetchLike,
  baseUrl: string,
  workspaceId: string,
  jurisdiction: string,
): Promise<CoverageTarget[]> {
  const response = await requestJson(
    fetchImpl,
    baseUrl,
    `/api/source-coverage?jurisdiction=${encodeURIComponent(jurisdiction)}&coverageTier=FOUNDATIONAL&catalogState=ACTIVE&workspaceId=${encodeURIComponent(workspaceId)}`,
  );
  return array(record(response.body)?.targets) as CoverageTarget[];
}

async function ensureApiSource(
  fetchImpl: FetchLike,
  baseUrl: string,
  target: CoverageTarget,
  workspaceId: string,
  spec: FoundationalApiBindingSpec,
): Promise<{ id: string; state: "CREATED" | "REUSED" }> {
  const payload = foundationalApiSourcePayload(target, workspaceId, spec);
  const slug = requiredString(payload.slug, "source.slug");
  const listed = await requestJson(
    fetchImpl,
    baseUrl,
    `/api/sources?q=${encodeURIComponent(slug)}&limit=100`,
  );
  for (const candidate of array(record(listed.body)?.items)) {
    const source = record(candidate);
    if (source?.slug === slug)
      return { id: requiredString(source.id, "source.id"), state: "REUSED" };
  }
  const created = await requestJson(fetchImpl, baseUrl, "/api/sources", jsonPost(payload));
  const source = record(record(created.body)?.source);
  return { id: requiredString(source?.id, "source.id"), state: "CREATED" };
}

async function ensureApiPlan(
  fetchImpl: FetchLike,
  baseUrl: string,
  target: CoverageTarget,
  sourceId: string,
): Promise<{ id: string; state: "CREATED" | "REUSED" }> {
  const payload = foundationalApiPlanPayload(target, sourceId);
  const name = requiredString(payload.name, "plan.name");
  const listed = await requestJson(
    fetchImpl,
    baseUrl,
    `/api/plans?sourceId=${encodeURIComponent(sourceId)}&limit=100`,
  );
  for (const candidate of array(record(listed.body)?.items)) {
    const outer = record(candidate);
    const direct = record(outer?.plan);
    const plan = direct && typeof direct.id === "string" ? direct : record(direct?.plan);
    if (plan?.name !== name) continue;
    if (plan.status !== "ACTIVE" || record(plan.schedule)?.mode !== "MANUAL") {
      throw new Error(`API remediation plan ${name} must remain ACTIVE and MANUAL`);
    }
    return { id: requiredString(plan.id, "plan.id"), state: "REUSED" };
  }
  const created = await requestJson(fetchImpl, baseUrl, "/api/plans", jsonPost(payload));
  const outer = record(record(created.body)?.plan ?? created.body);
  const plan = outer && typeof outer.id === "string" ? outer : record(outer?.plan);
  return { id: requiredString(plan?.id, "plan.id"), state: "CREATED" };
}

export async function prepareFoundationalApiRemediation(
  options: PrepareFoundationalApiRemediationOptions,
) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const baseUrl = normalizedBaseUrl(options.baseUrl);
  const jurisdiction = options.jurisdiction.trim().toUpperCase();
  if (!jurisdiction) throw new Error("jurisdiction is required");
  const specs = options.bindings.map(normalizedBinding);
  const duplicateTargets = specs
    .map((spec) => spec.targetId)
    .filter((targetId, index, values) => values.indexOf(targetId) !== index);
  if (duplicateTargets.length > 0) {
    throw new Error(
      `Duplicate API remediation targetId: ${[...new Set(duplicateTargets)].join(", ")}`,
    );
  }

  const targets = await loadCoverageTargets(fetchImpl, baseUrl, options.workspaceId, jurisdiction);
  const targetMap = new Map(targets.map((target) => [target.id, target]));
  const gaps = foundationalSupplyCapabilityGaps(targets);
  const entries: FoundationalApiRemediationEntry[] = [];

  for (const spec of specs) {
    const target = targetMap.get(spec.targetId);
    if (!target) throw new Error(`Unknown ${jurisdiction} FOUNDATIONAL target ${spec.targetId}`);
    const gap = apiGapForTarget(target, gaps);
    const artifactKinds = gap.remediation.apiBinding!.artifactKinds;
    if (!options.apply) {
      entries.push({
        targetId: target.id,
        endpointBinding: spec.endpointBinding,
        artifactKinds,
        sourceState: "PLANNED",
        sourceId: null,
        planState: "PLANNED",
        planId: null,
        workerEndpointBindingRequired: true,
      });
      continue;
    }

    await ensureApiConnector(fetchImpl, baseUrl);
    const source = await ensureApiSource(fetchImpl, baseUrl, target, options.workspaceId, spec);
    const plan = await ensureApiPlan(fetchImpl, baseUrl, target, source.id);
    entries.push({
      targetId: target.id,
      endpointBinding: spec.endpointBinding,
      artifactKinds,
      sourceState: source.state,
      sourceId: source.id,
      planState: plan.state,
      planId: plan.id,
      workerEndpointBindingRequired: true,
    });
  }

  return {
    version: "FOUNDATIONAL_API_REMEDIATION_V1" as const,
    mode: options.apply ? ("APPLY" as const) : ("PLAN" as const),
    controlPlaneUrl: baseUrl,
    workspaceId: options.workspaceId,
    jurisdiction,
    entries,
    collectionAuthorization: "NONE" as const,
    automaticExecution: false as const,
  };
}
