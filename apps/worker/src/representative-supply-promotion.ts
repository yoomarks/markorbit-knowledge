import { getRepresentativeSupplyPromotionCanaries } from "@markorbit/persistence/representative-source-live-canaries";
import { prepareFoundationalSupply, type SupplyRun } from "./source-coverage-operations";

export const REPRESENTATIVE_SUPPLY_PROMOTION_VERSION =
  "REPRESENTATIVE_SUPPLY_PROMOTION_V1" as const;

export const REPRESENTATIVE_SUPPLY_PROMOTION_BLOCKERS = [
  "SOURCE_UNREGISTERED",
  "SOURCE_ID_MISSING",
  "COMPATIBILITY_UNOBSERVED",
  "COMPATIBILITY_STALE",
  "COMPATIBILITY_DEGRADED",
  "COMPATIBILITY_BLOCKED",
] as const;
export type RepresentativeSupplyPromotionBlocker =
  (typeof REPRESENTATIVE_SUPPLY_PROMOTION_BLOCKERS)[number];

export type RepresentativeSupplyPromotionCompatibility = {
  state: "PASS" | "DEGRADED" | "BLOCKED" | "UNOBSERVED";
  freshness: "FRESH" | "STALE" | "UNOBSERVED";
  observedAt: string | null;
};

export type RepresentativeSupplyPromotionGate = {
  targetId: string;
  jurisdiction: string;
  registrationState: "REGISTERED" | "UNREGISTERED";
  sourceIds: string[];
  compatibility: RepresentativeSupplyPromotionCompatibility;
  eligibility: "ELIGIBLE" | "BLOCKED";
  blockers: RepresentativeSupplyPromotionBlocker[];
};

export type RepresentativeSupplyPromotionEntry = {
  jurisdiction: string;
  displayName: string;
  targetId: string;
  gate: RepresentativeSupplyPromotionGate;
  state: "ELIGIBLE" | "BLOCKED" | "DISPATCHED" | "FAILED";
  run: SupplyRun | null;
  receiptId: string | null;
  error: string | null;
};

export type RepresentativeSupplyPromotionWave = {
  version: typeof REPRESENTATIVE_SUPPLY_PROMOTION_VERSION;
  mode: "PLAN" | "APPLY";
  workspaceId: string;
  controlPlaneUrl: string;
  selectedJurisdictions: string[];
  entries: RepresentativeSupplyPromotionEntry[];
  summary: {
    eligible: number;
    blocked: number;
    dispatched: number;
    failed: number;
  };
};

type JsonRecord = Record<string, unknown>;
type FetchLike = typeof fetch;

type DispatchTarget = (input: {
  baseUrl: string;
  workspaceId: string;
  jurisdiction: string;
  targetId: string;
}) => Promise<SupplyRun>;

type RecordReceipt = (input: {
  baseUrl: string;
  workspaceId: string;
  jurisdiction: string;
  targetId: string;
  collectionRunId: string;
}) => Promise<string>;

export type RunRepresentativeSupplyPromotionOptions = {
  baseUrl: string;
  workspaceId: string;
  apply: boolean;
  jurisdictions?: readonly string[];
  fetchImpl?: FetchLike;
  dispatchTarget?: DispatchTarget;
  recordReceipt?: RecordReceipt;
};

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
  return url.toString().replace(/\/$/, "");
}

function compatibility(value: unknown): RepresentativeSupplyPromotionCompatibility {
  const item = record(value);
  const state = item?.state;
  const freshness = item?.freshness;
  const allowedStates = new Set(["PASS", "DEGRADED", "BLOCKED", "UNOBSERVED"]);
  const allowedFreshness = new Set(["FRESH", "STALE", "UNOBSERVED"]);
  return {
    state:
      typeof state === "string" && allowedStates.has(state)
        ? (state as RepresentativeSupplyPromotionCompatibility["state"])
        : "UNOBSERVED",
    freshness:
      typeof freshness === "string" && allowedFreshness.has(freshness)
        ? (freshness as RepresentativeSupplyPromotionCompatibility["freshness"])
        : "UNOBSERVED",
    observedAt: typeof item?.observedAt === "string" ? item.observedAt : null,
  };
}

export function evaluateRepresentativeSupplyPromotionGate(input: {
  targetId: string;
  jurisdiction: string;
  registrationState: "REGISTERED" | "UNREGISTERED";
  sourceIds: string[];
  compatibility: RepresentativeSupplyPromotionCompatibility;
}): RepresentativeSupplyPromotionGate {
  const blockers: RepresentativeSupplyPromotionBlocker[] = [];
  if (input.registrationState !== "REGISTERED") blockers.push("SOURCE_UNREGISTERED");
  if (input.sourceIds.length === 0) blockers.push("SOURCE_ID_MISSING");
  if (input.compatibility.freshness === "UNOBSERVED") {
    blockers.push("COMPATIBILITY_UNOBSERVED");
  } else if (input.compatibility.freshness === "STALE") {
    blockers.push("COMPATIBILITY_STALE");
  }
  if (input.compatibility.freshness === "FRESH") {
    if (input.compatibility.state === "UNOBSERVED") blockers.push("COMPATIBILITY_UNOBSERVED");
    if (input.compatibility.state === "DEGRADED") blockers.push("COMPATIBILITY_DEGRADED");
    if (input.compatibility.state === "BLOCKED") blockers.push("COMPATIBILITY_BLOCKED");
  }
  return {
    ...input,
    eligibility: blockers.length === 0 ? "ELIGIBLE" : "BLOCKED",
    blockers: [...new Set(blockers)],
  };
}

async function requestJson(
  fetchImpl: FetchLike,
  url: string,
  init?: RequestInit,
): Promise<unknown> {
  const response = await fetchImpl(url, init);
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok) {
    const error = record(record(payload)?.error);
    const message = typeof error?.message === "string" ? error.message : `HTTP ${response.status}`;
    throw new Error(message);
  }
  return payload;
}

async function loadGate(
  fetchImpl: FetchLike,
  baseUrl: string,
  workspaceId: string,
  jurisdiction: string,
  targetId: string,
): Promise<RepresentativeSupplyPromotionGate> {
  const query = new URLSearchParams({
    workspaceId,
    jurisdiction,
    targetId,
    coverageTier: "FOUNDATIONAL",
    catalogState: "ACTIVE",
  });
  const payload = await requestJson(
    fetchImpl,
    `${baseUrl}/api/source-supply-health?${query.toString()}`,
    { cache: "no-store" },
  );
  const items = array(record(payload)?.items)
    .map(record)
    .filter((item): item is JsonRecord => !!item);
  const item = items.find((candidate) => candidate.targetId === targetId);
  if (!item)
    throw new Error(`Source supply health did not return representative target ${targetId}`);
  const sourceIds = array(item.sourceIds).filter(
    (value): value is string => typeof value === "string",
  );
  return evaluateRepresentativeSupplyPromotionGate({
    targetId,
    jurisdiction,
    registrationState: item.registrationState === "REGISTERED" ? "REGISTERED" : "UNREGISTERED",
    sourceIds,
    compatibility: compatibility(item.compatibility),
  });
}

async function dispatchRepresentativeTarget(input: {
  baseUrl: string;
  workspaceId: string;
  jurisdiction: string;
  targetId: string;
}): Promise<SupplyRun> {
  const result = await prepareFoundationalSupply({
    baseUrl: input.baseUrl,
    workspaceId: input.workspaceId,
    jurisdiction: input.jurisdiction,
    dispatchTargetIds: [input.targetId],
  });
  if (result.collectionAuthorization !== "EXPLICIT_TARGET_MANUAL_RUNS_DISPATCHED") {
    throw new Error(`${input.targetId} dispatch did not produce explicit collection authorization`);
  }
  const run = result.runs.find((candidate) => candidate.targetId === input.targetId);
  if (!run || result.runs.length !== 1) {
    throw new Error(
      `${input.targetId} dispatch must create exactly one representative CollectionRun`,
    );
  }
  return run;
}

async function recordPromotionReceipt(
  fetchImpl: FetchLike,
  input: {
    baseUrl: string;
    workspaceId: string;
    jurisdiction: string;
    targetId: string;
    collectionRunId: string;
  },
): Promise<string> {
  const payload = await requestJson(
    fetchImpl,
    `${input.baseUrl}/api/source-supply-promotion-receipts`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "Idempotency-Key": `representative-supply:${input.collectionRunId}`,
      },
      body: JSON.stringify({
        workspaceId: input.workspaceId,
        jurisdiction: input.jurisdiction,
        targetId: input.targetId,
        collectionRunId: input.collectionRunId,
        operatorActor: "operator:representative-supply-promotion",
      }),
    },
  );
  const receipt = record(record(payload)?.receipt);
  if (!receipt || typeof receipt.id !== "string" || !receipt.id) {
    throw new Error(`Supply promotion receipt for ${input.targetId} returned an invalid response`);
  }
  return receipt.id;
}

function selectCanaries(requested: readonly string[] | undefined, apply: boolean) {
  const canaries = getRepresentativeSupplyPromotionCanaries();
  const supported = new Set<string>(canaries.map((item) => item.jurisdiction));
  const normalized = [
    ...new Set((requested ?? []).map((value) => value.trim().toUpperCase()).filter(Boolean)),
  ];
  if (apply && normalized.length === 0) {
    throw new Error("--apply requires at least one explicit representative jurisdiction");
  }
  const unknown = normalized.filter((value) => !supported.has(value));
  if (unknown.length > 0) {
    throw new Error(`Unsupported representative jurisdiction: ${unknown.join(", ")}`);
  }
  if (normalized.length === 0) return canaries;
  return canaries.filter((item) => normalized.includes(item.jurisdiction));
}

export async function runRepresentativeSupplyPromotionWave(
  options: RunRepresentativeSupplyPromotionOptions,
): Promise<RepresentativeSupplyPromotionWave> {
  const baseUrl = normalizedBaseUrl(options.baseUrl);
  const fetchImpl = options.fetchImpl ?? fetch;
  const dispatchTarget = options.dispatchTarget ?? dispatchRepresentativeTarget;
  const recordReceipt =
    options.recordReceipt ?? ((input) => recordPromotionReceipt(fetchImpl, input));
  const selected = selectCanaries(options.jurisdictions, options.apply);
  const entries: RepresentativeSupplyPromotionEntry[] = [];

  for (const canary of selected) {
    let gate: RepresentativeSupplyPromotionGate;
    try {
      gate = await loadGate(
        fetchImpl,
        baseUrl,
        options.workspaceId,
        canary.jurisdiction,
        canary.targetId,
      );
    } catch (error) {
      entries.push({
        jurisdiction: canary.jurisdiction,
        displayName: canary.displayName,
        targetId: canary.targetId,
        gate: evaluateRepresentativeSupplyPromotionGate({
          targetId: canary.targetId,
          jurisdiction: canary.jurisdiction,
          registrationState: "UNREGISTERED",
          sourceIds: [],
          compatibility: { state: "UNOBSERVED", freshness: "UNOBSERVED", observedAt: null },
        }),
        state: "FAILED",
        run: null,
        receiptId: null,
        error: error instanceof Error ? error.message : String(error),
      });
      continue;
    }

    if (gate.eligibility !== "ELIGIBLE" || !options.apply) {
      entries.push({
        jurisdiction: canary.jurisdiction,
        displayName: canary.displayName,
        targetId: canary.targetId,
        gate,
        state: gate.eligibility,
        run: null,
        receiptId: null,
        error: null,
      });
      continue;
    }

    let run: SupplyRun | null = null;
    try {
      run = await dispatchTarget({
        baseUrl,
        workspaceId: options.workspaceId,
        jurisdiction: canary.jurisdiction,
        targetId: canary.targetId,
      });
      const receiptId = await recordReceipt({
        baseUrl,
        workspaceId: options.workspaceId,
        jurisdiction: canary.jurisdiction,
        targetId: canary.targetId,
        collectionRunId: run.runId,
      });
      entries.push({
        jurisdiction: canary.jurisdiction,
        displayName: canary.displayName,
        targetId: canary.targetId,
        gate,
        state: "DISPATCHED",
        run,
        receiptId,
        error: null,
      });
    } catch (error) {
      entries.push({
        jurisdiction: canary.jurisdiction,
        displayName: canary.displayName,
        targetId: canary.targetId,
        gate,
        state: "FAILED",
        run,
        receiptId: null,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    version: REPRESENTATIVE_SUPPLY_PROMOTION_VERSION,
    mode: options.apply ? "APPLY" : "PLAN",
    workspaceId: options.workspaceId,
    controlPlaneUrl: baseUrl,
    selectedJurisdictions: selected.map((item) => item.jurisdiction),
    entries,
    summary: {
      eligible: entries.filter((entry) => entry.state === "ELIGIBLE").length,
      blocked: entries.filter((entry) => entry.state === "BLOCKED").length,
      dispatched: entries.filter((entry) => entry.state === "DISPATCHED").length,
      failed: entries.filter((entry) => entry.state === "FAILED").length,
    },
  };
}
