import { extractAcquisitionRunLessons } from "@markorbit/contracts";
import { describe, expect, it } from "vitest";
import {
  buildAcquisitionRunEvidenceFromProfile,
  buildSourceFingerprintFromAcquisitionProfile,
  type AcquisitionLearningObservation,
  type AcquisitionLearningProfile,
} from "../src/acquisition-learning-profile";

const profile: AcquisitionLearningProfile = {
  profileId: "static-index-html-v1",
  playbookId: "official-static-index-tree",
  playbookRevision: 1,
  fingerprint: {
    architecture: "STATIC_HTML",
    discoverySurfaces: ["INDEX_PAGE"],
    renderRequirement: "NONE",
    localeStructure: "SINGLE",
    supportsHttpValidators: null,
    attachmentKinds: ["HTML"],
    confidence: 0.9,
  },
};

function observation(
  changeDetection?: AcquisitionLearningObservation["changeDetection"],
): AcquisitionLearningObservation {
  return {
    runId: "run_validator_measurement",
    sourceId: "src_validator_measurement",
    startedAt: "2026-08-22T00:00:00.000Z",
    finishedAt: "2026-08-22T00:00:01.000Z",
    counts: { discovered: 1, attempted: 1, fetched: 1, accepted: 1, duplicates: 0, retries: 0 },
    knownCorpus: null,
    ...(changeDetection ? { changeDetection } : {}),
    bytes: 100,
    evidenceRefs: ["fixture:validator-measurement"],
  };
}

describe("acquisition learning measurement semantics", () => {
  it("keeps unmeasured validators unknown without fabricating unavailable lessons", () => {
    const evidence = buildAcquisitionRunEvidenceFromProfile({
      profile,
      observation: observation(),
    });
    expect(evidence.changeDetection.etagObserved).toBeNull();
    expect(evidence.changeDetection.lastModifiedObserved).toBeNull();
    const lessonTypes = extractAcquisitionRunLessons(evidence).map((lesson) => lesson.lessonType);
    expect(lessonTypes).not.toContain("HTTP_VALIDATORS_UNAVAILABLE");
    expect(lessonTypes).not.toContain("DIGEST_WATCH_REQUIRED");
    expect(
      buildSourceFingerprintFromAcquisitionProfile({
        profile,
        sourceId: evidence.sourceId,
        observedAt: evidence.finishedAt,
        evidenceRefs: evidence.evidenceRefs,
        changeDetection: evidence.changeDetection,
      }).supportsHttpValidators,
    ).toBeNull();
  });

  it("derives support and fallback lessons only from measured observations", () => {
    const available = buildAcquisitionRunEvidenceFromProfile({
      profile,
      observation: observation({
        etagObserved: true,
        lastModifiedObserved: false,
        validator304Count: 0,
        digestChanges: 0,
      }),
    });
    expect(
      buildSourceFingerprintFromAcquisitionProfile({
        profile,
        sourceId: available.sourceId,
        observedAt: available.finishedAt,
        evidenceRefs: available.evidenceRefs,
        changeDetection: available.changeDetection,
      }).supportsHttpValidators,
    ).toBe(true);

    const unavailable = buildAcquisitionRunEvidenceFromProfile({
      profile,
      observation: observation({
        etagObserved: false,
        lastModifiedObserved: false,
        validator304Count: 0,
        digestChanges: 0,
      }),
    });
    const lessonTypes = extractAcquisitionRunLessons(unavailable).map(
      (lesson) => lesson.lessonType,
    );
    expect(lessonTypes).toContain("HTTP_VALIDATORS_UNAVAILABLE");
    expect(lessonTypes).toContain("DIGEST_WATCH_REQUIRED");
  });
});
