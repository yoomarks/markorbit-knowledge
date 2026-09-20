import {
  cnipaGazetteBrowserConnectorManifest,
  cnipaGazetteBrowserPlanPayload,
  cnipaGazetteBrowserSourcePayload,
  cnipaGazetteBrowserStreamJobFromContext,
  cnipaGazetteBrowserWorkerPayload,
  CNIPA_GAZETTE_BROWSER_SOURCE_MODE,
  CNIPA_GAZETTE_BROWSER_STREAM_PLAN_EXTENSION,
  CNIPA_GAZETTE_JOB_CONNECTOR_ID,
  CNIPA_GAZETTE_JOB_CONNECTOR_VERSION,
} from "@markorbit/worker-runtime";
import type { ArtifactBackedExecutionContext } from "@markorbit/worker-runtime";

type CliArguments = {
  workspaceId: string;
  announcementIssue: number;
  targetLogicalPagesPerCheckpoint: number;
  maxRuntimeSeconds: number;
  dispatch: boolean;
};

function valueAfter(args: string[], index: number, name: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
  return value;
}

function integer(raw: string, name: string, minimum: number, maximum: number): number {
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer from ${minimum} to ${maximum}`);
  }
  return value;
}

export function parseCnipaGazetteBrowserJobArguments(args: string[]): CliArguments {
  let workspaceId: string | undefined;
  let announcementIssue: number | undefined;
  let targetLogicalPagesPerCheckpoint = 24;
  let maxRuntimeSeconds = 21600;
  let dispatch = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    if (arg === "--workspace") {
      workspaceId = valueAfter(args, index, "--workspace");
      index += 1;
    } else if (arg === "--issue") {
      announcementIssue = integer(valueAfter(args, index, "--issue"), "--issue", 1, 999999);
      index += 1;
    } else if (arg === "--checkpoint-pages") {
      targetLogicalPagesPerCheckpoint = integer(
        valueAfter(args, index, "--checkpoint-pages"),
        "--checkpoint-pages",
        1,
        100,
      );
      index += 1;
    } else if (arg === "--max-runtime-seconds") {
      maxRuntimeSeconds = integer(
        valueAfter(args, index, "--max-runtime-seconds"),
        "--max-runtime-seconds",
        60,
        86400,
      );
      index += 1;
    } else if (arg === "--dispatch") {
      dispatch = true;
    } else {
      throw new Error(`Unknown CNIPA Gazette browser Job argument: ${arg}`);
    }
  }
  if (!workspaceId || !/^wsp_[0-9A-HJKMNP-TV-Z]{26}$/u.test(workspaceId)) {
    throw new Error("--workspace must be a Schema v1 workspace id");
  }
  if (!announcementIssue) throw new Error("--issue is required");
  return {
    workspaceId,
    announcementIssue,
    targetLogicalPagesPerCheckpoint,
    maxRuntimeSeconds,
    dispatch,
  };
}
function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function items(value: unknown): unknown[] {
  const root = record(value);
  return Array.isArray(root?.items) ? root.items : [];
}

function identifier(value: unknown, label: string, pattern: RegExp): string {
  if (typeof value !== "string" || !pattern.test(value)) throw new Error(`${label} is invalid`);
  return value;
}

function normalizedBaseUrl(raw: string): string {
  const url = new URL(raw);
  if (url.protocol !== "http:" && url.protocol !== "https:")
    throw new Error("MARKORBIT_CONTROL_PLANE_URL must use http or https");
  return url.toString().replace(/\/$/u, "");
}

async function requestJson(
  baseUrl: string,
  path: string,
  init: RequestInit = {},
  allowedStatuses: readonly number[] = [],
  fetcher: typeof fetch = fetch,
): Promise<{ status: number; body: unknown }> {
  const response = await fetcher(`${baseUrl}${path}`, init);
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

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
function verifyConnector(value: unknown): void {
  const connector = record(value);
  const expected = cnipaGazetteBrowserConnectorManifest();
  const extensions = record(connector?.extensions);
  if (
    connector?.connectorId !== expected.connectorId ||
    connector?.version !== expected.version ||
    connector?.runtime !== "NODE" ||
    !sameJson(connector?.sourceTypes, ["API"]) ||
    !sameJson(connector?.capabilities, ["COLLECT"]) ||
    !sameJson(connector?.supportedJobTypes, ["API_COLLECTION"]) ||
    !sameJson(connector?.outputArtifactKinds, ["JSON"]) ||
    !sameJson(connector?.configurationSchema, expected.configurationSchema) ||
    !sameJson(connector?.secretSchema, expected.secretSchema) ||
    extensions?.["x-markorbit-cnipa-gazette-browser-bridge"] !== true ||
    extensions?.["x-markorbit-browser-auth-owned-by-browser"] !== true
  ) {
    throw new Error(
      "Existing cnipa-trademark-gazette@1.0.0 connector drifted from browser-bridge contract",
    );
  }
}

async function ensureConnector(baseUrl: string, fetcher: typeof fetch): Promise<void> {
  const found = await requestJson(
    baseUrl,
    `/api/connectors/${CNIPA_GAZETTE_JOB_CONNECTOR_ID}/${CNIPA_GAZETTE_JOB_CONNECTOR_VERSION}`,
    {},
    [404],
    fetcher,
  );
  if (found.status !== 404) {
    verifyConnector(record(found.body)?.connector);
    return;
  }
  const created = await requestJson(
    baseUrl,
    "/api/connectors",
    jsonPost(cnipaGazetteBrowserConnectorManifest()),
    [],
    fetcher,
  );
  verifyConnector(record(created.body)?.connector ?? cnipaGazetteBrowserConnectorManifest());
}

function verifySource(source: Record<string, unknown>, workspaceId: string): void {
  const connector = record(source.connector);
  const config = record(source.connectorConfig);
  if (
    source.workspaceId !== workspaceId ||
    source.slug !== "cnipa-trademark-gazette-browser-bridge" ||
    source.sourceType !== "API" ||
    source.canonicalUri !== "https://pub.sbj.cnipa.gov.cn" ||
    connector?.connectorId !== CNIPA_GAZETTE_JOB_CONNECTOR_ID ||
    connector?.version !== CNIPA_GAZETTE_JOB_CONNECTOR_VERSION ||
    config?.acquisitionMode !== CNIPA_GAZETTE_BROWSER_SOURCE_MODE ||
    source.secretRef !== undefined
  ) {
    throw new Error("Existing CNIPA Gazette browser source drifted from the governed contract");
  }
}

async function ensureSource(
  baseUrl: string,
  workspaceId: string,
  fetcher: typeof fetch,
): Promise<string> {
  const list = await requestJson(
    baseUrl,
    `/api/sources?workspaceId=${encodeURIComponent(workspaceId)}&q=cnipa-trademark-gazette-browser-bridge&limit=100`,
    {},
    [],
    fetcher,
  );
  const matches = items(list.body)
    .map(record)
    .filter((item): item is Record<string, unknown> =>
      Boolean(item && item.slug === "cnipa-trademark-gazette-browser-bridge"),
    );
  if (matches.length > 1) throw new Error("Multiple governed CNIPA Gazette browser sources found");
  if (matches.length === 1) {
    verifySource(matches[0]!, workspaceId);
    return identifier(matches[0]!.id, "source.id", /^src_[0-9A-HJKMNP-TV-Z]{26}$/u);
  }
  const created = await requestJson(
    baseUrl,
    "/api/sources",
    jsonPost(cnipaGazetteBrowserSourcePayload(workspaceId)),
    [],
    fetcher,
  );
  const source = record(record(created.body)?.source);
  if (!source) throw new Error("Source create response is invalid");
  verifySource(source, workspaceId);
  return identifier(source.id, "source.id", /^src_[0-9A-HJKMNP-TV-Z]{26}$/u);
}
function verifyPlan(
  plan: Record<string, unknown>,
  expected: ReturnType<typeof cnipaGazetteBrowserPlanPayload>,
): void {
  const extension = record(record(plan.extensions)?.[CNIPA_GAZETTE_BROWSER_STREAM_PLAN_EXTENSION]);
  if (
    plan.name !== expected.name ||
    plan.sourceId !== expected.sourceId ||
    !sameJson(plan.schedule, { mode: "MANUAL" }) ||
    !sameJson(record(plan.output)?.artifactKinds, ["JSON"]) ||
    !sameJson(extension, expected.extensions[CNIPA_GAZETTE_BROWSER_STREAM_PLAN_EXTENSION]) ||
    record(plan.extensions)?.["x-markorbit-historical-replay-activated"] !== false
  ) {
    throw new Error(
      `Existing Gazette browser plan ${String(plan.name)} drifted from requested frozen scope`,
    );
  }
}

async function ensurePlan(
  baseUrl: string,
  input: CliArguments & { sourceId: string },
  fetcher: typeof fetch,
): Promise<string> {
  const expected = cnipaGazetteBrowserPlanPayload({
    workspaceId: input.workspaceId,
    sourceId: input.sourceId,
    announcementIssue: input.announcementIssue,
    targetLogicalPagesPerCheckpoint: input.targetLogicalPagesPerCheckpoint,
    maxRuntimeSeconds: input.maxRuntimeSeconds,
  });
  const list = await requestJson(
    baseUrl,
    `/api/plans?workspaceId=${encodeURIComponent(input.workspaceId)}&sourceId=${encodeURIComponent(input.sourceId)}&limit=100`,
    {},
    [],
    fetcher,
  );
  const matches = items(list.body)
    .map((item) => record(record(item)?.plan) ?? record(item))
    .filter((item): item is Record<string, unknown> =>
      Boolean(item && item.name === expected.name),
    );
  if (matches.length > 1)
    throw new Error(`Multiple Gazette browser plans found for issue ${input.announcementIssue}`);
  if (matches.length === 1) {
    verifyPlan(matches[0]!, expected);
    return identifier(matches[0]!.id, "plan.id", /^pln_[0-9A-HJKMNP-TV-Z]{26}$/u);
  }
  const created = await requestJson(baseUrl, "/api/plans", jsonPost(expected), [], fetcher);
  const wrapper = record(record(created.body)?.plan);
  const plan = record(wrapper?.plan) ?? wrapper;
  if (!plan) throw new Error("Plan create response is invalid");
  verifyPlan(plan, expected);
  return identifier(plan.id, "plan.id", /^pln_[0-9A-HJKMNP-TV-Z]{26}$/u);
}

function verifyWorker(worker: Record<string, unknown>, workspaceId: string): void {
  const bindings = Array.isArray(worker.connectorBindings)
    ? worker.connectorBindings.map(record)
    : [];
  const binding = bindings[0];
  if (
    worker.workspaceId !== workspaceId ||
    worker.maxConcurrency !== 1 ||
    !sameJson(worker.supportedJobTypes, ["API_COLLECTION"]) ||
    bindings.length !== 1 ||
    binding?.connectorId !== CNIPA_GAZETTE_JOB_CONNECTOR_ID ||
    binding?.version !== CNIPA_GAZETTE_JOB_CONNECTOR_VERSION ||
    !sameJson(binding?.capabilities, ["COLLECT"])
  ) {
    throw new Error("Existing CNIPA Gazette browser Worker drifted from the governed contract");
  }
}

async function ensureWorker(
  baseUrl: string,
  workspaceId: string,
  fetcher: typeof fetch,
): Promise<{ workerId: string; credential: string | null }> {
  const label = "cnipa-gazette-browser-bridge";
  const list = await requestJson(
    baseUrl,
    `/api/workers?workspaceId=${encodeURIComponent(workspaceId)}&label=${encodeURIComponent(label)}&limit=100`,
    {},
    [],
    fetcher,
  );
  const matches = items(list.body)
    .map((item) => record(record(item)?.worker) ?? record(item))
    .filter((item): item is Record<string, unknown> => Boolean(item));
  if (matches.length > 1) throw new Error("Multiple CNIPA Gazette browser Workers found");
  if (matches.length === 1) {
    verifyWorker(matches[0]!, workspaceId);
    return {
      workerId: identifier(matches[0]!.id, "worker.id", /^wrk_[0-9A-HJKMNP-TV-Z]{26}$/u),
      credential: null,
    };
  }
  const created = await requestJson(
    baseUrl,
    "/api/workers",
    jsonPost(cnipaGazetteBrowserWorkerPayload(workspaceId)),
    [],
    fetcher,
  );
  const view = record(record(created.body)?.view);
  const worker = record(view?.worker);
  if (!worker) throw new Error("Worker create response is invalid");
  verifyWorker(worker, workspaceId);
  const credential = record(created.body)?.credential;
  if (typeof credential !== "string" || !credential)
    throw new Error("Worker credential is missing from create response");
  return {
    workerId: identifier(worker.id, "worker.id", /^wrk_[0-9A-HJKMNP-TV-Z]{26}$/u),
    credential,
  };
}
function validateDispatchedJob(
  value: unknown,
  expected: { planId: string; sourceId: string; announcementIssue: number },
): string {
  const job = record(value);
  if (!job) throw new Error("Dispatched Job is invalid");
  if (job.planId !== expected.planId || job.sourceId !== expected.sourceId)
    throw new Error("Dispatched Job does not match prepared plan/source");
  const context = {
    workerId: "wrk_validation",
    leaseToken: "validation-only",
    lease: { id: "lse_validation" },
    job,
  } as unknown as ArtifactBackedExecutionContext;
  const parsed = cnipaGazetteBrowserStreamJobFromContext(context);
  if (parsed.announcementIssue !== expected.announcementIssue)
    throw new Error("Dispatched Job issue mismatch");
  return identifier(job.id, "job.id", /^job_[0-9A-HJKMNP-TV-Z]{26}$/u);
}

async function dispatch(
  baseUrl: string,
  input: { planId: string; sourceId: string; announcementIssue: number },
  fetcher: typeof fetch,
): Promise<{ runId: string; jobId: string; replayed: boolean }> {
  const result = await requestJson(
    baseUrl,
    "/api/runs",
    {
      ...jsonPost({ planId: input.planId }),
      headers: {
        "content-type": "application/json",
        "Idempotency-Key": `cnipa-gazette-browser-issue-${input.announcementIssue}-${input.planId}`,
      },
    },
    [],
    fetcher,
  );
  const root = record(result.body);
  const recordValue = record(root?.record);
  const run = record(recordValue?.run);
  const jobs = Array.isArray(recordValue?.jobs) ? recordValue.jobs : [];
  if (jobs.length !== 1)
    throw new Error(
      `Gazette browser dispatch must create exactly one Job; received ${jobs.length}`,
    );
  return {
    runId: identifier(run?.id, "run.id", /^run_[0-9A-HJKMNP-TV-Z]{26}$/u),
    jobId: validateDispatchedJob(jobs[0], input),
    replayed: root?.replayed === true,
  };
}

export async function prepareCnipaGazetteBrowserJob(
  args: CliArguments,
  options: { baseUrl: string; fetcher?: typeof fetch },
) {
  const baseUrl = normalizedBaseUrl(options.baseUrl);
  const fetcher = options.fetcher ?? fetch;
  await ensureConnector(baseUrl, fetcher);
  const sourceId = await ensureSource(baseUrl, args.workspaceId, fetcher);
  const planId = await ensurePlan(baseUrl, { ...args, sourceId }, fetcher);
  const worker = await ensureWorker(baseUrl, args.workspaceId, fetcher);
  const dispatched = args.dispatch
    ? await dispatch(
        baseUrl,
        { planId, sourceId, announcementIssue: args.announcementIssue },
        fetcher,
      )
    : null;
  return {
    controlPlaneUrl: baseUrl,
    workspaceId: args.workspaceId,
    announcementIssue: args.announcementIssue,
    sourceId,
    planId,
    workerId: worker.workerId,
    workerCredential: worker.credential,
    dispatched: args.dispatch,
    runId: dispatched?.runId ?? null,
    jobId: dispatched?.jobId ?? null,
    replayed: dispatched?.replayed ?? false,
    historicalReplayActivated: false,
  };
}

async function main(): Promise<void> {
  const args = parseCnipaGazetteBrowserJobArguments(process.argv.slice(2));
  const baseUrl = process.env.MARKORBIT_CONTROL_PLANE_URL?.trim();
  if (!baseUrl) throw new Error("MARKORBIT_CONTROL_PLANE_URL is required");
  const result = await prepareCnipaGazetteBrowserJob(args, { baseUrl });
  process.stdout.write(
    `${JSON.stringify(
      {
        ...result,
        workerCredential: result.workerCredential ?? null,
        credentialNote: result.workerCredential
          ? "Worker credential returned once; store it as MARKORBIT_WORKER_CREDENTIAL before starting the bridge."
          : "Existing Worker reused; credential is intentionally not recoverable. Rotate only if the stored credential is unavailable.",
        nextCommand: result.jobId
          ? `pnpm --filter @markorbit/worker cnipa:gazette:browser-bridge -- --job ${result.jobId} --extension-origin chrome-extension://<extension-id>`
          : "Re-run this preparation with --dispatch when ready to create the exact governed Job.",
      },
      null,
      2,
    )}\n`,
  );
}

if (process.env.VITEST !== "true") {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
