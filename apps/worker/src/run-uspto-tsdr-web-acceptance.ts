import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  ControlledCollectionWorkerRuntime,
  Crawl4AiSubprocessAcquirer,
  HttpControlledCollectionClient,
  UsptoTsdrStaticWebArtifactAcquirer,
  UsptoTsdrWebArtifactAcquirer,
} from "@markorbit/worker-runtime";
import {
  parseUsptoTsdrWebAcceptancePlan,
  usptoTsdrWebAcceptanceCollectionPlanPayload,
  usptoTsdrWebAcceptancePlanSha256,
  usptoTsdrWebAcceptanceSourcePayload,
  usptoTsdrWebAcceptanceWorkerPayload,
  type UsptoTsdrWebAcceptancePlan,
} from "./uspto-tsdr-web-acceptance-plan";

type CliArguments = {
  planPath: string;
  apply: boolean;
  dispatch: boolean;
  expectedSha?: string;
  authorityToken?: string;
};

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function identifier(value: unknown, label: string): string {
  if (typeof value !== "string" || !value) throw new Error(`TSDR Web acceptance missing ${label}`);
  return value;
}

function normalizedBaseUrl(raw: string): string {
  const url = new URL(raw);
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Control-plane URL must use http or https");
  }
  return url.toString().replace(/\/$/u, "");
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return JSON.stringify(value.map((item) => JSON.parse(stable(item))));
  if (value && typeof value === "object") {
    return JSON.stringify(
      Object.fromEntries(
        Object.entries(value as Record<string, unknown>)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, item]) => [key, JSON.parse(stable(item))]),
      ),
    );
  }
  return JSON.stringify(value);
}

export function assertTsdrWebAcceptancePathOutsideWorkingTree(
  target: string,
  workingDirectory = process.cwd(),
): string {
  if (!path.isAbsolute(target)) throw new Error("TSDR Web acceptance plan path must be absolute");
  const resolvedTarget = path.resolve(target);
  const root = path.resolve(workingDirectory);
  const relative = path.relative(root, resolvedTarget);
  if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))) {
    throw new Error(
      "TSDR Web acceptance frozen plan must live outside the repository working tree",
    );
  }
  return resolvedTarget;
}

export async function loadUsptoTsdrWebAcceptancePlanFile(
  planPath: string,
  workingDirectory = process.cwd(),
): Promise<{ plan: UsptoTsdrWebAcceptancePlan; planSha256: string; absolutePath: string }> {
  const absolutePath = assertTsdrWebAcceptancePathOutsideWorkingTree(planPath, workingDirectory);
  const bytes = await readFile(absolutePath);
  const parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
  const plan = parseUsptoTsdrWebAcceptancePlan(parsed);
  return { plan, planSha256: usptoTsdrWebAcceptancePlanSha256(plan), absolutePath };
}

function valueAfter(args: string[], index: number, name: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
  return value;
}

export function parseUsptoTsdrWebAcceptanceArguments(args: string[]): CliArguments {
  let planPath: string | undefined;
  let expectedSha: string | undefined;
  let authorityToken: string | undefined;
  let apply = false;
  let dispatch = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    if (arg === "--plan") {
      planPath = valueAfter(args, index, "--plan");
      index += 1;
    } else if (arg === "--apply") {
      apply = true;
    } else if (arg === "--dispatch") {
      dispatch = true;
    } else if (arg === "--expected-sha") {
      expectedSha = valueAfter(args, index, "--expected-sha");
      index += 1;
    } else if (arg === "--authority-token") {
      authorityToken = valueAfter(args, index, "--authority-token");
      index += 1;
    } else {
      throw new Error(`Unknown TSDR Web acceptance argument: ${arg}`);
    }
  }
  if (!planPath) throw new Error("--plan is required");
  if (dispatch && !apply) throw new Error("--dispatch requires --apply");
  if (apply && !dispatch) {
    throw new Error("--apply requires --dispatch for APPLY_DISPATCH_ONCE acceptance");
  }
  if (apply && (!expectedSha || !authorityToken)) {
    throw new Error("--apply requires --expected-sha and --authority-token");
  }
  return {
    planPath: path.resolve(planPath),
    apply,
    dispatch,
    ...(expectedSha ? { expectedSha } : {}),
    ...(authorityToken ? { authorityToken } : {}),
  };
}

export function expectedUsptoTsdrWebAcceptanceAuthorityToken(
  plan: UsptoTsdrWebAcceptancePlan,
  planSha256: string,
): string {
  return `GO #842 TSDR-WEB ${plan.operationId} ${plan.stage} ${planSha256}`;
}

export function assertUsptoTsdrWebAcceptanceAuthority(input: {
  plan: UsptoTsdrWebAcceptancePlan;
  planSha256: string;
  expectedSha?: string;
  authorityToken?: string;
}): { authorityTokenSha256: string } {
  if (!/^[a-f0-9]{64}$/u.test(input.planSha256)) throw new Error("Computed plan SHA is invalid");
  if (input.expectedSha !== input.planSha256) {
    throw new Error("TSDR Web acceptance expected SHA does not match the frozen plan");
  }
  const expected = expectedUsptoTsdrWebAcceptanceAuthorityToken(input.plan, input.planSha256);
  if (input.authorityToken !== expected) {
    throw new Error("TSDR Web acceptance authority token does not match the frozen plan and stage");
  }
  return { authorityTokenSha256: createHash("sha256").update(expected).digest("hex") };
}

async function acceptanceRequest(
  baseUrl: string,
  plan: UsptoTsdrWebAcceptancePlan,
  planSha256: string,
  authorityToken: string,
  operation: string,
  payload: Record<string, unknown> = {},
): Promise<{ status: number; body: unknown }> {
  const internalSecret = process.env.MO_INTERNAL_SERVICE_SECRET?.trim();
  if (!internalSecret) throw new Error("MO_INTERNAL_SERVICE_SECRET is required for TSDR Web apply");
  const requestPath = "/api/internal/uspto-tsdr-web/acceptance";
  const response = await fetch(`${baseUrl}${requestPath}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-markorbit-internal-authorization": internalSecret,
      "x-markorbit-tsdr-web-authority": authorityToken,
    },
    body: JSON.stringify({
      workspaceId: plan.workspaceId,
      operation,
      authority: { frozenPlan: plan, planSha256 },
      payload,
    }),
  });
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  if (!response.ok) {
    const error = record(record(body)?.error);
    const message = typeof error?.message === "string" ? error.message : `HTTP ${response.status}`;
    throw new Error(`${requestPath}: ${message}`);
  }
  return { status: response.status, body };
}

function items(value: unknown): unknown[] {
  const container = record(value);
  return Array.isArray(container?.items) ? container.items : [];
}

async function ensureConnector(
  baseUrl: string,
  plan: UsptoTsdrWebAcceptancePlan,
  sha: string,
  token: string,
): Promise<void> {
  const response = await acceptanceRequest(baseUrl, plan, sha, token, "GET_CONNECTOR");
  if (!record(record(response.body)?.connector)) {
    throw new Error("Governed crawl4ai-web connector is unavailable");
  }
}

async function ensureSource(
  baseUrl: string,
  plan: UsptoTsdrWebAcceptancePlan,
  sha: string,
  token: string,
): Promise<string> {
  const expected = usptoTsdrWebAcceptanceSourcePayload(plan);
  const listed = await acceptanceRequest(baseUrl, plan, sha, token, "LIST_SOURCES", {
    slug: expected.slug,
  });
  for (const item of items(listed.body)) {
    const source = record(record(item)?.source) ?? record(item);
    if (!source || source.slug !== expected.slug) continue;
    if (
      source.canonicalUri !== expected.canonicalUri ||
      stable(source.connector) !== stable(expected.connector) ||
      stable(source.extensions) !== stable(expected.extensions)
    ) {
      throw new Error("Existing TSDR Web Source drifted from frozen authority");
    }
    return identifier(source.id, "source.id");
  }
  const created = await acceptanceRequest(baseUrl, plan, sha, token, "CREATE_SOURCE", {
    source: expected,
  });
  const outer = record(record(created.body)?.source);
  const source = record(outer?.source) ?? outer;
  return identifier(source?.id, "source.id");
}

async function ensurePlan(
  baseUrl: string,
  sourceId: string,
  plan: UsptoTsdrWebAcceptancePlan,
  sha: string,
  token: string,
): Promise<string> {
  const expected = usptoTsdrWebAcceptanceCollectionPlanPayload(sourceId, plan);
  const listed = await acceptanceRequest(baseUrl, plan, sha, token, "LIST_PLANS", { sourceId });
  for (const item of items(listed.body)) {
    const candidate = record(record(item)?.plan) ?? record(item);
    if (!candidate || candidate.name !== expected.name) continue;
    const extensions = record(candidate.extensions);
    if (extensions?.["x-markorbit-tsdr-web-frozen-plan-sha256"] !== sha) {
      throw new Error("Existing TSDR Web CollectionPlan drifted from frozen SHA");
    }
    return identifier(candidate.id, "plan.id");
  }
  const created = await acceptanceRequest(baseUrl, plan, sha, token, "CREATE_PLAN", {
    plan: expected,
  });
  const outer = record(record(created.body)?.plan);
  const collectionPlan = record(outer?.plan) ?? outer;
  return identifier(collectionPlan?.id, "plan.id");
}

async function provisionWorker(
  baseUrl: string,
  plan: UsptoTsdrWebAcceptancePlan,
  sha: string,
  token: string,
): Promise<{ workerId: string; credential: string }> {
  const response = await acceptanceRequest(baseUrl, plan, sha, token, "PROVISION_WORKER", {
    worker: usptoTsdrWebAcceptanceWorkerPayload(plan.workspaceId),
  });
  const body = record(response.body);
  return {
    workerId: identifier(body?.workerId, "workerId"),
    credential: identifier(body?.credential, "worker credential"),
  };
}

async function dispatch(
  baseUrl: string,
  plan: UsptoTsdrWebAcceptancePlan,
  collectionPlanId: string,
  sha: string,
  token: string,
): Promise<{ runId: string; jobId: string }> {
  const response = await acceptanceRequest(baseUrl, plan, sha, token, "DISPATCH_RUN", {
    planId: collectionPlanId,
    idempotencyKey: `tsdr-web-acceptance-${plan.operationId}-${sha}`,
  });
  const value = record(record(response.body)?.record);
  const run = record(value?.run);
  const jobs = Array.isArray(value?.jobs) ? value.jobs : [];
  const job = record(jobs[0]);
  if (jobs.length !== 1 || !job)
    throw new Error("TSDR Web acceptance must dispatch exactly one Job");
  return { runId: identifier(run?.id, "run.id"), jobId: identifier(job.id, "job.id") };
}

async function runOneShot(
  baseUrl: string,
  worker: { workerId: string; credential: string },
  jobId: string,
  plan: UsptoTsdrWebAcceptancePlan,
): Promise<void> {
  const acquirer =
    plan.transportMode === "STATIC_HTTP_PINNED"
      ? new UsptoTsdrStaticWebArtifactAcquirer()
      : new UsptoTsdrWebArtifactAcquirer({
          delegate: new Crawl4AiSubprocessAcquirer({
            maxDepth: 0,
            maxItems: 1,
            maxConcurrency: 1,
            maxProcessTimeoutMs: 180_000,
          }),
        });
  const runtime = new ControlledCollectionWorkerRuntime(
    new HttpControlledCollectionClient(baseUrl, worker.workerId, worker.credential),
    acquirer,
    { runtimeVersion: "1.0.0" },
  );
  if (!(await runtime.runOnce(jobId))) {
    throw new Error("Governed TSDR Web one-shot Worker did not claim the dispatched Job");
  }
}

export async function applyUsptoTsdrWebAcceptancePlan(input: {
  baseUrl: string;
  plan: UsptoTsdrWebAcceptancePlan;
  planSha256: string;
  authorityToken: string;
}): Promise<{ sourceId: string; collectionPlanId: string; workerId: string; runId: string }> {
  await ensureConnector(input.baseUrl, input.plan, input.planSha256, input.authorityToken);
  const sourceId = await ensureSource(
    input.baseUrl,
    input.plan,
    input.planSha256,
    input.authorityToken,
  );
  const collectionPlanId = await ensurePlan(
    input.baseUrl,
    sourceId,
    input.plan,
    input.planSha256,
    input.authorityToken,
  );
  const worker = await provisionWorker(
    input.baseUrl,
    input.plan,
    input.planSha256,
    input.authorityToken,
  );
  const dispatched = await dispatch(
    input.baseUrl,
    input.plan,
    collectionPlanId,
    input.planSha256,
    input.authorityToken,
  );
  await runOneShot(input.baseUrl, worker, dispatched.jobId, input.plan);
  return { sourceId, collectionPlanId, workerId: worker.workerId, runId: dispatched.runId };
}

async function main(): Promise<void> {
  const args = parseUsptoTsdrWebAcceptanceArguments(process.argv.slice(2));
  const loaded = await loadUsptoTsdrWebAcceptancePlanFile(args.planPath);
  const expectedAuthorityToken = expectedUsptoTsdrWebAcceptanceAuthorityToken(
    loaded.plan,
    loaded.planSha256,
  );

  if (!args.apply) {
    process.stdout.write(
      `${JSON.stringify({
        event: "uspto_tsdr_web.acceptance.plan_validated",
        operationId: loaded.plan.operationId,
        stage: loaded.plan.stage,
        serialNumber: loaded.plan.serialNumber,
        planSha256: loaded.planSha256,
        applyPerformed: false,
        dispatchPerformed: false,
        expectedAuthorityToken,
        message: "Frozen Web plan validated only. No mutation and no USPTO request was performed.",
      })}\n`,
    );
    return;
  }

  const authority = assertUsptoTsdrWebAcceptanceAuthority({
    plan: loaded.plan,
    planSha256: loaded.planSha256,
    expectedSha: args.expectedSha,
    authorityToken: args.authorityToken,
  });
  const raw = process.env.MARKORBIT_CONTROL_PLANE_URL?.trim();
  if (!raw) throw new Error("MARKORBIT_CONTROL_PLANE_URL is required for TSDR Web apply");
  const result = await applyUsptoTsdrWebAcceptancePlan({
    baseUrl: normalizedBaseUrl(raw),
    plan: loaded.plan,
    planSha256: loaded.planSha256,
    authorityToken: args.authorityToken!,
  });
  process.stdout.write(
    `${JSON.stringify({
      event: "uspto_tsdr_web.acceptance.dispatched",
      operationId: loaded.plan.operationId,
      stage: loaded.plan.stage,
      planSha256: loaded.planSha256,
      authorityTokenSha256: authority.authorityTokenSha256,
      ...result,
      dispatchPerformed: true,
    })}\n`,
  );
}

if (process.env.VITEST !== "true") {
  main().catch((error) => {
    process.stderr.write(
      `${JSON.stringify({
        event: "uspto_tsdr_web.acceptance.failed",
        message: error instanceof Error ? error.message : "USPTO TSDR Web acceptance failed",
      })}\n`,
    );
    process.exitCode = 1;
  });
}
