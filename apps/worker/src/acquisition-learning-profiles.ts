import type { AcquisitionLearningProfile } from "@markorbit/worker-runtime";

export const ACQUISITION_LEARNING_PROFILES = {
  "static-index-html-v1": {
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
  },
  "toc-graph-html-v1": {
    profileId: "toc-graph-html-v1",
    playbookId: "official-toc-graph",
    playbookRevision: 1,
    fingerprint: {
      architecture: "STATIC_HTML",
      discoverySurfaces: ["TOC"],
      renderRequirement: "NONE",
      localeStructure: "SINGLE",
      supportsHttpValidators: null,
      attachmentKinds: ["HTML", "PDF"],
      confidence: 0.9,
    },
  },
  "jurisdiction-index-html-v1": {
    profileId: "jurisdiction-index-html-v1",
    playbookId: "official-jurisdiction-index",
    playbookRevision: 1,
    fingerprint: {
      architecture: "STATIC_HTML",
      discoverySurfaces: ["COUNTRY_INDEX"],
      renderRequirement: "NONE",
      localeStructure: "JURISDICTION_GRAPH",
      supportsHttpValidators: null,
      attachmentKinds: ["HTML", "PDF"],
      confidence: 0.85,
    },
  },
  "api-document-catalog-v1": {
    profileId: "api-document-catalog-v1",
    playbookId: "official-api-catalog",
    playbookRevision: 1,
    fingerprint: {
      architecture: "API_BACKED",
      discoverySurfaces: ["API", "DOCUMENT_CATALOG"],
      renderRequirement: "NONE",
      localeStructure: "MULTI_LOCALE",
      supportsHttpValidators: null,
      attachmentKinds: ["JSON", "PDF"],
      confidence: 0.9,
    },
  },
  "sitemap-static-web-v1": {
    profileId: "sitemap-static-web-v1",
    playbookId: "web-sitemap-static",
    playbookRevision: 1,
    siteFamily: "sitemap-static-web",
    fingerprint: {
      architecture: "UNKNOWN",
      discoverySurfaces: ["SITEMAP"],
      renderRequirement: "NONE",
      localeStructure: "UNKNOWN",
      supportsHttpValidators: null,
      attachmentKinds: ["HTML"],
      confidence: 0.8,
    },
  },
  "sitemap-rendered-web-v1": {
    profileId: "sitemap-rendered-web-v1",
    playbookId: "web-sitemap-rendered",
    playbookRevision: 1,
    siteFamily: "sitemap-rendered-web",
    fingerprint: {
      architecture: "UNKNOWN",
      discoverySurfaces: ["SITEMAP"],
      renderRequirement: "REQUIRED",
      localeStructure: "UNKNOWN",
      supportsHttpValidators: null,
      attachmentKinds: ["HTML"],
      confidence: 0.75,
    },
  },
  "direct-entry-static-web-v1": {
    profileId: "direct-entry-static-web-v1",
    playbookId: "web-direct-entry-static",
    playbookRevision: 1,
    siteFamily: "direct-entry-static-web",
    fingerprint: {
      architecture: "UNKNOWN",
      discoverySurfaces: ["DIRECT_ENTRYPOINT"],
      renderRequirement: "NONE",
      localeStructure: "UNKNOWN",
      supportsHttpValidators: null,
      attachmentKinds: ["HTML"],
      confidence: 0.7,
    },
  },
  "direct-entry-rendered-web-v1": {
    profileId: "direct-entry-rendered-web-v1",
    playbookId: "web-direct-entry-rendered",
    playbookRevision: 1,
    siteFamily: "direct-entry-rendered-web",
    fingerprint: {
      architecture: "UNKNOWN",
      discoverySurfaces: ["DIRECT_ENTRYPOINT"],
      renderRequirement: "REQUIRED",
      localeStructure: "UNKNOWN",
      supportsHttpValidators: null,
      attachmentKinds: ["HTML"],
      confidence: 0.65,
    },
  },
  "link-graph-static-web-v1": {
    profileId: "link-graph-static-web-v1",
    playbookId: "web-link-graph-static",
    playbookRevision: 1,
    siteFamily: "link-graph-static-web",
    fingerprint: {
      architecture: "UNKNOWN",
      discoverySurfaces: ["LINK_GRAPH"],
      renderRequirement: "NONE",
      localeStructure: "UNKNOWN",
      supportsHttpValidators: null,
      attachmentKinds: ["HTML"],
      confidence: 0.75,
    },
  },
  "link-graph-rendered-web-v1": {
    profileId: "link-graph-rendered-web-v1",
    playbookId: "web-link-graph-rendered",
    playbookRevision: 1,
    siteFamily: "link-graph-rendered-web",
    fingerprint: {
      architecture: "UNKNOWN",
      discoverySurfaces: ["LINK_GRAPH"],
      renderRequirement: "REQUIRED",
      localeStructure: "UNKNOWN",
      supportsHttpValidators: null,
      attachmentKinds: ["HTML"],
      confidence: 0.7,
    },
  },
} as const satisfies Record<string, AcquisitionLearningProfile>;

export type AcquisitionLearningProfileId = keyof typeof ACQUISITION_LEARNING_PROFILES;

const PROVIDER_PROFILE_DEFAULTS: Readonly<Record<string, AcquisitionLearningProfileId>> = {
  "ip-australia-manual": "static-index-html-v1",
};

export function acquisitionLearningProfile(
  profileId: string | undefined,
): AcquisitionLearningProfile | null {
  if (!profileId) return null;
  return ACQUISITION_LEARNING_PROFILES[profileId as AcquisitionLearningProfileId] ?? null;
}

export function defaultAcquisitionLearningProfileIdForProvider(
  provider: string,
): AcquisitionLearningProfileId | undefined {
  return PROVIDER_PROFILE_DEFAULTS[provider];
}
