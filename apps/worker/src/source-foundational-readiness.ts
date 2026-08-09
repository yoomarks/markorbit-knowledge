import {
  FOUNDATIONAL_READINESS_PROTOCOL_VERSION,
  evaluateFoundationalReadiness,
  normalizeFoundationalJurisdiction,
  type FoundationalReadinessGate,
  type FoundationalRetrievalQualityItem,
  type FoundationalRetrievalRelevanceItem,
  type FoundationalSupplyHealthItem,
} from "@markorbit/worker-runtime/foundational-readiness";
import {
  prepareFoundationalSupply,
  type PreparedSupplyPlan,
  type SupplyCapabilityGap,
  type SupplyRun,
} from "./source-coverage-operations";

export {
  FOUNDATIONAL_READINESS_PROTOCOL_VERSION,
  FOUNDATIONAL_READINESS_STAGES,
  US_FOUNDATIONAL_READINESS_PROTOCOL_VERSION,
  deriveFoundationalReadinessStage,
  evaluateFoundationalReadiness,
  evaluateFoundationalRetrievalQuality,
  evaluateFoundationalRetrievalRelevance,
  evaluateUsFoundationalReadiness,
  evaluateWipoFoundationalReadiness,
  normalizeFoundationalJurisdiction,
} from "@markorbit/worker-runtime/foundational-readiness";
export type {
  FoundationalReadinessGate,
  FoundationalReadinessStage,
  FoundationalReadinessTarget,
  FoundationalRetrievalQualityItem,
  FoundationalRetrievalQualityState,
  FoundationalRetrievalRelevanceItem,
  FoundationalRetrievalRelevanceState,
  FoundationalSupplyHealthItem,
} from "@markorbit/worker-runtime/foundational-readiness";

export type FoundationalOperatorBatchResult = {
  protocolVersion: typeof FOUNDATIONAL_READINESS_PROTOCOL_VERSION;
  objectType: "FOUNDATIONAL_OPERATOR_BATCH";
  jurisdiction: string;
  mode: "REVIEW" | "DISPATCH";
  controlPlaneUrl: string;
  workspaceId: string;
  targetCount: number;
  preparedPlanCount: number;
  plans: PreparedSupplyPlan[];
  capabilityGaps: SupplyCapabilityGap[];
  requestedTargetIds: string[];
  approvedTargetIds: string[];
  approvalRequired: boolean;
  runs: SupplyRun[];
  collectionAuthorization: "NONE" | "EXPLICIT_TARGET_MANUAL_RUNS_DISPATCHED";
  readiness: FoundationalReadinessGate;
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

function nonNegativeNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`Invalid ${field}`);
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

export function parseFoundationalSupplyHealth(payload: unknown): FoundationalSupplyHealthItem[] {
  const outer = record(payload);
  return array(outer?.items).map((value, index) => {
    const item = record(value);
    const latestRun = record(item?.latestRun);
    const acquisition = record(item?.acquisition);
    const normalization = record(item?.normalization);
    const retrieval = record(item?.retrieval);
    const freshness = record(item?.freshness);
    if (!item || !acquisition || !normalization || !retrieval || !freshness) {
      throw new Error(`Invalid source supply health item at index ${index}`);
    }
    const state = requiredString(item.state, `items[${index}].state`);
    if (state !== "READY" && state !== "DEGRADED" && state !== "BLOCKED") {
      throw new Error(`Invalid items[${index}].state`);
    }
    const registrationState = requiredString(
      item.registrationState,
      `items[${index}].registrationState`,
    );
    if (registrationState !== "REGISTERED" && registrationState !== "UNREGISTERED") {
      throw new Error(`Invalid items[${index}].registrationState`);
    }
    return {
      targetId: requiredString(item.targetId, `items[${index}].targetId`),
      sourceIds: array(item.sourceIds)
        .map((sourceId) => String(sourceId).trim())
        .filter(Boolean),
      state,
      registrationState,
      latestRunStatus: latestRun && typeof latestRun.status === "string" ? latestRun.status : null,
      artifactCount: nonNegativeNumber(
        acquisition.artifactCount,
        `items[${index}].acquisition.artifactCount`,
      ),
      readyDocumentCount: nonNegativeNumber(
        normalization.readyDocumentCount,
        `items[${index}].normalization.readyDocumentCount`,
      ),
      currentDocumentCount: nonNegativeNumber(
        retrieval.currentDocumentCount,
        `items[${index}].retrieval.currentDocumentCount`,
      ),
      freshnessState: requiredString(freshness.state, `items[${index}].freshness.state`),
      gaps: array(item.gaps).map((gap) => String(gap)),
    };
  });
}

export function parseFoundationalRetrievalQuality(
  payload: unknown,
): FoundationalRetrievalQualityItem[] {
  const outer = record(payload);
  return array(outer?.items).map((value, index) => {
    const item = record(value);
    if (!item) throw new Error(`Invalid retrieval quality item at index ${index}`);
    const state = requiredString(item.state, `items[${index}].state`);
    if (state !== "READY" && state !== "DEGRADED" && state !== "BLOCKED") {
      throw new Error(`Invalid items[${index}].state`);
    }
    if (typeof item.isCurrent !== "boolean") {
      throw new Error(`Invalid items[${index}].isCurrent`);
    }
    return {
      sourceId: requiredString(item.sourceId, `items[${index}].sourceId`),
      state,
      gaps: array(item.gaps).map((gap) => String(gap)),
      isCurrent: item.isCurrent,
    };
  });
}

export function parseFoundationalRetrievalRelevance(
  payload: unknown,
): FoundationalRetrievalRelevanceItem[] {
  const outer = record(payload);
  return array(outer?.items).map((value, index) => {
    const item = record(value);
    if (!item) throw new Error(`Invalid retrieval relevance item at index ${index}`);
    const state = requiredString(item.state, `items[${index}].state`);
    if (
      state !== "READY" &&
      state !== "DEGRADED" &&
      state !== "BLOCKED" &&
      state !== "NOT_APPLICABLE"
    ) {
      throw new Error(`Invalid items[${index}].state`);
    }
    return {
      targetId: requiredString(item.targetId, `items[${index}].targetId`),
      state,
      gaps: array(item.gaps).map((gap) => String(gap)),
      probeCount: array(item.probes).length,
    };
  });
}

async function loadReadiness(
  fetchImpl: FetchLike,
  baseUrl: string,
  workspaceId: string,
  jurisdiction: string,
  targetIds: readonly string[],
): Promise<FoundationalReadinessGate> {
  const query = `workspaceId=${encodeURIComponent(workspaceId)}&jurisdiction=${encodeURIComponent(jurisdiction)}`;
  const [healthPayload, qualityPayload, relevancePayload] = await Promise.all([
    requestJson(
      fetchImpl,
      baseUrl,
      `/api/source-supply-health?${query}&coverageTier=FOUNDATIONAL&catalogState=ACTIVE`,
    ),
    requestJson(fetchImpl, baseUrl, `/api/retrieval/audit?${query}`),
    requestJson(fetchImpl, baseUrl, `/api/retrieval/relevance-audit?${query}`),
  ]);
  return evaluateFoundationalReadiness(
    jurisdiction,
    targetIds,
    parseFoundationalSupplyHealth(healthPayload),
    parseFoundationalRetrievalQuality(qualityPayload),
    parseFoundationalRetrievalRelevance(relevancePayload),
  );
}

export type OperateFoundationalBatchOptions = {
  baseUrl: string;
  workspaceId: string;
  jurisdiction: string;
  dispatchTargetIds?: string[];
  dispatchAll?: boolean;
  approveDispatch?: boolean;
  fetchImpl?: FetchLike;
};

export async function operateFoundationalBatch(
  options: OperateFoundationalBatchOptions,
): Promise<FoundationalOperatorBatchResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const baseUrl = normalizedBaseUrl(options.baseUrl);
  const jurisdiction = normalizeFoundationalJurisdiction(options.jurisdiction);
  const preview = await prepareFoundationalSupply({
    baseUrl,
    workspaceId: options.workspaceId,
    jurisdiction,
    fetchImpl,
  });
  const allTargetIds = preview.plans.map((plan) => plan.targetId);
  const requested = [...new Set(options.dispatchTargetIds ?? [])];
  if (options.dispatchAll && requested.length > 0) {
    throw new Error("Use either dispatchAll or dispatchTargetIds, not both");
  }
  const selected = options.dispatchAll ? allTargetIds : requested;
  const allowed = new Set(allTargetIds);
  for (const targetId of selected) {
    if (!allowed.has(targetId)) {
      throw new Error(`Unknown ${jurisdiction} FOUNDATIONAL target ${targetId}`);
    }
  }

  const approvalRequired = selected.length > 0 && options.approveDispatch !== true;
  if (selected.length === 0 || approvalRequired) {
    return {
      protocolVersion: FOUNDATIONAL_READINESS_PROTOCOL_VERSION,
      objectType: "FOUNDATIONAL_OPERATOR_BATCH",
      jurisdiction,
      mode: "REVIEW",
      controlPlaneUrl: baseUrl,
      workspaceId: options.workspaceId,
      targetCount: preview.targetCount,
      preparedPlanCount: preview.preparedPlanCount,
      plans: preview.plans,
      capabilityGaps: preview.capabilityGaps,
      requestedTargetIds: selected,
      approvedTargetIds: [],
      approvalRequired,
      runs: [],
      collectionAuthorization: "NONE",
      readiness: await loadReadiness(
        fetchImpl,
        baseUrl,
        options.workspaceId,
        jurisdiction,
        allTargetIds,
      ),
    };
  }

  const execution = await prepareFoundationalSupply({
    baseUrl,
    workspaceId: options.workspaceId,
    jurisdiction,
    dispatchTargetIds: selected,
    fetchImpl,
  });
  return {
    protocolVersion: FOUNDATIONAL_READINESS_PROTOCOL_VERSION,
    objectType: "FOUNDATIONAL_OPERATOR_BATCH",
    jurisdiction,
    mode: "DISPATCH",
    controlPlaneUrl: baseUrl,
    workspaceId: options.workspaceId,
    targetCount: execution.targetCount,
    preparedPlanCount: execution.preparedPlanCount,
    plans: execution.plans,
    capabilityGaps: execution.capabilityGaps,
    requestedTargetIds: selected,
    approvedTargetIds: selected,
    approvalRequired: false,
    runs: execution.runs,
    collectionAuthorization:
      execution.runs.length > 0 ? "EXPLICIT_TARGET_MANUAL_RUNS_DISPATCHED" : "NONE",
    readiness: await loadReadiness(
      fetchImpl,
      baseUrl,
      options.workspaceId,
      jurisdiction,
      allTargetIds,
    ),
  };
}

export type OperateJurisdictionFoundationalBatchOptions = Omit<
  OperateFoundationalBatchOptions,
  "jurisdiction"
>;

export function operateUsFoundationalBatch(options: OperateJurisdictionFoundationalBatchOptions) {
  return operateFoundationalBatch({ ...options, jurisdiction: "US" });
}

export function operateWipoFoundationalBatch(options: OperateJurisdictionFoundationalBatchOptions) {
  return operateFoundationalBatch({ ...options, jurisdiction: "WO" });
}
