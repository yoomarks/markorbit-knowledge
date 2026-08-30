import type { SourceCoverageTarget } from "./source-coverage-v1";
import type { SourceSupplyHealthRecord } from "./source-supply-health-v1";

export const COLLECTION_LIFECYCLE_POLICY_PROTOCOL_VERSION = "1.0" as const;

export const COLLECTION_LIFECYCLE_POLICY_CLASSES = [
  "CHANGE_WATCH",
  "FREQUENT_REFRESH",
  "STANDARD_REFRESH",
  "MANUAL_ON_DEMAND",
  "RETIRED",
] as const;
export type CollectionLifecyclePolicyClass = (typeof COLLECTION_LIFECYCLE_POLICY_CLASSES)[number];

export const COLLECTION_LIFECYCLE_HEALTH_DIRECTIVES = [
  "ELIGIBLE_FOR_PLAN_PROPOSAL",
  "REPAIR_BEFORE_EXPANSION",
  "HOLD_AND_REPAIR",
  "REQUIRE_HEALTH_OBSERVATION",
  "OBSERVE_ONLY",
  "DISABLED",
] as const;
export type CollectionLifecycleHealthDirective =
  (typeof COLLECTION_LIFECYCLE_HEALTH_DIRECTIVES)[number];

export const COLLECTION_LIFECYCLE_REASON_CODES = [
  "CATALOG_RETIRED",
  "CATALOG_WATCH_ONLY",
  "CHANGE_SIGNAL_TIER",
  "HIGH_CHANGE_SENSITIVITY",
  "ACTIVE_STANDARD_COVERAGE",
  "SUPPLY_READY",
  "SUPPLY_DEGRADED",
  "SUPPLY_BLOCKED",
  "SUPPLY_UNOBSERVED",
] as const;
export type CollectionLifecycleReasonCode = (typeof COLLECTION_LIFECYCLE_REASON_CODES)[number];

export type CollectionLifecyclePolicyProjection = {
  protocolVersion: typeof COLLECTION_LIFECYCLE_POLICY_PROTOCOL_VERSION;
  objectType: "COLLECTION_LIFECYCLE_POLICY_PROJECTION";
  targetId: string;
  jurisdiction: string;
  family: SourceCoverageTarget["family"];
  policyClass: CollectionLifecyclePolicyClass;
  healthDirective: CollectionLifecycleHealthDirective;
  reasonCodes: CollectionLifecycleReasonCode[];
  observedHealthState: SourceSupplyHealthRecord["state"] | "UNOBSERVED";
  boundaries: {
    derivedOnlyFromExplicitCoverageMetadataAndSupplyHealth: true;
    sourceIntelligenceScoreUsed: false;
    semanticRelevanceInferred: false;
    authorityInferred: false;
    collectionPlanCreated: false;
    schedulerMutationApplied: false;
    automaticCollectionApplied: false;
    grantsCollectionAuthority: false;
  };
};

function resolvePolicyClass(target: SourceCoverageTarget): {
  policyClass: CollectionLifecyclePolicyClass;
  reasonCode: CollectionLifecycleReasonCode;
} {
  if (target.catalogState === "RETIRED") {
    return { policyClass: "RETIRED", reasonCode: "CATALOG_RETIRED" };
  }
  if (target.catalogState === "WATCH") {
    return { policyClass: "MANUAL_ON_DEMAND", reasonCode: "CATALOG_WATCH_ONLY" };
  }
  if (target.coverageTier === "CHANGE_SIGNAL") {
    return { policyClass: "CHANGE_WATCH", reasonCode: "CHANGE_SIGNAL_TIER" };
  }
  if (target.changeSensitivity === "HIGH") {
    return { policyClass: "FREQUENT_REFRESH", reasonCode: "HIGH_CHANGE_SENSITIVITY" };
  }
  return { policyClass: "STANDARD_REFRESH", reasonCode: "ACTIVE_STANDARD_COVERAGE" };
}

function resolveSupplyReasonCode(
  health: SourceSupplyHealthRecord | undefined,
): CollectionLifecycleReasonCode {
  if (!health) return "SUPPLY_UNOBSERVED";
  if (health.state === "READY") return "SUPPLY_READY";
  if (health.state === "DEGRADED") return "SUPPLY_DEGRADED";
  return "SUPPLY_BLOCKED";
}

function resolveHealthDirective(
  policyClass: CollectionLifecyclePolicyClass,
  health: SourceSupplyHealthRecord | undefined,
): {
  directive: CollectionLifecycleHealthDirective;
  reasonCode: CollectionLifecycleReasonCode | null;
  observedHealthState: SourceSupplyHealthRecord["state"] | "UNOBSERVED";
} {
  if (policyClass === "RETIRED") {
    return {
      directive: "DISABLED",
      reasonCode: null,
      observedHealthState: health?.state ?? "UNOBSERVED",
    };
  }
  if (policyClass === "MANUAL_ON_DEMAND") {
    return {
      directive: "OBSERVE_ONLY",
      reasonCode: resolveSupplyReasonCode(health),
      observedHealthState: health?.state ?? "UNOBSERVED",
    };
  }
  if (!health) {
    return {
      directive: "REQUIRE_HEALTH_OBSERVATION",
      reasonCode: "SUPPLY_UNOBSERVED",
      observedHealthState: "UNOBSERVED",
    };
  }
  if (health.state === "BLOCKED") {
    return {
      directive: "HOLD_AND_REPAIR",
      reasonCode: "SUPPLY_BLOCKED",
      observedHealthState: health.state,
    };
  }
  if (health.state === "DEGRADED") {
    return {
      directive: "REPAIR_BEFORE_EXPANSION",
      reasonCode: "SUPPLY_DEGRADED",
      observedHealthState: health.state,
    };
  }
  return {
    directive: "ELIGIBLE_FOR_PLAN_PROPOSAL",
    reasonCode: "SUPPLY_READY",
    observedHealthState: health.state,
  };
}

export function projectCollectionLifecyclePolicy(
  target: SourceCoverageTarget,
  health?: SourceSupplyHealthRecord,
): CollectionLifecyclePolicyProjection {
  if (health) {
    if (health.targetId !== target.id) {
      throw new Error(`source supply health target mismatch: ${health.targetId} !== ${target.id}`);
    }
    if (health.jurisdiction !== target.jurisdiction || health.family !== target.family) {
      throw new Error("source supply health coverage identity mismatch");
    }
  }

  const policy = resolvePolicyClass(target);
  const healthResolution = resolveHealthDirective(policy.policyClass, health);
  const reasonCodes = [policy.reasonCode];
  if (healthResolution.reasonCode) reasonCodes.push(healthResolution.reasonCode);

  return {
    protocolVersion: COLLECTION_LIFECYCLE_POLICY_PROTOCOL_VERSION,
    objectType: "COLLECTION_LIFECYCLE_POLICY_PROJECTION",
    targetId: target.id,
    jurisdiction: target.jurisdiction,
    family: target.family,
    policyClass: policy.policyClass,
    healthDirective: healthResolution.directive,
    reasonCodes,
    observedHealthState: healthResolution.observedHealthState,
    boundaries: {
      derivedOnlyFromExplicitCoverageMetadataAndSupplyHealth: true,
      sourceIntelligenceScoreUsed: false,
      semanticRelevanceInferred: false,
      authorityInferred: false,
      collectionPlanCreated: false,
      schedulerMutationApplied: false,
      automaticCollectionApplied: false,
      grantsCollectionAuthority: false,
    },
  };
}
