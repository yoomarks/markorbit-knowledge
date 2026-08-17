import { DEFAULT_WORKSPACE } from "@markorbit/persistence";
import { queueSourceCoverageGapsForDiscovery } from "@markorbit/persistence/source-coverage-discovery-intake";
import {
  getRepresentativeSourceActivationWave,
  REPRESENTATIVE_SOURCE_ACTIVATION_WAVE_VERSION,
} from "@markorbit/persistence/representative-source-activation";
import { getSourceCoverageSnapshot } from "./source-coverage-service";
import { getSourceDiscoveryRepository, getSourceRepository } from "./source-registry";

export type RepresentativeActivationJurisdictionView = {
  jurisdiction: string;
  displayName: string;
  profile: string;
  purpose: string;
  targetCount: number;
  registered: number;
  activated: number;
  healthy: number;
  missing: number;
  queuedForReview: number;
};

export type RepresentativeActivationPreview = {
  version: typeof REPRESENTATIVE_SOURCE_ACTIVATION_WAVE_VERSION;
  workspaceId: string;
  targetCount: number;
  registeredTargetCount: number;
  activatedTargetCount: number;
  healthyTargetCount: number;
  missingTargetCount: number;
  queuedForReviewCount: number;
  queueableTargetCount: number;
  jurisdictions: RepresentativeActivationJurisdictionView[];
  missingTargetIds: string[];
};

export type RepresentativeActivationQueueResult = {
  preview: RepresentativeActivationPreview;
  intake: {
    total: number;
    queued: number;
    alreadyInDiscovery: number;
    alreadyCovered: number;
  };
};

export function getRepresentativeActivationPreview(
  workspaceId = DEFAULT_WORKSPACE.id,
): RepresentativeActivationPreview {
  const wave = getRepresentativeSourceActivationWave();
  const coverage = getSourceCoverageSnapshot(workspaceId);
  const coverageByJurisdiction = new Map(
    coverage.items.map((item) => [item.jurisdiction, item]),
  );
  const waveTargetIds = new Set(wave.targetIds);
  const missingTargetIds: string[] = [];
  let registeredTargetCount = 0;
  let activatedTargetCount = 0;
  let healthyTargetCount = 0;
  let queuedForReviewCount = 0;

  const jurisdictions = wave.jurisdictions.map((waveJurisdiction) => {
    const coverageItem = coverageByJurisdiction.get(waveJurisdiction.jurisdiction);
    const targets = (coverageItem?.targets ?? []).filter((target) => waveTargetIds.has(target.id));
    const registered = targets.filter((target) => target.state === "REGISTERED").length;
    const activated = targets.filter((target) =>
      target.sources.some((source) => source.status === "ACTIVE"),
    ).length;
    const healthy = targets.filter(
      (target) =>
        target.supply.state === "READY" &&
        target.sources.some((source) => source.status === "ACTIVE"),
    ).length;
    const missingTargets = targets.filter((target) => target.state === "UNREGISTERED");
    const queuedForReview = missingTargets.filter((target) => target.discoveryCandidate).length;
    missingTargetIds.push(...missingTargets.map((target) => target.id));
    registeredTargetCount += registered;
    activatedTargetCount += activated;
    healthyTargetCount += healthy;
    queuedForReviewCount += queuedForReview;

    return {
      jurisdiction: waveJurisdiction.jurisdiction,
      displayName: waveJurisdiction.displayName,
      profile: waveJurisdiction.profile,
      purpose: waveJurisdiction.purpose,
      targetCount: targets.length,
      registered,
      activated,
      healthy,
      missing: missingTargets.length,
      queuedForReview,
    } satisfies RepresentativeActivationJurisdictionView;
  });

  return {
    version: REPRESENTATIVE_SOURCE_ACTIVATION_WAVE_VERSION,
    workspaceId,
    targetCount: wave.targetIds.length,
    registeredTargetCount,
    activatedTargetCount,
    healthyTargetCount,
    missingTargetCount: missingTargetIds.length,
    queuedForReviewCount,
    queueableTargetCount: Math.max(0, missingTargetIds.length - queuedForReviewCount),
    jurisdictions,
    missingTargetIds,
  };
}

export function queueRepresentativeActivationWave(
  workspaceId = DEFAULT_WORKSPACE.id,
): RepresentativeActivationQueueResult {
  const before = getRepresentativeActivationPreview(workspaceId);
  if (before.missingTargetIds.length === 0) {
    return {
      preview: before,
      intake: { total: 0, queued: 0, alreadyInDiscovery: 0, alreadyCovered: 0 },
    };
  }

  const result = queueSourceCoverageGapsForDiscovery(
    { workspaceId, targetIds: before.missingTargetIds },
    {
      sources: getSourceRepository(),
      discovery: getSourceDiscoveryRepository(),
    },
  );
  return {
    preview: getRepresentativeActivationPreview(workspaceId),
    intake: {
      total: result.summary.total,
      queued: result.summary.QUEUED,
      alreadyInDiscovery: result.summary.ALREADY_IN_DISCOVERY,
      alreadyCovered: result.summary.ALREADY_COVERED,
    },
  };
}
