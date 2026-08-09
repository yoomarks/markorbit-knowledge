export type CoverageTarget = {
  id: string;
  jurisdiction: string;
  authorityName: string;
  authorityBasis: string;
  family: string;
  displayName: string;
  canonicalUri: string;
  entrypoints: Array<{ uri: string; label?: string }>;
  sourceType: string;
  category: string;
  authorityLevel: string;
  languages: string[];
  coverageTier: string;
  catalogState: string;
  acquisition: {
    mode: string;
    renderJavascriptHint: boolean;
    fetchAttachmentsHint: boolean;
    expectedArtifactKinds: string[];
  };
  protocolVersion: string;
};

export type CoverageRegistration = {
  targetId: string;
  state: "REGISTERED" | "UNREGISTERED";
  sourceIds: string[];
};

type JsonRecord = Record<string, unknown>;
type FetchLike = typeof fetch;

export const DEFAULT_WORKSPACE_ID = "wsp_01ARZ3NDEKTSV4RRFFQ69G5FAV";
export const COVERAGE_CONNECTOR_ID = "crawl4ai-web";
export const COVERAGE_CONNECTOR_VERSION = "1.2.0";
export const REPRESENTATIVE_TARGET_IDS = [
  "us-uspto-trademarks-root",
  "us-uspto-tmep-current",
  "us-uspto-trademark-fees",
  "us-uspto-registration-maintenance",
] as const;

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

function bool(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") throw new Error(`Missing ${field}`);
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
  allowedStatuses: number[] = [],
): Promise<{ status: number; body: unknown }> {
  const response = await fetchImpl(`${baseUrl}${path}`, init);
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

function jsonPost(body: unknown, extraHeaders: Record<string, string> = {}): RequestInit {
  return {
    method: "POST",
    headers: { "content-type": "application/json", ...extraHeaders },
    body: JSON.stringify(body),
  };
}

export function sourceSlugForTarget(targetId: string): string {
  const slug = `coverage-${targetId}`.toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new Error(`Coverage target ${targetId} cannot be converted to a valid source slug`);
  }
  return slug;
}

export function sourceCreatePayload(target: CoverageTarget, workspaceId: string): JsonRecord {
  return {
    workspaceId,
    name: target.displayName,
    slug: sourceSlugForTarget(target.id),
    sourceType: target.sourceType,
    category: target.category,
    authorityLevel: target.authorityLevel,
    status: "ACTIVE",
    jurisdictions: [target.jurisdiction],
    languages: target.languages,
    connector: { connectorId: COVERAGE_CONNECTOR_ID, version: COVERAGE_CONNECTOR_VERSION },
    connectorConfig: {
      renderJavascript: target.acquisition.renderJavascriptHint,
      maxDepth: 0,
    },
    canonicalUri: target.canonicalUri,
    entrypoints: target.entrypoints,
    tags: [
      "official",
      "source-coverage",
      target.coverageTier.toLowerCase(),
      target.jurisdiction.toLowerCase(),
      target.family.toLowerCase().replaceAll("_", "-"),
    ],
    extensions: {
      "x-markorbit-source-coverage-target-id": target.id,
      "x-markorbit-source-coverage-protocol": target.protocolVersion,
      "x-markorbit-authority-basis": target.authorityBasis,
      "x-markorbit-acquisition-mode": target.acquisition.mode,
      "x-markorbit-collection-authorization": false,
    },
  };
}

export function parseCoverageTargets(payload: unknown): CoverageTarget[] {
  const outer = record(payload);
  return array(outer?.targets).map((item, index) => {
    const target = record(item);
    const acquisition = record(target?.acquisition);
    if (!target || !acquisition) throw new Error(`Invalid coverage target at index ${index}`);
    return {
      id: requiredString(target.id, `targets[${index}].id`),
      jurisdiction: requiredString(target.jurisdiction, `targets[${index}].jurisdiction`),
      authorityName: requiredString(target.authorityName, `targets[${index}].authorityName`),
      authorityBasis: requiredString(target.authorityBasis, `targets[${index}].authorityBasis`),
      family: requiredString(target.family, `targets[${index}].family`),
      displayName: requiredString(target.displayName, `targets[${index}].displayName`),
      canonicalUri: requiredString(target.canonicalUri, `targets[${index}].canonicalUri`),
      entrypoints: array(target.entrypoints).map((entry, entryIndex) => {
        const value = record(entry);
        return {
          uri: requiredString(value?.uri, `targets[${index}].entrypoints[${entryIndex}].uri`),
          ...(typeof value?.label === "string" ? { label: value.label } : {}),
        };
      }),
      sourceType: requiredString(target.sourceType, `targets[${index}].sourceType`),
      category: requiredString(target.category, `targets[${index}].category`),
      authorityLevel: requiredString(target.authorityLevel, `targets[${index}].authorityLevel`),
      languages: array(target.languages).map((value) => requiredString(value, "target.language")),
      coverageTier: requiredString(target.coverageTier, `targets[${index}].coverageTier`),
      catalogState: requiredString(target.catalogState, `targets[${index}].catalogState`),
      acquisition: {
        mode: requiredString(acquisition.mode, `targets[${index}].acquisition.mode`),
        renderJavascriptHint: bool(
          acquisition.renderJavascriptHint,
          `targets[${index}].acquisition.renderJavascriptHint`,
        ),
        fetchAttachmentsHint: bool(
          acquisition.fetchAttachmentsHint,
          `targets[${index}].acquisition.fetchAttachmentsHint`,
        ),
        expectedArtifactKinds: array(acquisition.expectedArtifactKinds).map((value) =>
          requiredString(value, "target.expectedArtifactKind"),
        ),
      },
      protocolVersion: requiredString(target.protocolVersion, `targets[${index}].protocolVersion`),
    };
  });
}

export function parseRegistrations(payload: unknown): CoverageRegistration[] {
  const outer = record(payload);
  return array(outer?.registration).map((item, index) => {
    const registration = record(item);
    const state = requiredString(registration?.state, `registration[${index}].state`);
    if (state !== "REGISTERED" && state !== "UNREGISTERED") {
      throw new Error(`Invalid registration state ${state}`);
    }
    return {
      targetId: requiredString(registration?.targetId, `registration[${index}].targetId`),
      state,
      sourceIds: array(registration?.sourceIds).map((value) => requiredString(value, "sourceId")),
    };
  });
}

async function ensureConnector(fetchImpl: FetchLike, baseUrl: string): Promise<void> {
  const existing = await requestJson(
    fetchImpl,
    baseUrl,
    `/api/connectors/${COVERAGE_CONNECTOR_ID}/${COVERAGE_CONNECTOR_VERSION}`,
    {},
    [404],
  );
  if (existing.status !== 404) return;
  await requestJson(
    fetchImpl,
    baseUrl,
    "/api/connectors",
    jsonPost({
      connectorId: COVERAGE_CONNECTOR_ID,
      displayName: "Crawl4AI Web Connector — Production Pages + Attachments",
      version: COVERAGE_CONNECTOR_VERSION,
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

async function loadCoverage(
  fetchImpl: FetchLike,
  baseUrl: string,
  workspaceId: string,
  jurisdiction: string,
): Promise<{ targets: CoverageTarget[]; registrations: CoverageRegistration[] }> {
  const response = await requestJson(
    fetchImpl,
    baseUrl,
    `/api/source-coverage?jurisdiction=${encodeURIComponent(jurisdiction)}&coverageTier=FOUNDATIONAL&catalogState=ACTIVE&workspaceId=${encodeURIComponent(workspaceId)}`,
  );
  return {
    targets: parseCoverageTargets(response.body),
    registrations: parseRegistrations(response.body),
  };
}

async function ensureWorker(
  fetchImpl: FetchLike,
  baseUrl: string,
): Promise<{ workerId: string; credential: string | null }> {
  const label = "us-foundational-coverage-smoke";
  const existing = await requestJson(
    fetchImpl,
    baseUrl,
    `/api/workers?label=${encodeURIComponent(label)}&limit=100`,
  );
  for (const candidate of array(record(existing.body)?.items)) {
    const worker = record(record(candidate)?.worker);
    if (worker) return { workerId: requiredString(worker.id, "worker.id"), credential: null };
  }
  const created = await requestJson(
    fetchImpl,
    baseUrl,
    "/api/workers",
    jsonPost({
      displayName: "Crawl4AI US Foundational Coverage Smoke Worker",
      desiredState: "ACTIVE",
      runtime: { runtimeId: "crawl4ai-worker", version: "1.0.0" },
      supportedJobTypes: ["WEB_CRAWL"],
      connectorBindings: [
        {
          connectorId: COVERAGE_CONNECTOR_ID,
          version: COVERAGE_CONNECTOR_VERSION,
          capabilities: ["COLLECT", "DEEP_CRAWL", "RENDER_JAVASCRIPT", "FETCH_ATTACHMENTS"],
        },
      ],
      maxConcurrency: 1,
      labels: ["production", "crawl4ai", label],
      extensions: { "x-markorbit-purpose": "foundational-source-coverage-smoke" },
    }),
  );
  const view = record(record(created.body)?.view);
  const worker = record(view?.worker);
  return {
    workerId: requiredString(worker?.id, "worker.id"),
    credential: requiredString(record(created.body)?.credential, "worker.credential"),
  };
}

async function ensurePlan(
  fetchImpl: FetchLike,
  baseUrl: string,
  sourceId: string,
  target: CoverageTarget,
): Promise<string> {
  const planName = `Coverage Smoke — ${target.id}`;
  const existing = await requestJson(
    fetchImpl,
    baseUrl,
    `/api/plans?sourceId=${encodeURIComponent(sourceId)}&limit=100`,
  );
  for (const candidate of array(record(existing.body)?.items)) {
    const plan = record(record(candidate)?.plan);
    if (plan?.name === planName) return requiredString(plan.id, "plan.id");
  }
  const created = await requestJson(
    fetchImpl,
    baseUrl,
    "/api/plans",
    jsonPost({
      sourceId,
      name: planName,
      status: "ACTIVE",
      schedule: { mode: "MANUAL" },
      priority: "HIGH",
      policy: {
        includePatterns: [target.canonicalUri],
        excludePatterns: [],
        maxDepth: 0,
        maxItems: 1,
        renderJavascript: target.acquisition.renderJavascriptHint,
        fetchAttachments: false,
        respectRobots: true,
        rateLimitPerMinute: 6,
        timeoutSeconds: 90,
        retry: { maxAttempts: 1, backoffSeconds: 10 },
        locale: target.languages[0] ?? "en-US",
      },
      output: { artifactKinds: ["HTML", "MARKDOWN"] },
      extensions: {
        "x-markorbit-source-coverage-target-id": target.id,
        "x-markorbit-purpose": "representative-live-acquisition-smoke",
      },
    }),
  );
  const createdRecord = record(record(created.body)?.plan);
  const plan = record(createdRecord?.plan);
  return requiredString(plan?.id, "plan.id");
}

async function dispatchPlan(
  fetchImpl: FetchLike,
  baseUrl: string,
  targetId: string,
  planId: string,
): Promise<string> {
  const day = new Date().toISOString().slice(0, 10);
  const response = await requestJson(
    fetchImpl,
    baseUrl,
    "/api/runs",
    jsonPost(
      {
        planId,
        requestedBy: { actorType: "LOCAL_ADMIN", actorId: "bootstrap-source-coverage" },
      },
      { "Idempotency-Key": `source-coverage-${targetId}-${day}` },
    ),
  );
  const runRecord = record(record(response.body)?.record);
  const run = record(runRecord?.run);
  return requiredString(run?.id, "run.id");
}

export type BootstrapCoverageOptions = {
  baseUrl: string;
  workspaceId?: string;
  jurisdiction?: string;
  dispatchRepresentative?: boolean;
  representativeTargetIds?: readonly string[];
  fetchImpl?: FetchLike;
};

export async function bootstrapFoundationalCoverage(options: BootstrapCoverageOptions) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const baseUrl = normalizedBaseUrl(options.baseUrl);
  const workspaceId = options.workspaceId ?? DEFAULT_WORKSPACE_ID;
  const jurisdiction = (options.jurisdiction ?? "US").trim().toUpperCase();
  if (!jurisdiction) throw new Error("jurisdiction is required");
  await ensureConnector(fetchImpl, baseUrl);

  const initial = await loadCoverage(fetchImpl, baseUrl, workspaceId, jurisdiction);
  if (initial.targets.length === 0) {
    throw new Error(`No active ${jurisdiction} FOUNDATIONAL coverage targets found`);
  }
  const byRegistration = new Map(initial.registrations.map((value) => [value.targetId, value]));
  const created: Array<{ targetId: string; sourceId: string }> = [];
  const reused: Array<{ targetId: string; sourceIds: string[] }> = [];

  for (const target of initial.targets) {
    const registration = byRegistration.get(target.id);
    if (registration?.state === "REGISTERED") {
      reused.push({ targetId: target.id, sourceIds: registration.sourceIds });
      continue;
    }
    const response = await requestJson(
      fetchImpl,
      baseUrl,
      "/api/sources",
      jsonPost(sourceCreatePayload(target, workspaceId)),
    );
    const source = record(record(response.body)?.source);
    created.push({ targetId: target.id, sourceId: requiredString(source?.id, "source.id") });
  }

  const finalCoverage = await loadCoverage(fetchImpl, baseUrl, workspaceId, jurisdiction);
  const missing = finalCoverage.registrations.filter((value) => value.state !== "REGISTERED");
  if (missing.length > 0) {
    throw new Error(
      `Coverage registration incomplete: ${missing.map((value) => value.targetId).join(", ")}`,
    );
  }

  const representativeTargetIds =
    options.representativeTargetIds ?? (jurisdiction === "US" ? REPRESENTATIVE_TARGET_IDS : []);
  let worker: { workerId: string; credential: string | null } | null = null;
  const runs: Array<{ targetId: string; sourceId: string; planId: string; runId: string }> = [];
  if (options.dispatchRepresentative && representativeTargetIds.length > 0) {
    worker = await ensureWorker(fetchImpl, baseUrl);
    const targetMap = new Map(finalCoverage.targets.map((value) => [value.id, value]));
    const registrationMap = new Map(
      finalCoverage.registrations.map((value) => [value.targetId, value]),
    );
    for (const targetId of representativeTargetIds) {
      const target = targetMap.get(targetId);
      const registration = registrationMap.get(targetId);
      if (!target || !registration || registration.state !== "REGISTERED") {
        throw new Error(`Representative target ${targetId} is not registered`);
      }
      const sourceId = requiredString(registration.sourceIds[0], `${targetId}.sourceId`);
      const planId = await ensurePlan(fetchImpl, baseUrl, sourceId, target);
      const runId = await dispatchPlan(fetchImpl, baseUrl, targetId, planId);
      runs.push({ targetId, sourceId, planId, runId });
    }
  }

  return {
    controlPlaneUrl: baseUrl,
    workspaceId,
    jurisdiction,
    connector: `${COVERAGE_CONNECTOR_ID}@${COVERAGE_CONNECTOR_VERSION}`,
    targetCount: finalCoverage.targets.length,
    registeredCount: finalCoverage.registrations.length,
    created,
    reused,
    workerId: worker?.workerId ?? null,
    workerCredential: worker?.credential ?? null,
    runs,
    collectionAuthorization:
      runs.length > 0 ? "REPRESENTATIVE_MANUAL_RUNS_EXPLICITLY_DISPATCHED" : "NONE",
  };
}

export type JurisdictionBootstrapCoverageOptions = Omit<
  BootstrapCoverageOptions,
  "jurisdiction" | "representativeTargetIds"
>;

export function bootstrapUsFoundationalCoverage(options: JurisdictionBootstrapCoverageOptions) {
  return bootstrapFoundationalCoverage({
    ...options,
    jurisdiction: "US",
    representativeTargetIds: REPRESENTATIVE_TARGET_IDS,
  });
}

export function bootstrapWipoFoundationalCoverage(options: JurisdictionBootstrapCoverageOptions) {
  return bootstrapFoundationalCoverage({
    ...options,
    jurisdiction: "WO",
    representativeTargetIds: [],
  });
}
