import { describe, expect, it } from "vitest";
import {
  buildAcquisitionRunEvidenceFromProfile,
  buildSourceFingerprintFromAcquisitionProfile,
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
    supportsHttpValidators: true,
    attachmentKinds: ["HTML"],
    confidence: 0.9,
  },
};

describe("acquisition learning profiles", () => {
  it("builds a reusable source fingerprint without source-name logic", () => {
    const fingerprint = buildSourceFingerprintFromAcquisitionProfile({
      profile,
      sourceId: "src_new_official_manual",
      observedAt: "2026-08-22T00:00:00.000Z",
      evidenceRefs: ["probe:index"],
    });

    expect(fingerprint).toMatchObject({
      sourceId: "src_new_official_manual",
      architecture: "STATIC_HTML",
      discoverySurfaces: ["INDEX_PAGE"],
      renderRequirement: "NONE",
      confidence: 0.9,
    });
  });

  it("treats a successful bounded acquisition with unknown corpus size as success, not fake degradation", () => {
    const evidence = buildAcquisitionRunEvidenceFromProfile({
      profile,
      observation: {
        runId: "run_unknown_corpus",
        sourceId: "src_new_official_manual",
        startedAt: "2026-08-22T00:00:00.000Z",
        finishedAt: "2026-08-22T00:00:10.000Z",
        counts: {
          discovered: 8,
          attempted: 8,
          fetched: 8,
          accepted: 8,
          duplicates: 0,
          retries: 0,
        },
        knownCorpus: null,
        httpStatusCounts: { "200": 8 },
        bytes: 1000,
        evidenceRefs: ["collection-run:run_unknown_corpus"],
      },
    });

    expect(evidence.outcome).toBe("SUCCESS");
    expect(evidence.coverage).toEqual({ knownCorpus: null, ratio: null, previousRatio: null });
    expect(evidence.playbookId).toBe("official-static-index-tree");
    expect(evidence.playbookRevision).toBe(1);
    expect(evidence.evidenceRefs).toContain("acquisition-learning-profile:static-index-html-v1");
    expect(evidence.boundaries).toEqual({
      legalTruthVerified: false,
      autoPromotionApplied: false,
      collectionAuthorityGranted: false,
    });
  });

  it("marks a known corpus gap as degraded while preserving the authoritative denominator", () => {
    const evidence = buildAcquisitionRunEvidenceFromProfile({
      profile,
      observation: {
        runId: "run_known_gap",
        sourceId: "src_new_official_manual",
        startedAt: "2026-08-22T00:00:00.000Z",
        finishedAt: "2026-08-22T00:00:10.000Z",
        counts: {
          discovered: 100,
          attempted: 100,
          fetched: 98,
          accepted: 98,
          duplicates: 0,
          retries: 0,
        },
        knownCorpus: 100,
        httpStatusCounts: { "200": 98, "404": 2 },
        failureSignatures: [{ code: "SOURCE_UNAVAILABLE", count: 2 }],
        bytes: 1000,
        evidenceRefs: [
          "source-gap:SOURCE_UNAVAILABLE:404:a",
          "source-gap:SOURCE_UNAVAILABLE:404:b",
        ],
      },
    });

    expect(evidence.outcome).toBe("DEGRADED");
    expect(evidence.coverage.ratio).toBe(0.98);
    expect(evidence.coverage.knownCorpus).toBe(100);
  });
});
