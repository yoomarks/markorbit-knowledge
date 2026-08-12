import { createHash } from "node:crypto";
import {
  API_CONNECTOR_ID,
  API_CONNECTOR_VERSION,
  parseApiEndpointBindings,
} from "@markorbit/worker-runtime";

const OUTPUT_KINDS = ["JSON", "XML", "CSV", "TEXT", "MARKDOWN"] as const;
const SENSITIVE_QUERY_KEY =
  /(?:^|[-_.])(token|secret|password|passwd|credential|authorization|auth|api[-_.]?key|access[-_.]?key)(?:$|[-_.])/i;

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function items(value: unknown): unknown[] {
  const container = record(value);
  return Array.isArray(container?.items) ? container.items : [];
}

function required(key: string): string {
  const value = process.env[key]?.trim();
  if (!value) throw new Error(`${key} is required`);
  return value;
}

function integer(key: string, fallback: number, minimum: number, maximum: number): number {
  const raw = process.env[key]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${key} must be an integer between ${minimum} and ${maximum}`);
  }
  return value;
}

function normalizedBaseUrl(raw: string): string {
  const url = new URL(raw);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Control-plane URL must use http or https");
  }
  return url.toString().replace(/\/$/, "");
}

function identifier(value: unknown, field: string): string {
  if (typeof value !== "string" || !value) throw new Error(`Bootstrap response missing ${field}`);
  return value;
}

async function requestJson(
  baseUrl: string,
  path: string,
  init: RequestInit = {},
  allowedStatuses: number[] = [],
): Promise<{ status: number; body: unknown }> {
  const response = await fetch(`${baseUrl}${path}`, init);
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

function safeQuery(): Record<string, string> {
  const raw = process.env.MARKORBIT_API_QUERY_JSON?.trim();
  if (!raw) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("MARKORBIT_API_QUERY_JSON must be a JSON object");
  }
  const container = record(parsed);
  if (!container) throw new Error("MARKORBIT_API_QUERY_JSON must be a JSON object");
  if (Object.keys(container).length > 50)
    throw new Error("MARKORBIT_API_QUERY_JSON has too many entries");
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(container)) {
    if (!key || key.length > 100 || SENSITIVE_QUERY_KEY.test(key)) {
      throw new Error(
        "MARKORBIT_API_QUERY_JSON contains an invalid or credential-like key; use endpoint bindings for credentials",
      );
    }
    if (typeof value !== "string" || value.length > 2_048 || /[\u0000\r\n]/.test(value)) {
      throw new Error(`MARKORBIT_API_QUERY_JSON value for ${key} must be a bounded string`);
    }
    result[key] = value;
  }
  return result;
}

function resourcePath(): string {
  const value = required("MARKORBIT_API_RESOURCE_PATH");
  if (
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    value.includes("?") ||
    value.includes("#") ||
    value.length > 2_048
  ) {
    throw new Error(
      "MARKORBIT_API_RESOURCE_PATH must be one bounded absolute path without query/fragment",
    );
  }
  return value;
}

function logicalUri(bindingId: string, path: string, query: Record<string, string>): string {
  const digest = createHash("sha256")
    .update(
      JSON.stringify({
        binding: bindingId,
        path,
        query: Object.entries(query).sort(([left], [right]) => left.localeCompare(right)),
      }),
    )
    .digest("hex");
  return `api://${bindingId}/${digest}`;
}

function sourceSlug(bindingId: string, path: string, query: Record<string, string>): string {
  const digest = createHash("sha256")
    .update(JSON.stringify([path, Object.entries(query).sort()]))
    .digest("hex")
    .slice(0, 12);
  return `api-${bindingId}-${digest}`;
}

async function ensureConnector(baseUrl: string): Promise<void> {
  const existing = await requestJson(
    baseUrl,
    `/api/connectors/${API_CONNECTOR_ID}/${API_CONNECTOR_VERSION}`,
    {},
    [404],
  );
  if (existing.status !== 404) return;

  await requestJson(
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
          query: {
            type: "object",
            additionalProperties: { type: "string", maxLength: 2048 },
            maxProperties: 50,
          },
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
      outputArtifactKinds: [...OUTPUT_KINDS],
      healthCheck: { mode: "WORKER_PROBE", timeoutSeconds: 30 },
      status: "ACTIVE",
      extensions: {
        "x-markorbit-production-provider": true,
        "x-markorbit-http-method": "GET",
        "x-markorbit-transport": "https-only",
        "x-markorbit-redirect-policy": "disabled",
        "x-markorbit-ssrf-policy": "public-address-only-pinned-ip",
        "x-markorbit-auth-policy": "worker-env-binding-only",
      },
    }),
  );
}

async function ensureSource(
  baseUrl: string,
  input: {
    bindingId: string;
    path: string;
    query: Record<string, string>;
    sourceName: string;
    timeoutMs: number;
    maxResponseBytes: number;
  },
): Promise<string> {
  const slug = sourceSlug(input.bindingId, input.path, input.query);
  const existing = await requestJson(
    baseUrl,
    `/api/sources?q=${encodeURIComponent(slug)}&limit=100`,
  );
  for (const candidate of items(existing.body)) {
    const source = record(candidate);
    if (source?.slug === slug) return identifier(source.id, "source.id");
  }

  const uri = logicalUri(input.bindingId, input.path, input.query);
  const created = await requestJson(
    baseUrl,
    "/api/sources",
    jsonPost({
      name: input.sourceName,
      slug,
      sourceType: "API",
      category: "OTHER",
      authorityLevel: "UNKNOWN",
      status: "ACTIVE",
      jurisdictions: [],
      languages: [],
      connector: { connectorId: API_CONNECTOR_ID, version: API_CONNECTOR_VERSION },
      connectorConfig: {
        endpointBinding: input.bindingId,
        resourcePath: input.path,
        query: input.query,
        timeoutMs: input.timeoutMs,
        maxResponseBytes: input.maxResponseBytes,
      },
      canonicalUri: uri,
      entrypoints: [{ uri, label: input.sourceName }],
      tags: ["api", "https", "governed"],
      extensions: {
        "x-markorbit-network-locator-persisted": false,
        "x-markorbit-credential-persisted": false,
      },
    }),
  );
  const source = record(record(created.body)?.source);
  return identifier(source?.id, "source.id");
}

async function ensurePlan(baseUrl: string, sourceId: string, sourceName: string): Promise<string> {
  const existing = await requestJson(
    baseUrl,
    `/api/plans?sourceId=${encodeURIComponent(sourceId)}&limit=100`,
  );
  for (const candidate of items(existing.body)) {
    const plan = record(record(candidate)?.plan);
    if (plan?.name === `${sourceName} Collection`) return identifier(plan.id, "plan.id");
  }

  const created = await requestJson(
    baseUrl,
    "/api/plans",
    jsonPost({
      sourceId,
      name: `${sourceName} Collection`,
      status: "ACTIVE",
      schedule: { mode: "MANUAL" },
      priority: "NORMAL",
      policy: {
        includePatterns: [],
        excludePatterns: [],
        maxDepth: 0,
        maxItems: 1,
        renderJavascript: false,
        fetchAttachments: false,
        respectRobots: false,
        rateLimitPerMinute: 30,
        timeoutSeconds: 120,
        retry: { maxAttempts: 1, backoffSeconds: 0 },
      },
      output: { artifactKinds: [...OUTPUT_KINDS] },
      extensions: {
        "x-markorbit-purpose": "governed-api-snapshot",
        "x-markorbit-pagination": "none-v1",
      },
    }),
  );
  const createdRecord = record(record(created.body)?.plan);
  const plan = record(createdRecord?.plan);
  return identifier(plan?.id, "plan.id");
}

async function ensureWorker(
  baseUrl: string,
): Promise<{ workerId: string; credential: string | null }> {
  const label = "api-worker-v1";
  const existing = await requestJson(
    baseUrl,
    `/api/workers?label=${encodeURIComponent(label)}&limit=100`,
  );
  for (const candidate of items(existing.body)) {
    const worker = record(record(candidate)?.worker);
    if (worker) return { workerId: identifier(worker.id, "worker.id"), credential: null };
  }

  const created = await requestJson(
    baseUrl,
    "/api/workers",
    jsonPost({
      displayName: "Governed HTTPS API Production Worker",
      desiredState: "ACTIVE",
      runtime: { runtimeId: "api-worker", version: API_CONNECTOR_VERSION },
      supportedJobTypes: ["API_COLLECTION"],
      connectorBindings: [
        {
          connectorId: API_CONNECTOR_ID,
          version: API_CONNECTOR_VERSION,
          capabilities: ["COLLECT", "CHECK_UPDATE"],
        },
      ],
      maxConcurrency: 1,
      labels: ["production", "api", "https", label],
      extensions: {
        "x-markorbit-auth-policy": "worker-env-binding-only",
      },
    }),
  );
  const view = record(record(created.body)?.view);
  const worker = record(view?.worker);
  return {
    workerId: identifier(worker?.id, "worker.id"),
    credential: identifier(record(created.body)?.credential, "worker.credential"),
  };
}

async function dispatch(baseUrl: string, planId: string): Promise<string> {
  const result = await requestJson(baseUrl, "/api/runs", {
    ...jsonPost({
      planId,
      requestedBy: { actorType: "LOCAL_ADMIN", actorId: "bootstrap-api-worker" },
    }),
    headers: {
      "content-type": "application/json",
      "Idempotency-Key": `bootstrap-api-${planId}-${new Date().toISOString().slice(0, 10)}`,
    },
  });
  const recordValue = record(record(result.body)?.record);
  const run = record(recordValue?.run);
  return identifier(run?.id, "run.id");
}

async function main(): Promise<void> {
  const baseUrl = normalizedBaseUrl(
    process.env.MARKORBIT_CONTROL_PLANE_URL?.trim() || "http://localhost:3000",
  );
  const bindings = parseApiEndpointBindings(required("MARKORBIT_API_ENDPOINT_BINDINGS"));
  const bindingId = required("MARKORBIT_API_ENDPOINT_BINDING");
  if (!bindings[bindingId]) {
    throw new Error(`MARKORBIT_API_ENDPOINT_BINDING ${bindingId} is not defined on this Worker`);
  }
  const path = resourcePath();
  const query = safeQuery();
  const timeoutMs = integer("MARKORBIT_API_TIMEOUT_MS", 30_000, 1_000, 120_000);
  const maxResponseBytes = integer(
    "MARKORBIT_API_MAX_RESPONSE_BYTES",
    10 * 1024 * 1024,
    1,
    100 * 1024 * 1024,
  );
  const sourceName = process.env.MARKORBIT_API_SOURCE_NAME?.trim() || `API — ${bindingId}`;

  await ensureConnector(baseUrl);
  const sourceId = await ensureSource(baseUrl, {
    bindingId,
    path,
    query,
    sourceName,
    timeoutMs,
    maxResponseBytes,
  });
  const planId = await ensurePlan(baseUrl, sourceId, sourceName);
  const worker = await ensureWorker(baseUrl);
  const runId = process.argv.includes("--dispatch") ? await dispatch(baseUrl, planId) : null;

  process.stdout.write(
    `${JSON.stringify(
      {
        connector: `${API_CONNECTOR_ID}@${API_CONNECTOR_VERSION}`,
        sourceId,
        planId,
        workerId: worker.workerId,
        workerCredential: worker.credential,
        runId,
        workerEnvironment: {
          MARKORBIT_COLLECTION_PROVIDER: "api",
          MARKORBIT_API_ENDPOINT_BINDINGS:
            "<keep endpoint origins and credential env bindings local to the Worker>",
        },
      },
      null,
      2,
    )}\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
