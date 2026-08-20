import { describe, expect, it } from "vitest";
import type { CoverageTarget } from "../src/source-coverage-bootstrap";
import {
  foundationalApiPlanPayload,
  foundationalApiSourcePayload,
} from "../src/source-coverage-api-remediation";
import { prepareFoundationalApiRemediationWithDriftGuard } from "../src/source-coverage-api-remediation-drift-guard";

const workspaceId = "wsp_01ARZ3NDEKTSV4RRFFQ69G5FAV";
const binding = {
  targetId: "us-uspto-id-manual",
  endpointBinding: "uspto-id-manual",
  resourcePath: "/api/search",
  query: { q: "shoes" },
};

function target(): CoverageTarget {
  return {
    id: "us-uspto-id-manual",
    jurisdiction: "US",
    authorityName: "United States Patent and Trademark Office",
    authorityBasis: "EXPLICIT_CURATED",
    family: "GOODS_SERVICES_ID",
    displayName: "USPTO ID Manual",
    canonicalUri: "https://idm-tmng.uspto.gov/",
    entrypoints: [{ uri: "https://idm-tmng.uspto.gov/", label: "ID Manual" }],
    sourceType: "WEB",
    category: "OFFICIAL_AUTHORITY",
    authorityLevel: "PRIMARY_OFFICIAL",
    languages: ["en-US"],
    coverageTier: "FOUNDATIONAL",
    catalogState: "ACTIVE",
    acquisition: {
      mode: "MIXED",
      renderJavascriptHint: true,
      fetchAttachmentsHint: false,
      expectedArtifactKinds: ["HTML", "JSON"],
    },
    protocolVersion: "1.0",
  };
}

function expectedSource() {
  return foundationalApiSourcePayload(target(), workspaceId, binding);
}

function sourceRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: "src_api_1",
    ...expectedSource(),
    ...overrides,
  };
}

describe("foundational API remediation drift guard", () => {
  it("rejects existing Source configuration drift before any mutation", async () => {
    const requests: string[] = [];
    const source = sourceRecord({
      connectorConfig: {
        ...(expectedSource().connectorConfig as Record<string, unknown>),
        resourcePath: "/api/old-search",
      },
    });
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = new URL(typeof input === "string" ? input : input.toString());
      const method = init?.method ?? "GET";
      requests.push(`${method} ${url.pathname}`);
      if (method === "GET" && url.pathname === "/api/source-coverage") {
        return Response.json({ targets: [target()] });
      }
      if (method === "GET" && url.pathname === "/api/sources") {
        return Response.json({ items: [source] });
      }
      throw new Error(`Unexpected request ${method} ${url.pathname}`);
    };

    await expect(
      prepareFoundationalApiRemediationWithDriftGuard({
        baseUrl: "http://127.0.0.1:3000",
        workspaceId,
        jurisdiction: "US",
        bindings: [binding],
        apply: true,
        fetchImpl,
      }),
    ).rejects.toThrow("Source configuration drift");
    expect(requests).toEqual(["GET /api/source-coverage", "GET /api/sources"]);
    expect(requests.some((request) => request.startsWith("POST "))).toBe(false);
  });

  it("rejects existing Plan output drift before any mutation", async () => {
    const requests: string[] = [];
    const source = sourceRecord();
    const plan = {
      id: "pln_api_1",
      ...foundationalApiPlanPayload(target(), "src_api_1"),
      output: { artifactKinds: ["XML"] },
    };
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = new URL(typeof input === "string" ? input : input.toString());
      const method = init?.method ?? "GET";
      requests.push(`${method} ${url.pathname}`);
      if (method === "GET" && url.pathname === "/api/source-coverage") {
        return Response.json({ targets: [target()] });
      }
      if (method === "GET" && url.pathname === "/api/sources") {
        return Response.json({ items: [source] });
      }
      if (method === "GET" && url.pathname === "/api/plans") {
        return Response.json({ items: [{ plan }] });
      }
      throw new Error(`Unexpected request ${method} ${url.pathname}`);
    };

    await expect(
      prepareFoundationalApiRemediationWithDriftGuard({
        baseUrl: "http://127.0.0.1:3000",
        workspaceId,
        jurisdiction: "US",
        bindings: [binding],
        apply: true,
        fetchImpl,
      }),
    ).rejects.toThrow("Plan configuration drift");
    expect(requests).toEqual([
      "GET /api/source-coverage",
      "GET /api/sources",
      "GET /api/plans",
    ]);
    expect(requests.some((request) => request.startsWith("POST "))).toBe(false);
  });
});
