import { describe, expect, it } from "vitest";
import { runWebAcquisitionCampaign } from "../src/web-acquisition-campaign";
import { buildOfficialScaleCampaignManifest } from "../src/web-acquisition-official-scale-campaign";

const WORKSPACE = "wsp_01ARZ3NDEKTSV4RRFFQ69G5FAV";

type Counters = {
  sources: number;
  plans: number;
  profiles: number;
  runs: number;
  activeSourceCreates: number;
  maxSourceCreates: number;
};

function scaleControlPlaneFetch(counters: Counters): typeof fetch {
  return (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input);
    const method = (init.method ?? "GET").toUpperCase();

    if (url.includes("/api/connectors/crawl4ai-web/1.3.0")) return Response.json({});
    if (url.includes("/api/converters?") && method === "GET") {
      return Response.json({
        items: [{ manifest: { converterId: "builtin-markdown-staging", version: "1.0.0" } }],
      });
    }
    if (url.includes("/api/sources?") && method === "GET") return Response.json({ items: [] });
    if (url.endsWith("/api/sources") && method === "POST") {
      counters.activeSourceCreates += 1;
      counters.maxSourceCreates = Math.max(counters.maxSourceCreates, counters.activeSourceCreates);
      await new Promise((resolve) => setTimeout(resolve, 2));
      counters.sources += 1;
      counters.activeSourceCreates -= 1;
      return Response.json({ source: { id: `src_scale_${counters.sources}` } }, { status: 201 });
    }
    if (url.includes("/api/plans?") && method === "GET") return Response.json({ items: [] });
    if (url.endsWith("/api/plans") && method === "POST") {
      counters.plans += 1;
      return Response.json(
        { plan: { plan: { id: `pln_scale_${counters.plans}` } } },
        { status: 201 },
      );
    }
    if (url.includes("/api/conversion-profiles?") && method === "GET") {
      return Response.json({ items: [] });
    }
    if (url.endsWith("/api/conversion-profiles") && method === "POST") {
      counters.profiles += 1;
      return Response.json({ profile: { id: `cvp_scale_${counters.profiles}` } }, { status: 201 });
    }
    if (url.includes("/api/workers?label=") && method === "GET") {
      return Response.json({ items: [] });
    }
    if (url.endsWith("/api/workers") && method === "POST") {
      return Response.json(
        {
          view: { worker: { id: "wrk_scale", maxConcurrency: 8 } },
          credential: "scale-credential",
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
      counters.runs += 1;
      return Response.json(
        { record: { run: { id: `run_scale_${counters.runs}` } } },
        { status: 201 },
      );
    }
    throw new Error(`unexpected ${method} ${url}`);
  }) as typeof fetch;
}

describe("official 60-domain orchestration", () => {
  it("bootstraps and dispatches every governed source with bounded concurrency", async () => {
    const counters: Counters = {
      sources: 0,
      plans: 0,
      profiles: 0,
      runs: 0,
      activeSourceCreates: 0,
      maxSourceCreates: 0,
    };
    const manifest = buildOfficialScaleCampaignManifest(WORKSPACE);
    const result = await runWebAcquisitionCampaign(manifest, {
      controlPlaneUrl: "http://control.test",
      dispatch: true,
      runKey: "scale-acceptance",
      fetchImpl: scaleControlPlaneFetch(counters),
    });

    expect(result.sources).toHaveLength(60);
    expect(result.sources.every((source) => source.runId !== null)).toBe(true);
    expect(counters).toMatchObject({ sources: 60, plans: 120, profiles: 60, runs: 60 });
    expect(counters.maxSourceCreates).toBeGreaterThan(1);
    expect(counters.maxSourceCreates).toBeLessThanOrEqual(manifest.globalConcurrency);
    expect(result.recommendedWorkerProcesses).toBe(manifest.globalConcurrency);
  });
});
