import { describe, expect, it } from "vitest";
import type {
  ArtifactBackedExecutionContext,
  CollectionArtifactAcquirer,
} from "./artifact-backed-collection-executor";
import { CollectionAcquisitionError } from "./artifact-backed-collection-executor";
import {
  UsptoTsdrWebArtifactAcquirer,
  parseUsptoTsdrWebTarget,
  usptoTsdrWebRuntimeDescriptor,
} from "./uspto-tsdr-web-acquirer";

function context(
  urls: string[],
  overrides: Record<string, unknown> = {},
): ArtifactBackedExecutionContext {
  return {
    job: {
      sourceSnapshot: {
        sourceType: "WEB",
        connector: { connectorId: "crawl4ai-web", version: "1.2.0" },
        canonicalUri: urls[0],
        entrypoints: urls.map((uri) => ({ uri })),
      },
      planSnapshot: {
        policy: {
          maxDepth: 0,
          maxItems: 3,
          rateLimitPerMinute: 6,
          respectRobots: true,
          renderJavascript: true,
          fetchAttachments: false,
          includePatterns: [],
          excludePatterns: [],
          timeoutSeconds: 30,
          ...overrides,
        },
        output: { artifactKinds: ["HTML", "MARKDOWN", "IMAGE"] },
      },
    },
  } as unknown as ArtifactBackedExecutionContext;
}

class FakeDelegate implements CollectionArtifactAcquirer {
  readonly executor = {
    executorId: "fake",
    version: "1.0.0",
    mode: "PRODUCTION" as const,
  };

  constructor(private readonly body = "<html>TSDR case page</html>") {}

  async acquire(input: ArtifactBackedExecutionContext) {
    const uri = input.job.sourceSnapshot.entrypoints[0]!.uri;
    return [
      {
        artifactKind: "HTML" as const,
        mimeType: "text/html",
        originalName: "case.html",
        sourceUri: uri,
        canonicalUri: uri,
        content: new TextEncoder().encode(this.body),
      },
    ];
  }
}

describe("USPTO TSDR Web acquisition", () => {
  it("parses the three governed official surfaces", () => {
    expect(
      parseUsptoTsdrWebTarget("https://tsdr.uspto.gov/statusview/sn90817045"),
    ).toMatchObject({
      surface: "STATUS",
      serialNumber: "90817045",
    });
    expect(
      parseUsptoTsdrWebTarget("https://tsdr.uspto.gov/img/90817045/large"),
    ).toMatchObject({
      surface: "MARK_IMAGE",
      serialNumber: "90817045",
    });
    expect(
      parseUsptoTsdrWebTarget(
        "https://tsdr.uspto.gov/documentviewer?caseId=sn90817045",
      ),
    ).toMatchObject({ surface: "DOCUMENT_INDEX", serialNumber: "90817045" });
  });

  it("accepts a bounded same-serial job through the normal artifact delegate", async () => {
    const acquirer = new UsptoTsdrWebArtifactAcquirer({
      delegate: new FakeDelegate(),
    });
    const artifacts = await acquirer.acquire(
      context([
        "https://tsdr.uspto.gov/statusview/sn90817045",
        "https://tsdr.uspto.gov/img/90817045/large",
      ]),
    );
    expect(artifacts).toHaveLength(1);
    expect(acquirer.executor.executorId).toBe("uspto-tsdr-web-crawl4ai");
  });

  it("rejects cross-serial and alternate-origin jobs", async () => {
    const acquirer = new UsptoTsdrWebArtifactAcquirer({
      delegate: new FakeDelegate(),
    });
    await expect(
      acquirer.acquire(
        context([
          "https://tsdr.uspto.gov/statusview/sn90817045",
          "https://tsdr.uspto.gov/img/90817046/large",
        ]),
      ),
    ).rejects.toMatchObject({ code: "TSDR_WEB_BOUNDARY_INVALID" });

    expect(() =>
      parseUsptoTsdrWebTarget("https://example.test/statusview/sn90817045"),
    ).toThrow(CollectionAcquisitionError);
  });

  it("fails closed on recursive, excessive-rate, or robots-disabled plans", async () => {
    const acquirer = new UsptoTsdrWebArtifactAcquirer({
      delegate: new FakeDelegate(),
    });
    const uri = "https://tsdr.uspto.gov/statusview/sn90817045";

    await expect(
      acquirer.acquire(context([uri], { maxDepth: 1 })),
    ).rejects.toMatchObject({
      code: "TSDR_WEB_BOUNDARY_INVALID",
    });
    await expect(
      acquirer.acquire(context([uri], { rateLimitPerMinute: 13 })),
    ).rejects.toMatchObject({ code: "TSDR_WEB_BOUNDARY_INVALID" });
    await expect(
      acquirer.acquire(context([uri], { respectRobots: false })),
    ).rejects.toMatchObject({
      code: "TSDR_WEB_BOUNDARY_INVALID",
    });
  });

  it("stops when an access-control or CAPTCHA page is observed", async () => {
    const acquirer = new UsptoTsdrWebArtifactAcquirer({
      delegate: new FakeDelegate("<html>Please verify you are human</html>"),
    });
    await expect(
      acquirer.acquire(
        context(["https://tsdr.uspto.gov/statusview/sn90817045"]),
      ),
    ).rejects.toMatchObject({ code: "TSDR_WEB_CHALLENGE_DETECTED" });
  });

  it("publishes the dual-channel-safe runtime boundary", () => {
    expect(usptoTsdrWebRuntimeDescriptor()).toMatchObject({
      providerId: "uspto-tsdr-web",
      officialOrigin: "https://tsdr.uspto.gov",
      recursiveCrawlForbidden: true,
      challengeBypassForbidden: true,
      artifactBackedIngestionRequired: true,
    });
  });
});
