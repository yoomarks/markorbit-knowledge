const CONNECTOR_ID = "crawl4ai-web";
const CONNECTOR_VERSION = "1.2.0";
const SOURCE_SLUG = "uspto-fee-schedule-phase2";
const SOURCE_NAME = "USPTO Fee Schedule — Phase 2 Primary Authority";
const PLAN_NAME = "USPTO Fee Schedule — Exact Page";
const WORKER_LABEL = "phase2-uspto-fee-schedule";
const CANONICAL_URI =
  "https://www.uspto.gov/learning-and-resources/fees-and-payment/uspto-fee-schedule";

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function items(value: unknown): unknown[] {
  const container = record(value);
  return Array.isArray(container?.items) ? container.items : [];
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

function identifier(value: unknown, field: string): string {
  if (typeof value !== "string" || !value) {
    throw new Error(`Fee Schedule bootstrap response missing ${field}`);
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

function verifyCanonicalBoundary(): void {
  const url = new URL(CANONICAL_URI);
  if (
    url.protocol !== "https:" ||
    url.hostname !== "www.uspto.gov" ||
    url.pathname !== "/learning-and-resources/fees-and-payment/uspto-fee-schedule" ||
    url.search ||
    url.hash
  ) {
    throw new Error("USPTO Fee Schedule canonical boundary drifted");
  }
}

async function ensureConnector(baseUrl: string): Promise<void> {
  const existing = await requestJson(
    baseUrl,
    `/api/connectors/${CONNECTOR_ID}/${CONNECTOR_VERSION}`,
    {},
    [404],
  );
  if (existing.status !== 404) return;

  await requestJson(
    baseUrl,
    "/api/connectors",
    jsonPost({
      connectorId: CONNECTOR_ID,
      displayName: "Crawl4AI Web Connector — Production Pages + Attachments",
      version: CONNECTOR_VERSION,
      sourceTypes: ["WEB"],
      runtime: "PYTHON",
      capabilities: ["COLLECT", "DEEP_CRAWL", "RENDER_JAVASCRIPT", "FETCH_ATTACHMENTS"],
      supportedJobTypes: ["WEB_CRAWL"],
      configurationSchema: {
        type: "object",
        additionalProperties: false,
        properties: {
          renderJavascript: { type: "boolean" },
          maxDepth: { type: "integer", minimum: 0, maximum: 5 },
        },
      },
      secretSchema: { type: "object", properties: {} },
      outputArtifactKinds: [
        "HTML",
        "MARKDOWN",
        "PDF",
        "DOCX",
        "XLSX",
        "CSV",
        "JSON",
        "XML",
        "EMAIL",
        "IMAGE",
        "TEXT",
      ],
      healthCheck: { mode: "WORKER_PROBE", timeoutSeconds: 30 },
      status: "ACTIVE",
      extensions: {
        "x-markorbit-production-provider": true,
        "x-markorbit-crawl4ai-version": "0.9.2",
        "x-markorbit-evidence-boundary": "raw-pages-and-authorized-attachments",
      },
    }),
  );
}

async function ensureSource(baseUrl: string): Promise<string> {
  const existing = await requestJson(
    baseUrl,
    `/api/sources?q=${encodeURIComponent(SOURCE_SLUG)}&limit=100`,
  );
  for (const candidate of items(existing.body)) {
    const source = record(candidate);
    if (source?.slug === SOURCE_SLUG) {
      if (source.canonicalUri !== CANONICAL_URI) {
        throw new Error("Existing USPTO Fee Schedule Source canonical URI drifted");
      }
      return identifier(source.id, "source.id");
    }
  }

  const created = await requestJson(
    baseUrl,
    "/api/sources",
    jsonPost({
      name: SOURCE_NAME,
      slug: SOURCE_SLUG,
      sourceType: "WEB",
      category: "OFFICIAL_AUTHORITY",
      authorityLevel: "PRIMARY_OFFICIAL",
      status: "ACTIVE",
      jurisdictions: ["US"],
      languages: ["en-US"],
      connector: { connectorId: CONNECTOR_ID, version: CONNECTOR_VERSION },
      connectorConfig: { renderJavascript: false, maxDepth: 0 },
      canonicalUri: CANONICAL_URI,
      entrypoints: [{ uri: CANONICAL_URI, label: "USPTO Fee Schedule" }],
      tags: [
        "official",
        "primary-authority",
        "trademark",
        "fee-schedule",
        "us",
        "phase2",
      ],
      extensions: {
        "x-markorbit-phase2-primary-fee-authority": true,
        "x-markorbit-source-owner": "United States Patent and Trademark Office",
      },
    }),
  );
  const source = record(record(created.body)?.source);
  return identifier(source?.id, "source.id");
}

async function ensurePlan(baseUrl: string, sourceId: string): Promise<string> {
  const existing = await requestJson(
    baseUrl,
    `/api/plans?sourceId=${encodeURIComponent(sourceId)}&limit=100`,
  );
  for (const candidate of items(existing.body)) {
    const plan = record(record(candidate)?.plan);
    if (plan?.name === PLAN_NAME) return identifier(plan.id, "plan.id");
  }

  const created = await requestJson(
    baseUrl,
    "/api/plans",
    jsonPost({
      sourceId,
      name: PLAN_NAME,
      status: "ACTIVE",
      schedule: { mode: "MANUAL" },
      priority: "HIGH",
      policy: {
        includePatterns: [CANONICAL_URI],
        excludePatterns: ["*[?]*"],
        maxDepth: 0,
        maxItems: 1,
        renderJavascript: false,
        fetchAttachments: false,
        respectRobots: true,
        rateLimitPerMinute: 6,
        timeoutSeconds: 45,
        retry: { maxAttempts: 2, backoffSeconds: 15 },
        locale: "en-US",
      },
      output: { artifactKinds: ["HTML", "MARKDOWN"] },
      extensions: {
        "x-markorbit-phase2-primary-fee-authority": true,
        "x-markorbit-purpose": "official-fee-numeric-authority",
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
  const existing = await requestJson(
    baseUrl,
    `/api/workers?label=${encodeURIComponent(WORKER_LABEL)}&limit=100`,
  );
  for (const candidate of items(existing.body)) {
    const worker = record(record(candidate)?.worker);
    if (worker) {
      return { workerId: identifier(worker.id, "worker.id"), credential: null };
    }
  }

  const created = await requestJson(
    baseUrl,
    "/api/workers",
    jsonPost({
      displayName: "Crawl4AI USPTO Fee Schedule Phase 2 Worker",
      desiredState: "ACTIVE",
      runtime: { runtimeId: "crawl4ai-worker", version: "1.0.0" },
      supportedJobTypes: ["WEB_CRAWL"],
      connectorBindings: [
        {
          connectorId: CONNECTOR_ID,
          version: CONNECTOR_VERSION,
          capabilities: ["COLLECT", "DEEP_CRAWL", "RENDER_JAVASCRIPT", "FETCH_ATTACHMENTS"],
        },
      ],
      maxConcurrency: 1,
      labels: ["production", "crawl4ai", WORKER_LABEL],
      extensions: { "x-markorbit-phase2-primary-fee-authority": true },
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
      requestedBy: { actorType: "LOCAL_ADMIN", actorId: "phase2-uspto-fee-schedule" },
    }),
    headers: {
      "content-type": "application/json",
      "Idempotency-Key": `phase2-uspto-fee-schedule-${Date.now()}`,
    },
  });
  const recordValue = record(record(result.body)?.record);
  const run = record(recordValue?.run);
  return identifier(run?.id, "run.id");
}

async function main(): Promise<void> {
  verifyCanonicalBoundary();
  const rawBaseUrl = process.env.MARKORBIT_CONTROL_PLANE_URL?.trim() || "http://localhost:3000";
  const baseUrl = normalizedBaseUrl(rawBaseUrl);
  const shouldDispatch = process.argv.includes("--dispatch");

  await ensureConnector(baseUrl);
  const sourceId = await ensureSource(baseUrl);
  const planId = await ensurePlan(baseUrl, sourceId);
  const worker = await ensureWorker(baseUrl);
  const runId = shouldDispatch ? await dispatch(baseUrl, planId) : null;

  process.stdout.write(
    `${JSON.stringify(
      {
        controlPlaneUrl: baseUrl,
        connector: `${CONNECTOR_ID}@${CONNECTOR_VERSION}`,
        canonicalUri: CANONICAL_URI,
        sourceId,
        planId,
        workerId: worker.workerId,
        workerCredential: worker.credential,
        runId,
      },
      null,
      2,
    )}\n`,
  );
}

main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exitCode = 1;
});
