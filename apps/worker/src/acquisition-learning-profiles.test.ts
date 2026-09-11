import { describe, expect, it } from "vitest";
import {
  ACQUISITION_LEARNING_PROFILES,
  acquisitionLearningProfile,
  defaultAcquisitionLearningProfileIdForProvider,
} from "./acquisition-learning-profiles";

const cases = [
  ["static-index-html-v1", "official-static-index-tree", "INDEX_PAGE", "NONE", "SINGLE", undefined],
  ["toc-graph-html-v1", "official-toc-graph", "TOC", "NONE", "SINGLE", undefined],
  [
    "jurisdiction-index-html-v1",
    "official-jurisdiction-index",
    "COUNTRY_INDEX",
    "NONE",
    "JURISDICTION_GRAPH",
    undefined,
  ],
  ["api-document-catalog-v1", "official-api-catalog", "API", "NONE", "MULTI_LOCALE", undefined],
  [
    "sitemap-static-web-v1",
    "web-sitemap-static",
    "SITEMAP",
    "NONE",
    "UNKNOWN",
    "sitemap-static-web",
  ],
  [
    "sitemap-rendered-web-v1",
    "web-sitemap-rendered",
    "SITEMAP",
    "REQUIRED",
    "UNKNOWN",
    "sitemap-rendered-web",
  ],
  [
    "direct-entry-static-web-v1",
    "web-direct-entry-static",
    "DIRECT_ENTRYPOINT",
    "NONE",
    "UNKNOWN",
    "direct-entry-static-web",
  ],
  [
    "direct-entry-rendered-web-v1",
    "web-direct-entry-rendered",
    "DIRECT_ENTRYPOINT",
    "REQUIRED",
    "UNKNOWN",
    "direct-entry-rendered-web",
  ],
  [
    "link-graph-static-web-v1",
    "web-link-graph-static",
    "LINK_GRAPH",
    "NONE",
    "UNKNOWN",
    "link-graph-static-web",
  ],
  [
    "link-graph-rendered-web-v1",
    "web-link-graph-rendered",
    "LINK_GRAPH",
    "REQUIRED",
    "UNKNOWN",
    "link-graph-rendered-web",
  ],
] as const;

describe("acquisition learning profile matrix", () => {
  it("keeps representative source families as structural declarations", () => {
    expect(Object.keys(ACQUISITION_LEARNING_PROFILES).sort()).toEqual(
      cases.map(([id]) => id).sort(),
    );

    for (const [
      profileId,
      expectedPlaybook,
      expectedSurface,
      expectedRenderRequirement,
      expectedLocale,
      expectedSiteFamily,
    ] of cases) {
      const profile = acquisitionLearningProfile(profileId);
      expect(profile, profileId).not.toBeNull();
      expect(profile?.playbookId).toBe(expectedPlaybook);
      expect(profile?.playbookRevision).toBe(1);
      expect(profile?.fingerprint.discoverySurfaces).toContain(expectedSurface);
      expect(profile?.fingerprint.renderRequirement).toBe(expectedRenderRequirement);
      expect(profile?.fingerprint.localeStructure).toBe(expectedLocale);
      expect(profile?.siteFamily).toBe(expectedSiteFamily);
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
