import { getRepresentativeSourceLiveCanaries } from "@markorbit/persistence/representative-source-live-canaries";

export const REPRESENTATIVE_SUPPLY_PROOF_VERSION = "REPRESENTATIVE_SUPPLY_PROOF_V1" as const;

export const REPRESENTATIVE_SUPPLY_PROOF_BLOCKERS = [
  "SOURCE_UNREGISTERED",
  "NO_ACQUISITION_EVIDENCE",
  "NO_READY_NORMALIZED_DOCUMENT",
  "NO_CURRENT_RETRIEVAL_DOCUMENT",
  "SUPPLY_NOT_FRESH",
  "COMPATIBILITY_NOT_PASS",
  "COMPATIBILITY_NOT_FRESH",
] as const;
export type RepresentativeSupplyProofBlocker =
  (typeof REPRESENTATIVE_SUPPLY_PROOF_BLOCKERS)[number];

export type RepresentativeSupplyProofEntry = {
  jurisdiction: string;
  displayName: string;
  targetId: string;
  status: "PROVEN" | "INCOMPLETE" | "FAILED";
  blockers: RepresentativeSupplyProofBlocker[];
  evidence: {
    registrationState: string;
    artifactCount: number;
    readyDocumentCount: number;
    currentRetrievalDocumentCount: number;
    supplyFreshness: string;
    compatibilityState: string;
    compatibilityFreshness: string;
    latestRunStatus: string | null;
  } | null;
  error: string | null;
};

export type RepresentativeSupplyProof = {
  version: typeof REPRESENTATIVE_SUPPLY_PROOF_VERSION;
  workspaceId: string;
  controlPlaneUrl: string;
  mutationPerformed: false;
  selectedJurisdictions: string[];
  entries: RepresentativeSupplyProofEntry[];
  summary: {
    proven: number;
    incomplete: number;
    failed: number;
  };
};

type JsonRecord = Record<string, unknown>;
type FetchLike = typeof fetch;

export type RunRepresentativeSupplyProofOptions = {
  baseUrl: string;
  workspaceId: string;
  jurisdictions?: readonly string[];
  fetchImpl?: FetchLike;
};

function record(value: unknown): JsonRecord | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function number(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function string(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function normalizedBaseUrl(raw: string): string {
  const url = new URL(raw);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Control-plane URL must use http or https");
  }
  return url.toString().replace(/\/$/, "");
}

function selectCanaries(requested: readonly string[] | undefined) {
  const canaries = getRepresentativeSourceLiveCanaries();
  if (!requested || requested.length === 0) return canaries;
  const supported = new Set<string>(canaries.map((item) => item.jurisdiction));
  const normalized = [
    ...new Set(requested.map((value) => value.trim().toUpperCase()).filter(Boolean)),
  ];
  const unknown = normalized.filter((value) => !supported.has(value));
  if (unknown.length > 0) {
    throw new Error(`Unsupported representative jurisdiction: ${unknown.join(", ")}`);
  }
  return canaries.filter((item) => normalized.includes(item.jurisdiction));
}

export function evaluateRepresentativeSupplyProofRecord(value: unknown): {
  status: "PROVEN" | "INCOMPLETE";
  blockers: RepresentativeSupplyProofBlocker[];
  evidence: NonNullable<RepresentativeSupplyProofEntry["evidence"]>;
} {
  const item = record(value) ?? {};
  const acquisition = record(item.acquisition) ?? {};
  const normalization = record(item.normalization) ?? {};
  const retrieval = record(item.retrieval) ?? {};
  const freshness = record(item.freshness) ?? {};
  const compatibility = record(item.compatibility) ?? {};
  const latestRun = record(item.latestRun);

  const evidence = {
    registrationState: string(item.registrationState) || "UNREGISTERED",
    artifactCount: number(acquisition.artifactCount),
    readyDocumentCount: number(normalization.readyDocumentCount),
    currentRetrievalDocumentCount: number(retrieval.currentDocumentCount),
    supplyFreshness: string(freshness.state) || "UNOBSERVED",
    compatibilityState: string(compatibility.state) || "UNOBSERVED",
    compatibilityFreshness: string(compatibility.freshness) || "UNOBSERVED",
    latestRunStatus: latestRun ? string(latestRun.status) || null : null,
  };

  const blockers: RepresentativeSupplyProofBlocker[] = [];
  if (evidence.registrationState !== "REGISTERED") blockers.push("SOURCE_UNREGISTERED");
  if (evidence.artifactCount <= 0) blockers.push("NO_ACQUISITION_EVIDENCE");
  if (evidence.readyDocumentCount <= 0) blockers.push("NO_READY_NORMALIZED_DOCUMENT");
  if (evidence.currentRetrievalDocumentCount <= 0) {
    blockers.push("NO_CURRENT_RETRIEVAL_DOCUMENT");
  }
  if (evidence.supplyFreshness !== "FRESH") blockers.push("SUPPLY_NOT_FRESH");
  if (evidence.compatibilityState !== "PASS") blockers.push("COMPATIBILITY_NOT_PASS");
  if (evidence.compatibilityFreshness !== "FRESH") blockers.push("COMPATIBILITY_NOT_FRESH");

  return {
    status: blockers.length === 0 ? "PROVEN" : "INCOMPLETE",
    blockers,
    evidence,
  };
}

async function loadTargetHealth(
  fetchImpl: FetchLike,
  baseUrl: string,
  workspaceId: string,
  jurisdiction: string,
  targetId: string,
): Promise<unknown> {
  const query = new URLSearchParams({
    workspaceId,
    jurisdiction,
    targetId,
    coverageTier: "FOUNDATIONAL",
    catalogState: "ACTIVE",
  });
  const response = await fetchImpl(`${baseUrl}/api/source-supply-health?${query.toString()}`, {
    cache: "no-store",
  });
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok) {
    const error = record(record(payload)?.error);
    const message = typeof error?.message === "string" ? error.message : `HTTP ${response.status}`;
    throw new Error(`source-supply-health: ${message}`);
  }
  const item = array(record(payload)?.items)
    .map(record)
    .find((candidate) => candidate?.targetId === targetId);
  if (!item)
    throw new Error(`Source supply health did not return representative target ${targetId}`);
  return item;
}

export async function runRepresentativeSupplyProof(
  options: RunRepresentativeSupplyProofOptions,
): Promise<RepresentativeSupplyProof> {
  const baseUrl = normalizedBaseUrl(options.baseUrl);
  const fetchImpl = options.fetchImpl ?? fetch;
  const selected = selectCanaries(options.jurisdictions);
  const entries: RepresentativeSupplyProofEntry[] = [];

  for (const canary of selected) {
    try {
      const result = evaluateRepresentativeSupplyProofRecord(
        await loadTargetHealth(
          fetchImpl,
          baseUrl,
          options.workspaceId,
          canary.jurisdiction,
          canary.targetId,
        ),
      );
      entries.push({
        jurisdiction: canary.jurisdiction,
        displayName: canary.displayName,
        targetId: canary.targetId,
        status: result.status,
        blockers: result.blockers,
        evidence: result.evidence,
        error: null,
      });
    } catch (error) {
      entries.push({
        jurisdiction: canary.jurisdiction,
        displayName: canary.displayName,
        targetId: canary.targetId,
        status: "FAILED",
        blockers: [],
        evidence: null,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    version: REPRESENTATIVE_SUPPLY_PROOF_VERSION,
    workspaceId: options.workspaceId,
    controlPlaneUrl: baseUrl,
    mutationPerformed: false,
    selectedJurisdictions: selected.map((item) => item.jurisdiction),
    entries,
    summary: {
      proven: entries.filter((entry) => entry.status === "PROVEN").length,
      incomplete: entries.filter((entry) => entry.status === "INCOMPLETE").length,
      failed: entries.filter((entry) => entry.status === "FAILED").length,
    },
  };
}
