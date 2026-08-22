import {
  ACQUISITION_INTELLIGENCE_PROTOCOL_VERSION,
  type AcquisitionRunEvidence,
  type DiscoverySurface,
  type RenderRequirement,
  type SourceArchitecture,
  type SourceFingerprint,
  type SourceLocaleStructure,
} from "@markorbit/contracts";

export type AcquisitionLearningProfile = {
  profileId: string;
  playbookId: string;
  playbookRevision: number;
  fingerprint: {
    architecture: SourceArchitecture;
    discoverySurfaces: DiscoverySurface[];
    renderRequirement: RenderRequirement;
    localeStructure: SourceLocaleStructure;
    supportsHttpValidators: boolean;
    attachmentKinds: string[];
    confidence: number;
  };
};

export type AcquisitionLearningObservation = {
  runId: string;
  sourceId: string;
  startedAt: string;
  finishedAt: string;
  counts: AcquisitionRunEvidence["counts"];
  knownCorpus: number | null;
  previousCoverageRatio?: number | null;
  httpStatusCounts?: Record<string, number>;
  failureSignatures?: AcquisitionRunEvidence["failureSignatures"];
  surfaceOutcomes?: AcquisitionRunEvidence["surfaceOutcomes"];
  rendering?: AcquisitionRunEvidence["rendering"];
  changeDetection?: AcquisitionRunEvidence["changeDetection"];
  bytes: number;
  evidenceRefs: string[];
};

function inferredOutcome(
  observation: AcquisitionLearningObservation,
): AcquisitionRunEvidence["outcome"] {
  const { accepted } = observation.counts;
  if (accepted <= 0) return "FAILED";
  if ((observation.failureSignatures?.length ?? 0) > 0) return "DEGRADED";
  if (observation.knownCorpus === null) return "SUCCESS";
  return accepted === observation.knownCorpus ? "SUCCESS" : "DEGRADED";
}

function defaultSurfaceOutcomes(
  profile: AcquisitionLearningProfile,
  observation: AcquisitionLearningObservation,
): AcquisitionRunEvidence["surfaceOutcomes"] {
  if (profile.fingerprint.discoverySurfaces.length === 0) return [];
  return profile.fingerprint.discoverySurfaces.map((surface) => ({
    surface,
    discovered: observation.counts.discovered,
    accepted: observation.counts.accepted,
    knownCorpus: observation.knownCorpus,
  }));
}

export function buildSourceFingerprintFromAcquisitionProfile(input: {
  profile: AcquisitionLearningProfile;
  sourceId: string;
  observedAt: string;
  evidenceRefs: string[];
}): SourceFingerprint {
  return {
    protocolVersion: ACQUISITION_INTELLIGENCE_PROTOCOL_VERSION,
    objectType: "SOURCE_FINGERPRINT",
    sourceId: input.sourceId,
    observedAt: input.observedAt,
    architecture: input.profile.fingerprint.architecture,
    discoverySurfaces: [...input.profile.fingerprint.discoverySurfaces],
    renderRequirement: input.profile.fingerprint.renderRequirement,
    localeStructure: input.profile.fingerprint.localeStructure,
    supportsHttpValidators: input.profile.fingerprint.supportsHttpValidators,
    attachmentKinds: [...input.profile.fingerprint.attachmentKinds],
    confidence: input.profile.fingerprint.confidence,
    evidenceRefs: [...new Set(input.evidenceRefs)].sort(),
  };
}

export function buildAcquisitionRunEvidenceFromProfile(input: {
  profile: AcquisitionLearningProfile;
  observation: AcquisitionLearningObservation;
}): AcquisitionRunEvidence {
  const { profile, observation } = input;
  const ratio =
    observation.knownCorpus === null || observation.knownCorpus <= 0
      ? null
      : observation.counts.accepted / observation.knownCorpus;
  const durationMs = Math.max(
    0,
    Date.parse(observation.finishedAt) - Date.parse(observation.startedAt),
  );

  return {
    protocolVersion: ACQUISITION_INTELLIGENCE_PROTOCOL_VERSION,
    objectType: "ACQUISITION_RUN_EVIDENCE",
    runId: observation.runId,
    sourceId: observation.sourceId,
    playbookId: profile.playbookId,
    playbookRevision: profile.playbookRevision,
    startedAt: observation.startedAt,
    finishedAt: observation.finishedAt,
    outcome: inferredOutcome(observation),
    counts: { ...observation.counts },
    coverage: {
      knownCorpus: observation.knownCorpus,
      ratio,
      previousRatio: observation.previousCoverageRatio ?? null,
    },
    httpStatusCounts: { ...(observation.httpStatusCounts ?? {}) },
    failureSignatures: [...(observation.failureSignatures ?? [])],
    surfaceOutcomes: observation.surfaceOutcomes
      ? [...observation.surfaceOutcomes]
      : defaultSurfaceOutcomes(profile, observation),
    rendering: observation.rendering ?? {
      used: profile.fingerprint.renderRequirement === "REQUIRED",
    },
    changeDetection: observation.changeDetection ?? {
      etagObserved: false,
      lastModifiedObserved: false,
      validator304Count: 0,
      digestChanges: 0,
    },
    performance: {
      durationMs,
      bytes: observation.bytes,
    },
    evidenceRefs: [
      ...new Set([
        `acquisition-learning-profile:${profile.profileId}`,
        ...observation.evidenceRefs,
      ]),
    ].sort(),
    boundaries: {
      legalTruthVerified: false,
      autoPromotionApplied: false,
      collectionAuthorityGranted: false,
    },
  };
}
