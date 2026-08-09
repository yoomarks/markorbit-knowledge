import {
  prepareUsFoundationalSupply,
  type PreparedSupplyPlan,
  type SupplyCapabilityGap,
  type SupplyRun,
} from "./source-coverage-operations";

export const US_FOUNDATIONAL_READINESS_PROTOCOL_VERSION = "1.0" as const;

export const FOUNDATIONAL_READINESS_STAGES = [
  "REGISTER",
  "COLLECT",
  "INGEST",
  "CONVERT",
  "INDEX",
  "HEALTH",
  "READY",
] as const;
export type FoundationalReadinessStage = (typeof FOUNDATIONAL_READINESS_STAGES)[number];

export type FoundationalSupplyHealthItem = {
  targetId: string;
  state: "READY" | "DEGRADED" | "BLOCKED";
  registrationState: "REGISTERED" | "UNREGISTERED";
  latestRunStatus: string | null;
  artifactCount: number;
  readyDocumentCount: number;
  currentDocumentCount: number;
  freshnessState: string;
  gaps: string[];
};

export type FoundationalReadinessTarget = {
  targetId: string;
  stage: FoundationalReadinessStage;
  ready: boolean;
  healthState: FoundationalSupplyHealthItem["state"] | "MISSING";
  gaps: string[];
  reason: string | null;
};

export type FoundationalReadinessGate = {
  protocolVersion: typeof US_FOUNDATIONAL_READINESS_PROTOCOL_VERSION;
  objectType: "US_FOUNDATIONAL_READINESS_GATE";
  state: "READY" | "NOT_READY";
  totalCount: number;
  readyCount: number;
  blockingCount: number;
  readyPercent: number;
  byStage: Record<FoundationalReadinessStage, number>;
  targets: FoundationalReadinessTarget[];
};

export type FoundationalOperatorBatchResult = {
  protocolVersion: typeof US_FOUNDATIONAL_READINESS_PROTOCOL_VERSION;
  objectType: "US_FOUNDATIONAL_OPERATOR_BATCH";
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
      state,
      registrationState,
      latestRunStatus:
        latestRun && typeof latestRun.status === "string" ? latestRun.status : null,
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
      freshnessState: requiredString(
        freshness.state,
        `items[${index}].freshness.state`,
      ),
      gaps: array(item.gaps).map((gap) => String(gap)),
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

function reasonFor(item: FoundationalSupplyHealthItem, stage: FoundationalReadinessStage): string | null {
  if (stage === "READY") return null;
  if (stage === "INGEST") return "COLLECTION_COMPLETED_WITHOUT_RAW_ARTIFACT";
  if (item.gaps.length > 0) return item.gaps.join(",");
  return `SUPPLY_${item.state}`;
}

export function evaluateUsFoundationalReadiness(
  targetIds: readonly string[],
  healthItems: readonly FoundationalSupplyHealthItem[],
): FoundationalReadinessGate {
  const expected = [...new Set(targetIds)];
  if (expected.length === 0) throw new Error("US FOUNDATIONAL readiness requires at least one target");
  const healthMap = new Map<string, FoundationalSupplyHealthItem>();
  for (const item of healthItems) {
    if (healthMap.has(item.targetId)) throw new Error(`Duplicate supply health for ${item.targetId}`);
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
      };
    }
    const stage = deriveFoundationalReadinessStage(item);
    byStage[stage] += 1;
    return {
      targetId,
      stage,
      ready: stage === "READY",
      healthState: item.state,
      gaps: item.gaps,
      reason: reasonFor(item, stage),
    };
  });
  const readyCount = targets.filter((target) => target.ready).length;
  const totalCount = targets.length;
  return {
    protocolVersion: US_FOUNDATIONAL_READINESS_PROTOCOL_VERSION,
    objectType: "US_FOUNDATIONAL_READINESS_GATE",
    state: readyCount === totalCount ? "READY" : "NOT_READY",
    totalCount,
    readyCount,
    blockingCount: totalCount - readyCount,
    readyPercent: Number(((readyCount / totalCount) * 100).toFixed(2)),
    byStage,
    targets,
  };
}

async function loadReadiness(
  fetchImpl: FetchLike,
  baseUrl: string,
  workspaceId: string,
  targetIds: readonly string[],
): Promise<FoundationalReadinessGate> {
  const payload = await requestJson(
    fetchImpl,
    baseUrl,
    `/api/source-supply-health?workspaceId=${encodeURIComponent(workspaceId)}&jurisdiction=US&coverageTier=FOUNDATIONAL&catalogState=ACTIVE`,
  );
  return evaluateUsFoundationalReadiness(targetIds, parseFoundationalSupplyHealth(payload));
}

export type OperateUsFoundationalBatchOptions = {
  baseUrl: string;
  workspaceId: string;
  dispatchTargetIds?: string[];
  dispatchAll?: boolean;
  approveDispatch?: boolean;
  fetchImpl?: FetchLike;
};

export async function operateUsFoundationalBatch(
  options: OperateUsFoundationalBatchOptions,
): Promise<FoundationalOperatorBatchResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const baseUrl = normalizedBaseUrl(options.baseUrl);
  const preview = await prepareUsFoundationalSupply({
    baseUrl,
    workspaceId: options.workspaceId,
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
    if (!allowed.has(targetId)) throw new Error(`Unknown US FOUNDATIONAL target ${targetId}`);
  }

  const approvalRequired = selected.length > 0 && options.approveDispatch !== true;
  if (selected.length === 0 || approvalRequired) {
    return {
      protocolVersion: US_FOUNDATIONAL_READINESS_PROTOCOL_VERSION,
      objectType: "US_FOUNDATIONAL_OPERATOR_BATCH",
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
      readiness: await loadReadiness(fetchImpl, baseUrl, options.workspaceId, allTargetIds),
    };
  }

  const execution = await prepareUsFoundationalSupply({
    baseUrl,
    workspaceId: options.workspaceId,
    dispatchTargetIds: selected,
    fetchImpl,
  });
  return {
    protocolVersion: US_FOUNDATIONAL_READINESS_PROTOCOL_VERSION,
    objectType: "US_FOUNDATIONAL_OPERATOR_BATCH",
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
    collectionAuthorization: execution.collectionAuthorization,
    readiness: await loadReadiness(fetchImpl, baseUrl, options.workspaceId, allTargetIds),
  };
}
