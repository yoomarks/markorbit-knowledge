import { createHash } from "node:crypto";
import { GITHUB_CONNECTOR_ID, GITHUB_CONNECTOR_VERSION, normalizeGitHubPathPrefix } from "@markorbit/worker-runtime";

const OUTPUT_KINDS = ["JSON", "MARKDOWN", "HTML", "XML", "CSV", "TEXT"] as const;

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

function owner(value: string): string {
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(value)) {
    throw new Error("MARKORBIT_GITHUB_OWNER is invalid");
  }
  return value;
}

function repository(value: string): string {
  if (!/^[A-Za-z0-9._-]{1,100}$/.test(value) || value === "." || value === "..") {
    throw new Error("MARKORBIT_GITHUB_REPOSITORY is invalid");
  }
  return value;
}

function refName(value: string): string {
  if (
    value.length > 256 ||
    !/^[A-Za-z0-9._/-]+$/.test(value) ||
    value.startsWith("/") ||
    value.endsWith("/") ||
    value.includes("//") ||
    value.includes("..") ||
    value.includes("@{") ||
    value.endsWith(".")
  ) {
    throw new Error("MARKORBIT_GITHUB_REF contains unsupported ref syntax");
  }
  return value;
}

function patterns(key: string): string[] {
  const raw = process.env[key]?.trim();
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`${key} must be a JSON array of strings`);
  }
  if (!Array.isArray(parsed) || parsed.length > 100) {
    throw new Error(`${key} must be a JSON array with at most 100 entries`);
  }
  return parsed.map((value) => {
    if (typeof value !== "string" || value.length === 0 || value.length > 1024 || /[\u0000\r\n]/.test(value)) {
      throw new Error(`${key} contains an invalid pattern`);
    }
    return value;
  });
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

function sourceIdentity(input: {
  owner: string;
  repository: string;
  ref: string;
  pathPrefix: string;
}): string {
  return createHash("sha256")
    .update(JSON.stringify([input.owner.toLowerCase(), input.repository.toLowerCase(), input.ref, input.pathPrefix]))
    .digest("hex")
    .slice(0, 16);
}

function sourceSlug(input: { owner: string; repository: string; ref: string; pathPrefix: string }): string {
  const base = `${input.owner}-${input.repository}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
  return `github-${base}-${sourceIdentity(input)}`;
}

function logicalUri(input: { owner: string; repository: string; ref: string; pathPrefix: string }): string {
  const prefix = input.pathPrefix
    ? `/path/${input.pathPrefix.split("/").map(encodeURIComponent).join("/")}`
    : "";
  return `github://${input.owner.toLowerCase()}/${input.repository.toLowerCase()}/ref/${encodeURIComponent(input.ref)}${prefix}`;
}

async function ensureConnector(baseUrl: string): Promise<void> {
  const existing = await requestJson(
    baseUrl,
    `/api/connectors/${GITHUB_CONNECTOR_ID}/${GITHUB_CONNECTOR_VERSION}`,
    {},
    [404],
  );
  if (existing.status !== 404) return;

  await requestJson(
    baseUrl,
    "/api/connectors",
    jsonPost({
      connectorId: GITHUB_CONNECTOR_ID,
      displayName: "Governed GitHub Repository Worker",
      version: GITHUB_CONNECTOR_VERSION,
      sourceTypes: ["GITHUB"],
      runtime: "NODE",
      capabilities: ["COLLECT", "CHECK_UPDATE"],
      supportedJobTypes: ["WEB_CRAWL"],
      configurationSchema: {
        type: "object",
        additionalProperties: false,
        required: ["owner", "repository", "ref", "pathPrefix"],
        properties: {
          owner: { type: "string", minLength: 1, maxLength: 39 },
          repository: { type: "string", minLength: 1, maxLength: 100 },
          ref: { type: "string", minLength: 1, maxLength: 256 },
          pathPrefix: { type: "string", maxLength: 2048 },
        },
      },
      secretSchema: { type: "object", properties: {}, additionalProperties: false },
      outputArtifactKinds: [...OUTPUT_KINDS],
      healthCheck: { mode: "WORKER_PROBE", timeoutSeconds: 30 },
      status: "ACTIVE",
      extensions: {
        "x-markorbit-production-provider": true,
        "x-markorbit-github-host": "api.github.com",
        "x-markorbit-http-method": "GET",
        "x-markorbit-transport": "https-only-pinned-ip",
        "x-markorbit-auth-policy": "optional-worker-env-token-only",
        "x-markorbit-snapshot-identity": "commit-tree-blob",
        "x-markorbit-binary-policy": "utf8-text-only-v1",
      },
    }),
  );
}

async function ensureSource(
  baseUrl: string,
  input: {
    owner: string;
    repository: string;
    ref: string;
    pathPrefix: string;
    sourceName: string;
  },
): Promise<string> {
  const slug = sourceSlug(input);
  const existing = await requestJson(baseUrl, `/api/sources?q=${encodeURIComponent(slug)}&limit=100`);
  for (const candidate of items(existing.body)) {
    const source = record(candidate);
    if (source?.slug === slug) return identifier(source.id, "source.id");
  }

  const uri = logicalUri(input);
  const webUrl = `https://github.com/${encodeURIComponent(input.owner)}/${encodeURIComponent(input.repository)}`;
  const created = await requestJson(
    baseUrl,
    "/api/sources",
    jsonPost({
      name: input.sourceName,
      slug,
      sourceType: "GITHUB",
      category: "TECHNICAL",
      authorityLevel: "UNKNOWN",
      status: "ACTIVE",
      jurisdictions: [],
      languages: [],
      connector: { connectorId: GITHUB_CONNECTOR_ID, version: GITHUB_CONNECTOR_VERSION },
      connectorConfig: {
        owner: input.owner,
        repository: input.repository,
        ref: input.ref,
        pathPrefix: input.pathPrefix,
      },
      canonicalUri: uri,
      entrypoints: [{ uri: webUrl, label: input.sourceName }],
      tags: ["github", "repository", "source-code", "governed"],
      extensions: {
        "x-markorbit-github-token-persisted": false,
        "x-markorbit-github-enterprise-supported": false,
        "x-markorbit-submodules-supported": false,
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
  input: { includePatterns: string[]; excludePatterns: string[]; maxItems: number; maxDepth: number },
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
        includePatterns: input.includePatterns,
        excludePatterns: input.excludePatterns,
        maxDepth: input.maxDepth,
        maxItems: input.maxItems,
        renderJavascript: false,
        fetchAttachments: false,
        respectRobots: false,
        rateLimitPerMinute: 30,
        timeoutSeconds: 120,
        retry: { maxAttempts: 1, backoffSeconds: 0 },
      },
      output: { artifactKinds: [...OUTPUT_KINDS] },
      extensions: {
        "x-markorbit-purpose": "governed-github-repository-snapshot",
        "x-markorbit-file-versioning": "canonical-uri-git-blob-evidence",
        "x-markorbit-metadata-evidence-artifacts": 2,
        "x-markorbit-pagination": "none-v1",
      },
    }),
  );
  const createdRecord = record(record(created.body)?.plan);
  const plan = record(createdRecord?.plan);
  return identifier(plan?.id, "plan.id");
}

async function ensureWorker(baseUrl: string): Promise<{ workerId: string; credential: string | null }> {
  const label = "github-worker-v1";
  const existing = await requestJson(baseUrl, `/api/workers?label=${encodeURIComponent(label)}&limit=100`);
  for (const candidate of items(existing.body)) {
    const worker = record(record(candidate)?.worker);
    if (worker) return { workerId: identifier(worker.id, "worker.id"), credential: null };
  }

  const created = await requestJson(
    baseUrl,
    "/api/workers",
    jsonPost({
      displayName: "Governed GitHub Repository Production Worker",
      desiredState: "ACTIVE",
      runtime: { runtimeId: GITHUB_CONNECTOR_ID, version: GITHUB_CONNECTOR_VERSION },
      supportedJobTypes: ["WEB_CRAWL"],
      connectorBindings: [
        {
          connectorId: GITHUB_CONNECTOR_ID,
          version: GITHUB_CONNECTOR_VERSION,
          capabilities: ["COLLECT", "CHECK_UPDATE"],
        },
      ],
      maxConcurrency: 1,
      labels: ["production", "github", "repository", label],
      extensions: {
        "x-markorbit-auth-policy": "optional-worker-env-token-only",
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
      requestedBy: { actorType: "LOCAL_ADMIN", actorId: "bootstrap-github-worker" },
    }),
    headers: {
      "content-type": "application/json",
      "Idempotency-Key": `bootstrap-github-${planId}-${new Date().toISOString().slice(0, 10)}`,
    },
  });
  const recordValue = record(record(result.body)?.record);
  const run = record(recordValue?.run);
  return identifier(run?.id, "run.id");
}

async function main(): Promise<void> {
  const baseUrl = normalizedBaseUrl(process.env.MARKORBIT_CONTROL_PLANE_URL?.trim() || "http://localhost:3000");
  const input = {
    owner: owner(required("MARKORBIT_GITHUB_OWNER")),
    repository: repository(required("MARKORBIT_GITHUB_REPOSITORY")),
    ref: refName(process.env.MARKORBIT_GITHUB_REF?.trim() || "main"),
    pathPrefix: normalizeGitHubPathPrefix(process.env.MARKORBIT_GITHUB_PATH_PREFIX?.trim() || ""),
  };
  const sourceName =
    process.env.MARKORBIT_GITHUB_SOURCE_NAME?.trim() ||
    `GitHub — ${input.owner}/${input.repository}${input.pathPrefix ? `/${input.pathPrefix}` : ""}`;
  const planInput = {
    includePatterns: patterns("MARKORBIT_GITHUB_INCLUDE_PATTERNS_JSON"),
    excludePatterns: patterns("MARKORBIT_GITHUB_EXCLUDE_PATTERNS_JSON"),
    maxItems: integer("MARKORBIT_GITHUB_PLAN_MAX_ITEMS", 250, 1, 5_000),
    maxDepth: integer("MARKORBIT_GITHUB_PLAN_MAX_DEPTH", 20, 0, 60),
  };

  await ensureConnector(baseUrl);
  const sourceId = await ensureSource(baseUrl, { ...input, sourceName });
  const planId = await ensurePlan(baseUrl, sourceId, sourceName, planInput);
  const worker = await ensureWorker(baseUrl);
  const runId = process.argv.includes("--dispatch") ? await dispatch(baseUrl, planId) : null;

  process.stdout.write(
    `${JSON.stringify(
      {
        connector: `${GITHUB_CONNECTOR_ID}@${GITHUB_CONNECTOR_VERSION}`,
        sourceId,
        planId,
        workerId: worker.workerId,
        workerCredential: worker.credential,
        runId,
        workerEnvironment: {
          MARKORBIT_COLLECTION_PROVIDER: "github",
          MARKORBIT_GITHUB_TOKEN: "<optional; inject only on the Worker for private repositories or higher rate limits>",
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
