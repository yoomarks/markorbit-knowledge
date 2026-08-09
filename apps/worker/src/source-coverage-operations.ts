import type { CoverageRegistration, CoverageTarget } from "./source-coverage-bootstrap";

const ATTACHMENT_KINDS = new Set([
  "PDF",
  "DOCX",
  "XLSX",
  "CSV",
  "JSON",
  "XML",
  "EMAIL",
  "IMAGE",
  "TEXT",
]);

export type PreparedSupplyPlan = {
  targetId: string;
  sourceId: string;
  planId: string;
  state: "CREATED" | "REUSED";
  outputArtifactKinds: string[];
  fetchAttachments: boolean;
  maxDepth: number;
  maxItems: number;
};

export type SupplyRun = {
  targetId: string;
  sourceId: string;
  planId: string;
  runId: string;
};

export type SupplyCapabilityGap = {
  targetId: string;
  code: "STRUCTURED_ENDPOINT_NOT_CAPTURED";
  expectedArtifactKinds: string[];
};

type JsonRecord = Record<string, unknown>;
type FetchLike = typeof fetch;

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
  return url.toString().replace(/\/$/, "");
}

async function requestJson(
  fetchImpl: FetchLike,
  baseUrl: string,
  path: string,
  init: RequestInit = {},
): Promise<unknown> {
  const response = await fetchImpl(`${baseUrl}${path}`, init);
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  if (!response.ok) {
    const error = record(record(body)?.error);
    const message = typeof error?.message === "string" ? error.message : `HTTP ${response.status}`;
    throw new Error(`${path}: ${message}`);
  }
  return body;
}

function jsonPost(body: unknown, extraHeaders: Record<string, string> = {}): RequestInit {
  return {
    method: "POST",
    headers: { "content-type": "application/json", ...extraHeaders },
    body: JSON.stringify(body),
  };
}

function planFromEnvelope(value: unknown): JsonRecord | null {
  const outer = record(value);
  if (!outer) return null;
  const direct = record(outer.plan);
  if (direct && typeof direct.id === "string") return direct;
  return record(direct?.plan);
}

function wildcardPrefix(uri: string): string {
  const url = new URL(uri);
  url.hash = "";
  const normalized = url.toString().replace(/\/$/, "");
  return `${normalized}*`;
}

function crawlShape(target: CoverageTarget): { maxDepth: number; maxItems: number } {
  switch (target.family) {
    case "EXAMINATION_MANUAL":
    case "TTAB_PROCEDURE":
      return { maxDepth: 2, maxItems: 120 };
    case "PORTAL":
      return { maxDepth: 1, maxItems: 40 };
    case "MAINTENANCE":
      return { maxDepth: 1, maxItems: 40 };
    default:
      return { maxDepth: 0, maxItems: 10 };
  }
}

function authorizedArtifactKinds(target: CoverageTarget): string[] {
  const kinds = ["HTML", "MARKDOWN"];
  if (target.acquisition.fetchAttachmentsHint) {
    for (const kind of target.acquisition.expectedArtifactKinds) {
      if (ATTACHMENT_KINDS.has(kind) && !kinds.includes(kind)) kinds.push(kind);
    }
  }
  return kinds;
}

export function foundationalSupplyPlanName(targetId: string): string {
  return `Foundational Supply — ${targetId}`;
}

export function supplyPlanCreatePayload(target: CoverageTarget, sourceId: string): JsonRecord {
  const shape = crawlShape(target);
  const artifactKinds = authorizedArtifactKinds(target);
  const fetchAttachments = target.acquisition.fetchAttachmentsHint && artifactKinds.length > 2;
  const includePatterns = [target.canonicalUri, ...target.entrypoints.map((entry) => entry.uri)]
    .map(wildcardPrefix)
    .filter((value, index, values) => values.indexOf(value) === index);

  return {
    sourceId,
    name: foundationalSupplyPlanName(target.id),
    status: "ACTIVE",
    schedule: { mode: "MANUAL" },
    priority: "HIGH",
    policy: {
      includePatterns,
      excludePatterns: [],
      maxDepth: shape.maxDepth,
      maxItems: shape.maxItems,
      renderJavascript: target.acquisition.renderJavascriptHint,
      fetchAttachments,
      respectRobots: true,
      rateLimitPerMinute: 12,
      timeoutSeconds: 90,
      retry: { maxAttempts: 1, backoffSeconds: 10 },
      locale: target.languages[0] ?? "en-US",
    },
    output: { artifactKinds },
    extensions: {
      "x-markorbit-source-coverage-target-id": target.id,
      "x-markorbit-purpose": "foundational-source-supply",
      "x-markorbit-acquisition-mode": target.acquisition.mode,
      "x-markorbit-collection-authorization": false,
    },
  };
}

async function loadCoverage(
  fetchImpl: FetchLike,
  baseUrl: string,
  workspaceId: string,
): Promise<{ targets: CoverageTarget[]; registrations: CoverageRegistration[] }> {
  const payload = await requestJson(
    fetchImpl,
    baseUrl,
    `/api/source-coverage?jurisdiction=US&coverageTier=FOUNDATIONAL&catalogState=ACTIVE&workspaceId=${encodeURIComponent(workspaceId)}`,
  );
  const outer = record(payload);
  const targets = array(outer?.targets) as CoverageTarget[];
  const registrations = array(outer?.registration) as CoverageRegistration[];
  if (targets.length === 0) throw new Error("No active US FOUNDATIONAL coverage targets found");
  return { targets, registrations };
}

async function ensureSupplyPlan(
  fetchImpl: FetchLike,
  baseUrl: string,
  sourceId: string,
  target: CoverageTarget,
): Promise<PreparedSupplyPlan> {
  const payload = supplyPlanCreatePayload(target, sourceId);
  const name = requiredString(payload.name, "plan.name");
  const listed = await requestJson(
    fetchImpl,
    baseUrl,
    `/api/plans?sourceId=${encodeURIComponent(sourceId)}&limit=100`,
  );
  for (const candidate of array(record(listed)?.items)) {
    const plan = planFromEnvelope(candidate);
    if (plan?.name !== name) continue;
    if (plan.status !== "ACTIVE") {
      throw new Error(`Supply plan ${name} exists but is not ACTIVE`);
    }
    const schedule = record(plan.schedule);
    if (schedule?.mode !== "MANUAL") {
      throw new Error(`Supply plan ${name} must remain MANUAL`);
    }
    const policy = record(payload.policy);
    const output = record(payload.output);
    return {
      targetId: target.id,
      sourceId,
      planId: requiredString(plan.id, "plan.id"),
      state: "REUSED",
      outputArtifactKinds: array(output?.artifactKinds).map((value) => String(value)),
      fetchAttachments: policy?.fetchAttachments === true,
      maxDepth: Number(policy?.maxDepth),
      maxItems: Number(policy?.maxItems),
    };
  }

  const created = await requestJson(fetchImpl, baseUrl, "/api/plans", jsonPost(payload));
  const plan = planFromEnvelope(record(created)?.plan ?? created);
  if (!plan) throw new Error(`Plan creation for ${target.id} returned an invalid response`);
  const policy = record(payload.policy);
  const output = record(payload.output);
  return {
    targetId: target.id,
    sourceId,
    planId: requiredString(plan.id, "plan.id"),
    state: "CREATED",
    outputArtifactKinds: array(output?.artifactKinds).map((value) => String(value)),
    fetchAttachments: policy?.fetchAttachments === true,
    maxDepth: Number(policy?.maxDepth),
    maxItems: Number(policy?.maxItems),
  };
}

async function dispatchSupplyPlan(
  fetchImpl: FetchLike,
  baseUrl: string,
  targetId: string,
  planId: string,
): Promise<string> {
  const day = new Date().toISOString().slice(0, 10);
  const payload = await requestJson(
    fetchImpl,
    baseUrl,
    "/api/runs",
    jsonPost(
      {
        planId,
        requestedBy: { actorType: "LOCAL_ADMIN", actorId: "source-supply-operator" },
      },
      { "Idempotency-Key": `source-supply-${targetId}-${day}` },
    ),
  );
  const runRecord = record(record(payload)?.record);
  const run = record(runRecord?.run);
  return requiredString(run?.id, "run.id");
}

export type PrepareUsFoundationalSupplyOptions = {
  baseUrl: string;
  workspaceId: string;
  dispatchTargetIds?: string[];
  fetchImpl?: FetchLike;
};

export async function prepareUsFoundationalSupply(options: PrepareUsFoundationalSupplyOptions) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const baseUrl = normalizedBaseUrl(options.baseUrl);
  const coverage = await loadCoverage(fetchImpl, baseUrl, options.workspaceId);
  const registrationMap = new Map(coverage.registrations.map((value) => [value.targetId, value]));
  const targetMap = new Map(coverage.targets.map((value) => [value.id, value]));

  const missing = coverage.targets.filter(
    (target) => registrationMap.get(target.id)?.state !== "REGISTERED",
  );
  if (missing.length > 0) {
    throw new Error(`Foundational sources must be registered first: ${missing.map((v) => v.id).join(", ")}`);
  }

  const plans: PreparedSupplyPlan[] = [];
  for (const target of coverage.targets) {
    const registration = registrationMap.get(target.id)!;
    const sourceId = requiredString(registration.sourceIds[0], `${target.id}.sourceId`);
    plans.push(await ensureSupplyPlan(fetchImpl, baseUrl, sourceId, target));
  }

  const requestedTargets = [...new Set(options.dispatchTargetIds ?? [])];
  for (const targetId of requestedTargets) {
    if (!targetMap.has(targetId)) throw new Error(`Unknown US FOUNDATIONAL target ${targetId}`);
  }

  const planMap = new Map(plans.map((plan) => [plan.targetId, plan]));
  const runs: SupplyRun[] = [];
  for (const targetId of requestedTargets) {
    const plan = planMap.get(targetId)!;
    const runId = await dispatchSupplyPlan(fetchImpl, baseUrl, targetId, plan.planId);
    runs.push({
      targetId,
      sourceId: plan.sourceId,
      planId: plan.planId,
      runId,
    });
  }

  const capabilityGaps: SupplyCapabilityGap[] = coverage.targets
    .filter(
      (target) =>
        !target.acquisition.fetchAttachmentsHint &&
        target.acquisition.expectedArtifactKinds.some((kind) => kind === "JSON"),
    )
    .map((target) => ({
      targetId: target.id,
      code: "STRUCTURED_ENDPOINT_NOT_CAPTURED" as const,
      expectedArtifactKinds: target.acquisition.expectedArtifactKinds.filter((kind) => kind === "JSON"),
    }));

  return {
    controlPlaneUrl: baseUrl,
    workspaceId: options.workspaceId,
    targetCount: coverage.targets.length,
    preparedPlanCount: plans.length,
    plans,
    capabilityGaps,
    runs,
    collectionAuthorization:
      runs.length > 0 ? "EXPLICIT_TARGET_MANUAL_RUNS_DISPATCHED" : "NONE",
  };
}
