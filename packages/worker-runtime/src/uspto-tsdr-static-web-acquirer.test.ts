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
        extensions: {
          "x-markorbit-tsdr-web-robots-policy":
            "RFC9309_4XX_UNAVAILABLE_ALLOW_5XX_UNREACHABLE_FAIL_V1",
        },
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

  it("continues when robots.txt is unavailable with HTTP 404", async () => {
    const calls: string[] = [];
    const acquirer = new UsptoTsdrStaticWebArtifactAcquirer({
      resolver,
      transport: async (url) => {
        calls.push(url.toString());
        return url.pathname === "/robots.txt"
          ? {
              statusCode: 404,
              headers: { "content-type": "text/html" },
              body: new Uint8Array(),
            }
          : {
              statusCode: 200,
              headers: { "content-type": "text/html" },
              body: new TextEncoder().encode("<html>US Serial Number: 90817045</html>"),
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
  });

  it("fails closed when robots.txt is unreachable with HTTP 5xx", async () => {
    const acquirer = new UsptoTsdrStaticWebArtifactAcquirer({
      resolver,
      transport: async () => ({
        statusCode: 503,
        headers: { "content-type": "text/plain" },
        body: new Uint8Array(),
      }),
    });

    await expect(
      acquirer.acquire(context("https://tsdr.uspto.gov/statusview/sn90817045", "HTML")),
    ).rejects.toMatchObject({
      code: "TSDR_WEB_STATIC_ROBOTS_UNREACHABLE",
      retryable: true,
    });
  });

  it("captures DOCUMENT_INDEX HTML through the same pinned public address", async () => {
    const calls: string[] = [];
    const acquirer = new UsptoTsdrStaticWebArtifactAcquirer({
      resolver,
      transport: async (url) => {
        calls.push(url.toString());
        return url.pathname === "/robots.txt"
          ? {
              statusCode: 404,
              headers: { "content-type": "text/html" },
              body: new Uint8Array(),
            }
          : {
              statusCode: 200,
              headers: { "content-type": "text/html; charset=UTF-8" },
              body: new TextEncoder().encode(
                "<html><body>Case Id 90817045 <select><option>Non-Final Action</option></select></body></html>",
              ),
            };
      },
    });

    const [artifact] = await acquirer.acquire(
      context("https://tsdr.uspto.gov/documentviewer?caseId=sn90817045", "HTML"),
    );

    expect(calls).toEqual([
      "https://tsdr.uspto.gov/robots.txt",
      "https://tsdr.uspto.gov/documentviewer?caseId=sn90817045",
    ]);
    expect(artifact).toMatchObject({
      artifactKind: "HTML",
      mimeType: "text/html",
      originalName: "tsdr-90817045-document-index.html",
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

  it("fails closed on robots disallow, non-public DNS, or challenge HTML", async () => {
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
