import { describe, expect, it } from "vitest";
import {
  bootstrapUsFoundationalCoverage,
  parseCoverageTargets,
  sourceCreatePayload,
  sourceSlugForTarget,
  type CoverageTarget,
} from "../src/source-coverage-bootstrap";

const target = (id: string, canonicalUri: string): CoverageTarget => ({
  id,
  jurisdiction: "US",
  authorityName: "United States Patent and Trademark Office",
  authorityBasis: "EXPLICIT_CURATED",
  family: "PORTAL",
  displayName: id,
  canonicalUri,
  entrypoints: [{ uri: canonicalUri, label: id }],
  sourceType: "WEB",
  category: "OFFICIAL_AUTHORITY",
  authorityLevel: "PRIMARY_OFFICIAL",
  languages: ["en-US"],
  coverageTier: "FOUNDATIONAL",
  catalogState: "ACTIVE",
  acquisition: {
    mode: "WEB_CRAWL",
    renderJavascriptHint: false,
    fetchAttachmentsHint: false,
    expectedArtifactKinds: ["HTML", "MARKDOWN"],
  },
  protocolVersion: "1.0",
});

describe("US foundational source coverage bootstrap", () => {
  it("creates deterministic source slugs", () => {
    expect(sourceSlugForTarget("us-uspto-trademarks-root")).toBe(
      "coverage-us-uspto-trademarks-root",
    );
  });

  it("maps a coverage target to an active SourceDefinition payload without collection authority", () => {
    const payload = sourceCreatePayload(
      target("us-uspto-trademark-fees", "https://www.uspto.gov/trademarks/trademark-fee-information"),
      "wsp_01ARZ3NDEKTSV4RRFFQ69G5FAV",
    );
    expect(payload.status).toBe("ACTIVE");
    expect(payload.canonicalUri).toBe(
      "https://www.uspto.gov/trademarks/trademark-fee-information",
    );
    expect(payload.connector).toEqual({ connectorId: "crawl4ai-web", version: "1.2.0" });
    expect(payload.extensions).toMatchObject({
      "x-markorbit-source-coverage-target-id": "us-uspto-trademark-fees",
      "x-markorbit-collection-authorization": false,
    });
  });

  it("validates target shape at the HTTP boundary", () => {
    expect(() => parseCoverageTargets({ targets: [{ id: "broken" }] })).toThrow(
      "Invalid coverage target",
    );
  });

  it("registers only missing targets and remains non-dispatching by default", async () => {
    const targets = [
      target("us-uspto-trademarks-root", "https://www.uspto.gov/trademarks"),
      target("us-uspto-trademark-fees", "https://www.uspto.gov/trademarks/trademark-fee-information"),
    ];
    const createdTargetIds: string[] = [];
    let connectorCreated = false;

    const registrations = () =>
      targets.map((item) => ({
        targetId: item.id,
        state:
          item.id === "us-uspto-trademarks-root" || createdTargetIds.includes(item.id)
            ? "REGISTERED"
            : "UNREGISTERED",
        sourceIds:
          item.id === "us-uspto-trademarks-root"
            ? ["src_01ARZ3NDEKTSV4RRFFQ69G5FAA"]
            : createdTargetIds.includes(item.id)
              ? ["src_01ARZ3NDEKTSV4RRFFQ69G5FAB"]
              : [],
      }));

    const fetchImpl: typeof fetch = async (input, init) => {
      const url = new URL(typeof input === "string" ? input : input.toString());
      const method = init?.method ?? "GET";
      if (url.pathname === "/api/connectors/crawl4ai-web/1.2.0" && method === "GET") {
        return new Response(connectorCreated ? JSON.stringify({}) : JSON.stringify({ error: {} }), {
          status: connectorCreated ? 200 : 404,
          headers: { "content-type": "application/json" },
        });
      }
      if (url.pathname === "/api/connectors" && method === "POST") {
        connectorCreated = true;
        return Response.json({ created: true }, { status: 201 });
      }
      if (url.pathname === "/api/source-coverage" && method === "GET") {
        return Response.json({ targets, registration: registrations() });
      }
      if (url.pathname === "/api/sources" && method === "POST") {
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        const extensions = body.extensions as Record<string, unknown>;
        const targetId = String(extensions["x-markorbit-source-coverage-target-id"]);
        createdTargetIds.push(targetId);
        return Response.json(
          { source: { id: "src_01ARZ3NDEKTSV4RRFFQ69G5FAB" } },
          { status: 201 },
        );
      }
      throw new Error(`Unexpected request ${method} ${url.pathname}`);
    };

    const result = await bootstrapUsFoundationalCoverage({
      baseUrl: "http://127.0.0.1:3000",
      fetchImpl,
    });

    expect(connectorCreated).toBe(true);
    expect(result.targetCount).toBe(2);
    expect(result.created).toEqual([
      {
        targetId: "us-uspto-trademark-fees",
        sourceId: "src_01ARZ3NDEKTSV4RRFFQ69G5FAB",
      },
    ]);
    expect(result.reused).toEqual([
      {
        targetId: "us-uspto-trademarks-root",
        sourceIds: ["src_01ARZ3NDEKTSV4RRFFQ69G5FAA"],
      },
    ]);
    expect(result.runs).toEqual([]);
    expect(result.collectionAuthorization).toBe("NONE");
  });
});
