import { describe, expect, it } from "vitest";
import type { CoverageTarget } from "../src/source-coverage-bootstrap";
import {
  foundationalSupplyPlanName,
  prepareUsFoundationalSupply,
  supplyPlanCreatePayload,
} from "../src/source-coverage-operations";

function target(
  id: string,
  family: string,
  canonicalUri: string,
  options: {
    renderJavascript?: boolean;
    fetchAttachments?: boolean;
    expectedArtifactKinds?: string[];
  } = {},
): CoverageTarget {
  return {
    id,
    jurisdiction: "US",
    authorityName: "United States Patent and Trademark Office",
    authorityBasis: "EXPLICIT_CURATED",
    family,
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
      renderJavascriptHint: options.renderJavascript ?? false,
      fetchAttachmentsHint: options.fetchAttachments ?? false,
      expectedArtifactKinds: options.expectedArtifactKinds ?? ["HTML", "MARKDOWN"],
    },
    protocolVersion: "1.0",
  };
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Expected object");
  }
  return value as Record<string, unknown>;
}

describe("US foundational source supply operations", () => {
  it("builds bounded deep-crawl plans for official manuals", () => {
    const payload = supplyPlanCreatePayload(
      target(
        "us-uspto-tmep-current",
        "EXAMINATION_MANUAL",
        "https://tmep.uspto.gov/RDMS/TMEP/current",
      ),
      "src_01ARZ3NDEKTSV4RRFFQ69G5FAA",
    );
    expect(payload.name).toBe(foundationalSupplyPlanName("us-uspto-tmep-current"));
    expect(payload.schedule).toEqual({ mode: "MANUAL" });
    expect(payload.output).toEqual({ artifactKinds: ["HTML", "MARKDOWN"] });
    expect(payload.policy).toMatchObject({
      maxDepth: 2,
      maxItems: 120,
      fetchAttachments: false,
      respectRobots: true,
      rateLimitPerMinute: 12,
    });
    expect(record(payload.extensions)["x-markorbit-collection-authorization"]).toBe(false);
  });

  it("authorizes only curated attachment kinds when the target requests attachment capture", () => {
    const payload = supplyPlanCreatePayload(
      target("us-uspto-tsdr", "STATUS_AND_DOCUMENTS", "https://tsdr.uspto.gov/", {
        renderJavascript: true,
        fetchAttachments: true,
        expectedArtifactKinds: ["HTML", "MARKDOWN", "PDF", "IMAGE", "JSON"],
      }),
      "src_01ARZ3NDEKTSV4RRFFQ69G5FAA",
    );
    expect(payload.output).toEqual({
      artifactKinds: ["HTML", "MARKDOWN", "PDF", "IMAGE", "JSON"],
    });
    expect(payload.policy).toMatchObject({
      maxDepth: 0,
      maxItems: 10,
      renderJavascript: true,
      fetchAttachments: true,
    });
  });

  it("prepares every registered foundational source and dispatches only explicitly selected targets", async () => {
    const first = target("us-uspto-trademarks-root", "PORTAL", "https://www.uspto.gov/trademarks");
    const second = target(
      "us-uspto-trademark-fees",
      "FEES",
      "https://www.uspto.gov/trademarks/trademark-fee-information",
    );
    const targets = [first, second];
    const plansBySource = new Map<string, Array<Record<string, unknown>>>([
      [
        "src_01ARZ3NDEKTSV4RRFFQ69G5FAA",
        [
          {
            id: "pln_01ARZ3NDEKTSV4RRFFQ69G5FAA",
            name: foundationalSupplyPlanName(first.id),
            status: "ACTIVE",
            schedule: { mode: "MANUAL" },
          },
        ],
      ],
      ["src_01ARZ3NDEKTSV4RRFFQ69G5FAB", []],
    ]);
    const createdPlans: string[] = [];
    const dispatched: string[] = [];

    const fetchImpl: typeof fetch = async (input, init) => {
      const url = new URL(typeof input === "string" ? input : input.toString());
      const method = init?.method ?? "GET";
      if (url.pathname === "/api/source-coverage" && method === "GET") {
        return Response.json({
          targets,
          registration: [
            {
              targetId: first.id,
              state: "REGISTERED",
              sourceIds: ["src_01ARZ3NDEKTSV4RRFFQ69G5FAA"],
            },
            {
              targetId: second.id,
              state: "REGISTERED",
              sourceIds: ["src_01ARZ3NDEKTSV4RRFFQ69G5FAB"],
            },
          ],
        });
      }
      if (url.pathname === "/api/plans" && method === "GET") {
        const sourceId = url.searchParams.get("sourceId") ?? "";
        return Response.json({
          items: (plansBySource.get(sourceId) ?? []).map((plan) => ({ plan })),
        });
      }
      if (url.pathname === "/api/plans" && method === "POST") {
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        const sourceId = String(body.sourceId);
        const plan = {
          id: "pln_01ARZ3NDEKTSV4RRFFQ69G5FAB",
          name: String(body.name),
          status: "ACTIVE",
          schedule: { mode: "MANUAL" },
        };
        createdPlans.push(String(body.name));
        plansBySource.set(sourceId, [plan]);
        return Response.json({ plan: { plan } }, { status: 201 });
      }
      if (url.pathname === "/api/runs" && method === "POST") {
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        dispatched.push(String(body.planId));
        return Response.json({
          record: { run: { id: "run_01ARZ3NDEKTSV4RRFFQ69G5FAA" } },
        });
      }
      throw new Error(`Unexpected request ${method} ${url.pathname}`);
    };

    const result = await prepareUsFoundationalSupply({
      baseUrl: "http://127.0.0.1:3000",
      workspaceId: "wsp_01ARZ3NDEKTSV4RRFFQ69G5FAV",
      dispatchTargetIds: [second.id],
      fetchImpl,
    });

    expect(result.preparedPlanCount).toBe(2);
    expect(result.plans.map((plan) => [plan.targetId, plan.state])).toEqual([
      [first.id, "REUSED"],
      [second.id, "CREATED"],
    ]);
    expect(createdPlans).toEqual([foundationalSupplyPlanName(second.id)]);
    expect(dispatched).toEqual(["pln_01ARZ3NDEKTSV4RRFFQ69G5FAB"]);
    expect(result.runs).toEqual([
      {
        targetId: second.id,
        sourceId: "src_01ARZ3NDEKTSV4RRFFQ69G5FAB",
        planId: "pln_01ARZ3NDEKTSV4RRFFQ69G5FAB",
        runId: "run_01ARZ3NDEKTSV4RRFFQ69G5FAA",
      },
    ]);
    expect(result.collectionAuthorization).toBe("EXPLICIT_TARGET_MANUAL_RUNS_DISPATCHED");
  });

  it("keeps dynamic JSON endpoints visible as a known supply gap instead of pretending they are captured", async () => {
    const dynamic = target(
      "us-uspto-id-manual",
      "GOODS_SERVICES_ID",
      "https://idm-tmng.uspto.gov/",
      {
        renderJavascript: true,
        fetchAttachments: false,
        expectedArtifactKinds: ["HTML", "JSON"],
      },
    );

    const fetchImpl: typeof fetch = async (input, init) => {
      const url = new URL(typeof input === "string" ? input : input.toString());
      const method = init?.method ?? "GET";
      if (url.pathname === "/api/source-coverage" && method === "GET") {
        return Response.json({
          targets: [dynamic],
          registration: [
            {
              targetId: dynamic.id,
              state: "REGISTERED",
              sourceIds: ["src_01ARZ3NDEKTSV4RRFFQ69G5FAA"],
            },
          ],
        });
      }
      if (url.pathname === "/api/plans" && method === "GET") return Response.json({ items: [] });
      if (url.pathname === "/api/plans" && method === "POST") {
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return Response.json({
          plan: {
            plan: {
              id: "pln_01ARZ3NDEKTSV4RRFFQ69G5FAA",
              name: String(body.name),
              status: "ACTIVE",
              schedule: { mode: "MANUAL" },
            },
          },
        });
      }
      throw new Error(`Unexpected request ${method} ${url.pathname}`);
    };

    const result = await prepareUsFoundationalSupply({
      baseUrl: "http://127.0.0.1:3000",
      workspaceId: "wsp_01ARZ3NDEKTSV4RRFFQ69G5FAV",
      fetchImpl,
    });
    expect(result.capabilityGaps).toEqual([
      {
        targetId: dynamic.id,
        code: "STRUCTURED_ENDPOINT_NOT_CAPTURED",
        expectedArtifactKinds: ["JSON"],
      },
    ]);
    expect(result.runs).toEqual([]);
    expect(result.collectionAuthorization).toBe("NONE");
  });
});
