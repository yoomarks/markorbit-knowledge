import { describe, expect, it } from "vitest";
import type { CoverageTarget } from "../src/source-coverage-bootstrap";
import {
  foundationalApiSourcePayload,
  prepareFoundationalApiRemediation,
} from "../src/source-coverage-api-remediation";

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

describe("foundational API remediation", () => {
  it("builds a logical API Source without persisting endpoint hosts or credentials", () => {
    const payload = foundationalApiSourcePayload(
      target(),
      "wsp_01ARZ3NDEKTSV4RRFFQ69G5FAV",
      {
        targetId: "us-uspto-id-manual",
        endpointBinding: "uspto-id-manual",
        resourcePath: "/api/search",
        query: { q: "shoes" },
      },
    );

    expect(payload).toMatchObject({
      sourceType: "API",
      category: "OFFICIAL_AUTHORITY",
      authorityLevel: "PRIMARY_OFFICIAL",
      connector: { connectorId: "api-worker", version: "1.0.0" },
      connectorConfig: {
        endpointBinding: "uspto-id-manual",
        resourcePath: "/api/search",
        query: { q: "shoes" },
        acceptedMimeTypes: ["application/json"],
      },
      extensions: {
        "x-markorbit-source-coverage-remediation-target-id": "us-uspto-id-manual",
        "x-markorbit-remediation-artifact-kinds": ["JSON"],
        "x-markorbit-endpoint-binding-required": true,
        "x-markorbit-network-locator-persisted": false,
        "x-markorbit-credential-persisted": false,
        "x-markorbit-collection-authorization": false,
      },
    });
    expect(String(payload.canonicalUri)).toMatch(/^api:\/\/uspto-id-manual\/[a-f0-9]{64}$/u);
    expect(JSON.stringify(payload)).not.toContain("https://api.example.com");
  });

  it("defaults to PLAN and performs no mutations", async () => {
    const requests: Array<[string, string]> = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = new URL(typeof input === "string" ? input : input.toString());
      const method = init?.method ?? "GET";
      requests.push([method, url.pathname]);
      if (method === "GET" && url.pathname === "/api/source-coverage") {
        return Response.json({ targets: [target()] });
      }
      throw new Error(`Unexpected request ${method} ${url.pathname}`);
    };

    const result = await prepareFoundationalApiRemediation({
      baseUrl: "http://127.0.0.1:3000/",
      workspaceId: "wsp_01ARZ3NDEKTSV4RRFFQ69G5FAV",
      jurisdiction: "us",
      bindings: [
        {
          targetId: "us-uspto-id-manual",
          endpointBinding: "uspto-id-manual",
          resourcePath: "/api/search",
        },
      ],
      fetchImpl,
    });

    expect(result).toMatchObject({
      version: "FOUNDATIONAL_API_REMEDIATION_V1",
      mode: "PLAN",
      jurisdiction: "US",
      collectionAuthorization: "NONE",
      automaticExecution: false,
      entries: [
        {
          targetId: "us-uspto-id-manual",
          endpointBinding: "uspto-id-manual",
          artifactKinds: ["JSON"],
          sourceState: "PLANNED",
          sourceId: null,
          planState: "PLANNED",
          planId: null,
          workerEndpointBindingRequired: true,
        },
      ],
    });
    expect(requests).toEqual([["GET", "/api/source-coverage"]]);
  });

  it("APPLY creates a governed API Source and manual plan without dispatching a run", async () => {
    const requests: Array<{ method: string; path: string; body?: Record<string, unknown> }> = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = new URL(typeof input === "string" ? input : input.toString());
      const method = init?.method ?? "GET";
      const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined;
      requests.push({ method, path: url.pathname, ...(body ? { body } : {}) });

      if (method === "GET" && url.pathname === "/api/source-coverage") {
        return Response.json({ targets: [target()] });
      }
      if (method === "GET" && url.pathname === "/api/connectors/api-worker/1.0.0") {
        return Response.json({ error: { message: "not found" } }, { status: 404 });
      }
      if (method === "POST" && url.pathname === "/api/connectors") {
        return Response.json({ ok: true }, { status: 201 });
      }
      if (method === "GET" && url.pathname === "/api/sources") {
        return Response.json({ items: [] });
      }
      if (method === "POST" && url.pathname === "/api/sources") {
        return Response.json({ source: { id: "src_api_1" } }, { status: 201 });
      }
      if (method === "GET" && url.pathname === "/api/plans") {
        return Response.json({ items: [] });
      }
      if (method === "POST" && url.pathname === "/api/plans") {
        return Response.json({ plan: { plan: { id: "pln_api_1" } } }, { status: 201 });
      }
      throw new Error(`Unexpected request ${method} ${url.pathname}`);
    };

    const result = await prepareFoundationalApiRemediation({
      baseUrl: "http://127.0.0.1:3000",
      workspaceId: "wsp_01ARZ3NDEKTSV4RRFFQ69G5FAV",
      jurisdiction: "US",
      apply: true,
      bindings: [
        {
          targetId: "us-uspto-id-manual",
          endpointBinding: "uspto-id-manual",
          resourcePath: "/api/search",
        },
      ],
      fetchImpl,
    });

    expect(result.entries).toEqual([
      {
        targetId: "us-uspto-id-manual",
        endpointBinding: "uspto-id-manual",
        artifactKinds: ["JSON"],
        sourceState: "CREATED",
        sourceId: "src_api_1",
        planState: "CREATED",
        planId: "pln_api_1",
        workerEndpointBindingRequired: true,
      },
    ]);
    expect(result.collectionAuthorization).toBe("NONE");
    expect(requests.some((request) => request.path === "/api/runs")).toBe(false);
    const sourceRequest = requests.find(
      (request) => request.method === "POST" && request.path === "/api/sources",
    );
    expect(sourceRequest?.body).toMatchObject({
      sourceType: "API",
      connectorConfig: { endpointBinding: "uspto-id-manual", resourcePath: "/api/search" },
    });
    const planRequest = requests.find(
      (request) => request.method === "POST" && request.path === "/api/plans",
    );
    expect(planRequest?.body).toMatchObject({
      schedule: { mode: "MANUAL" },
      output: { artifactKinds: ["JSON"] },
      extensions: { "x-markorbit-collection-authorization": false },
    });
  });

  it("rejects unsafe or credential-like endpoint configuration before mutation", async () => {
    const fetchImpl = async () => {
      throw new Error("network should not be reached");
    };
    await expect(
      prepareFoundationalApiRemediation({
        baseUrl: "http://127.0.0.1:3000",
        workspaceId: "wsp_01ARZ3NDEKTSV4RRFFQ69G5FAV",
        jurisdiction: "US",
        bindings: [
          {
            targetId: "us-uspto-id-manual",
            endpointBinding: "uspto-id-manual",
            resourcePath: "/api/search",
            query: { api_key: "secret" },
          },
        ],
        fetchImpl: fetchImpl as typeof fetch,
      }),
    ).rejects.toThrow("credential-like key");
  });
});
