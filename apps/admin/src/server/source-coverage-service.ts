import { DEFAULT_WORKSPACE } from "@markorbit/persistence";
import {
  evaluateSourceCoverage,
  listSourceCoverageTargets,
} from "@markorbit/persistence/source-coverage";
import { getSourceRepository } from "./source-registry";

export type SourceCoverageTargetView = {
  id: string;
  displayName: string;
  family: string;
  coverageTier: string;
  catalogState: string;
  canonicalUri: string;
  state: "REGISTERED" | "UNREGISTERED";
  sources: Array<{ id: string; name: string; status: string }>;
};

export type SourceCoverageItemView = {
  jurisdiction: string;
  sourceCount: number;
  activeSourceCount: number;
  targetCount: number;
  registeredTargetCount: number;
  completenessPercent: number | null;
  foundational: {
    total: number;
    registered: number;
    completenessPercent: number | null;
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
  };
};

function percentage(registered: number, total: number): number | null {
  if (total === 0) return null;
  return Math.round((registered / total) * 100);
}

export function getSourceCoverageSnapshot(workspaceId = DEFAULT_WORKSPACE.id): SourceCoverageSnapshot {
  const repository = getSourceRepository();
  const sources = repository.list({ workspaceId, limit: 100 }).items;
  const targets = listSourceCoverageTargets().filter((target) => target.catalogState !== "RETIRED");
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
      } satisfies SourceCoverageTargetView;
    });
    const activeTargets = targetItems.filter((target) => target.catalogState === "ACTIVE");
    const registered = activeTargets.filter((target) => target.state === "REGISTERED").length;
    const foundational = activeTargets.filter((target) => target.coverageTier === "FOUNDATIONAL");
    const foundationalRegistered = foundational.filter(
      (target) => target.state === "REGISTERED",
    ).length;
    const jurisdictionSources = sources.filter((source) =>
      source.jurisdictions.includes(jurisdiction),
    );
    const missing = activeTargets.filter((target) => target.state === "UNREGISTERED");

    return {
      jurisdiction,
      sourceCount: jurisdictionSources.length,
      activeSourceCount: jurisdictionSources.filter((source) => source.status === "ACTIVE").length,
      targetCount: activeTargets.length,
      registeredTargetCount: registered,
      completenessPercent: percentage(registered, activeTargets.length),
      foundational: {
        total: foundational.length,
        registered: foundationalRegistered,
        completenessPercent: percentage(foundationalRegistered, foundational.length),
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
    },
  };
}
