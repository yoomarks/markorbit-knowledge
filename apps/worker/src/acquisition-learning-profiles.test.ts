import { describe, expect, it } from "vitest";
import {
  buildSourceFingerprintFromAcquisitionProfile,
  selectAcquisitionPlaybook,
  ACQUISITION_SEED_PLAYBOOKS,
} from "@markorbit/worker-runtime";
import { ACQUISITION_LEARNING_PROFILES, acquisitionLearningProfile } from "./acquisition-learning-profiles";

const cases = [
  ["ip-australia-like-static-index", "static-index-html-v1", "official-static-index-tree"],
  ["wipo-like-toc", "toc-graph-html-v1", "official-toc-graph"],
  ["country-index-like", "jurisdiction-index-html-v1", "official-jurisdiction-index"],
  ["api-document-catalog", "api-document-catalog-v1", "official-api-catalog"],
] as const;

describe("acquisition learning profile matrix", () => {
  it("keeps representative source families as structural declarations", () => {
    expect(Object.keys(ACQUISITION_LEARNING_PROFILES).sort()).toEqual(
      [
        "api-document-catalog-v1",
        "jurisdiction-index-html-v1",
        "static-index-html-v1",
        "toc-graph-html-v1",
      ].sort(),
    );

    for (const [sourceId, profileId, expectedPlaybook] of cases) {
      const profile = acquisitionLearningProfile(profileId);
      expect(profile, profileId).not.toBeNull();
      const fingerprint = buildSourceFingerprintFromAcquisitionProfile({
        profile: profile!,
        sourceId,
        observedAt: "2026-08-22T00:00:00.000Z",
        evidenceRefs: [`profile:${profileId}`],
      });
      const selection = selectAcquisitionPlaybook({
        fingerprint,
        playbooks: ACQUISITION_SEED_PLAYBOOKS,
      });
      expect(selection.selectedPlaybookId, sourceId).toBe(expectedPlaybook);
      expect(selection.boundaries.selectionGrantsCollectionAuthority).toBe(false);
      expect(selection.boundaries.autoPromotionApplied).toBe(false);
    }
  });

  it("rejects unknown profile ids instead of silently guessing", () => {
    expect(acquisitionLearningProfile("unknown-profile")).toBeNull();
    expect(acquisitionLearningProfile(undefined)).toBeNull();
  });
});
