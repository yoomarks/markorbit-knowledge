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
      supportsHttpValidators: true,
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
      supportsHttpValidators: true,
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
      supportsHttpValidators: true,
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
      supportsHttpValidators: true,
      attachmentKinds: ["JSON", "PDF"],
      confidence: 0.9,
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
