import { DatabaseSync } from "node:sqlite";
import type {
  SourceCompatibilityObservation,
  SourceSupplyCompatibilityHealth,
  SourceSupplyCompatibilityState,
  SourceSupplyGap,
  SourceSupplyHealthRecord,
} from "@markorbit/contracts";
import { SqliteSourceCompatibilityObservationRepository } from "./source-compatibility-observations";
import {
  SqliteSourceSupplyHealthRepository,
  summarizeSourceSupplyHealth,
  type SourceSupplyHealthFilters,
  type SourceSupplyHealthListResult,
  type SourceSupplyHealthRepository,
} from "./source-supply-health";

function compatibilityHealth(
  observation: SourceCompatibilityObservation | undefined,
): SourceSupplyCompatibilityHealth {
  if (!observation) {
    return {
      state: "UNOBSERVED",
      observedAt: null,
      primaryUri: null,
      renderJavascript: null,
      errorCode: null,
      errorMessage: null,
      baselineTargetId: null,
      baselineState: null,
    };
  }
  return {
    state: observation.state,
    observedAt: observation.observedAt,
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
  const gap = compatibilityGap(compatibility.state);
  const gaps = gap && !item.gaps.includes(gap) ? [...item.gaps, gap] : [...item.gaps];
  const state =
    compatibility.state === "BLOCKED"
      ? "BLOCKED"
      : compatibility.state === "DEGRADED" && item.state === "READY"
        ? "DEGRADED"
        : item.state;
  return { ...item, compatibility, gaps, state };
}

export class SqliteCompatibilityAwareSupplyHealthRepository implements SourceSupplyHealthRepository {
  private readonly base: SqliteSourceSupplyHealthRepository;
  private readonly compatibility: SqliteSourceCompatibilityObservationRepository;

  constructor(database: DatabaseSync, clock: () => Date = () => new Date()) {
    this.base = new SqliteSourceSupplyHealthRepository(database, clock);
    this.compatibility = new SqliteSourceCompatibilityObservationRepository(database);
  }

  list(filters: SourceSupplyHealthFilters): SourceSupplyHealthListResult {
    const base = this.base.list({ ...filters, state: undefined });
    const latest = this.compatibility.latest(base.items.map((item) => item.targetId));
    const items = base.items
      .map((item) =>
        applySourceCompatibilityHealth(item, compatibilityHealth(latest.get(item.targetId))),
      )
      .filter((item) => !filters.state || item.state === filters.state);
    const summary = summarizeSourceSupplyHealth(items);
    const byCompatibility: Record<SourceSupplyCompatibilityState, number> = {
      PASS: 0,
      DEGRADED: 0,
      BLOCKED: 0,
      UNOBSERVED: 0,
    };
    for (const item of items) {
      byCompatibility[item.compatibility?.state ?? "UNOBSERVED"] += 1;
    }
    return {
      ...base,
      items,
      summary: { ...summary, byCompatibility },
    };
  }
}
