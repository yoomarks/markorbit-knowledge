import { createHash } from "node:crypto";
import {
  LOCAL_FOLDER_CONNECTOR_ID,
  LOCAL_FOLDER_CONNECTOR_VERSION,
  normalizeLocalFolderRelativePath,
  parseLocalFolderRoots,
} from "@markorbit/worker-runtime";

const WORKER_LABEL_PREFIX = "local-folder-root";
const OUTPUT_KINDS = [
  "MARKDOWN",
  "HTML",
  "PDF",
  "DOCX",
  "XLSX",
  "CSV",
  "JSON",
  "XML",
  "EMAIL",
  "TEXT",
  "IMAGE",
] as const;

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

function bool(key: string, fallback: boolean): boolean {
  const raw = process.env[key]?.trim().toLowerCase();
  if (!raw) return fallback;
  if (["1", "true", "yes", "on"].includes(raw)) return true;
  if (["0", "false", "no", "off"].includes(raw)) return false;
  throw new Error(`${key} must be a boolean value`);
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

function logicalUri(rootId: string, relativePath: string): string {
  const encoded = relativePath
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `local-folder://${rootId}/${encoded}`;
}

function sourceSlug(rootId: string, relativePath: string): string {
  if (!relativePath) return `local-folder-${rootId}`;
  const suffix = createHash("sha256").update(relativePath).digest("hex").slice(0, 10);
  return `local-folder-${rootId}-${suffix}`;
}

async function ensureConnector(baseUrl: string): Promise<void> {
  const existing = await requestJson(
    baseUrl,
    `/api/connectors/${LOCAL_FOLDER_CONNECTOR_ID}/${LOCAL_FOLDER_CONNECTOR_VERSION}`,
    {},
    [404],
  );
  if (existing.status !== 404) return;

  await requestJson(
    baseUrl,
    "/api/connectors",
    jsonPost({
      connectorId: LOCAL_FOLDER_CONNECTOR_ID,
      displayName: "Local Folder Worker — governed filesystem acquisition",
      version: LOCAL_FOLDER_CONNECTOR_VERSION,
      sourceTypes: ["LOCAL_FOLDER"],
      runtime: "LOCAL_AGENT",
      capabilities: ["COLLECT", "IMPORT"],
      supportedJobTypes: ["LOCAL_FILE_SCAN"],
      configurationSchema: {
        type: "object",
        additionalProperties: false,
        required: ["rootId", "relativePath", "recursive", "includeHidden"],
        properties: {
          rootId: {
            type: "string",
            pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$",
          },
          relativePath: { type: "string", maxLength: 1024 },
          recursive: { type: "boolean" },
          includeHidden: { type: "boolean" },
        },
      },
      secretSchema: { type: "object", properties: {}, additionalProperties: false },
      outputArtifactKinds: [...OUTPUT_KINDS],
      healthCheck: { mode: "WORKER_PROBE", timeoutSeconds: 30 },
      status: "ACTIVE",
      extensions: {
        "x-markorbit-production-provider": true,
        "x-markorbit-root-policy": "worker-local-alias-only",
        "x-markorbit-symlink-policy": "fail-closed",
      },
    }),
  );
}

async function ensureSource(
  baseUrl: string,
  input: {
    rootId: string;
    relativePath: string;
    recursive: boolean;
    includeHidden: boolean;
    sourceName: string;
  },
): Promise<string> {
  const slug = sourceSlug(input.rootId, input.relativePath);
  const existing = await requestJson(baseUrl, `/api/sources?q=${encodeURIComponent(slug)}&limit=100`);
  for (const candidate of items(existing.body)) {
    const source = record(candidate);
    if (source?.slug === slug) return identifier(source.id, "source.id");
  }

  const uri = logicalUri(input.rootId, input.relativePath);
  const created = await requestJson(
    baseUrl,
    "/api/sources",
    jsonPost({
      name: input.sourceName,
      slug,
      sourceType: "LOCAL_FOLDER",
      category: "USER_PROVIDED",
      authorityLevel: "UNKNOWN",
      status: "ACTIVE",
      jurisdictions: [],
      languages: [],
      connector: {
        connectorId: LOCAL_FOLDER_CONNECTOR_ID,
        version: LOCAL_FOLDER_CONNECTOR_VERSION,
      },
      connectorConfig: {
        rootId: input.rootId,
        relativePath: input.relativePath,
        recursive: input.recursive,
        includeHidden: input.includeHidden,
      },
      canonicalUri: uri,
      entrypoints: [{ uri, label: input.sourceName }],
      tags: ["local-folder", "user-provided", input.rootId],
      extensions: {
        "x-markorbit-local-folder-root-id": input.rootId,
        "x-markorbit-absolute-path-persisted": false,
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
  maxDepth: number,
  maxItems: number,
): Promise<string> {
  const existing = await requestJson(
    baseUrl,
    `/api/plans?sourceId=${encodeURIComponent(sourceId)}&limit=100`,
  );
  for (const candidate of items(existing.body)) {
    const plan = record(record(candidate)?.plan);
    if (plan?.name === `${sourceName} Scan`) return identifier(plan.id, "plan.id");
  }

  const created = await requestJson(
    baseUrl,
    "/api/plans",
    jsonPost({
      sourceId,
      name: `${sourceName} Scan`,
      status: "ACTIVE",
      schedule: { mode: "MANUAL" },
      priority: "NORMAL",
      policy: {
        includePatterns: [],
        excludePatterns: [],
        maxDepth,
        maxItems,
        renderJavascript: false,
        fetchAttachments: false,
        respectRobots: false,
        rateLimitPerMinute: 60,
        timeoutSeconds: 300,
        retry: { maxAttempts: 1, backoffSeconds: 0 },
      },
      output: { artifactKinds: [...OUTPUT_KINDS] },
      extensions: {
        "x-markorbit-purpose": "governed-local-folder-snapshot",
      },
    }),
  );
  const createdRecord = record(record(created.body)?.plan);
  const plan = record(createdRecord?.plan);
  return identifier(plan?.id, "plan.id");
}

async function ensureWorker(
  baseUrl: string,
  rootId: string,
): Promise<{ workerId: string; credential: string | null }> {
  const label = `${WORKER_LABEL_PREFIX}-${rootId}`;
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
      displayName: `Local Folder Production Worker — ${rootId}`,
      desiredState: "ACTIVE",
      runtime: { runtimeId: "local-folder-worker", version: "1.0.0" },
      supportedJobTypes: ["LOCAL_FILE_SCAN"],
      connectorBindings: [
        {
          connectorId: LOCAL_FOLDER_CONNECTOR_ID,
          version: LOCAL_FOLDER_CONNECTOR_VERSION,
          capabilities: ["COLLECT", "IMPORT"],
        },
      ],
      maxConcurrency: 1,
      labels: ["production", "local-folder", label],
      extensions: {
        "x-markorbit-root-id": rootId,
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
      requestedBy: {
        actorType: "LOCAL_ADMIN",
        actorId: "bootstrap-local-folder-worker",
      },
    }),
    headers: {
      "content-type": "application/json",
      "Idempotency-Key": `bootstrap-local-folder-${planId}-${new Date().toISOString().slice(0, 10)}`,
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
  const roots = parseLocalFolderRoots(required("MARKORBIT_LOCAL_FOLDER_ROOTS"));
  const rootId = required("MARKORBIT_LOCAL_FOLDER_ROOT_ID");
  if (!roots[rootId]) {
    throw new Error(`MARKORBIT_LOCAL_FOLDER_ROOT_ID ${rootId} is not present in LOCAL_FOLDER_ROOTS`);
  }
  const relativePath = normalizeLocalFolderRelativePath(
    process.env.MARKORBIT_LOCAL_FOLDER_RELATIVE_PATH?.trim() || "",
  );
  const recursive = bool("MARKORBIT_LOCAL_FOLDER_RECURSIVE", true);
  const includeHidden = bool("MARKORBIT_LOCAL_FOLDER_INCLUDE_HIDDEN", false);
  const maxDepth = integer("MARKORBIT_LOCAL_FOLDER_PLAN_MAX_DEPTH", 8, 0, 20);
  const maxItems = integer("MARKORBIT_LOCAL_FOLDER_PLAN_MAX_ITEMS", 250, 1, 5_000);
  const sourceName =
    process.env.MARKORBIT_LOCAL_FOLDER_SOURCE_NAME?.trim() ||
    `Local Folder — ${rootId}${relativePath ? `/${relativePath}` : ""}`;

  await ensureConnector(baseUrl);
  const sourceId = await ensureSource(baseUrl, {
    rootId,
    relativePath,
    recursive,
    includeHidden,
    sourceName,
  });
  const planId = await ensurePlan(baseUrl, sourceId, sourceName, maxDepth, maxItems);
  const worker = await ensureWorker(baseUrl, rootId);
  const runId = process.argv.includes("--dispatch") ? await dispatch(baseUrl, planId) : null;

  process.stdout.write(
    `${JSON.stringify(
      {
        connector: `${LOCAL_FOLDER_CONNECTOR_ID}@${LOCAL_FOLDER_CONNECTOR_VERSION}`,
        sourceId,
        planId,
        workerId: worker.workerId,
        workerCredential: worker.credential,
        runId,
        workerEnvironment: {
          MARKORBIT_COLLECTION_PROVIDER: "local-folder",
          MARKORBIT_LOCAL_FOLDER_ROOT_ID: rootId,
          MARKORBIT_LOCAL_FOLDER_ROOTS: "<keep this local to the Worker; never persist absolute paths>",
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
