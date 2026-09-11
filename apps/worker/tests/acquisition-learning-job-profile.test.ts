import { describe, expect, it } from "vitest";
import type { Job } from "@markorbit/contracts";
import { acquisitionLearningProfileForJob } from "../src/acquisition-learning-job-profile";

function job(input: {
  discoveryMode?: string;
  renderJavascript?: boolean;
  profileId?: string;
  siteFamily?: string;
}): Job {
  const extensions = {
    ...(input.discoveryMode ? { "x-markorbit-discovery-mode": input.discoveryMode } : {}),
    ...(input.profileId ? { "x-markorbit-acquisition-learning-profile": input.profileId } : {}),
    ...(input.siteFamily ? { "x-markorbit-site-family": input.siteFamily } : {}),
  };
  return {
    planSnapshot: {
      policy: { renderJavascript: input.renderJavascript === true },
      extensions,
    },
    sourceSnapshot: { extensions },
  } as unknown as Job;
}

describe("acquisitionLearningProfileForJob", () => {
  it("selects a sitemap profile from the immutable job snapshot", () => {
    const profile = acquisitionLearningProfileForJob({
      job: job({ discoveryMode: "SITEMAP" }),
      collectionProvider: "crawl4ai",
    });
    expect(profile).toMatchObject({
      profileId: "sitemap-static-web-v1",
      playbookId: "web-sitemap-static",
      siteFamily: "sitemap-static-web",
    });
  });

  it("selects rendered link-graph learning per job, not per worker", () => {
    const profile = acquisitionLearningProfileForJob({
      job: job({ discoveryMode: "LINK_CRAWL", renderJavascript: true }),
      collectionProvider: "crawl4ai",
    });
    expect(profile).toMatchObject({
      profileId: "link-graph-rendered-web-v1",
      playbookId: "web-link-graph-rendered",
      siteFamily: "link-graph-rendered-web",
    });
  });
  it("learns direct-entry sources instead of leaving EXACT_URL_LIST unclassified", () => {
    const profile = acquisitionLearningProfileForJob({
      job: job({ discoveryMode: "EXACT_URL_LIST" }),
      collectionProvider: "crawl4ai",
    });
    expect(profile).toMatchObject({
      profileId: "direct-entry-static-web-v1",
      playbookId: "web-direct-entry-static",
      siteFamily: "direct-entry-static-web",
    });
  });

  it("lets explicit source/plan learning metadata override worker defaults", () => {
    const profile = acquisitionLearningProfileForJob({
      job: job({
        profileId: "sitemap-static-web-v1",
        siteFamily: "government-sitemap-family",
      }),
      configuredProfileId: "static-index-html-v1",
      collectionProvider: "crawl4ai",
    });
    expect(profile).toMatchObject({
      profileId: "sitemap-static-web-v1",
      siteFamily: "government-sitemap-family",
    });
  });
});
