import type { DatabaseSync } from "node:sqlite";
import type { Extensions } from "@markorbit/contracts";
import type { CollectionPlanRepository } from "./collection-plan-registry";

export const ADAPTIVE_RECRAWL_POLICY_VERSION = "1.0" as const;
export const ADAPTIVE_RECRAWL_EVIDENCE_WINDOW_RUNS = 12;
export const ADAPTIVE_RECRAWL_MIN_EVIDENCE_RUNS = 6;
export const ADAPTIVE_RECRAWL_COOLDOWN_INTERVALS = 3;

export type AdaptiveRecrawlSourceClass = "OFFICIAL_AUTHORITY" | "PEER_PROFESSIONAL";
export type AdaptiveRecrawlDecision =
  "FASTER" | "SLOWER" | "STABLE" | "AT_BOUND" | "INSUFFICIENT_EVIDENCE" | "COOLDOWN";

export type AdaptiveRecrawlPolicy = {
  minimumIntervalSeconds: number;
  maximumIntervalSeconds: number;
  fasterAtOrBelowNoChangePercent: number;
  slowerAtOrAboveNoChangePercent: number;
};
export type AdaptiveRecrawlRecommendation = {
  decision: AdaptiveRecrawlDecision;
  currentIntervalSeconds: number;
  recommendedIntervalSeconds: number;
  evidenceRuns: number;
  metadataOnlyRuns: number;
  noChangeRatePercent: number;
  cooldownUntil: string | null;
};

export type AdaptiveRecrawlApplyResult = AdaptiveRecrawlRecommendation & {
  planId: string;
  sourceClass: AdaptiveRecrawlSourceClass | null;
  enabled: boolean;
  applied: boolean;
  evaluatedAt: string;
  skipReason?:
    | "JOB_NOT_FOUND"
    | "PLAN_NOT_FOUND"
    | "PLAN_INACTIVE"
    | "NOT_CHANGE_WATCH"
    | "DISABLED"
    | "UNSUPPORTED_SOURCE_CLASS";
};

const POLICIES: Record<AdaptiveRecrawlSourceClass, AdaptiveRecrawlPolicy> = {
  OFFICIAL_AUTHORITY: {
    minimumIntervalSeconds: 6 * 60 * 60,
    maximumIntervalSeconds: 7 * 24 * 60 * 60,
    fasterAtOrBelowNoChangePercent: 40,
    slowerAtOrAboveNoChangePercent: 90,
  },
  PEER_PROFESSIONAL: {
    minimumIntervalSeconds: 24 * 60 * 60,
    maximumIntervalSeconds: 30 * 24 * 60 * 60,
    fasterAtOrBelowNoChangePercent: 40,
    slowerAtOrAboveNoChangePercent: 90,
  },
};

function percentage(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 1_000) / 10;
}

function validDate(value: string | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function adaptiveRecrawlPolicy(
  sourceClass: AdaptiveRecrawlSourceClass,
): AdaptiveRecrawlPolicy {
  return POLICIES[sourceClass];
}

export function recommendAdaptiveRecrawlCadence(input: {
  sourceClass: AdaptiveRecrawlSourceClass;
  currentIntervalSeconds: number;
  evidenceRuns: number;
  metadataOnlyRuns: number;
  observedAt: Date;
  lastChangedAt?: string;
  lastPreviousIntervalSeconds?: number;
}): AdaptiveRecrawlRecommendation {
  const policy = POLICIES[input.sourceClass];
  const evidenceRuns = Math.max(0, Math.trunc(input.evidenceRuns));
  const metadataOnlyRuns = Math.min(evidenceRuns, Math.max(0, Math.trunc(input.metadataOnlyRuns)));
  const noChangeRatePercent = percentage(metadataOnlyRuns, evidenceRuns);
  const currentIntervalSeconds = Math.trunc(input.currentIntervalSeconds);
  const base = {
    currentIntervalSeconds,
    recommendedIntervalSeconds: currentIntervalSeconds,
    evidenceRuns,
    metadataOnlyRuns,
    noChangeRatePercent,
    cooldownUntil: null,
  };
  if (evidenceRuns < ADAPTIVE_RECRAWL_MIN_EVIDENCE_RUNS) {
    return { ...base, decision: "INSUFFICIENT_EVIDENCE" };
  }

  const lastChangedAt = validDate(input.lastChangedAt);
  if (lastChangedAt) {
    const previous = input.lastPreviousIntervalSeconds ?? currentIntervalSeconds;
    const anchorSeconds = Math.max(currentIntervalSeconds, previous);
    const cooldownUntil = new Date(
      lastChangedAt.getTime() + anchorSeconds * ADAPTIVE_RECRAWL_COOLDOWN_INTERVALS * 1_000,
    );
    if (input.observedAt.getTime() < cooldownUntil.getTime()) {
      return { ...base, decision: "COOLDOWN", cooldownUntil: cooldownUntil.toISOString() };
    }
  }

  const boundedIntervalSeconds = Math.min(
    policy.maximumIntervalSeconds,
    Math.max(policy.minimumIntervalSeconds, currentIntervalSeconds),
  );
  if (boundedIntervalSeconds !== currentIntervalSeconds) {
    return {
      ...base,
      decision: "AT_BOUND",
      recommendedIntervalSeconds: boundedIntervalSeconds,
    };
  }

  if (noChangeRatePercent <= policy.fasterAtOrBelowNoChangePercent) {
    const recommendedIntervalSeconds = Math.max(
      policy.minimumIntervalSeconds,
      Math.floor(currentIntervalSeconds / 2),
    );
    return {
      ...base,
      decision: recommendedIntervalSeconds === currentIntervalSeconds ? "AT_BOUND" : "FASTER",
      recommendedIntervalSeconds,
    };
  }
  if (noChangeRatePercent >= policy.slowerAtOrAboveNoChangePercent) {
    const recommendedIntervalSeconds = Math.min(
      policy.maximumIntervalSeconds,
      currentIntervalSeconds * 2,
    );
    return {
      ...base,
      decision: recommendedIntervalSeconds === currentIntervalSeconds ? "AT_BOUND" : "SLOWER",
      recommendedIntervalSeconds,
    };
  }
  return { ...base, decision: "STABLE" };
}
type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function sourceClassFromJobDocument(documentJson: string): AdaptiveRecrawlSourceClass | null {
  const job = record(JSON.parse(documentJson) as unknown);
  const source = record(job?.sourceSnapshot);
  const extensions = record(source?.extensions);
  const value = extensions?.["x-markorbit-source-class"];
  return value === "OFFICIAL_AUTHORITY" || value === "PEER_PROFESSIONAL" ? value : null;
}

function extensionString(
  extensions: Extensions | undefined,
  key: `x-${string}`,
): string | undefined {
  const value = extensions?.[key];
  return typeof value === "string" ? value : undefined;
}

function extensionNumber(
  extensions: Extensions | undefined,
  key: `x-${string}`,
): number | undefined {
  const value = extensions?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function evidenceForPlan(database: DatabaseSync, planId: string, observedAt: Date) {
  const rows = database
    .prepare(
      `SELECT CAST(json_extract(a.document_json, '$.receipt.metadataOnly') AS INTEGER) AS metadataOnly,
              a.completed_at AS completedAt
       FROM execution_attempts a
       JOIN jobs j ON j.id = a.job_id
       WHERE j.plan_id = ?
         AND a.status = 'COMPLETED'
         AND a.completed_at IS NOT NULL
         AND a.completed_at <= ?
         AND json_extract(j.document_json, '$.planSnapshot.schedule.mode') = 'CHANGE_WATCH'
         AND json_extract(a.document_json, '$.receipt.metadataOnly') IS NOT NULL
       ORDER BY a.completed_at DESC, a.id DESC
       LIMIT ?`,
    )
    .all(planId, observedAt.toISOString(), ADAPTIVE_RECRAWL_EVIDENCE_WINDOW_RUNS) as Array<{
    metadataOnly: number;
    completedAt: string;
  }>;
  return {
    evidenceRuns: rows.length,
    metadataOnlyRuns: rows.reduce((sum, row) => sum + (Number(row.metadataOnly) === 1 ? 1 : 0), 0),
  };
}

function skipped(input: {
  planId: string;
  sourceClass?: AdaptiveRecrawlSourceClass | null;
  currentIntervalSeconds?: number;
  enabled?: boolean;
  evaluatedAt: string;
  skipReason: AdaptiveRecrawlApplyResult["skipReason"];
}): AdaptiveRecrawlApplyResult {
  const currentIntervalSeconds = input.currentIntervalSeconds ?? 0;
  return {
    planId: input.planId,
    sourceClass: input.sourceClass ?? null,
    enabled: input.enabled ?? false,
    applied: false,
    evaluatedAt: input.evaluatedAt,
    decision: "STABLE",
    currentIntervalSeconds,
    recommendedIntervalSeconds: currentIntervalSeconds,
    evidenceRuns: 0,
    metadataOnlyRuns: 0,
    noChangeRatePercent: 0,
    cooldownUntil: null,
    skipReason: input.skipReason,
  };
}
export function applyAdaptiveRecrawlCadenceForCompletedJob(
  database: DatabaseSync,
  plans: CollectionPlanRepository,
  jobId: string,
  observedAt = new Date(),
): AdaptiveRecrawlApplyResult {
  const evaluatedAt = observedAt.toISOString();
  const row = database
    .prepare("SELECT plan_id AS planId, document_json AS documentJson FROM jobs WHERE id = ?")
    .get(jobId) as { planId: string; documentJson: string } | undefined;
  if (!row) return skipped({ planId: "", evaluatedAt, skipReason: "JOB_NOT_FOUND" });

  const planRecord = plans.getById(row.planId);
  if (!planRecord) {
    return skipped({ planId: row.planId, evaluatedAt, skipReason: "PLAN_NOT_FOUND" });
  }
  const plan = planRecord.plan;
  if (plan.status !== "ACTIVE") {
    return skipped({ planId: plan.id, evaluatedAt, skipReason: "PLAN_INACTIVE" });
  }
  if (plan.schedule.mode !== "CHANGE_WATCH") {
    return skipped({ planId: plan.id, evaluatedAt, skipReason: "NOT_CHANGE_WATCH" });
  }
  const enabled = plan.extensions?.["x-markorbit-adaptive-refresh-cadence"] === true;
  if (!enabled) {
    return skipped({
      planId: plan.id,
      currentIntervalSeconds: plan.schedule.pollIntervalSeconds,
      enabled: false,
      evaluatedAt,
      skipReason: "DISABLED",
    });
  }
  const sourceClass = sourceClassFromJobDocument(row.documentJson);
  if (!sourceClass) {
    return skipped({
      planId: plan.id,
      currentIntervalSeconds: plan.schedule.pollIntervalSeconds,
      enabled: true,
      evaluatedAt,
      skipReason: "UNSUPPORTED_SOURCE_CLASS",
    });
  }

  const evidence = evidenceForPlan(database, plan.id, observedAt);
  const recommendation = recommendAdaptiveRecrawlCadence({
    sourceClass,
    currentIntervalSeconds: plan.schedule.pollIntervalSeconds,
    evidenceRuns: evidence.evidenceRuns,
    metadataOnlyRuns: evidence.metadataOnlyRuns,
    observedAt,
    lastChangedAt: extensionString(plan.extensions, "x-markorbit-adaptive-cadence-last-changed-at"),
    lastPreviousIntervalSeconds: extensionNumber(
      plan.extensions,
      "x-markorbit-adaptive-cadence-previous-seconds",
    ),
  });

  const nextIntervalSeconds = recommendation.recommendedIntervalSeconds;
  const applied = nextIntervalSeconds !== plan.schedule.pollIntervalSeconds;
  const previousIntervalSeconds = applied
    ? plan.schedule.pollIntervalSeconds
    : (extensionNumber(plan.extensions, "x-markorbit-adaptive-cadence-previous-seconds") ??
      plan.schedule.pollIntervalSeconds);
  const extensions: Extensions = {
    ...(plan.extensions ?? {}),
    "x-markorbit-adaptive-cadence-policy-version": ADAPTIVE_RECRAWL_POLICY_VERSION,
    "x-markorbit-adaptive-cadence-last-evaluated-at": evaluatedAt,
    "x-markorbit-adaptive-cadence-last-decision": recommendation.decision,
    "x-markorbit-adaptive-cadence-evidence-runs": recommendation.evidenceRuns,
    "x-markorbit-adaptive-cadence-no-change-rate-percent": recommendation.noChangeRatePercent,
    "x-markorbit-adaptive-cadence-previous-seconds": previousIntervalSeconds,
    "x-markorbit-adaptive-cadence-current-seconds": nextIntervalSeconds,
  };
  if (applied) {
    extensions["x-markorbit-adaptive-cadence-last-changed-at"] = evaluatedAt;
  }
  plans.update(
    plan.id,
    {
      schedule: { mode: "CHANGE_WATCH", pollIntervalSeconds: nextIntervalSeconds },
      extensions,
    },
    plan.updatedAt,
  );

  return {
    ...recommendation,
    planId: plan.id,
    sourceClass,
    enabled: true,
    applied,
    evaluatedAt,
  };
}
