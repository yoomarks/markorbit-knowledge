import {
  CNIPA_CONNECTOR_ID,
  CNIPA_CONNECTOR_VERSION,
} from "@markorbit/worker-runtime/cnipa-artifact-acquirer";
import {
  CNIPA_FAST_QUERY_TEMPLATE_EXTENSION_KEY,
  CNIPA_FAST_SOURCE_SPECS,
  cnipaConnectorManifest,
  cnipaFastPlanPayload,
  cnipaFastWorkerPayload,
  cnipaSourceConnectorConfig,
  type CnipaFastSourceSpec,
} from "./cnipa-fast-bootstrap-spec";

const WORKER_LABEL = "cnipa-fast-worker-v1";

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function items(value: unknown): unknown[] {
  const container = record(value);
  return Array.isArray(container?.items) ? container.items : [];
}

function identifier(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Bootstrap response missing ${field}`);
  }
  return value;
}

function envInteger(name: string, fallback: number, minimum: number, maximum: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer in ${minimum}..${maximum}`);
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

function sameStrings(value: unknown, expected: readonly string[]): boolean {
  return (
    Array.isArray(value) &&
    value.length === expected.length &&
    value.every((item, index) => item === expected[index])
  );
}

async function ensureConnector(baseUrl: string): Promise<void> {
  const existing = await requestJson(
    baseUrl,
    `/api/connectors/${CNIPA_CONNECTOR_ID}/${CNIPA_CONNECTOR_VERSION}`,
    {},
    [404],
  );
  if (existing.status !== 404) return;

  await requestJson(baseUrl, "/api/connectors", jsonPost(cnipaConnectorManifest()));
}

function verifyExistingSource(source: Record<string, unknown>, spec: CnipaFastSourceSpec): void {
  const connector = record(source.connector);
  const config = record(source.connectorConfig);
  const responseSchema = record(config?.responseSchema);
  const listSchema = record(responseSchema?.list);

  if (
    source.canonicalUri !== spec.canonicalUri ||
    connector?.connectorId !== CNIPA_CONNECTOR_ID ||
    connector?.version !== CNIPA_CONNECTOR_VERSION ||
    listSchema?.sourceRecordIdField !== spec.sourceRecordIdField ||
    config?.query !== undefined
  ) {
    throw new Error(`Existing CNIPA source ${spec.slug} drifted from the FAST source contract`);
  }
}

async function ensureSource(baseUrl: string, spec: CnipaFastSourceSpec): Promise<string> {
  const existing = await requestJson(
    baseUrl,
    `/api/sources?q=${encodeURIComponent(spec.slug)}&limit=100`,
  );
  for (const candidate of items(existing.body)) {
    const source = record(candidate);
    if (source?.slug !== spec.slug) continue;
    verifyExistingSource(source, spec);
    return identifier(source.id, "source.id");
  }

  const created = await requestJson(
    baseUrl,
    "/api/sources",
    jsonPost({
      name: spec.name,
      slug: spec.slug,
      sourceType: "API",
      category: "OFFICIAL_AUTHORITY",
      authorityLevel: "PRIMARY_OFFICIAL",
      status: "ACTIVE",
      jurisdictions: ["CN"],
      languages: ["zh-CN"],
      connector: { connectorId: CNIPA_CONNECTOR_ID, version: CNIPA_CONNECTOR_VERSION },
      connectorConfig: cnipaSourceConnectorConfig(spec),
      canonicalUri: spec.canonicalUri,
      entrypoints: [{ uri: spec.canonicalUri, label: spec.name }],
      tags: [...spec.tags, "official", "primary-authority", "cn"],
      extensions: {
        "x-markorbit-source-owner": "China National Intellectual Property Administration",
        "x-markorbit-cnipa-document-kind": spec.documentKind,
        "x-markorbit-cnipa-source-record-id-field": spec.sourceRecordIdField,
        "x-markorbit-cnipa-traffic-class": "FAST_LIST",
        "x-markorbit-cnipa-static-query": false,
        "x-markorbit-detail-lane": "SEPARATE_SLOW_ENRICHMENT",
      },
    }),
  );

  const source = record(record(created.body)?.source);
  return identifier(source?.id, "source.id");
}

function verifyExistingPlan(
  plan: Record<string, unknown>,
  spec: CnipaFastSourceSpec,
  expected: ReturnType<typeof cnipaFastPlanPayload>,
): void {
  const schedule = record(plan.schedule);
  const output = record(plan.output);
  const extensions = record(plan.extensions);
  const template = record(extensions?.[CNIPA_FAST_QUERY_TEMPLATE_EXTENSION_KEY]);

  if (
    schedule?.mode !== "CRON" ||
    schedule?.expression !== expected.schedule.expression ||
    schedule?.timezone !== expected.schedule.timezone ||
    !sameStrings(output?.artifactKinds, ["JSON", "MARKDOWN"]) ||
    template?.mode !== "WEEKDAY_INCREMENTAL_DATE_RANGE" ||
    !sameStrings(template?.documentKinds, [spec.documentKind]) ||
    template?.timezone !== expected.schedule.timezone ||
    extensions?.["x-markorbit.cnipa-detail-fanout"] !== false
  ) {
    throw new Error(`Existing CNIPA plan for ${spec.slug} drifted from the FAST plan contract`);
  }
}

async function ensurePlan(
  baseUrl: string,
  sourceId: string,
  spec: CnipaFastSourceSpec,
  hour: number,
  minute: number,
): Promise<string> {
  const expected = cnipaFastPlanPayload(sourceId, spec, { hour, minute });
  const existing = await requestJson(
    baseUrl,
    `/api/plans?sourceId=${encodeURIComponent(sourceId)}&limit=100`,
  );

  for (const candidate of items(existing.body)) {
    const plan = record(record(candidate)?.plan);
    if (plan?.name !== expected.name) continue;
    verifyExistingPlan(plan, spec, expected);
    return identifier(plan.id, "plan.id");
  }

  const created = await requestJson(baseUrl, "/api/plans", jsonPost(expected));
  const createdRecord = record(record(created.body)?.plan);
  const plan = record(createdRecord?.plan);
  return identifier(plan?.id, "plan.id");
}

function verifyExistingWorker(worker: Record<string, unknown>): void {
  const bindings = Array.isArray(worker.connectorBindings) ? worker.connectorBindings : [];
  const binding = record(bindings[0]);
  if (
    worker.maxConcurrency !== 1 ||
    !sameStrings(worker.supportedJobTypes, ["API_COLLECTION"]) ||
    bindings.length !== 1 ||
    binding?.connectorId !== CNIPA_CONNECTOR_ID ||
    binding?.version !== CNIPA_CONNECTOR_VERSION ||
    !sameStrings(binding?.capabilities, ["COLLECT"])
  ) {
    throw new Error("Existing CNIPA FAST worker drifted from the serialized worker contract");
  }
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
    if (!worker) continue;
    verifyExistingWorker(worker);
    return { workerId: identifier(worker.id, "worker.id"), credential: null };
  }

  const created = await requestJson(baseUrl, "/api/workers", jsonPost(cnipaFastWorkerPayload()));
  const view = record(record(created.body)?.view);
  const worker = record(view?.worker);
  return {
    workerId: identifier(worker?.id, "worker.id"),
    credential: identifier(record(created.body)?.credential, "worker.credential"),
  };
}

async function dispatch(baseUrl: string, planId: string, key: string): Promise<string> {
  const result = await requestJson(baseUrl, "/api/runs", {
    ...jsonPost({
      planId,
      requestedBy: { actorType: "LOCAL_ADMIN", actorId: "bootstrap-cnipa-fast" },
    }),
    headers: {
      "content-type": "application/json",
      "Idempotency-Key": `bootstrap-cnipa-fast-${key}-${new Date().toISOString().slice(0, 10)}`,
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
  const hour = envInteger("MARKORBIT_CNIPA_FAST_HOUR_SHANGHAI", 8, 0, 23);
  const minute = envInteger("MARKORBIT_CNIPA_FAST_MINUTE_SHANGHAI", 30, 0, 59);
  const shouldDispatch = process.argv.includes("--dispatch");

  await ensureConnector(baseUrl);

  const sources: Array<{
    key: string;
    sourceId: string;
    planId: string;
    runId: string | null;
  }> = [];

  for (const spec of CNIPA_FAST_SOURCE_SPECS) {
    const sourceId = await ensureSource(baseUrl, spec);
    const planId = await ensurePlan(baseUrl, sourceId, spec, hour, minute);
    const runId = shouldDispatch ? await dispatch(baseUrl, planId, spec.key) : null;
    sources.push({ key: spec.key, sourceId, planId, runId });
  }

  const worker = await ensureWorker(baseUrl);

  process.stdout.write(
    `${JSON.stringify(
      {
        controlPlaneUrl: baseUrl,
        connector: `${CNIPA_CONNECTOR_ID}@${CNIPA_CONNECTOR_VERSION}`,
        trafficClass: "FAST_LIST",
        timezone: "Asia/Shanghai",
        schedule: `${minute} ${hour} * * 1-5`,
        sources,
        workerId: worker.workerId,
        workerCredential: worker.credential,
        dispatched: shouldDispatch,
        credentialNote: worker.credential
          ? "Credential is returned once. Store it as MARKORBIT_WORKER_CREDENTIAL for the CNIPA Worker."
          : "Existing CNIPA Worker reused. Its credential is intentionally not recoverable; rotate it in the control plane if needed.",
        runtimeNote:
          "Run the worker with MARKORBIT_COLLECTION_PROVIDER=cnipa and the operator-managed CNIPA browser session environment.",
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
