import type { DatabaseSync } from "node:sqlite";
import {
  EVIDENCE_SUPPLY_HEALTH_PROTOCOL_VERSION,
  EVIDENCE_SUPPLY_HEALTH_STATES,
  isCollectionPlan,
  isSourceDefinition,
  type CollectionPlan,
  type EvidenceSupplyCoverageFacts,
  type EvidenceSupplyHealthReasonCode,
  type EvidenceSupplyHealthRecordV1,
  type EvidenceSupplyHealthResultV1,
  type EvidenceSupplyHealthState,
  type EvidenceSupplyLatencyFacts,
  type EvidenceSupplyReliabilityFacts,
  type EvidenceSupplyScheduleFacts,
  type SourceDefinition,
  type SourceSupplyFreshnessState,
} from "@markorbit/contracts";
import { SqliteOperationalSupplyHealthRepository } from "./source-compatibility-supply-health";
import {
  evaluateSourceCoverage,
  listSourceCoverageTargets,
  type SourceCoverageRegistration,
} from "./source-coverage-catalog";
import { summarizeProducerCoreLatency } from "./producer-core-reliability-scorecard";

const RELIABILITY_WINDOW_DAYS = 30;
const LATENCY_WINDOW_DAYS = 30;
const CHANGE_WINDOW_DAYS = 30;
const RECENT_CHANGE_WINDOW_DAYS = 7;

export type EvidenceSupplyHealthListInput = {
  workspaceId: string;
  observedAt?: Date;
};

export interface EvidenceSupplyHealthRepository {
  list(input: EvidenceSupplyHealthListInput): EvidenceSupplyHealthResultV1;
}

type SchedulerStateRow = {
  planId: string;
  nextDueAt: string | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  lastErrorAt: string | null;
};

type RunFact = {
  sourceId: string;
  status: "COMPLETED" | "FAILED" | "CANCELLED";
  updatedAt: string;
};

type LatencyFact = {
  sourceId: string;
  publishedAt: string | null;
  capturedAt: string;
  normalizedAt: string | null;
  indexedAt: string;
};

type ChangeFact = {
  sourceId: string;
  observedAt: string;
};

type CoverageInput = {
  registration: SourceCoverageRegistration;
  sourceStatuses: string[];
  supplyState: "READY" | "DEGRADED" | "BLOCKED";
  gaps: string[];
  artifactCount: number;
  observedArtifactKinds: string[];
  expectedArtifactKinds: string[];
  knownLimitation: boolean;
};

function tableExists(database: DatabaseSync, tableName: string): boolean {
  return Boolean(
    database
      .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?")
      .get(tableName),
  );
}

function parseTimestamp(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function durationMs(start: string | null, end: string | null): number | null {
  const startMs = parseTimestamp(start);
  const endMs = parseTimestamp(end);
  if (startMs === null || endMs === null || endMs < startMs) return null;
  return endMs - startMs;
}

function windowStart(observedAt: Date, days: number): string {
  return new Date(observedAt.getTime() - days * 24 * 60 * 60 * 1_000).toISOString();
}

function latest(values: Array<string | null | undefined>): string | null {
  const timestamps = values.filter((value): value is string => Boolean(value));
  return timestamps.length === 0 ? null : [...timestamps].sort().at(-1)!;
}

function earliest(values: Array<string | null | undefined>): string | null {
  const timestamps = values.filter((value): value is string => Boolean(value));
  return timestamps.length === 0 ? null : [...timestamps].sort().at(0)!;
}

function loadSources(database: DatabaseSync, workspaceId: string): SourceDefinition[] {
  if (!tableExists(database, "source_definitions")) return [];
  return (database.prepare("SELECT document_json FROM source_definitions").all() as Array<{
    document_json: string;
  }>)
    .map((row) => JSON.parse(row.document_json) as unknown)
    .filter(isSourceDefinition)
    .filter((source) => source.workspaceId === workspaceId);
}

function loadPlans(database: DatabaseSync, workspaceId: string): CollectionPlan[] {
  if (!tableExists(database, "collection_plans")) return [];
  return (database.prepare("SELECT document_json FROM collection_plans").all() as Array<{
    document_json: string;
  }>)
    .map((row) => JSON.parse(row.document_json) as unknown)
    .filter(isCollectionPlan)
    .filter((plan) => plan.workspaceId === workspaceId);
}

function loadSchedulerStates(database: DatabaseSync, workspaceId: string): Map<string, SchedulerStateRow> {
  if (!tableExists(database, "collection_schedule_states")) return new Map();
  const rows = database
    .prepare(
      `SELECT plan_id AS planId,
              next_due_at AS nextDueAt,
              last_error_code AS lastErrorCode,
              last_error_message AS lastErrorMessage,
              last_error_at AS lastErrorAt
         FROM collection_schedule_states
        WHERE workspace_id = ?`,
    )
    .all(workspaceId) as SchedulerStateRow[];
  return new Map(rows.map((row) => [row.planId, row]));
}

function loadRunFacts(database: DatabaseSync, workspaceId: string, from: string): RunFact[] {
  if (!tableExists(database, "collection_runs")) return [];
  return database
    .prepare(
      `SELECT source_id AS sourceId, status, updated_at AS updatedAt
         FROM collection_runs
        WHERE workspace_id = ?
          AND updated_at >= ?
          AND status IN ('COMPLETED','FAILED','CANCELLED')
        ORDER BY updated_at ASC, id ASC`,
    )
    .all(workspaceId, from) as RunFact[];
}

function loadLatencyFacts(database: DatabaseSync, workspaceId: string, from: string): LatencyFact[] {
  if (!tableExists(database, "retrieval_documents")) return [];
  const normalizedColumn = tableExists(database, "staging_documents")
    ? "s.created_at AS normalizedAt"
    : "NULL AS normalizedAt";
  const join = tableExists(database, "staging_documents")
    ? "LEFT JOIN staging_documents s ON s.id = d.staging_document_id"
    : "";
  return database
    .prepare(
      `SELECT d.source_id AS sourceId,
              d.published_at AS publishedAt,
              d.captured_at AS capturedAt,
              ${normalizedColumn},
              d.indexed_at AS indexedAt
         FROM retrieval_documents d
         ${join}
        WHERE d.workspace_id = ? AND d.indexed_at >= ?
        ORDER BY d.indexed_at ASC, d.document_id ASC, d.artifact_version ASC`,
    )
    .all(workspaceId, from) as LatencyFact[];
}

function loadChangeFacts(database: DatabaseSync, workspaceId: string, from: string): ChangeFact[] {
  if (!tableExists(database, "document_change_events")) return [];
  return database
    .prepare(
      `SELECT source_id AS sourceId, observed_at AS observedAt
         FROM document_change_events
        WHERE workspace_id = ? AND change_kind = 'UPDATED' AND observed_at >= ?
        ORDER BY observed_at ASC, sequence ASC`,
    )
    .all(workspaceId, from) as ChangeFact[];
}

function deriveCoverage(input: CoverageInput): EvidenceSupplyCoverageFacts {
  const missingExpectedArtifactKinds = input.expectedArtifactKinds.filter(
    (kind) => !input.observedArtifactKinds.includes(kind),
  );
  if (input.registration.state === "UNREGISTERED" || input.artifactCount === 0) {
    return {
      state: "UNKNOWN",
      reasons: [
        input.registration.state === "UNREGISTERED"
          ? "SOURCE_UNREGISTERED"
          : "NO_ACQUISITION_EVIDENCE",
      ],
      expectedArtifactKinds: [...input.expectedArtifactKinds],
      observedArtifactKinds: [...input.observedArtifactKinds],
      missingExpectedArtifactKinds,
    };
  }

  const reasons = new Set<string>();
  if (!input.sourceStatuses.includes("ACTIVE")) reasons.add("NO_ACTIVE_SOURCE");
  if (input.supplyState !== "READY") reasons.add(`SUPPLY_${input.supplyState}`);
  input.gaps.forEach((gap) => reasons.add(gap));
  missingExpectedArtifactKinds.forEach((kind) =>
    reasons.add(`EXPECTED_ARTIFACT_KIND_MISSING:${kind}`),
  );
  if (input.knownLimitation) reasons.add("KNOWN_LIMITATION");

  return {
    state: reasons.size > 0 ? "PARTIAL" : "COMPLETE",
    reasons: [...reasons],
    expectedArtifactKinds: [...input.expectedArtifactKinds],
    observedArtifactKinds: [...input.observedArtifactKinds],
    missingExpectedArtifactKinds,
  };
}

function cadence(plan: CollectionPlan): string {
  switch (plan.schedule.mode) {
    case "MANUAL":
      return "MANUAL";
    case "INTERVAL":
      return `INTERVAL:${plan.schedule.intervalSeconds}s`;
    case "CHANGE_WATCH":
      return `CHANGE_WATCH:${plan.schedule.pollIntervalSeconds}s`;
    case "CRON":
      return `CRON:${plan.schedule.expression}@${plan.schedule.timezone}`;
  }
}

function scheduleFacts(
  sourceIds: readonly string[],
  plans: readonly CollectionPlan[],
  schedulerStates: ReadonlyMap<string, SchedulerStateRow>,
): EvidenceSupplyScheduleFacts {
  const relevant = plans.filter((plan) => sourceIds.includes(plan.sourceId));
  const active = relevant.filter((plan) => plan.status === "ACTIVE");
  const hasManual = relevant.some((plan) => plan.schedule.mode === "MANUAL");
  const hasAutomatic = relevant.some((plan) => plan.schedule.mode !== "MANUAL");
  const state =
    relevant.length === 0
      ? "UNCONFIGURED"
      : hasManual && hasAutomatic
        ? "MIXED"
        : hasAutomatic
          ? "AUTOMATIC"
          : "MANUAL";

  const automaticActive = active.filter((plan) => plan.schedule.mode !== "MANUAL");
  const schedulerRows = automaticActive
    .map((plan) => ({ plan, scheduler: schedulerStates.get(plan.id) }))
    .filter((item) => item.scheduler !== undefined);
  const errors = schedulerRows
    .filter(
      (item) =>
        item.scheduler!.lastErrorCode &&
        item.scheduler!.lastErrorMessage &&
        item.scheduler!.lastErrorAt,
    )
    .map((item) => ({
      code: item.scheduler!.lastErrorCode!,
      message: item.scheduler!.lastErrorMessage!,
      at: item.scheduler!.lastErrorAt!,
      planId: item.plan.id,
    }))
    .sort((left, right) => left.at.localeCompare(right.at));

  return {
    state,
    planCount: relevant.length,
    activePlanCount: active.length,
    expectedCadences: [...new Set(active.map(cadence))].sort(),
    nextScheduledCheckAt: earliest(schedulerRows.map((item) => item.scheduler!.nextDueAt)),
    schedulerErrorCount: errors.length,
    latestSchedulerError: errors.at(-1) ?? null,
  };
}

function reliabilityFacts(
  sourceIds: readonly string[],
  runs: readonly RunFact[],
): EvidenceSupplyReliabilityFacts {
  const relevant = runs.filter((run) => sourceIds.includes(run.sourceId));
  const completed = relevant.filter((run) => run.status === "COMPLETED");
  const failed = relevant.filter((run) => run.status === "FAILED");
  const cancelled = relevant.filter((run) => run.status === "CANCELLED");
  const attemptedOutcome = completed.length + failed.length;
  return {
    windowDays: RELIABILITY_WINDOW_DAYS,
    attempts: relevant.length,
    completed: completed.length,
    failed: failed.length,
    cancelled: cancelled.length,
    successRate: attemptedOutcome === 0 ? null : completed.length / attemptedOutcome,
    lastCompletedAt: latest(completed.map((run) => run.updatedAt)),
    lastFailedAt: latest(failed.map((run) => run.updatedAt)),
  };
}

function latencyFacts(
  sourceIds: readonly string[],
  facts: readonly LatencyFact[],
): EvidenceSupplyLatencyFacts {
  const relevant = facts.filter((fact) => sourceIds.includes(fact.sourceId));
  return {
    windowDays: LATENCY_WINDOW_DAYS,
    publicationToCapture: summarizeProducerCoreLatency(
      relevant.map((fact) => durationMs(fact.publishedAt, fact.capturedAt)),
    ),
    captureToNormalized: summarizeProducerCoreLatency(
      relevant.map((fact) => durationMs(fact.capturedAt, fact.normalizedAt)),
    ),
    normalizedToRetrievalReady: summarizeProducerCoreLatency(
      relevant.map((fact) => durationMs(fact.normalizedAt, fact.indexedAt)),
    ),
    basis: {
      publication: "RETRIEVAL_DOCUMENT_PUBLISHED_AT",
      capture: "RETRIEVAL_DOCUMENT_CAPTURED_AT",
      normalized: "STAGING_DOCUMENT_CREATED_AT",
      retrievalReady: "RETRIEVAL_DOCUMENT_INDEXED_AT",
    },
  };
}

function changeFacts(
  sourceIds: readonly string[],
  facts: readonly ChangeFact[],
  sevenDayStart: string,
) {
  const relevant = facts.filter((fact) => sourceIds.includes(fact.sourceId));
  return {
    updates7d: relevant.filter((fact) => fact.observedAt >= sevenDayStart).length,
    updates30d: relevant.length,
    lastObservedChangeAt: latest(relevant.map((fact) => fact.observedAt)),
  };
}

export function deriveEvidenceSupplyHealthState(input: {
  coverage: EvidenceSupplyCoverageFacts["state"];
  supplyState: "READY" | "DEGRADED" | "BLOCKED";
  freshness: SourceSupplyFreshnessState;
  schedulerErrorCount: number;
}): EvidenceSupplyHealthState {
  if (input.coverage === "UNKNOWN") return "UNKNOWN";
  if (input.supplyState === "BLOCKED") return "BLOCKED";
  if (input.freshness === "STALE") return "STALE";
  if (input.coverage === "PARTIAL") return "PARTIAL";
  if (input.supplyState === "DEGRADED" || input.schedulerErrorCount > 0) return "DEGRADED";
  return "HEALTHY";
}

function reasonCodes(input: {
  coverage: EvidenceSupplyCoverageFacts;
  supplyState: "READY" | "DEGRADED" | "BLOCKED";
  freshness: SourceSupplyFreshnessState;
  gaps: readonly string[];
  schedule: EvidenceSupplyScheduleFacts;
  reliability: EvidenceSupplyReliabilityFacts;
}): EvidenceSupplyHealthReasonCode[] {
  const reasons = new Set<EvidenceSupplyHealthReasonCode>();
  for (const reason of input.coverage.reasons) {
    if (reason === "SOURCE_UNREGISTERED" || reason === "NO_ACQUISITION_EVIDENCE") {
      reasons.add(reason);
    } else if (reason === "NO_ACTIVE_SOURCE" || reason === "KNOWN_LIMITATION") {
      reasons.add(reason);
    } else if (reason.startsWith("EXPECTED_ARTIFACT_KIND_MISSING:")) {
      reasons.add(reason as EvidenceSupplyHealthReasonCode);
    }
  }
  if (input.supplyState === "BLOCKED") reasons.add("SUPPLY_BLOCKED");
  if (input.supplyState === "DEGRADED") reasons.add("SUPPLY_DEGRADED");
  if (input.freshness === "STALE") reasons.add("ACQUISITION_STALE");
  input.gaps.forEach((gap) => reasons.add(`SUPPLY_GAP:${gap}`));
  if (input.schedule.schedulerErrorCount > 0) {
    reasons.add("SCHEDULER_ERROR");
    if (input.schedule.latestSchedulerError) {
      reasons.add(`SCHEDULER_ERROR:${input.schedule.latestSchedulerError.code}`);
    }
  }
  if (input.reliability.failed > 0) reasons.add("RECENT_ACQUISITION_FAILURES");
  return [...reasons].sort();
}

function emptyByState(): Record<EvidenceSupplyHealthState, number> {
  return Object.fromEntries(EVIDENCE_SUPPLY_HEALTH_STATES.map((state) => [state, 0])) as Record<
    EvidenceSupplyHealthState,
    number
  >;
}

export class SqliteEvidenceSupplyHealthRepository implements EvidenceSupplyHealthRepository {
  constructor(private readonly database: DatabaseSync) {}

  list(input: EvidenceSupplyHealthListInput): EvidenceSupplyHealthResultV1 {
    const workspaceId = input.workspaceId.trim();
    if (!workspaceId) throw new Error("workspaceId is required");
    const observedAtDate = input.observedAt ?? new Date();
    if (Number.isNaN(observedAtDate.getTime())) throw new Error("observedAt must be a valid Date");
    const observedAt = observedAtDate.toISOString();
    const reliabilityFrom = windowStart(observedAtDate, RELIABILITY_WINDOW_DAYS);
    const latencyFrom = windowStart(observedAtDate, LATENCY_WINDOW_DAYS);
    const changeFrom = windowStart(observedAtDate, CHANGE_WINDOW_DAYS);
    const sevenDayStart = windowStart(observedAtDate, RECENT_CHANGE_WINDOW_DAYS);

    const sources = loadSources(this.database, workspaceId);
    const sourceById = new Map(sources.map((source) => [source.id, source]));
    const targets = listSourceCoverageTargets().filter((target) => target.catalogState !== "RETIRED");
    const registrations = new Map(
      evaluateSourceCoverage(sources, targets).map((registration) => [
        registration.targetId,
        registration,
      ]),
    );
    const operational = new SqliteOperationalSupplyHealthRepository(this.database).list({
      workspaceId,
    });
    const healthByTarget = new Map(operational.items.map((health) => [health.targetId, health]));
    const plans = loadPlans(this.database, workspaceId);
    const schedulerStates = loadSchedulerStates(this.database, workspaceId);
    const runs = loadRunFacts(this.database, workspaceId, reliabilityFrom);
    const latencies = loadLatencyFacts(this.database, workspaceId, latencyFrom);
    const changes = loadChangeFacts(this.database, workspaceId, changeFrom);

    const items: EvidenceSupplyHealthRecordV1[] = targets.map((target) => {
      const health = healthByTarget.get(target.id);
      const registration = registrations.get(target.id) ?? {
        targetId: target.id,
        state: "UNREGISTERED" as const,
        sourceIds: [],
      };
      const sourceIds = health?.sourceIds ?? registration.sourceIds;
      const sourceStatuses = sourceIds
        .map((sourceId) => sourceById.get(sourceId)?.status)
        .filter((status): status is string => Boolean(status));
      const supplyState = health?.state ?? "BLOCKED";
      const gaps = health?.gaps ?? ["SOURCE_UNREGISTERED"];
      const coverage = deriveCoverage({
        registration,
        sourceStatuses,
        supplyState,
        gaps,
        artifactCount: health?.acquisition.artifactCount ?? 0,
        observedArtifactKinds: health?.acquisition.artifactKinds ?? [],
        expectedArtifactKinds: target.acquisition.expectedArtifactKinds,
        knownLimitation: Boolean(target.notes?.trim()),
      });
      const schedule = scheduleFacts(sourceIds, plans, schedulerStates);
      const reliability = reliabilityFacts(sourceIds, runs);
      const freshnessState = health?.freshness.state ?? "UNOBSERVED";
      const state = deriveEvidenceSupplyHealthState({
        coverage: coverage.state,
        supplyState,
        freshness: freshnessState,
        schedulerErrorCount: schedule.schedulerErrorCount,
      });

      return {
        protocolVersion: EVIDENCE_SUPPLY_HEALTH_PROTOCOL_VERSION,
        objectType: "EVIDENCE_SUPPLY_HEALTH",
        workspaceId,
        targetId: target.id,
        sourceIds: [...sourceIds],
        state,
        reasonCodes: reasonCodes({
          coverage,
          supplyState,
          freshness: freshnessState,
          gaps,
          schedule,
          reliability,
        }),
        coverage,
        freshness: {
          state: freshnessState,
          lastSuccessfulAcquisitionAt: health?.acquisition.latestArtifactAt ?? null,
          ageHours: health?.freshness.ageHours ?? null,
          maxAgeHours: health?.freshness.maxAgeHours ?? null,
        },
        schedule,
        reliability,
        latency: latencyFacts(sourceIds, latencies),
        changeActivity: changeFacts(sourceIds, changes, sevenDayStart),
        observedAt,
      };
    });

    const byState = emptyByState();
    const coverage = { COMPLETE: 0, PARTIAL: 0, UNKNOWN: 0 };
    for (const item of items) {
      byState[item.state] += 1;
      coverage[item.coverage.state] += 1;
    }

    return {
      protocolVersion: EVIDENCE_SUPPLY_HEALTH_PROTOCOL_VERSION,
      objectType: "EVIDENCE_SUPPLY_HEALTH_RESULT",
      workspaceId,
      observedAt,
      items,
      summary: {
        total: items.length,
        byState,
        coverage,
        requiringAttention: items.filter((item) => item.state !== "HEALTHY").length,
        stale: byState.STALE,
        blocked: byState.BLOCKED,
        recentChanges30d: items.reduce((total, item) => total + item.changeActivity.updates30d, 0),
      },
    };
  }
}
