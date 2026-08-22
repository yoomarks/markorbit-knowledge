import { describe, expect, it } from "vitest";
import {
  ACQUISITION_LEARNING_PROFILES,
  acquisitionLearningProfile,
  defaultAcquisitionLearningProfileIdForProvider,
} from "./acquisition-learning-profiles";

const cases = [
  ["static-index-html-v1", "official-static-index-tree", "INDEX_PAGE", "SINGLE"],
  ["toc-graph-html-v1", "official-toc-graph", "TOC", "SINGLE"],
  [
    "jurisdiction-index-html-v1",
    "official-jurisdiction-index",
    "COUNTRY_INDEX",
    "JURISDICTION_GRAPH",
  ],
  ["api-document-catalog-v1", "official-api-catalog", "API", "MULTI_LOCALE"],
] as const;

describe("acquisition learning profile matrix", () => {
  it("keeps representative source families as structural declarations", () => {
    expect(Object.keys(ACQUISITION_LEARNING_PROFILES).sort()).toEqual(
      cases.map(([id]) => id).sort(),
    );

    for (const [profileId, expectedPlaybook, expectedSurface, expectedLocale] of cases) {
      const profile = acquisitionLearningProfile(profileId);
      expect(profile, profileId).not.toBeNull();
      expect(profile?.playbookId).toBe(expectedPlaybook);
      expect(profile?.playbookRevision).toBe(1);
      expect(profile?.fingerprint.discoverySurfaces).toContain(expectedSurface);
      expect(profile?.fingerprint.localeStructure).toBe(expectedLocale);
    }
  });

  it("keeps existing source provider defaults as thin declarations outside selector core", () => {
    expect(defaultAcquisitionLearningProfileIdForProvider("ip-australia-manual")).toBe(
      "static-index-html-v1",
    );
    expect(defaultAcquisitionLearningProfileIdForProvider("crawl4ai")).toBeUndefined();
    expect(
      defaultAcquisitionLearningProfileIdForProvider("new-authoritative-source"),
    ).toBeUndefined();
  });

  it("rejects unknown profile ids instead of silently guessing", () => {
    expect(acquisitionLearningProfile("unknown-profile")).toBeNull();
    expect(acquisitionLearningProfile(undefined)).toBeNull();
  });
});
