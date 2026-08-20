import type { CoverageTarget } from "./source-coverage-bootstrap";
import {
  foundationalApiPlanPayload,
  foundationalApiSourcePayload,
  prepareFoundationalApiRemediation,
  type FoundationalApiBindingSpec,
  type PrepareFoundationalApiRemediationOptions,
} from "./source-coverage-api-remediation";

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

function normalizedBaseUrl(raw: string): string {
  const url = new URL(raw);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Control-plane URL must use http or https");
  }
  return url.toString().replace(/\/$/u, "");
}

async function requestJson(fetchImpl: FetchLike, baseUrl: string, path: string): Promise<unknown> {
  const response = await fetchImpl(`${baseUrl}${path}`);
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

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const object = record(value);
  if (object) {
    return `{${Object.keys(object)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function assertEqual(actual: unknown, expected: unknown, label: string, targetId: string): void {
  if (canonicalJson(actual) !== canonicalJson(expected)) {
    throw new Error(`API remediation ${label} drift for ${targetId}`);
  }
}

function expectedSourceContract(payload: JsonRecord): JsonRecord {
  return {
    sourceType: payload.sourceType,
    category: payload.category,
    authorityLevel: payload.authorityLevel,
    status: payload.status,
    jurisdictions: payload.jurisdictions,
    languages: payload.languages,
    connector: payload.connector,
    connectorConfig: payload.connectorConfig,
    canonicalUri: payload.canonicalUri,
    extensions: payload.extensions,
  };
}

function actualSourceContract(source: JsonRecord): JsonRecord {
  const extensions = record(source.extensions) ?? {};
  return {
    sourceType: source.sourceType,
    category: source.category,
    authorityLevel: source.authorityLevel,
    status: source.status,
    jurisdictions: source.jurisdictions,
    languages: source.languages,
    connector: source.connector,
    connectorConfig: source.connectorConfig,
    canonicalUri: source.canonicalUri,
    extensions: {
      "x-markorbit-source-coverage-remediation-target-id":
        extensions["x-markorbit-source-coverage-remediation-target-id"],
      "x-markorbit-source-coverage-protocol":
        extensions["x-markorbit-source-coverage-protocol"],
      "x-markorbit-acquisition-mode": extensions["x-markorbit-acquisition-mode"],
      "x-markorbit-remediation-artifact-kinds":
        extensions["x-markorbit-remediation-artifact-kinds"],
      "x-markorbit-endpoint-binding-required":
        extensions["x-markorbit-endpoint-binding-required"],
      "x-markorbit-network-locator-persisted":
        extensions["x-markorbit-network-locator-persisted"],
      "x-markorbit-credential-persisted": extensions["x-markorbit-credential-persisted"],
      "x-markorbit-collection-authorization":
        extensions["x-markorbit-collection-authorization"],
    },
  };
}

function expectedPlanContract(payload: JsonRecord): JsonRecord {
  return {
    status: payload.status,
    schedule: payload.schedule,
    output: payload.output,
    extensions: payload.extensions,
  };
}

function actualPlanContract(plan: JsonRecord): JsonRecord {
  const extensions = record(plan.extensions) ?? {};
  return {
    status: plan.status,
    schedule: plan.schedule,
    output: plan.output,
    extensions: {
      "x-markorbit-source-coverage-remediation-target-id":
        extensions["x-markorbit-source-coverage-remediation-target-id"],
      "x-markorbit-purpose": extensions["x-markorbit-purpose"],
      "x-markorbit-collection-authorization":
        extensions["x-markorbit-collection-authorization"],
    },
  };
}

async function loadCoverageTargets(
  fetchImpl: FetchLike,
  baseUrl: string,
  workspaceId: string,
  jurisdiction: string,
): Promise<CoverageTarget[]> {
  const body = await requestJson(
    fetchImpl,
    baseUrl,
    `/api/source-coverage?jurisdiction=${encodeURIComponent(jurisdiction)}&coverageTier=FOUNDATIONAL&catalogState=ACTIVE&workspaceId=${encodeURIComponent(workspaceId)}`,
  );
  return array(record(body)?.targets) as CoverageTarget[];
}

function sourceFromCandidate(candidate: unknown): JsonRecord | null {
  const outer = record(candidate);
  if (!outer) return null;
  return record(outer.source) ?? outer;
}

function planFromCandidate(candidate: unknown): JsonRecord | null {
  const outer = record(candidate);
  if (!outer) return null;
  const direct = record(outer.plan);
  if (!direct) return null;
  return typeof direct.id === "string" ? direct : record(direct.plan);
}

async function assertBindingDriftFree(
  fetchImpl: FetchLike,
  baseUrl: string,
  workspaceId: string,
  target: CoverageTarget,
  binding: FoundationalApiBindingSpec,
): Promise<void> {
  const expectedSource = foundationalApiSourcePayload(target, workspaceId, binding);
  const slug = String(expectedSource.slug);
  const listedSources = await requestJson(
    fetchImpl,
    baseUrl,
    `/api/sources?q=${encodeURIComponent(slug)}&limit=100`,
  );
  const existingSource = array(record(listedSources)?.items)
    .map(sourceFromCandidate)
    .find((source) => source?.slug === slug);
  if (!existingSource) return;

  assertEqual(
    actualSourceContract(existingSource),
    expectedSourceContract(expectedSource),
    "Source configuration",
    target.id,
  );

  const sourceId = existingSource.id;
  if (typeof sourceId !== "string" || !sourceId) {
    throw new Error(`API remediation existing Source is missing id for ${target.id}`);
  }
  const expectedPlan = foundationalApiPlanPayload(target, sourceId);
  const planName = String(expectedPlan.name);
  const listedPlans = await requestJson(
    fetchImpl,
    baseUrl,
    `/api/plans?sourceId=${encodeURIComponent(sourceId)}&limit=100`,
  );
  const existingPlan = array(record(listedPlans)?.items)
    .map(planFromCandidate)
    .find((plan) => plan?.name === planName);
  if (!existingPlan) return;

  assertEqual(
    actualPlanContract(existingPlan),
    expectedPlanContract(expectedPlan),
    "Plan configuration",
    target.id,
  );
}

export async function prepareFoundationalApiRemediationWithDriftGuard(
  options: PrepareFoundationalApiRemediationOptions,
) {
  if (!options.apply) return prepareFoundationalApiRemediation(options);

  const fetchImpl = options.fetchImpl ?? fetch;
  const baseUrl = normalizedBaseUrl(options.baseUrl);
  const jurisdiction = options.jurisdiction.trim().toUpperCase();
  if (!jurisdiction) throw new Error("jurisdiction is required");
  const targets = await loadCoverageTargets(fetchImpl, baseUrl, options.workspaceId, jurisdiction);
  const targetMap = new Map(targets.map((target) => [target.id, target]));

  for (const binding of options.bindings) {
    const target = targetMap.get(binding.targetId.trim());
    if (!target) {
      throw new Error(`Unknown ${jurisdiction} FOUNDATIONAL target ${binding.targetId.trim()}`);
    }
    await assertBindingDriftFree(fetchImpl, baseUrl, options.workspaceId, target, binding);
  }

  return prepareFoundationalApiRemediation({ ...options, fetchImpl });
}
