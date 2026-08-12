import { createHash } from "node:crypto";
import { RSS_CONNECTOR_ID, RSS_CONNECTOR_VERSION } from "@markorbit/worker-runtime";

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

function normalizedFeedUrl(raw: string): string {
  if (raw.length > 4_096) throw new Error("MARKORBIT_RSS_FEED_URL exceeds 4096 characters");
  const url = new URL(raw);
  if (url.protocol !== "https:") throw new Error("MARKORBIT_RSS_FEED_URL must use HTTPS");
  if (url.username || url.password || url.hash) {
    throw new Error("MARKORBIT_RSS_FEED_URL cannot contain userinfo or a fragment");
  }
  if (url.port && url.port !== "443") {
    throw new Error("MARKORBIT_RSS_FEED_URL must use the default HTTPS port");
  }
  const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".localhost")) {
    throw new Error("MARKORBIT_RSS_FEED_URL cannot target localhost");
  }
  const sensitive =
    /(?:^|[-_.])(token|secret|password|passwd|credential|authorization|auth|api[-_.]?key|access[-_.]?key)(?:$|[-_.])/i;
  for (const [key, value] of url.searchParams) {
    if (sensitive.test(key) || /[\u0000-\u001f\u007f]/.test(key) || /[\u0000\r\n]/.test(value)) {
      throw new Error("MARKORBIT_RSS_FEED_URL contains a credential-like or invalid query parameter");
    }
  }
  return url.toString();
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

function sourceSlug(feedUrl: string): string {
  return `rss-${createHash("sha256").update(feedUrl).digest("hex").slice(0, 16)}`;
}

async function ensureConnector(baseUrl: string): Promise<void> {
  const existing = await requestJson(
    baseUrl,
    `/api/connectors/${RSS_CONNECTOR_ID}/${RSS_CONNECTOR_VERSION}`,
    {},
    [404],
  );
  if (existing.status !== 404) return;

  await requestJson(
    baseUrl,
    "/api/connectors",
    jsonPost({
      connectorId: RSS_CONNECTOR_ID,
      displayName: "Governed RSS / Atom Worker",
      version: RSS_CONNECTOR_VERSION,
      sourceTypes: ["RSS"],
      runtime: "NODE",
      capabilities: ["COLLECT", "CHECK_UPDATE"],
      supportedJobTypes: ["WEB_CRAWL"],
      configurationSchema: {
        type: "object",
        additionalProperties: false,
        required: ["feedUrl"],
        properties: {
          feedUrl: { type: "string", maxLength: 4096, pattern: "^https://" },
          timeoutMs: { type: "integer", minimum: 1000, maximum: 120000 },
          maxResponseBytes: { type: "integer", minimum: 1, maximum: 20971520 },
          maxEntries: { type: "integer", minimum: 1, maximum: 500 },
        },
      },
      secretSchema: { type: "object", properties: {}, additionalProperties: false },
      outputArtifactKinds: ["XML", "JSON"],
      healthCheck: { mode: "WORKER_PROBE", timeoutSeconds: 30 },
      status: "ACTIVE",
      extensions: {
        "x-markorbit-production-provider": true,
        "x-markorbit-feed-formats": ["RSS_2_0", "ATOM_1_0"],
        "x-markorbit-http-method": "GET",
        "x-markorbit-transport": "https-only",
        "x-markorbit-redirect-policy": "disabled",
        "x-markorbit-ssrf-policy": "public-address-only-pinned-ip",
        "x-markorbit-entry-identity": "stable-canonical-uri",
      },
    }),
  );
}

async function ensureSource(
  baseUrl: string,
  input: {
    feedUrl: string;
    sourceName: string;
    timeoutMs: number;
    maxResponseBytes: number;
    maxEntries: number;
  },
): Promise<string> {
  const slug = sourceSlug(input.feedUrl);
  const existing = await requestJson(
    baseUrl,
    `/api/sources?q=${encodeURIComponent(slug)}&limit=100`,
  );
  for (const candidate of items(existing.body)) {
    const source = record(candidate);
    if (source?.slug === slug) return identifier(source.id, "source.id");
  }

  const created = await requestJson(
    baseUrl,
    "/api/sources",
    jsonPost({
      name: input.sourceName,
      slug,
      sourceType: "RSS",
      category: "NEWS",
      authorityLevel: "UNKNOWN",
      status: "ACTIVE",
      jurisdictions: [],
      languages: [],
      connector: { connectorId: RSS_CONNECTOR_ID, version: RSS_CONNECTOR_VERSION },
      connectorConfig: {
        feedUrl: input.feedUrl,
        timeoutMs: input.timeoutMs,
        maxResponseBytes: input.maxResponseBytes,
        maxEntries: input.maxEntries,
      },
      canonicalUri: input.feedUrl,
      entrypoints: [{ uri: input.feedUrl, label: input.sourceName }],
      tags: ["rss", "atom", "feed", "https", "governed"],
      extensions: {
        "x-markorbit-feed-authentication": "none-v1",
        "x-markorbit-entry-following": false,
      },
    }),
  );
  const source = record(record(created.body)?.source);
  return identifier(source?.id, "source.id");
}

async function ensurePlan(
  baseUrl: string,
  sourceId: string,
  sourceName: string,
  maxEntries: number,
): Promise<string> {
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
        maxItems: maxEntries + 1,
        renderJavascript: false,
        fetchAttachments: false,
        respectRobots: false,
        rateLimitPerMinute: 30,
        timeoutSeconds: 120,
        retry: { maxAttempts: 1, backoffSeconds: 0 },
      },
      output: { artifactKinds: ["XML", "JSON"] },
      extensions: {
        "x-markorbit-purpose": "governed-rss-atom-snapshot",
        "x-markorbit-entry-versioning": "canonical-uri-content-hash",
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
  const label = "rss-worker-v1";
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
      displayName: "Governed RSS / Atom Production Worker",
      desiredState: "ACTIVE",
      runtime: { runtimeId: RSS_CONNECTOR_ID, version: RSS_CONNECTOR_VERSION },
      supportedJobTypes: ["WEB_CRAWL"],
      connectorBindings: [
        {
          connectorId: RSS_CONNECTOR_ID,
          version: RSS_CONNECTOR_VERSION,
          capabilities: ["COLLECT", "CHECK_UPDATE"],
        },
      ],
      maxConcurrency: 1,
      labels: ["production", "rss", "atom", label],
      extensions: {
        "x-markorbit-network-policy": "public-https-feed-only",
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
      requestedBy: { actorType: "LOCAL_ADMIN", actorId: "bootstrap-rss-worker" },
    }),
    headers: {
      "content-type": "application/json",
      "Idempotency-Key": `bootstrap-rss-${planId}-${new Date().toISOString().slice(0, 10)}`,
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
  const feedUrl = normalizedFeedUrl(required("MARKORBIT_RSS_FEED_URL"));
  const sourceName = process.env.MARKORBIT_RSS_SOURCE_NAME?.trim() || `RSS — ${new URL(feedUrl).hostname}`;
  const timeoutMs = integer("MARKORBIT_RSS_TIMEOUT_MS", 30_000, 1_000, 120_000);
  const maxResponseBytes = integer(
    "MARKORBIT_RSS_MAX_RESPONSE_BYTES",
    5 * 1024 * 1024,
    1,
    20 * 1024 * 1024,
  );
  const maxEntries = integer("MARKORBIT_RSS_MAX_ENTRIES", 100, 1, 500);

  await ensureConnector(baseUrl);
  const sourceId = await ensureSource(baseUrl, {
    feedUrl,
    sourceName,
    timeoutMs,
    maxResponseBytes,
    maxEntries,
  });
  const planId = await ensurePlan(baseUrl, sourceId, sourceName, maxEntries);
  const worker = await ensureWorker(baseUrl);
  const runId = process.argv.includes("--dispatch") ? await dispatch(baseUrl, planId) : null;

  process.stdout.write(
    `${JSON.stringify(
      {
        connector: `${RSS_CONNECTOR_ID}@${RSS_CONNECTOR_VERSION}`,
        sourceId,
        planId,
        workerId: worker.workerId,
        workerCredential: worker.credential,
        runId,
        workerEnvironment: {
          MARKORBIT_COLLECTION_PROVIDER: "rss",
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
