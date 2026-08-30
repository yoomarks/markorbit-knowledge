import {
  projectCollectionLifecyclePolicy,
  type CollectionLifecycleHealthDirective,
  type CollectionLifecyclePolicyClass,
  type CollectionLifecycleReasonCode,
} from "@markorbit/contracts";
import { DEFAULT_WORKSPACE } from "@markorbit/persistence";
import {
  evaluateSourceCoverage,
  listSourceCoverageTargets,
} from "@markorbit/persistence/source-coverage";
import { SqliteCompatibilityAwareSupplyHealthRepository } from "@markorbit/persistence/source-compatibility-supply-health";
import { listAllWorkspaceSources } from "./source-pagination";
import {
  getRegistryDatabase,
  getSourceDiscoveryRepository,
  getSourceRepository,
} from "./source-registry";

export type SourceCoverageSupplyView = {
  state: "READY" | "DEGRADED" | "BLOCKED";
  freshness: "FRESH" | "STALE" | "UNOBSERVED";
  compatibility: "PASS" | "DEGRADED" | "BLOCKED" | "UNOBSERVED";
  compatibilityFreshness: "FRESH" | "STALE" | "UNOBSERVED";
  compatibilityObservedAt: string | null;
  compatibilityAgeHours: number | null;
  compatibilityErrorCode: string | null;
  gaps: string[];
  acquisitionObserved: boolean;
  normalizedAvailable: boolean;
  retrievalAvailable: boolean;
};

export type SourceCoverageLifecycleView = {
  policyClass: CollectionLifecyclePolicyClass;
  healthDirective: CollectionLifecycleHealthDirective;
  observedHealthState: "READY" | "DEGRADED" | "BLOCKED" | "UNOBSERVED";
  reasonCodes: CollectionLifecycleReasonCode[];
};

export type SourceCoverageTargetView = {
  id: string;
  displayName: string;
  family: string;
  coverageTier: string;
  catalogState: string;
  canonicalUri: string;
  state: "REGISTERED" | "UNREGISTERED";
  sources: Array<{ id: string; name: string; status: string }>;
  supply: SourceCoverageSupplyView;
  lifecycle: SourceCoverageLifecycleView;
  discoveryCandidate?: { candidateId: string; status: string };
};

export type SourceCoverageItemView = {
  jurisdiction: string;
  sourceCount: number;
  activeSourceCount: number;
  targetCount: number;
  registeredTargetCount: number;
  activatedTargetCount: number;
  completenessPercent: number | null;
  foundational: {
    total: number;
    registered: number;
    completenessPercent: number | null;
  };
  supply: {
    healthy: number;
    degraded: number;
    blocked: number;
    stale: number;
    compatibilityObserved: number;
    compatibilityFresh: number;
    compatibilityStale: number;
    compatibilityDegraded: number;
    compatibilityBlocked: number;
    healthyPercent: number | null;
  };
  missingFamilies: string[];
  missingCount: number;
  targets: SourceCoverageTargetView[];
};

export type SourceCoverageSnapshot = {
  workspaceId: string;
  items: SourceCoverageItemView[];
  summary: {
    jurisdictionCount: number;
    curatedJurisdictionCount: number;
    fullyCoveredCount: number;
    attentionCount: number;
    fullyHealthyCount: number;
    supplyAttentionCount: number;
    compatibilityAttentionCount: number;
    compatibilityStaleJurisdictionCount: number;
  };
};

function percentage(registered: number, total: number): number | null {
  if (total === 0) return null;
  return Math.round((registered / total) * 100);
}

export function getSourceCoverageSnapshot(
  workspaceId = DEFAULT_WORKSPACE.id,
): SourceCoverageSnapshot {
  const repository = getSourceRepository();
  const discovery = getSourceDiscoveryRepository();
  const sources = listAllWorkspaceSources(repository, workspaceId);
  const targets = listSourceCoverageTargets().filter((target) => target.catalogState !== "RETIRED");
  const supplyHealth = new SqliteCompatibilityAwareSupplyHealthRepository(
    getRegistryDatabase(),
  ).list({
    workspaceId,
  });
  const supplyByTargetId = new Map(supplyHealth.items.map((item) => [item.targetId, item]));
  const jurisdictions = [
    ...new Set([
      ...targets.map((target) => target.jurisdiction),
      ...sources.flatMap((source) => source.jurisdictions),
    ]),
  ].sort();

  const items = jurisdictions.map((jurisdiction) => {
    const jurisdictionTargets = targets.filter((target) => target.jurisdiction === jurisdiction);
    const registrations = evaluateSourceCoverage(sources, jurisdictionTargets);
    const sourceById = new Map(sources.map((source) => [source.id, source]));
    const targetById = new Map(jurisdictionTargets.map((target) => [target.id, target]));
    const targetItems = registrations.map((registration) => {
      const target = targetById.get(registration.targetId)!;
      const health = supplyByTargetId.get(target.id);
      const lifecycle = projectCollectionLifecyclePolicy(target, health);
      const discoveryCandidate =
        registration.state === "UNREGISTERED"
          ? discovery.getCandidateByLocator(target.canonicalUri)
          : null;
      return {
        id: target.id,
        displayName: target.displayName,
        family: target.family,
        coverageTier: target.coverageTier,
        catalogState: target.catalogState,
        canonicalUri: target.canonicalUri,
        state: registration.state,
        sources: registration.sourceIds
          .map((sourceId) => sourceById.get(sourceId))
          .filter(Boolean)
          .map((source) => ({ id: source!.id, name: source!.name, status: source!.status })),
        supply: {
          state: health?.state ?? "BLOCKED",
          freshness: health?.freshness.state ?? "UNOBSERVED",
          compatibility: health?.compatibility?.state ?? "UNOBSERVED",
          compatibilityFreshness: health?.compatibility?.freshness ?? "UNOBSERVED",
          compatibilityObservedAt: health?.compatibility?.observedAt ?? null,
          compatibilityAgeHours: health?.compatibility?.ageHours ?? null,
          compatibilityErrorCode: health?.compatibility?.errorCode ?? null,
          gaps: [...(health?.gaps ?? ["SOURCE_UNREGISTERED"])],
          acquisitionObserved: (health?.acquisition.artifactCount ?? 0) > 0,
          normalizedAvailable: (health?.normalization.readyDocumentCount ?? 0) > 0,
          retrievalAvailable: (health?.retrieval.currentDocumentCount ?? 0) > 0,
        },
        lifecycle: {
          policyClass: lifecycle.policyClass,
          healthDirective: lifecycle.healthDirective,
          observedHealthState: lifecycle.observedHealthState,
          reasonCodes: [...lifecycle.reasonCodes],
        },
        ...(discoveryCandidate
          ? {
              discoveryCandidate: {
                candidateId: discoveryCandidate.candidate.candidateId,
                status: discoveryCandidate.candidate.status,
              },
            }
          : {}),
      } satisfies SourceCoverageTargetView;
    });
    const activeTargets = targetItems.filter((target) => target.catalogState === "ACTIVE");
    const registered = activeTargets.filter((target) => target.state === "REGISTERED").length;
    const activated = activeTargets.filter((target) =>
      target.sources.some((source) => source.status === "ACTIVE"),
    ).length;
    const foundational = activeTargets.filter((target) => target.coverageTier === "FOUNDATIONAL");
    const foundationalRegistered = foundational.filter(
      (target) => target.state === "REGISTERED",
    ).length;
    const jurisdictionSources = sources.filter((source) =>
      source.jurisdictions.includes(jurisdiction),
    );
    const missing = activeTargets.filter((target) => target.state === "UNREGISTERED");
    const healthy = activeTargets.filter(
      (target) =>
        target.supply.state === "READY" &&
        target.sources.some((source) => source.status === "ACTIVE"),
    ).length;
    const degraded = activeTargets.filter((target) => target.supply.state === "DEGRADED").length;
    const blocked = activeTargets.filter((target) => target.supply.state === "BLOCKED").length;
    const stale = activeTargets.filter((target) => target.supply.freshness === "STALE").length;
    const compatibilityObserved = activeTargets.filter(
      (target) => target.supply.compatibility !== "UNOBSERVED",
    ).length;
    const compatibilityFresh = activeTargets.filter(
      (target) => target.supply.compatibilityFreshness === "FRESH",
    ).length;
    const compatibilityStale = activeTargets.filter(
      (target) => target.supply.compatibilityFreshness === "STALE",
    ).length;
    const compatibilityDegraded = activeTargets.filter(
      (target) =>
        target.supply.compatibilityFreshness === "FRESH" &&
        target.supply.compatibility === "DEGRADED",
    ).length;
    const compatibilityBlocked = activeTargets.filter(
      (target) =>
        target.supply.compatibilityFreshness === "FRESH" &&
        target.supply.compatibility === "BLOCKED",
    ).length;

    return {
      jurisdiction,
      sourceCount: jurisdictionSources.length,
      activeSourceCount: jurisdictionSources.filter((source) => source.status === "ACTIVE").length,
      targetCount: activeTargets.length,
      registeredTargetCount: registered,
      activatedTargetCount: activated,
      completenessPercent: percentage(registered, activeTargets.length),
      foundational: {
        total: foundational.length,
        registered: foundationalRegistered,
        completenessPercent: percentage(foundationalRegistered, foundational.length),
      },
      supply: {
        healthy,
        degraded,
        blocked,
        stale,
        compatibilityObserved,
        compatibilityFresh,
        compatibilityStale,
        compatibilityDegraded,
        compatibilityBlocked,
        healthyPercent: percentage(healthy, activeTargets.length),
      },
      missingFamilies: [...new Set(missing.map((target) => target.family))].sort(),
      missingCount: missing.length,
      targets: targetItems,
    } satisfies SourceCoverageItemView;
  });

  return {
    workspaceId,
    items,
    summary: {
      jurisdictionCount: items.length,
      curatedJurisdictionCount: items.filter((item) => item.targetCount > 0).length,
      fullyCoveredCount: items.filter(
        (item) => item.targetCount > 0 && item.registeredTargetCount === item.targetCount,
      ).length,
      attentionCount: items.filter(
        (item) => item.targetCount > 0 && item.registeredTargetCount < item.targetCount,
      ).length,
      fullyHealthyCount: items.filter(
        (item) => item.targetCount > 0 && item.supply.healthy === item.targetCount,
      ).length,
      supplyAttentionCount: items.filter(
        (item) => item.targetCount > 0 && item.supply.healthy < item.targetCount,
      ).length,
      compatibilityAttentionCount: items.filter(
        (item) => item.supply.compatibilityDegraded + item.supply.compatibilityBlocked > 0,
      ).length,
      compatibilityStaleJurisdictionCount: items.filter(
        (item) => item.supply.compatibilityStale > 0,
      ).length,
    },
  };
}
