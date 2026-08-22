import {
  buildAcquisitionRunEvidenceFromProfile,
  buildSourceFingerprintFromAcquisitionProfile,
  type AcquisitionRunEvidence,
} from "@markorbit/worker-runtime";
import { acquisitionLearningProfile } from "./acquisition-learning-profiles";

type AcquisitionFailureSignature = AcquisitionRunEvidence["failureSignatures"][number];
type SourceFingerprint = ReturnType<typeof buildSourceFingerprintFromAcquisitionProfile>;

export type LiveAcquisitionProfileEvidence = {
  profileId: string;
  fingerprint: SourceFingerprint;
  evidence: AcquisitionRunEvidence;
};

export function buildLiveAcquisitionProfileEvidence(input: {
  profileId: string;
  runId: string;
  sourceId: string;
  startedAt: string;
  finishedAt: string;
  discovered: number;
  attempted: number;
  fetched: number;
  accepted: number;
  duplicates?: number;
  retries?: number;
  knownCorpus: number | null;
  previousCoverageRatio?: number | null;
  bytes: number;
  httpStatusCounts?: Record<string, number>;
  failureSignatures?: AcquisitionFailureSignature[];
  changeDetection?: AcquisitionRunEvidence["changeDetection"];
  evidenceRefs: string[];
}): LiveAcquisitionProfileEvidence {
  const profile = acquisitionLearningProfile(input.profileId);
  if (!profile) throw new Error(`Unknown acquisition learning profile ${input.profileId}`);
  const evidence = buildAcquisitionRunEvidenceFromProfile({
    profile,
    observation: {
      runId: input.runId,
      sourceId: input.sourceId,
      startedAt: input.startedAt,
      finishedAt: input.finishedAt,
      counts: {
        discovered: input.discovered,
        attempted: input.attempted,
        fetched: input.fetched,
        accepted: input.accepted,
        duplicates: input.duplicates ?? 0,
        retries: input.retries ?? 0,
      },
      knownCorpus: input.knownCorpus,
      previousCoverageRatio: input.previousCoverageRatio ?? null,
      httpStatusCounts: input.httpStatusCounts,
      failureSignatures: input.failureSignatures,
      changeDetection: input.changeDetection,
      bytes: input.bytes,
      evidenceRefs: ["observation-scope:live-canary", ...input.evidenceRefs],
    },
  });
  const fingerprint = buildSourceFingerprintFromAcquisitionProfile({
    profile,
    sourceId: input.sourceId,
    observedAt: input.finishedAt,
    evidenceRefs: evidence.evidenceRefs,
  });
  return { profileId: profile.profileId, fingerprint, evidence };
}
