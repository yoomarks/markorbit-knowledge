import {
  prepareFoundationalSupply,
  type PreparedSupplyPlan,
  type SupplyCapabilityGap,
  type SupplyRun,
} from "./source-coverage-operations";

export const FOUNDATIONAL_READINESS_PROTOCOL_VERSION = "1.1" as const;
export const US_FOUNDATIONAL_READINESS_PROTOCOL_VERSION = FOUNDATIONAL_READINESS_PROTOCOL_VERSION;

export const FOUNDATIONAL_READINESS_STAGES = [
  "REGISTER",
  "COLLECT",
  "INGEST",
  "CONVERT",
  "INDEX",
  "QUALITY",
  "HEALTH",
  "READY",
] as const;
export type FoundationalReadinessStage = (typeof FOUNDATIONAL_READINESS_STAGES)[number];

export type FoundationalSupplyHealthItem = {
  targetId: string;
  sourceIds: string[];
  state: "READY" | "DEGRADED" | "BLOCKED";
  registrationState: "REGISTERED" | "UNREGISTERED";
  latestRunStatus: string | null;
  artifactCount: number;
  readyDocumentCount: number;
  currentDocumentCount: number;
  freshnessState: string;
  gaps: string[];
};

export type FoundationalRetrievalQualityItem = {
  sourceId: string;
  state: "READY" | "DEGRADED" | "BLOCKED";
  gaps: string[];
  isCurrent: boolean;
};

export type FoundationalRetrievalQualityState =
  "READY" | "DEGRADED" | "BLOCKED" | "MISSING" | "NOT_APPLICABLE";

export type FoundationalReadinessTarget = {
  targetId: string;
  stage: FoundationalReadinessStage;
  ready: boolean;
  healthState: FoundationalSupplyHealthItem["state"] | "MISSING";
  gaps: string[];
  reason: string | null;
  retrievalQualityState: FoundationalRetrievalQualityState;
  retrievalAuditDocumentCount: number;
  retrievalAuditGaps: string[];
};

export type FoundationalReadinessGate = {
  protocolVersion: typeof FOUNDATIONAL_READINESS_PROTOCOL_VERSION;
  objectType: "FOUNDATIONAL_READINESS_GATE";
  jurisdiction: string;
  state: "READY" | "NOT_READY";
  totalCount: number;
  readyCount: number;
  blockingCount: number;
  readyPercent: number;
  byStage: Record<FoundationalReadinessStage, number>;
  targets: FoundationalReadinessTarget[];
};

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

type RetrievalQualityEvaluation = {
  state: FoundationalRetrievalQualityState;
  documentCount: number;
  gaps: string[];
};

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

function normalizedJurisdiction(raw: string): string {
  const jurisdiction = raw.trim().toUpperCase();
  if (!jurisdiction) throw new Error("jurisdiction is required");
  if (!/^[A-Z0-9-]{2,12}$/.test(jurisdiction)) throw new Error("jurisdiction is invalid");
  return jurisdiction;
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

export function deriveFoundationalReadinessStage(
  item: FoundationalSupplyHealthItem,
): FoundationalReadinessStage {
  const gaps = new Set(item.gaps);
  if (item.registrationState === "UNREGISTERED" || gaps.has("SOURCE_UNREGISTERED")) {
    return "REGISTER";
  }
  if (item.artifactCount === 0) {
    return item.latestRunStatus === "COMPLETED" ? "INGEST" : "COLLECT";
  }
  if (
    item.latestRunStatus === "FAILED" ||
    gaps.has("LATEST_COLLECTION_FAILED") ||
    gaps.has("STALE_ACQUISITION") ||
    item.freshnessState === "STALE"
  ) {
    return "COLLECT";
  }
  if (item.readyDocumentCount === 0 || gaps.has("NO_NORMALIZED_DOCUMENT")) {
    return "CONVERT";
  }
  if (item.currentDocumentCount === 0 || gaps.has("NO_RETRIEVAL_DOCUMENT")) {
    return "INDEX";
  }
  if (item.state === "READY" && item.gaps.length === 0) return "READY";
  return "HEALTH";
}

export function evaluateFoundationalRetrievalQuality(
  item: FoundationalSupplyHealthItem,
  qualityItems: readonly FoundationalRetrievalQualityItem[],
): RetrievalQualityEvaluation {
  if (item.currentDocumentCount === 0) {
    return { state: "NOT_APPLICABLE", documentCount: 0, gaps: [] };
  }
  const sourceIds = new Set(item.sourceIds);
  const current = qualityItems.filter(
    (quality) => quality.isCurrent && sourceIds.has(quality.sourceId),
  );
  if (current.length === 0) {
    return {
      state: "MISSING",
      documentCount: 0,
      gaps: ["RETRIEVAL_AUDIT_MISSING"],
    };
  }

  const gaps = [...new Set(current.flatMap((quality) => quality.gaps))].sort();
  if (current.length !== item.currentDocumentCount) {
    gaps.unshift("RETRIEVAL_AUDIT_COVERAGE_MISMATCH");
  }
  if (
    current.some((quality) => quality.state === "BLOCKED") ||
    current.length !== item.currentDocumentCount
  ) {
    return { state: "BLOCKED", documentCount: current.length, gaps };
  }
  if (current.some((quality) => quality.state === "DEGRADED")) {
    return { state: "DEGRADED", documentCount: current.length, gaps };
  }
  return { state: "READY", documentCount: current.length, gaps };
}

function supplyReasonFor(
  item: FoundationalSupplyHealthItem,
  stage: FoundationalReadinessStage,
): string | null {
  if (stage === "READY") return null;
  if (stage === "INGEST") return "COLLECTION_COMPLETED_WITHOUT_RAW_ARTIFACT";
  if (item.gaps.length > 0) return item.gaps.join(",");
  return `SUPPLY_${item.state}`;
}

function qualityReasonFor(quality: RetrievalQualityEvaluation): string {
  if (quality.gaps.length > 0) return quality.gaps.join(",");
  return `RETRIEVAL_QUALITY_${quality.state}`;
}

export function evaluateFoundationalReadiness(
  jurisdiction: string,
  targetIds: readonly string[],
  healthItems: readonly FoundationalSupplyHealthItem[],
  qualityItems: readonly FoundationalRetrievalQualityItem[],
): FoundationalReadinessGate {
  const normalized = normalizedJurisdiction(jurisdiction);
  const expected = [...new Set(targetIds)];
  if (expected.length === 0) {
    throw new Error(`${normalized} FOUNDATIONAL readiness requires at least one target`);
  }
  const healthMap = new Map<string, FoundationalSupplyHealthItem>();
  for (const item of healthItems) {
    if (healthMap.has(item.targetId))
      throw new Error(`Duplicate supply health for ${item.targetId}`);
    healthMap.set(item.targetId, item);
  }

  const byStage = Object.fromEntries(
    FOUNDATIONAL_READINESS_STAGES.map((stage) => [stage, 0]),
  ) as Record<FoundationalReadinessStage, number>;
  const targets: FoundationalReadinessTarget[] = expected.map((targetId) => {
    const item = healthMap.get(targetId);
    if (!item) {
      byStage.HEALTH += 1;
      return {
        targetId,
        stage: "HEALTH",
        ready: false,
        healthState: "MISSING",
        gaps: ["HEALTH_RECORD_MISSING"],
        reason: "HEALTH_RECORD_MISSING",
        retrievalQualityState: "NOT_APPLICABLE",
        retrievalAuditDocumentCount: 0,
        retrievalAuditGaps: [],
      };
    }

    const supplyStage = deriveFoundationalReadinessStage(item);
    const quality = evaluateFoundationalRetrievalQuality(item, qualityItems);
    const stage = supplyStage === "READY" && quality.state !== "READY" ? "QUALITY" : supplyStage;
    byStage[stage] += 1;
    return {
      targetId,
      stage,
      ready: stage === "READY",
      healthState: item.state,
      gaps: item.gaps,
      reason: stage === "QUALITY" ? qualityReasonFor(quality) : supplyReasonFor(item, stage),
      retrievalQualityState: quality.state,
      retrievalAuditDocumentCount: quality.documentCount,
      retrievalAuditGaps: quality.gaps,
    };
  });
  const readyCount = targets.filter((target) => target.ready).length;
  const totalCount = targets.length;
  return {
    protocolVersion: FOUNDATIONAL_READINESS_PROTOCOL_VERSION,
    objectType: "FOUNDATIONAL_READINESS_GATE",
    jurisdiction: normalized,
    state: readyCount === totalCount ? "READY" : "NOT_READY",
    totalCount,
    readyCount,
    blockingCount: totalCount - readyCount,
    readyPercent: Number(((readyCount / totalCount) * 100).toFixed(2)),
    byStage,
    targets,
  };
}

export function evaluateUsFoundationalReadiness(
  targetIds: readonly string[],
  healthItems: readonly FoundationalSupplyHealthItem[],
  qualityItems: readonly FoundationalRetrievalQualityItem[],
): FoundationalReadinessGate {
  return evaluateFoundationalReadiness("US", targetIds, healthItems, qualityItems);
}

export function evaluateWipoFoundationalReadiness(
  targetIds: readonly string[],
  healthItems: readonly FoundationalSupplyHealthItem[],
  qualityItems: readonly FoundationalRetrievalQualityItem[],
): FoundationalReadinessGate {
  return evaluateFoundationalReadiness("WO", targetIds, healthItems, qualityItems);
}

async function loadReadiness(
  fetchImpl: FetchLike,
  baseUrl: string,
  workspaceId: string,
  jurisdiction: string,
  targetIds: readonly string[],
): Promise<FoundationalReadinessGate> {
  const query = `workspaceId=${encodeURIComponent(workspaceId)}&jurisdiction=${encodeURIComponent(jurisdiction)}`;
  const [healthPayload, qualityPayload] = await Promise.all([
    requestJson(
      fetchImpl,
      baseUrl,
      `/api/source-supply-health?${query}&coverageTier=FOUNDATIONAL&catalogState=ACTIVE`,
    ),
    requestJson(fetchImpl, baseUrl, `/api/retrieval/audit?${query}`),
  ]);
  return evaluateFoundationalReadiness(
    jurisdiction,
    targetIds,
    parseFoundationalSupplyHealth(healthPayload),
    parseFoundationalRetrievalQuality(qualityPayload),
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
  const jurisdiction = normalizedJurisdiction(options.jurisdiction);
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
