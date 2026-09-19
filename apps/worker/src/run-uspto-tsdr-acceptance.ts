import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  parseUsptoTsdrAcceptancePlan,
  usptoTsdrAcceptanceCollectionPlanPayload,
  usptoTsdrAcceptanceConnectorManifest,
  usptoTsdrAcceptancePlanSha256,
  usptoTsdrAcceptanceSourcePayload,
  usptoTsdrAcceptanceWorkerPayload,
  type UsptoTsdrAcceptancePlan,
} from "./uspto-tsdr-acceptance-plan";

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
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`TSDR acceptance response missing ${label}`);
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

function stable(value: unknown): string {
  if (Array.isArray(value)) return JSON.stringify(value.map((item) => JSON.parse(stable(item))));
  if (value && typeof value === "object") {
    const sorted = Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, JSON.parse(stable(item))]),
    );
    return JSON.stringify(sorted);
  }
  return JSON.stringify(value);
}

export function assertTsdrAcceptancePathOutsideWorkingTree(
  target: string,
  workingDirectory = process.cwd(),
): string {
  if (!path.isAbsolute(target)) {
    throw new Error("TSDR acceptance plan path must be absolute");
  }
  const resolvedTarget = path.resolve(target);
  const resolvedWorkingDirectory = path.resolve(workingDirectory);
  const relative = path.relative(resolvedWorkingDirectory, resolvedTarget);
  const inside = relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
  if (inside) {
    throw new Error("TSDR acceptance frozen plan must live outside the repository working tree");
  }
  return resolvedTarget;
}

export async function loadUsptoTsdrAcceptancePlanFile(
  planPath: string,
  workingDirectory = process.cwd(),
): Promise<{ plan: UsptoTsdrAcceptancePlan; planSha256: string; absolutePath: string }> {
  const absolutePath = assertTsdrAcceptancePathOutsideWorkingTree(planPath, workingDirectory);
  const bytes = await readFile(absolutePath);
  const parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
  const plan = parseUsptoTsdrAcceptancePlan(parsed);
  return {
    plan,
    planSha256: usptoTsdrAcceptancePlanSha256(plan),
    absolutePath,
  };
}

function valueAfter(args: string[], index: number, name: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value`);
  return value;
}

export function parseUsptoTsdrAcceptanceArguments(args: string[]): CliArguments {
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
      continue;
    }
    if (arg === "--apply") {
      apply = true;
      continue;
    }
    if (arg === "--dispatch") {
      dispatch = true;
      continue;
    }
    if (arg === "--expected-sha") {
      expectedSha = valueAfter(args, index, "--expected-sha");
      index += 1;
      continue;
    }
    if (arg === "--authority-token") {
      authorityToken = valueAfter(args, index, "--authority-token");
      index += 1;
      continue;
    }
    throw new Error(`Unknown TSDR acceptance argument: ${arg}`);
  }

  if (!planPath) throw new Error("--plan is required");
  if (dispatch && !apply) throw new Error("--dispatch requires --apply");
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

export function expectedUsptoTsdrAcceptanceAuthorityToken(
  plan: UsptoTsdrAcceptancePlan,
  planSha256: string,
): string {
  return `GO #741 TSDR ${plan.operationId} ${plan.stage} ${planSha256}`;
}

export function assertUsptoTsdrAcceptanceAuthority(input: {
  plan: UsptoTsdrAcceptancePlan;
  planSha256: string;
  expectedSha?: string;
  authorityToken?: string;
}): { authorityTokenSha256: string } {
  if (!/^[a-f0-9]{64}$/.test(input.planSha256)) throw new Error("Computed plan SHA is invalid");
  if (input.expectedSha !== input.planSha256) {
    throw new Error("TSDR acceptance expected SHA does not match the frozen plan");
  }
  const expectedToken = expectedUsptoTsdrAcceptanceAuthorityToken(input.plan, input.planSha256);
  if (input.authorityToken !== expectedToken) {
    throw new Error("TSDR acceptance authority token does not match the frozen plan and stage");
  }
  return {
    authorityTokenSha256: createHash("sha256").update(input.authorityToken).digest("hex"),
  };
}

async function requestJson(
  baseUrl: string,
  requestPath: string,
  init: RequestInit = {},
  allowedStatuses: number[] = [],
): Promise<{ status: number; body: unknown }> {
  const response = await fetch(`${baseUrl}${requestPath}`, init);
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  if (!response.ok && !allowedStatuses.includes(response.status)) {
    const error = record(record(body)?.error);
    const message = typeof error?.message === "string" ? error.message : `HTTP ${response.status}`;
    throw new Error(`${requestPath}: ${message}`);
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

function items(value: unknown): unknown[] {
  const container = record(value);
  return Array.isArray(container?.items) ? container.items : [];
}

async function ensureConnector(baseUrl: string): Promise<void> {
  const manifest = usptoTsdrAcceptanceConnectorManifest();
  const existing = await requestJson(
    baseUrl,
    `/api/connectors/${manifest.connectorId}/${manifest.version}`,
    {},
    [404],
  );
  if (existing.status === 404) {
    await requestJson(baseUrl, "/api/connectors", jsonPost(manifest));
    return;
  }
  const current = record(existing.body);
  const connector = record(current?.connector) ?? current;
  if (connector?.connectorId !== manifest.connectorId || connector?.version !== manifest.version) {
    throw new Error("Existing TSDR connector drifted from the frozen connector identity");
  }
}

function assertExistingSource(
  source: Record<string, unknown>,
  expected: ReturnType<typeof usptoTsdrAcceptanceSourcePayload>,
): void {
  if (
    source.slug !== expected.slug ||
    source.secretRef !== expected.secretRef ||
    source.canonicalUri !== expected.canonicalUri ||
    stable(source.connector) !== stable(expected.connector) ||
    stable(source.connectorConfig) !== stable(expected.connectorConfig)
  ) {
    throw new Error("Existing TSDR acceptance source drifted from the frozen plan");
  }
}

async function ensureSource(baseUrl: string, plan: UsptoTsdrAcceptancePlan): Promise<string> {
  const expected = usptoTsdrAcceptanceSourcePayload(plan);
  const existing = await requestJson(
    baseUrl,
    `/api/sources?q=${encodeURIComponent(expected.slug)}&limit=100`,
  );
  for (const candidate of items(existing.body)) {
    const source = record(candidate);
    if (source?.slug !== expected.slug) continue;
    assertExistingSource(source, expected);
    return identifier(source.id, "source.id");
  }

  const created = await requestJson(baseUrl, "/api/sources", jsonPost(expected));
  const source = record(record(created.body)?.source);
  return identifier(source?.id, "source.id");
}

function assertExistingPlan(
  collectionPlan: Record<string, unknown>,
  expected: ReturnType<typeof usptoTsdrAcceptanceCollectionPlanPayload>,
): void {
  const schedule = record(collectionPlan.schedule);
  const policy = record(collectionPlan.policy);
  const output = record(collectionPlan.output);
  const extensions = record(collectionPlan.extensions);
  const expectedExtensions = record(expected.extensions)!;
  if (
    collectionPlan.name !== expected.name ||
    schedule?.mode !== "MANUAL" ||
    policy?.maxItems !== 1 ||
    policy?.rateLimitPerMinute !== expected.policy.rateLimitPerMinute ||
    stable(output?.artifactKinds) !== stable(expected.output.artifactKinds) ||
    extensions?.["x-markorbit-tsdr-frozen-plan-sha256"] !==
      expectedExtensions["x-markorbit-tsdr-frozen-plan-sha256"]
  ) {
    throw new Error("Existing TSDR acceptance CollectionPlan drifted from the frozen plan");
  }
}

async function ensureCollectionPlan(
  baseUrl: string,
  sourceId: string,
  plan: UsptoTsdrAcceptancePlan,
): Promise<string> {
  const expected = usptoTsdrAcceptanceCollectionPlanPayload(sourceId, plan);
  const existing = await requestJson(
    baseUrl,
    `/api/plans?sourceId=${encodeURIComponent(sourceId)}&limit=100`,
  );
  for (const candidate of items(existing.body)) {
    const container = record(candidate);
    const collectionPlan = record(container?.plan) ?? container;
    if (collectionPlan?.name !== expected.name) continue;
    assertExistingPlan(collectionPlan, expected);
    return identifier(collectionPlan.id, "plan.id");
  }

  const created = await requestJson(baseUrl, "/api/plans", jsonPost(expected));
  const body = record(created.body);
  const outer = record(body?.plan);
  const collectionPlan = record(outer?.plan) ?? outer;
  return identifier(collectionPlan?.id, "plan.id");
}

async function dispatchRun(
  baseUrl: string,
  collectionPlanId: string,
  operationId: string,
  planSha256: string,
): Promise<string> {
  const response = await requestJson(baseUrl, "/api/runs", {
    ...jsonPost({ planId: collectionPlanId }),
    headers: {
      "content-type": "application/json",
      "Idempotency-Key": `tsdr-acceptance-${operationId}-${planSha256}`,
    },
  });
  const value = record(record(response.body)?.record);
  const run = record(value?.run);
  return identifier(run?.id, "run.id");
}

function sameStrings(value: unknown, expected: readonly string[]): boolean {
  return (
    Array.isArray(value) &&
    value.length === expected.length &&
    value.every((item, index) => item === expected[index])
  );
}

async function requireGovernedTsdrWorker(baseUrl: string): Promise<string> {
  const expected = usptoTsdrAcceptanceWorkerPayload();
  const label = "uspto-tsdr-governed-worker-v1";
  const response = await requestJson(
    baseUrl,
    `/api/workers?label=${encodeURIComponent(label)}&limit=100`,
  );
  for (const candidate of items(response.body)) {
    const container = record(candidate);
    const worker = record(container?.worker) ?? container;
    if (!worker) continue;
    const bindings = Array.isArray(worker.connectorBindings) ? worker.connectorBindings : [];
    const binding = record(bindings[0]);
    if (
      worker.maxConcurrency === expected.maxConcurrency &&
      sameStrings(worker.supportedJobTypes, expected.supportedJobTypes) &&
      bindings.length === 1 &&
      binding?.connectorId === "uspto-tsdr" &&
      binding?.version === "1.0.0" &&
      sameStrings(binding?.capabilities, ["COLLECT"])
    ) {
      return identifier(worker.id, "worker.id");
    }
  }
  throw new Error(
    "No governed USPTO TSDR Worker is registered. Provision its Worker credential separately before dispatch.",
  );
}

export async function applyUsptoTsdrAcceptancePlan(input: {
  baseUrl: string;
  plan: UsptoTsdrAcceptancePlan;
  planSha256: string;
  dispatch: boolean;
}): Promise<{
  sourceId: string;
  collectionPlanId: string;
  workerId: string | null;
  runId: string | null;
}> {
  await ensureConnector(input.baseUrl);
  const sourceId = await ensureSource(input.baseUrl, input.plan);
  const collectionPlanId = await ensureCollectionPlan(input.baseUrl, sourceId, input.plan);
  let workerId: string | null = null;
  let runId: string | null = null;
  if (input.dispatch) {
    workerId = await requireGovernedTsdrWorker(input.baseUrl);
    runId = await dispatchRun(
      input.baseUrl,
      collectionPlanId,
      input.plan.operationId,
      input.planSha256,
    );
  }
  return { sourceId, collectionPlanId, workerId, runId };
}

async function main(): Promise<void> {
  const args = parseUsptoTsdrAcceptanceArguments(process.argv.slice(2));
  const loaded = await loadUsptoTsdrAcceptancePlanFile(args.planPath);
  const expectedAuthorityToken = expectedUsptoTsdrAcceptanceAuthorityToken(
    loaded.plan,
    loaded.planSha256,
  );

  if (!args.apply) {
    process.stdout.write(
      `${JSON.stringify({
        event: "uspto_tsdr.acceptance.plan_validated",
        operationId: loaded.plan.operationId,
        stage: loaded.plan.stage,
        serialNumber: loaded.plan.serialNumber,
        planSha256: loaded.planSha256,
        applyPerformed: false,
        dispatchPerformed: false,
        expectedAuthorityToken,
        message:
          "Frozen plan validated only. No control-plane mutation and no USPTO request was performed.",
      })}\n`,
    );
    return;
  }

  const authority = assertUsptoTsdrAcceptanceAuthority({
    plan: loaded.plan,
    planSha256: loaded.planSha256,
    expectedSha: args.expectedSha,
    authorityToken: args.authorityToken,
  });
  const controlPlaneRaw = process.env.MARKORBIT_CONTROL_PLANE_URL?.trim();
  if (!controlPlaneRaw) {
    throw new Error("MARKORBIT_CONTROL_PLANE_URL is required for TSDR acceptance apply");
  }
  const baseUrl = normalizedBaseUrl(controlPlaneRaw);
  const result = await applyUsptoTsdrAcceptancePlan({
    baseUrl,
    plan: loaded.plan,
    planSha256: loaded.planSha256,
    dispatch: args.dispatch,
  });

  process.stdout.write(
    `${JSON.stringify({
      event: args.dispatch
        ? "uspto_tsdr.acceptance.dispatched"
        : "uspto_tsdr.acceptance.governance_applied",
      operationId: loaded.plan.operationId,
      stage: loaded.plan.stage,
      planSha256: loaded.planSha256,
      authorityTokenSha256: authority.authorityTokenSha256,
      sourceId: result.sourceId,
      collectionPlanId: result.collectionPlanId,
      workerId: result.workerId,
      runId: result.runId,
      dispatchPerformed: args.dispatch,
    })}\n`,
  );
}

if (process.env.VITEST !== "true") {
  main().catch((error) => {
    process.stderr.write(
      `${JSON.stringify({
        event: "uspto_tsdr.acceptance.failed",
        message: error instanceof Error ? error.message : "USPTO TSDR acceptance failed",
      })}\n`,
    );
    process.exitCode = 1;
  });
}

[executed on device: MarkOrbit (710fa508-4ac4-4899-bf0a-594e530d3e21)]