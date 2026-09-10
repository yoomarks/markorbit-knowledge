import { afterEach, describe, expect, it } from "vitest";
import {
  canonicalizeCampaignUrl,
  discoverWebAcquisitionInventory,
  parseWebAcquisitionCampaignManifest,
  runWebAcquisitionCampaign,
  selectWebAcquisitionBatch,
  type WebAcquisitionCampaignManifestV1,
} from "../src/web-acquisition-campaign";

const workspaceId = "wsp_01ARZ3NDEKTSV4RRFFQ69G5FAV";

function manifest(
  overrides: Partial<WebAcquisitionCampaignManifestV1> = {},
): WebAcquisitionCampaignManifestV1 {
  return {
    version: "1.0",
    campaignId: "test-wave",
    name: "Test Wave",
    workspaceId,
    globalConcurrency: 2,
    sources: [
      {
        key: "example",
        name: "Example Authority",
        sourceClass: "OFFICIAL_AUTHORITY",
        jurisdictions: ["US"],
        languages: ["en-US"],
        baseUrl: "https://example.com/trademarks",
        discovery: { mode: "SITEMAP", maxSitemaps: 5 },
        includePatterns: ["https://example.com/trademarks*"],
        excludePatterns: ["*privacy*"],
        maxPages: 10,
        maxDepth: 2,
        rateLimitPerMinute: 30,
        renderJavascript: false,
      },
    ],
    ...overrides,
  };
}

afterEach(() => {
  delete process.env.MARKORBIT_ADMIN_SESSION_TOKEN;
  delete process.env.MARKORBIT_CI_ADMIN_SESSION_TOKEN;
  delete process.env.MARKORBIT_CALIBRATION_SESSION_TOKEN;
});
describe("web acquisition campaign manifest", () => {
  it("normalizes safe public URLs and strips common tracking parameters", () => {
    expect(
      canonicalizeCampaignUrl("https://Example.com/trademarks?a=2&utm_source=x&a=1#section"),
    ).toBe("https://example.com/trademarks?a=2&a=1");
  });

  it("fails closed for private or credential-bearing origins", () => {
    expect(() => canonicalizeCampaignUrl("http://127.0.0.1/a")).toThrow(/public HTTP/);
    expect(() => canonicalizeCampaignUrl("https://user:pass@example.com/a")).toThrow(
      /without embedded credentials/,
    );
  });

  it("validates bounded manifest limits and unique source keys", () => {
    const parsed = parseWebAcquisitionCampaignManifest(manifest());
    expect(parsed.sources[0]?.maxPages).toBe(10);
    expect(parsed.sources[0]?.refreshIntervalSeconds).toBe(86_400);
    expect(parsed.sources[0]?.adaptiveRefreshCadence).toBe(false);
    expect(() =>
      parseWebAcquisitionCampaignManifest({
        ...manifest(),
        sources: [{ ...manifest().sources[0], adaptiveRefreshCadence: "yes" }],
      }),
    ).toThrow(/adaptiveRefreshCadence.*boolean/);
    expect(() =>
      parseWebAcquisitionCampaignManifest({
        ...manifest(),
        sources: [manifest().sources[0], manifest().sources[0]],
      }),
    ).toThrow(/Duplicate source key/);
    expect(() =>
      parseWebAcquisitionCampaignManifest({
        ...manifest(),
        sources: [{ ...manifest().sources[0], maxPages: 501 }],
      }),
    ).toThrow(/1\.\.500/);
  });
});

describe("sitemap-first discovery", () => {
  it("walks sitemap indexes, filters paths, canonicalizes and deduplicates", async () => {
    const fetchImpl = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/robots.txt")) {
        return new Response("Sitemap: https://example.com/sitemap.xml\n", { status: 200 });
      }
      if (url.endsWith("/sitemap.xml")) {
        return new Response(
          "<sitemapindex><sitemap><loc>https://example.com/sitemap-a.xml</loc></sitemap></sitemapindex>",
          { status: 200 },
        );
      }
      if (url.endsWith("/sitemap-a.xml")) {
        return new Response(
          "<urlset><url><loc>https://example.com/trademarks/apply?utm_source=x</loc></url>" +
            "<url><loc>https://example.com/trademarks/apply</loc></url>" +
            "<url><loc>https://example.com/privacy</loc></url></urlset>",
          { status: 200 },
        );
      }
      throw new Error(`unexpected ${url}`);
    }) as typeof fetch;

    const inventory = await discoverWebAcquisitionInventory(manifest().sources[0]!, fetchImpl);
    expect(inventory.modeUsed).toBe("SITEMAP");
    expect(inventory.selectedUrls).toEqual(["https://example.com/trademarks/apply"]);
    expect(inventory.eligibleCount).toBe(1);
    expect(inventory.duplicateCount).toBe(1);
    expect(inventory.excludedCount).toBe(1);
  });
  it("falls back to bounded link crawl when sitemap evidence is unavailable or irrelevant", async () => {
    const source = {
      ...manifest().sources[0]!,
      baseUrl: "https://example.com/trademarks",
      discovery: { mode: "SITEMAP" as const, maxSitemaps: 5 },
      includePatterns: ["https://example.com/trademarks*"],
    };
    const fetchImpl = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/robots.txt")) {
        return new Response("Sitemap: https://example.com/sitemap.xml\n", { status: 200 });
      }
      if (url.endsWith("/sitemap.xml")) {
        return new Response(
          "<urlset><url><loc>https://example.com/patents/one</loc></url></urlset>",
          { status: 200 },
        );
      }
      throw new Error(`unexpected ${url}`);
    }) as typeof fetch;

    const inventory = await discoverWebAcquisitionInventory(source, fetchImpl);
    expect(inventory.modeUsed).toBe("LINK_CRAWL");
    expect(inventory.selectedUrls).toEqual(["https://example.com/trademarks"]);
    expect(inventory.errors).toContain("sitemap-approved-empty:fallback-link-crawl");
  });
});

type ControlPlaneCall = {
  url: string;
  method: string;
  body: unknown;
  headers: Record<string, string>;
};

function controlPlaneFetch(calls: ControlPlaneCall[]): typeof fetch {
  return (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input);
    const method = (init.method ?? "GET").toUpperCase();
    const body = typeof init.body === "string" ? JSON.parse(init.body) : null;
    const headers = Object.fromEntries(new Headers(init.headers).entries());
    calls.push({ url, method, body, headers });

    if (url.endsWith("/api/admin-session")) {
      return Response.json({
        authenticated: true,
        csrfToken: "csrf-test",
        workspaces: [{ workspaceId, name: "Test", role: "WORKSPACE_ADMIN" }],
      });
    }
    if (url === "https://peer.example/robots.txt") {
      return new Response("Sitemap: https://peer.example/sitemap.xml\n", { status: 200 });
    }
    if (url === "https://peer.example/sitemap.xml") {
      return new Response(
        "<urlset><url><loc>https://peer.example/insights/trademark-one</loc></url></urlset>",
        { status: 200 },
      );
    }
    if (url.includes("/api/connectors/crawl4ai-web/1.3.0")) return Response.json({});
    if (url.includes("/api/converters?") && method === "GET") {
      return Response.json({
        items: [{ manifest: { converterId: "builtin-markdown-staging", version: "1.0.0" } }],
      });
    }
    if (url.includes("/api/sources?") && method === "GET") return Response.json({ items: [] });
    if (url.endsWith("/api/sources") && method === "POST") {
      return Response.json({ source: { id: "src_TEST0000000000000000000001" } }, { status: 201 });
    }
    if (url.includes("/api/plans?") && method === "GET") return Response.json({ items: [] });
    if (url.endsWith("/api/plans") && method === "POST") {
      const refresh = typeof body?.name === "string" && body.name.includes(" Refresh — ");
      return Response.json(
        {
          plan: {
            plan: {
              id: refresh ? "pln_TEST0000000000000000000002" : "pln_TEST0000000000000000000001",
            },
          },
        },
        { status: 201 },
      );
    }
    if (url.includes("/api/conversion-profiles?") && method === "GET") {
      return Response.json({ items: [] });
    }
    if (url.endsWith("/api/conversion-profiles") && method === "POST") {
      return Response.json({ profile: { id: "cvp_TEST0000000000000000000001" } }, { status: 201 });
    }
    if (url.includes("/api/workers?label=") && method === "GET")
      return Response.json({ items: [] });
    if (url.endsWith("/api/workers") && method === "POST") {
      return Response.json(
        {
          view: { worker: { id: "wrk_TEST0000000000000000000001", maxConcurrency: 2 } },
          credential: "credential-once",
        },
        { status: 201 },
      );
    }
    if (url.includes("/api/conversion-runtime/capabilities?") && method === "GET") {
      return Response.json({ items: [] });
    }
    if (url.endsWith("/api/conversion-runtime/capabilities") && method === "POST") {
      return Response.json({ record: {} }, { status: 201 });
    }
    if (url.endsWith("/api/runs") && method === "POST") {
      return Response.json(
        { record: { run: { id: "run_TEST0000000000000000000001" } } },
        { status: 201 },
      );
    }
    throw new Error(`unexpected ${method} ${url}`);
  }) as typeof fetch;
}

describe("bulk campaign orchestration", () => {
  it("creates governed peer Source/Plan, auto-conversion profile and dispatches one run", async () => {
    const calls: ControlPlaneCall[] = [];
    const peerManifest = manifest({
      sources: [
        {
          key: "peer",
          name: "Peer IP Firm",
          sourceClass: "PEER_PROFESSIONAL",
          jurisdictions: ["GLOBAL"],
          languages: ["en"],
          baseUrl: "https://peer.example/insights",
          discovery: { mode: "SITEMAP", maxSitemaps: 3 },
          includePatterns: ["https://peer.example/insights*"],
          excludePatterns: [],
          maxPages: 5,
          maxDepth: 1,
          rateLimitPerMinute: 20,
          renderJavascript: false,
        },
      ],
    });

    const result = await runWebAcquisitionCampaign(peerManifest, {
      controlPlaneUrl: "http://control.test",
      dispatch: true,
      runKey: "acceptance-1",
      fetchImpl: controlPlaneFetch(calls),
    });

    expect(result.sources[0]).toMatchObject({
      sourceKey: "peer",
      sourceId: "src_TEST0000000000000000000001",
      planId: "pln_TEST0000000000000000000001",
      refreshPlanId: "pln_TEST0000000000000000000002",
      runId: "run_TEST0000000000000000000001",
      conversionProfileId: "cvp_TEST0000000000000000000001",
    });
    expect(result.workerCredential).toBe("credential-once");
    expect(result.recommendedWorkerProcesses).toBe(2);

    const sourcePost = calls.find(
      (call) => call.method === "POST" && call.url.endsWith("/api/sources"),
    );
    expect(sourcePost?.body).toMatchObject({
      category: "LAW_FIRM",
      authorityLevel: "PROFESSIONAL",
      extensions: {
        "x-markorbit-discovered-count": 1,
        "x-markorbit-excluded-count": 0,
        "x-markorbit-duplicate-count": 0,
        "x-markorbit-inventory-error-count": 0,
        "x-markorbit-batch-count": 1,
        "x-markorbit-batch-sha256": expect.stringMatching(/^[a-f0-9]{64}$/u),
      },
    });
    const planPosts = calls.filter(
      (call) => call.method === "POST" && call.url.endsWith("/api/plans"),
    );
    expect(planPosts).toHaveLength(2);
    const initialPlanPost = planPosts.find((call) =>
      JSON.stringify(call.body).includes('"x-markorbit-plan-role":"INITIAL_COLLECTION"'),
    );
    const refreshPlanPost = planPosts.find((call) =>
      JSON.stringify(call.body).includes('"x-markorbit-plan-role":"REFRESH_WATCH"'),
    );
    expect(initialPlanPost?.body).toMatchObject({
      schedule: { mode: "MANUAL" },
      output: { artifactKinds: ["MARKDOWN"] },
    });
    expect(refreshPlanPost?.body).toMatchObject({
      schedule: { mode: "CHANGE_WATCH", pollIntervalSeconds: 604_800 },
      policy: { maxDepth: 0, maxItems: 1 },
      output: { artifactKinds: ["MARKDOWN"] },
    });
    const workerPost = calls.find(
      (call) => call.method === "POST" && call.url.endsWith("/api/workers"),
    );
    expect(workerPost?.body).toMatchObject({
      supportedJobTypes: ["WEB_CRAWL", "PAGE_UPDATE_CHECK"],
      connectorBindings: [
        {
          connectorId: "crawl4ai-web",
          version: "1.3.0",
          capabilities: expect.arrayContaining(["COLLECT", "CHECK_UPDATE"]),
        },
      ],
    });
    const profilePost = calls.find(
      (call) => call.method === "POST" && call.url.endsWith("/api/conversion-profiles"),
    );
    expect(profilePost?.body).toMatchObject({ autoConvert: true, outputFormat: "MARKDOWN" });
    const runPost = calls.find((call) => call.method === "POST" && call.url.endsWith("/api/runs"));
    expect(runPost?.body).toEqual({ planId: "pln_TEST0000000000000000000001" });
    expect(runPost?.headers["idempotency-key"]).toMatch(
      /^bulk-web:test-wave:peer:acceptance-1:[a-f0-9]{16}$/u,
    );
  });

  it("re-crawls governed link-crawl coverage while keeping sitemap refreshes depth-zero", async () => {
    const calls: ControlPlaneCall[] = [];
    const linkManifest = manifest({
      sources: [
        {
          ...manifest().sources[0]!,
          discovery: { mode: "LINK_CRAWL" },
          maxPages: 7,
          maxDepth: 3,
        },
      ],
    });

    const result = await runWebAcquisitionCampaign(linkManifest, {
      controlPlaneUrl: "http://control.test",
      dispatch: false,
      fetchImpl: controlPlaneFetch(calls),
    });

    expect(result.sources[0]?.inventory.modeUsed).toBe("LINK_CRAWL");
    const refreshPlanPost = calls
      .filter((call) => call.method === "POST" && call.url.endsWith("/api/plans"))
      .find((call) =>
        JSON.stringify(call.body).includes('"x-markorbit-plan-role":"REFRESH_WATCH"'),
      );
    expect(refreshPlanPost?.body).toMatchObject({
      policy: { maxDepth: 3, maxItems: 7, fetchAttachments: false },
    });
  });
});

// Keep high-value structural pages ahead of deep archive/release URLs when a sitemap
// contains more approved pages than the bounded campaign budget.
describe("bounded sitemap ordering", () => {
  it("prioritizes shallower paths before lexical archive order", async () => {
    const source = { ...manifest().sources[0]!, maxPages: 2 };
    const fetchImpl = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/robots.txt")) {
        return new Response("Sitemap: https://example.com/sitemap.xml\n", { status: 200 });
      }
      if (url.endsWith("/sitemap.xml")) {
        return new Response(
          "<urlset>" +
            "<url><loc>https://example.com/trademarks/archive/2020/release</loc></url>" +
            "<url><loc>https://example.com/trademarks/apply</loc></url>" +
            "<url><loc>https://example.com/trademarks</loc></url>" +
            "</urlset>",
          { status: 200 },
        );
      }
      throw new Error(`unexpected ${url}`);
    }) as typeof fetch;

    const inventory = await discoverWebAcquisitionInventory(source, fetchImpl);
    expect(inventory.selectedUrls).toEqual([
      "https://example.com/trademarks",
      "https://example.com/trademarks/apply",
    ]);
    expect(inventory.eligibleCount).toBe(3);
  });
});

describe("catalog batch exhaustion", () => {
  it("does not fall back to the first discovery batch after the durable catalog is exhausted", () => {
    const discoveredFirstBatch = [
      "https://example.com/trademarks/a",
      "https://example.com/trademarks/b",
    ];
    expect(selectWebAcquisitionBatch(discoveredFirstBatch, [])).toEqual([]);
    expect(selectWebAcquisitionBatch(discoveredFirstBatch, null)).toEqual(discoveredFirstBatch);
  });
});

describe("durable sitemap inventory vs batch budget", () => {
  it("keeps the full eligible inventory while selecting only one bounded batch", async () => {
    const source = { ...manifest().sources[0]!, maxPages: 2 };
    const fetchImpl = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/robots.txt")) {
        return new Response("Sitemap: https://example.com/sitemap.xml\n", { status: 200 });
      }
      if (url.endsWith("/sitemap.xml")) {
        return new Response(
          "<urlset>" +
            "<url><loc>https://example.com/trademarks/a</loc></url>" +
            "<url><loc>https://example.com/trademarks/b</loc></url>" +
            "<url><loc>https://example.com/trademarks/c</loc></url>" +
            "</urlset>",
          { status: 200 },
        );
      }
      throw new Error(`unexpected ${url}`);
    }) as typeof fetch;

    const inventory = await discoverWebAcquisitionInventory(source, fetchImpl);
    expect(inventory.eligibleCount).toBe(3);
    expect(inventory.selectedUrls).toHaveLength(2);
  });
});

describe("governed sitemap boundaries", () => {
  it("does not fetch cross-host sitemap locations unless the host is explicitly allowed", async () => {
    const source = manifest().sources[0]!;
    const requested: string[] = [];
    const fetchImpl = (async (input: RequestInfo | URL) => {
      const url = String(input);
      requested.push(url);
      if (url.endsWith("/robots.txt")) {
        return new Response("Sitemap: https://other.example/sitemap.xml\n", { status: 200 });
      }
      throw new Error(`unexpected ${url}`);
    }) as typeof fetch;

    const inventory = await discoverWebAcquisitionInventory(source, fetchImpl);
    expect(inventory.modeUsed).toBe("LINK_CRAWL");
    expect(requested).not.toContain("https://other.example/sitemap.xml");
    expect(inventory.errors).toContain(
      "sitemap-host-not-allowed:https://other.example/sitemap.xml",
    );
  });
});

describe("Admin browser-authenticated campaign writes", () => {
  it("sends workspace, CSRF, trusted origin and session cookie on registry mutations", async () => {
    process.env.MARKORBIT_ADMIN_SESSION_TOKEN = "session-test";
    const calls: ControlPlaneCall[] = [];
    const authenticated = manifest({
      sources: [
        {
          ...manifest().sources[0]!,
          baseUrl: "https://peer.example/insights",
          includePatterns: ["https://peer.example/insights*"],
        },
      ],
    });

    await runWebAcquisitionCampaign(authenticated, {
      controlPlaneUrl: "http://control.test",
      dispatch: false,
      fetchImpl: controlPlaneFetch(calls),
    });

    const mutation = calls.find(
      (call) => call.method === "POST" && call.url.endsWith("/api/sources"),
    );
    expect(mutation?.headers).toMatchObject({
      cookie: "mo_session=session-test",
      origin: "http://control.test",
      "x-markorbit-csrf-token": "csrf-test",
      "x-markorbit-workspace-id": workspaceId,
    });
  });
});

describe("repeat campaign inventory refresh", () => {
  it("revises the stable Source and Plan instead of duplicating them when sitemap inventory changes", async () => {
    const calls: ControlPlaneCall[] = [];
    const fetchImpl = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const url = String(input);
      const method = (init.method ?? "GET").toUpperCase();
      const body = typeof init.body === "string" ? JSON.parse(init.body) : null;
      calls.push({
        url,
        method,
        body,
        headers: Object.fromEntries(new Headers(init.headers).entries()),
      });
      if (url === "https://example.com/robots.txt") {
        return new Response("Sitemap: https://example.com/sitemap.xml\n", { status: 200 });
      }
      if (url === "https://example.com/sitemap.xml") {
        return new Response(
          "<urlset><url><loc>https://example.com/trademarks/new-guide</loc></url></urlset>",
          { status: 200 },
        );
      }
      if (url.includes("/api/connectors/crawl4ai-web/1.3.0")) return Response.json({});
      if (url.includes("/api/converters?") && method === "GET") {
        return Response.json({
          items: [{ manifest: { converterId: "builtin-markdown-staging", version: "1.0.0" } }],
        });
      }
      if (url.includes("/api/sources?") && method === "GET") {
        return Response.json({
          items: [
            {
              id: "src_TEST0000000000000000000001",
              slug: "campaign-test-wave-example",
              canonicalUri: "https://example.com/trademarks",
              category: "OFFICIAL_AUTHORITY",
              authorityLevel: "PRIMARY_OFFICIAL",
              connector: { connectorId: "crawl4ai-web", version: "1.2.0" },
              updatedAt: "2026-09-08T00:00:00.000Z",
              extensions: {
                "x-markorbit-campaign-id": "test-wave",
                "x-markorbit-campaign-source-key": "example",
                "x-markorbit-source-class": "OFFICIAL_AUTHORITY",
                "x-markorbit-inventory-sha256": "old-inventory",
              },
            },
          ],
        });
      }
      if (url.endsWith("/api/sources/src_TEST0000000000000000000001") && method === "PATCH") {
        return Response.json({ source: { id: "src_TEST0000000000000000000001" } });
      }
      if (url.includes("/api/plans?") && method === "GET") {
        return Response.json({
          items: [
            {
              plan: {
                id: "pln_TEST0000000000000000000001",
                name: "Bulk Web test-wave — example",
                updatedAt: "2026-09-08T00:00:00.000Z",
                extensions: { "x-markorbit-inventory-sha256": "old-inventory" },
              },
            },
            {
              plan: {
                id: "pln_TEST0000000000000000000002",
                name: "Bulk Web test-wave Refresh — example",
                updatedAt: "2026-09-08T00:00:00.000Z",
                schedule: { mode: "CHANGE_WATCH", pollIntervalSeconds: 172_800 },
                extensions: {
                  "x-markorbit-inventory-sha256": "old-inventory",
                  "x-markorbit-refresh-interval-seconds": 86_400,
                  "x-markorbit-adaptive-refresh-cadence": true,
                  "x-markorbit-adaptive-cadence-current-seconds": 172_800,
                },
              },
            },
          ],
        });
      }
      if (url.endsWith("/api/plans/pln_TEST0000000000000000000001") && method === "PATCH") {
        return Response.json({ plan: { plan: { id: "pln_TEST0000000000000000000001" } } });
      }
      if (url.endsWith("/api/plans/pln_TEST0000000000000000000002") && method === "PATCH") {
        return Response.json({ plan: { plan: { id: "pln_TEST0000000000000000000002" } } });
      }
      if (url.includes("/api/conversion-profiles?") && method === "GET") {
        return Response.json({
          items: [
            {
              id: "cvp_TEST0000000000000000000001",
              name: "Bulk Web test-wave Markdown Auto — example",
              autoConvert: true,
            },
          ],
        });
      }
      if (url.includes("/api/workers?label=") && method === "GET") {
        return Response.json({
          items: [
            {
              worker: {
                id: "wrk_TEST0000000000000000000001",
                updatedAt: "2026-09-08T00:00:00.000Z",
                maxConcurrency: 1,
                supportedJobTypes: ["WEB_CRAWL"],
                connectorBindings: [
                  {
                    connectorId: "crawl4ai-web",
                    version: "1.2.0",
                    capabilities: ["COLLECT", "DEEP_CRAWL"],
                  },
                ],
              },
            },
          ],
        });
      }
      if (url.endsWith("/api/workers/wrk_TEST0000000000000000000001") && method === "PATCH") {
        return Response.json({ view: { worker: { id: "wrk_TEST0000000000000000000001" } } });
      }
      throw new Error(`unexpected ${method} ${url}`);
    }) as typeof fetch;

    const result = await runWebAcquisitionCampaign(
      manifest({
        sources: [{ ...manifest().sources[0]!, adaptiveRefreshCadence: true }],
      }),
      {
        controlPlaneUrl: "http://control.test",
        dispatch: false,
        fetchImpl,
      },
    );

    expect(result.sources[0]?.sourceId).toBe("src_TEST0000000000000000000001");
    expect(result.sources[0]?.planId).toBe("pln_TEST0000000000000000000001");
    expect(result.sources[0]?.refreshPlanId).toBe("pln_TEST0000000000000000000002");
    expect(calls.some((call) => call.method === "POST" && call.url.endsWith("/api/sources"))).toBe(
      false,
    );
    expect(calls.some((call) => call.method === "POST" && call.url.endsWith("/api/plans"))).toBe(
      false,
    );
    const sourcePatch = calls.find(
      (call) => call.method === "PATCH" && call.url.includes("/api/sources/"),
    );
    expect(sourcePatch?.body).toMatchObject({
      expectedUpdatedAt: "2026-09-08T00:00:00.000Z",
      connector: { connectorId: "crawl4ai-web", version: "1.3.0" },
      entrypoints: [{ uri: "https://example.com/trademarks/new-guide" }],
      extensions: {
        "x-markorbit-source-config-sha256": expect.any(String),
        "x-markorbit-discovered-count": 1,
        "x-markorbit-excluded-count": 0,
        "x-markorbit-duplicate-count": 0,
        "x-markorbit-inventory-error-count": 0,
      },
    });
    const planPatches = calls.filter(
      (call) => call.method === "PATCH" && call.url.includes("/api/plans/"),
    );
    expect(planPatches).toHaveLength(2);
    const initialPatch = planPatches.find((call) => call.url.endsWith("0000000001"));
    const refreshPatch = planPatches.find((call) => call.url.endsWith("0000000002"));
    expect(initialPatch?.body).toMatchObject({
      expectedUpdatedAt: "2026-09-08T00:00:00.000Z",
      schedule: { mode: "MANUAL" },
      policy: { maxItems: 1, maxDepth: 0 },
      output: { artifactKinds: ["MARKDOWN"] },
      extensions: {
        "x-markorbit-plan-role": "INITIAL_COLLECTION",
        "x-markorbit-plan-policy-sha256": expect.any(String),
        "x-markorbit-plan-output-sha256": expect.any(String),
      },
    });
    expect(refreshPatch?.body).toMatchObject({
      schedule: { mode: "CHANGE_WATCH", pollIntervalSeconds: 172_800 },
      policy: { maxItems: 1, maxDepth: 0 },
      extensions: {
        "x-markorbit-plan-role": "REFRESH_WATCH",
        "x-markorbit-refresh-interval-seconds": 86_400,
        "x-markorbit-adaptive-refresh-cadence": true,
      },
    });
    const workerPatch = calls.find(
      (call) => call.method === "PATCH" && call.url.includes("/api/workers/"),
    );
    expect(workerPatch?.body).toMatchObject({
      expectedUpdatedAt: "2026-09-08T00:00:00.000Z",
      supportedJobTypes: ["WEB_CRAWL", "PAGE_UPDATE_CHECK"],
      connectorBindings: [
        {
          connectorId: "crawl4ai-web",
          version: "1.3.0",
          capabilities: expect.arrayContaining(["COLLECT", "CHECK_UPDATE"]),
        },
      ],
    });
  });
});
