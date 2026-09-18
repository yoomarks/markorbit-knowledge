import {
  CNIPA_DEFAULT_HISTORICAL_FLOOR,
  decideCnipaHistoricalWindow,
  planCnipaHistoricalWindow,
  type CnipaHistoricalWindowDays,
  type CnipaHistoricalWindowPlan,
} from "@markorbit/worker-runtime/cnipa-window-policy";

export type CnipaBackfillDocumentKind =
  | "REGISTRATION_EXAMINATION"
  | "OPPOSITION_DECISION"
  | "REVIEW_ADJUDICATION";

export const CNIPA_HISTORICAL_BACKFILL_VERSION = "cnipa-historical-backfill-v1" as const;

export type CnipaBackfillCompletionState = "ACTIVE" | "COMPLETE" | "BLOCKED";

export type CnipaAcceptedWindow = {
  fromDate: string;
  toDate: string;
  windowDays: CnipaHistoricalWindowDays;
  runId: string;
  coverageArtifactId: string;
  coverageArtifactSha256: string;
};

export type CnipaPendingWindow = {
  fromDate: string;
  toDate: string;
  windowDays: CnipaHistoricalWindowDays;
  idempotencyKey: string;
};

export type CnipaHistoricalBackfillSourceState = {
  sourceId: string;
  planId: string;
  documentKind: CnipaBackfillDocumentKind;
  floorDate: string;
  throughDate: string;
  cursorDate: string;
  currentWindowDays: CnipaHistoricalWindowDays;
  pendingWindow: CnipaPendingWindow | null;
  lastRunId: string | null;
  lastAcceptedWindow: CnipaAcceptedWindow | null;
  replayRequired: boolean;
  lastCoverageManifestArtifactId: string | null;
  lastCoverageManifestArtifactSha256: string | null;
  completionState: CnipaBackfillCompletionState;
  blockReason: string | null;
};

export type CnipaHistoricalBackfillCheckpoint = {
  schemaVersion: typeof CNIPA_HISTORICAL_BACKFILL_VERSION;
  updatedAt: string;
  sources: CnipaHistoricalBackfillSourceState[];
};

export type CnipaCoverageManifestForBackfill = {
  schemaVersion: "cnipa-collection-coverage-v1";
  documentKind: CnipaBackfillDocumentKind;
  query: {
    mode: "DATE_RANGE";
    fromDate: string;
    toDate: string;
    documentKinds?: readonly CnipaBackfillDocumentKind[];
  };
  rawListPageCount: number;
  uniqueSourceRecordCount: number;
  stopReason:
    | "NATURAL_SHORT_OR_EMPTY_PAGE"
    | "FULL_PAGE_ZERO_NEW_IDS"
    | "SAFETY_CEILING"
    | "NO_LIST_EVIDENCE"
    | "UNCLASSIFIED_FULL_PAGE_STOP";
  safetyCeilingReached: boolean;
  duplicateFullPageDetected: boolean;
  completeByObservedPaging: boolean;
};

function nextDate(value: string): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function deterministicKey(state: CnipaHistoricalBackfillSourceState, plan: CnipaHistoricalWindowPlan) {
  return [
    "cnipa-backfill-v1",
    state.documentKind.toLowerCase(),
    plan.fromDate,
    plan.toDate,
    String(plan.windowDays),
  ].join("-");
}

export function createCnipaHistoricalBackfillState(input: {
  sourceId: string;
  planId: string;
  documentKind: CnipaBackfillDocumentKind;
  throughDate: string;
  floorDate?: string;
}): CnipaHistoricalBackfillSourceState {
  const floorDate = input.floorDate ?? CNIPA_DEFAULT_HISTORICAL_FLOOR;
  return {
    ...input,
    floorDate,
    cursorDate: floorDate,
    currentWindowDays: 30,
    pendingWindow: null,
    lastRunId: null,
    lastAcceptedWindow: null,
    replayRequired: false,
    lastCoverageManifestArtifactId: null,
    lastCoverageManifestArtifactSha256: null,
    completionState: "ACTIVE",
    blockReason: null,
  };
}

export function planNextCnipaBackfillWindow(
  state: CnipaHistoricalBackfillSourceState,
): CnipaPendingWindow | null {
  if (state.completionState !== "ACTIVE") return null;
  if (state.pendingWindow) return state.pendingWindow;
  const plan = planCnipaHistoricalWindow({
    cursorDate: state.cursorDate,
    throughDate: state.throughDate,
    windowDays: state.currentWindowDays,
  });
  if (!plan) return null;
  return { ...plan, idempotencyKey: deterministicKey(state, plan) };
}

function assertCoverageMatchesPending(
  state: CnipaHistoricalBackfillSourceState,
  manifest: CnipaCoverageManifestForBackfill,
): CnipaPendingWindow {
  const pending = state.pendingWindow;
  if (!pending) throw new Error("CNIPA backfill coverage cannot be applied without a pending window");
  if (
    manifest.schemaVersion !== "cnipa-collection-coverage-v1" ||
    manifest.documentKind !== state.documentKind ||
    manifest.query.mode !== "DATE_RANGE" ||
    manifest.query.fromDate !== pending.fromDate ||
    manifest.query.toDate !== pending.toDate ||
    manifest.query.documentKinds?.length !== 1 ||
    manifest.query.documentKinds[0] !== state.documentKind
  ) {
    throw new Error("CNIPA coverage manifest does not match the durable pending window");
  }
  return pending;
}

export function applyCnipaCoverageObservation(input: {
  state: CnipaHistoricalBackfillSourceState;
  runId: string;
  artifactId: string;
  artifactSha256: string;
  manifest: CnipaCoverageManifestForBackfill;
}): CnipaHistoricalBackfillSourceState {
  const pending = assertCoverageMatchesPending(input.state, input.manifest);
  const state: CnipaHistoricalBackfillSourceState = {
    ...input.state,
    lastRunId: input.runId,
    lastCoverageManifestArtifactId: input.artifactId,
    lastCoverageManifestArtifactSha256: input.artifactSha256,
  };

  if (
    input.manifest.stopReason === "FULL_PAGE_ZERO_NEW_IDS" ||
    input.manifest.duplicateFullPageDetected
  ) {
    return {
      ...state,
      replayRequired: false,
      completionState: "BLOCKED",
      blockReason: "DUPLICATE_FULL_PAGE_ANOMALY",
    };
  }

  if (
    input.manifest.stopReason === "NO_LIST_EVIDENCE" ||
    input.manifest.stopReason === "UNCLASSIFIED_FULL_PAGE_STOP"
  ) {
    return {
      ...state,
      replayRequired: false,
      completionState: "BLOCKED",
      blockReason: input.manifest.stopReason,
    };
  }

  const decision = decideCnipaHistoricalWindow({
    observation: {
      fromDate: pending.fromDate,
      toDate: pending.toDate,
      requestedWindowDays: pending.windowDays,
      pageCount: input.manifest.rawListPageCount,
      uniqueRecordCount: input.manifest.uniqueSourceRecordCount,
      reachedSafetyCeiling: input.manifest.safetyCeilingReached,
    },
  });

  if (decision.action === "BLOCKED_AT_DAILY_CEILING") {
    return {
      ...state,
      currentWindowDays: 1,
      replayRequired: false,
      completionState: "BLOCKED",
      blockReason: "BLOCKED_AT_DAILY_CEILING",
    };
  }

  if (decision.action === "REPLAY_SMALLER") {
    return {
      ...state,
      currentWindowDays: decision.nextWindowDays,
      pendingWindow: null,
      lastRunId: null,
      replayRequired: true,
      completionState: "ACTIVE",
      blockReason: null,
    };
  }

  if (!input.manifest.completeByObservedPaging) {
    return {
      ...state,
      replayRequired: false,
      completionState: "BLOCKED",
      blockReason: `INCOMPLETE_COVERAGE:${input.manifest.stopReason}`,
    };
  }

  const accepted: CnipaAcceptedWindow = {
    fromDate: pending.fromDate,
    toDate: pending.toDate,
    windowDays: pending.windowDays,
    runId: input.runId,
    coverageArtifactId: input.artifactId,
    coverageArtifactSha256: input.artifactSha256,
  };
  const cursorDate = nextDate(pending.toDate);
  const finished = cursorDate > state.throughDate;
  return {
    ...state,
    cursorDate,
    currentWindowDays: decision.nextWindowDays,
    pendingWindow: null,
    lastRunId: null,
    lastAcceptedWindow: accepted,
    replayRequired: false,
    completionState: finished ? "COMPLETE" : "ACTIVE",
    blockReason: null,
  };
}
