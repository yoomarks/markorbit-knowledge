import { DatabaseSync } from "node:sqlite";
import type {
  SourceCompatibilityObservation,
  SourceSupplyCompatibilityHealth,
  SourceSupplyCompatibilityState,
  SourceSupplyGap,
  SourceSupplyHealthRecord,
} from "@markorbit/contracts";
import { RegistryValidationError } from "./index";
import { SqliteSourceCompatibilityObservationRepository } from "./source-compatibility-observations";
import {
  SqliteSourceSupplyHealthRepository,
  summarizeSourceSupplyHealth,
  type SourceSupplyHealthFilters,
  type SourceSupplyHealthListResult,
  type SourceSupplyHealthRepository,
} from "./source-supply-health";

export const SOURCE_COMPATIBILITY_MAX_AGE_HOURS = 48;

function compatibilityHealth(
  observation: SourceCompatibilityObservation | undefined,
  observedAt: Date,
): SourceSupplyCompatibilityHealth {
  if (!observation) {
    return {
      state: "UNOBSERVED",
      freshness: "UNOBSERVED",
      observedAt: null,
      ageHours: null,
      maxAgeHours: SOURCE_COMPATIBILITY_MAX_AGE_HOURS,
      primaryUri: null,
      renderJavascript: null,
      errorCode: null,
      errorMessage: null,
      baselineTargetId: null,
      baselineState: null,
    };
  }
  const observationMs = Date.parse(observation.observedAt);
  if (!Number.isFinite(observationMs)) {
    throw new RegistryValidationError("Persisted source-compatibility observation timestamp is invalid");
  }
  const ageHours = Math.max(0, (observedAt.getTime() - observationMs) / 3_600_000);
  return {
    state: observation.state,
    freshness: ageHours <= SOURCE_COMPATIBILITY_MAX_AGE_HOURS ? "FRESH" : "STALE",
    observedAt: observation.observedAt,
    ageHours: Number(ageHours.toFixed(2)),
    maxAgeHours: SOURCE_COMPATIBILITY_MAX_AGE_HOURS,
    primaryUri: observation.primaryUri,
    renderJavascript: observation.renderJavascript,
    errorCode: observation.errorCode ?? null,
    errorMessage: observation.errorMessage ?? null,
    baselineTargetId: observation.baselineTargetId ?? null,
    baselineState: observation.baselineState ?? null,
  };
}

function compatibilityGap(state: SourceSupplyCompatibilityState): SourceSupplyGap | null {
  if (state === "DEGRADED") return "PRIMARY_PATH_DEGRADED";
  if (state === "BLOCKED") return "EXTERNAL_COMPATIBILITY_BLOCKED";
  return null;
}

export function applySourceCompatibilityHealth(
  item: SourceSupplyHealthRecord,
  compatibility: SourceSupplyCompatibilityHealth,
): SourceSupplyHealthRecord {
  const actionable = compatibility.freshness === "FRESH";
  const gap = actionable ? compatibilityGap(compatibility.state) : null;
  const gaps = gap && !item.gaps.includes(gap) ? [...item.gaps, gap] : [...item.gaps];
  const state =
    actionable && compatibility.state === "BLOCKED"
      ? "BLOCKED"
      : actionable && compatibility.state === "DEGRADED" && item.state === "READY"
        ? "DEGRADED"
        : item.state;
  return { ...item, compatibility, gaps, state };
}

export class SqliteCompatibilityAwareSupplyHealthRepository implements SourceSupplyHealthRepository {
  private readonly base: SqliteSourceSupplyHealthRepository;
  private readonly compatibility: SqliteSourceCompatibilityObservationRepository;

  constructor(
    database: DatabaseSync,
    private readonly clock: () => Date = () => new Date(),
  ) {
    this.base = new SqliteSourceSupplyHealthRepository(database, clock);
    this.compatibility = new SqliteSourceCompatibilityObservationRepository(database);
  }

  list(filters: SourceSupplyHealthFilters): SourceSupplyHealthListResult {
    const base = this.base.list({ ...filters, state: undefined });
    const observedAt = this.clock();
    const latest = this.compatibility.latest(base.items.map((item) => item.targetId));
    const items = base.items
      .map((item) =>
        applySourceCompatibilityHealth(
          item,
          compatibilityHealth(latest.get(item.targetId), observedAt),
        ),
      )
      .filter((item) => !filters.state || item.state === filters.state);
    const summary = summarizeSourceSupplyHealth(items);
    const byCompatibility: Record<SourceSupplyCompatibilityState, number> = {
      PASS: 0,
      DEGRADED: 0,
      BLOCKED: 0,
      UNOBSERVED: 0,
    };
    const byCompatibilityFreshness = {
      FRESH: 0,
      STALE: 0,
      UNOBSERVED: 0,
    };
    for (const item of items) {
      byCompatibility[item.compatibility?.state ?? "UNOBSERVED"] += 1;
      byCompatibilityFreshness[item.compatibility?.freshness ?? "UNOBSERVED"] += 1;
    }
    return {
      ...base,
      items,
      summary: { ...summary, byCompatibility, byCompatibilityFreshness },
    };
  }
}
