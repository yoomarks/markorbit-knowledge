import { describe, expect, it } from "vitest";
import type { ArtifactBackedExecutionContext } from "@markorbit/worker-runtime";
import { IpAustraliaManualArtifactAcquirer } from "./ip-australia-manual-artifact-acquirer";

const controlledArticle = (title: string, date = "19 Aug 2026") => `
<html><body><main>
<h1>${title}</h1>
<p>Date Published ${date}</p>
<p>This official practice page contains substantive procedure and requirements content for the controlled Manual acquisition fixture. It is deliberately long enough to represent an ordinary article body.</p>
<h2>Amended Reasons</h2>
<table><tr><th>Amended Reason</th><th>Date Amended</th></tr><tr><td>Updated practice.</td><td>${date}</td></tr></table>
</main><footer>This document is controlled. Its accuracy can only be guaranteed when viewed electronically.</footer></body></html>`;

const specialPage = `
<html><body><main>
<h1>Annex A1 - Flow chart</h1>
<p>Date Published 31 Oct 2025</p>
<h2>Amended Reasons</h2>
<table><tr><th>Amended Reason</th><th>Date Amended</th></tr><tr><td>Accessibility update.</td><td>31 Oct 2025</td></tr></table>
</main><footer>This document is controlled. Its accuracy can only be guaranteed when viewed electronically.</footer></body></html>`;

function root(): string {
  return `
  <html><body>
    <nav>
      <a href="/trademark/article-a">Article A</a>
      <a href="/trademark/annex-a1">Annex A1</a>
      <a href="/trademark/broken">Broken current navigation</a>
    </nav>
  </body></html>`;
}

function context(maxItems = 3, artifactKinds: string[] = ["HTML"]): ArtifactBackedExecutionContext {
  return {
    workerId: "wrk_fixture",
    leaseToken: "fixture-token",
    lease: { id: "lse_fixture" },
    job: {
      planSnapshot: {
        output: { artifactKinds },
        policy: { maxItems },
      },
    },
  } as unknown as ArtifactBackedExecutionContext;
}

function fixtureFetch(): typeof fetch {
  return async (input) => {
    const uri = String(input);
    if (uri === "https://manuals.ipaustralia.gov.au/trademark") {
      return new Response(root(), { status: 200, headers: { "content-type": "text/html" } });
    }
    if (uri.endsWith("article-a")) {
      return new Response(controlledArticle("Article A"), {
        status: 200,
        headers: { "content-type": "text/html" },
      });
    }
    if (uri.endsWith("annex-a1")) {
      return new Response(specialPage, {
        status: 200,
        headers: { "content-type": "text/html" },
      });
    }
    return new Response("missing", { status: 404 });
  };
}

describe("IP Australia Manual artifact acquirer", () => {
  it("emits original HTML bytes for standard and special evidence while retaining source 404 diagnostics", async () => {
    const acquirer = new IpAustraliaManualArtifactAcquirer({
      fetcher: fixtureFetch(),
      concurrency: 2,
      interBatchDelayMs: 0,
    });

    const artifacts = await acquirer.acquire(context());
    const diagnostics = acquirer.getDiagnostics();

    expect(artifacts).toHaveLength(2);
    expect(artifacts.every((artifact) => artifact.artifactKind === "HTML")).toBe(true);
    expect(artifacts.every((artifact) => artifact.content.byteLength > 0)).toBe(true);
    expect(artifacts.map((artifact) => artifact.canonicalUri)).toEqual([
      "https://manuals.ipaustralia.gov.au/trademark/annex-a1",
      "https://manuals.ipaustralia.gov.au/trademark/article-a",
    ]);
    expect(diagnostics).toMatchObject({
      inventoryPageCount: 3,
      emittedArtifactCount: 2,
    });
    expect(diagnostics.sourceGaps).toEqual([
      expect.objectContaining({
        uri: "https://manuals.ipaustralia.gov.au/trademark/broken",
        status: 404,
        reason: "SOURCE_UNAVAILABLE",
      }),
    ]);
  });

  it("fails closed when the immutable CollectionPlan cannot cover the complete inventory", async () => {
    const acquirer = new IpAustraliaManualArtifactAcquirer({
      fetcher: fixtureFetch(),
      interBatchDelayMs: 0,
    });

    await expect(acquirer.acquire(context(2))).rejects.toMatchObject({
      code: "IP_AUSTRALIA_MANUAL_PLAN_BUDGET_TOO_SMALL",
      retryable: false,
    });
  });

  it("requires HTML authorization before producing RawArtifact candidates", async () => {
    const acquirer = new IpAustraliaManualArtifactAcquirer({
      fetcher: fixtureFetch(),
      interBatchDelayMs: 0,
    });

    await expect(acquirer.acquire(context(3, ["MARKDOWN"]))).rejects.toMatchObject({
      code: "IP_AUSTRALIA_MANUAL_HTML_NOT_AUTHORIZED",
      retryable: false,
    });
  });
});
