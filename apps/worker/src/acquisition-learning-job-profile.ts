import type { Job } from "@markorbit/contracts";
import type { AcquisitionLearningProfile } from "@markorbit/worker-runtime";
import {
  acquisitionLearningProfile,
  defaultAcquisitionLearningProfileIdForProvider,
} from "./acquisition-learning-profiles";

const PROFILE_EXTENSION = "x-markorbit-acquisition-learning-profile";
const SITE_FAMILY_EXTENSION = "x-markorbit-site-family";
const DISCOVERY_MODE_EXTENSION = "x-markorbit-discovery-mode";

function extensionString(
  extensions: Record<string, unknown> | undefined,
  key: string,
): string | undefined {
  const value = extensions?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function inferredProfileId(job: Job): string | undefined {
  const discoveryMode =
    extensionString(job.planSnapshot.extensions, DISCOVERY_MODE_EXTENSION) ??
    extensionString(job.sourceSnapshot.extensions, DISCOVERY_MODE_EXTENSION);
  const rendered = job.planSnapshot.policy.renderJavascript === true;

  if (discoveryMode === "SITEMAP") {
    return rendered ? "sitemap-rendered-web-v1" : "sitemap-static-web-v1";
  }
  if (discoveryMode === "LINK_CRAWL") {
    return rendered ? "link-graph-rendered-web-v1" : "link-graph-static-web-v1";
  }
  if (discoveryMode === "EXACT_URL_LIST") {
    return rendered ? "direct-entry-rendered-web-v1" : "direct-entry-static-web-v1";
  }
  return undefined;
}

function withJobSiteFamily(
  profile: AcquisitionLearningProfile,
  job: Job,
): AcquisitionLearningProfile {
  const siteFamily =
    extensionString(job.planSnapshot.extensions, SITE_FAMILY_EXTENSION) ??
    extensionString(job.sourceSnapshot.extensions, SITE_FAMILY_EXTENSION) ??
    profile.siteFamily;
  return siteFamily ? { ...profile, siteFamily } : profile;
}

export function acquisitionLearningProfileForJob(input: {
  job: Job;
  configuredProfileId?: string;
  collectionProvider: string;
}): AcquisitionLearningProfile | null {
  const explicitProfileId =
    extensionString(input.job.planSnapshot.extensions, PROFILE_EXTENSION) ??
    extensionString(input.job.sourceSnapshot.extensions, PROFILE_EXTENSION);

  const profileId =
    explicitProfileId ??
    inferredProfileId(input.job) ??
    input.configuredProfileId ??
    defaultAcquisitionLearningProfileIdForProvider(input.collectionProvider);
  if (!profileId) return null;
  const profile = acquisitionLearningProfile(profileId);
  if (!profile) {
    throw new Error(`Unknown acquisition learning profile: ${profileId}`);
  }
  return withJobSiteFamily(profile, input.job);
}

export const ACQUISITION_LEARNING_EXTENSION_KEYS = {
  profile: PROFILE_EXTENSION,
  siteFamily: SITE_FAMILY_EXTENSION,
  discoveryMode: DISCOVERY_MODE_EXTENSION,
} as const;
