import { describe, expect, it } from "vitest";
import type { ArtifactBackedExecutionContext } from "./artifact-backed-collection-executor";
import { UsptoTsdrStaticWebArtifactAcquirer } from "./uspto-tsdr-static-web-acquirer";

function context(url: string, output: "HTML" | "IMAGE"): ArtifactBackedExecutionContext {
  return {
    job: {
      jobType: "WEB_CRAWL",
      connector: { connectorId: "crawl4ai-web", version: "1.3.0" },
      sourceSnapshot: {
        sourceType: "WEB",
        connector: { connectorId: "crawl4ai-web", version: "1.3.0" },
        canonicalUri: url,
        entrypoints: [{ uri: url }],
      },
      planSnapshot: {
        policy: {
          includePatterns: [],
          excludePatterns: [],
          maxDepth: 0,
          maxItems: 1,
          renderJavascript: false,
          fetchAttachments: false,
          respectRobots: true,
          rateLimitPerMinute: 6,
          timeoutSeconds: 120,
        },
        output: { artifactKinds: [output] },
      },
    },
  } as unknown as ArtifactBackedExecutionContext;
}

const resolver = async () => [{ address: "8.8.8.8", family: 4 as const }];

describe("USPTO TSDR static Web acquirer", () => {
  it("fetches robots first, then captures STATUS HTML through a pinned transport", async () => {
    const calls: string[] = [];
    const acquirer = new UsptoTsdrStaticWebArtifactAcquirer({
      resolver,
      transport: async (url) => {
        calls.push(url.toString());
        if (url.pathname === "/robots.txt") {
          return {
            statusCode: 200,
            headers: { "content-type": "text/plain" },
            body: new TextEncoder().encode("User-agent: *\nAllow: /"),
          };
        }
        return {
          statusCode: 200,
          headers: { "content-type": "text/html; charset=UTF-8" },
          body: new TextEncoder().encode("<html><body>US Serial Number: 90817045</body></html>"),
        };
      },
    });

    const artifacts = await acquirer.acquire(
      context("https://tsdr.uspto.gov/statusview/sn90817045", "HTML"),
    );

    expect(calls).toEqual([
      "https://tsdr.uspto.gov/robots.txt",
      "https://tsdr.uspto.gov/statusview/sn90817045",
    ]);
    expect(artifacts).toHaveLength(1);
    expect(artifacts[0]).toMatchObject({
      artifactKind: "HTML",
      canonicalUri: "https://tsdr.uspto.gov/statusview/sn90817045",
    });
  });

  it("captures the mark image through the same pinned public address", async () => {
    const acquirer = new UsptoTsdrStaticWebArtifactAcquirer({
      resolver,
      transport: async (url) =>
        url.pathname === "/robots.txt"
          ? {
              statusCode: 200,
              headers: { "content-type": "text/plain" },
              body: new TextEncoder().encode("User-agent: *\nAllow: /"),
            }
          : {
              statusCode: 200,
              headers: { "content-type": "image/png" },
              body: Uint8Array.from([137, 80, 78, 71]),
            },
    });
    const [artifact] = await acquirer.acquire(
      context("https://tsdr.uspto.gov/img/90817045/large", "IMAGE"),
    );
    expect(artifact).toMatchObject({ artifactKind: "IMAGE", mimeType: "image/png" });
  });

  it("fails closed on robots disallow, non-public DNS, document viewer, or challenge HTML", async () => {
    const disallowed = new UsptoTsdrStaticWebArtifactAcquirer({
      resolver,
      transport: async () => ({
        statusCode: 200,
        headers: { "content-type": "text/plain" },
        body: new TextEncoder().encode("User-agent: *\nDisallow: /statusview"),
      }),
    });
    await expect(
      disallowed.acquire(context("https://tsdr.uspto.gov/statusview/sn90817045", "HTML")),
    ).rejects.toMatchObject({ code: "TSDR_WEB_STATIC_ROBOTS_DISALLOWED" });

    const privateTarget = new UsptoTsdrStaticWebArtifactAcquirer({
      resolver: async () => [{ address: "127.0.0.1", family: 4 }],
    });
    await expect(
      privateTarget.acquire(context("https://tsdr.uspto.gov/statusview/sn90817045", "HTML")),
    ).rejects.toMatchObject({ code: "TSDR_WEB_STATIC_NETWORK_TARGET_REJECTED" });

    const viewer = new UsptoTsdrStaticWebArtifactAcquirer({ resolver });
    await expect(
      viewer.acquire(context("https://tsdr.uspto.gov/documentviewer?caseId=sn90817045", "HTML")),
    ).rejects.toMatchObject({ code: "TSDR_WEB_STATIC_DOCUMENT_INDEX_UNSUPPORTED" });

    const challenge = new UsptoTsdrStaticWebArtifactAcquirer({
      resolver,
      transport: async (url) =>
        url.pathname === "/robots.txt"
          ? {
              statusCode: 200,
              headers: { "content-type": "text/plain" },
              body: new TextEncoder().encode("User-agent: *\nAllow: /"),
            }
          : {
              statusCode: 200,
              headers: { "content-type": "text/html" },
              body: new TextEncoder().encode("<html>Verify you are human</html>"),
            },
    });
    await expect(
      challenge.acquire(context("https://tsdr.uspto.gov/statusview/sn90817045", "HTML")),
    ).rejects.toMatchObject({ code: "TSDR_WEB_CHALLENGE_DETECTED" });
  });
});
