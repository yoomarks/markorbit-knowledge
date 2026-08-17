import { describe, expect, it, vi } from "vitest";
import {
  evaluateRepresentativeSupplyProofRecord,
  runRepresentativeSupplyProof,
} from "../src/representative-supply-proof";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function healthyRecord(targetId = "target-1") {
  return {
    targetId,
    registrationState: "REGISTERED",
    latestRun: { status: "COMPLETE" },
    acquisition: { artifactCount: 2 },
    normalization: { readyDocumentCount: 1 },
    retrieval: { currentDocumentCount: 1 },
    freshness: { state: "FRESH" },
    compatibility: { state: "PASS", freshness: "FRESH" },
  };
}

describe("representative supply proof", () => {
  it("requires evidence across acquisition, normalization, retrieval, freshness and compatibility", () => {
    expect(evaluateRepresentativeSupplyProofRecord(healthyRecord())).toMatchObject({
      status: "PROVEN",
      blockers: [],
    });

    expect(
      evaluateRepresentativeSupplyProofRecord({
        ...healthyRecord(),
        acquisition: { artifactCount: 0 },
        normalization: { readyDocumentCount: 0 },
        retrieval: { currentDocumentCount: 0 },
        freshness: { state: "STALE" },
        compatibility: { state: "DEGRADED", freshness: "STALE" },
      }),
    ).toMatchObject({
      status: "INCOMPLETE",
      blockers: [
        "NO_ACQUISITION_EVIDENCE",
        "NO_READY_NORMALIZED_DOCUMENT",
        "NO_CURRENT_RETRIEVAL_DOCUMENT",
        "SUPPLY_NOT_FRESH",
        "COMPATIBILITY_NOT_PASS",
        "COMPATIBILITY_NOT_FRESH",
      ],
    });
  });

  it("verifies the full representative wave read-only", async () => {
    const fetchMock = vi.fn(async (request: string | URL | Request, init?: RequestInit) => {
      void init;
      const url = new URL(
        typeof request === "string" ? request : request instanceof URL ? request : request.url,
      );
      const targetId = url.searchParams.get("targetId") ?? "missing";
      return jsonResponse({ items: [healthyRecord(targetId)] });
    });
    const fetchImpl = fetchMock as unknown as typeof fetch;

    const proof = await runRepresentativeSupplyProof({
      baseUrl: "http://127.0.0.1:3000/",
      workspaceId: "workspace-1",
      fetchImpl,
    });

    expect(proof.mutationPerformed).toBe(false);
    expect(proof.selectedJurisdictions).toEqual([
      "CN",
      "US",
      "IN",
      "JP",
      "KR",
      "GB",
      "CA",
      "AU",
      "BR",
      "AE",
      "EU",
      "CI",
    ]);
    expect(proof.summary).toEqual({ proven: 12, incomplete: 0, failed: 0 });
    expect(fetchMock).toHaveBeenCalledTimes(12);
    for (const call of fetchMock.mock.calls) {
      const init = call[1];
      expect(init?.method).toBeUndefined();
    }
  });

  it("supports a jurisdiction subset and reports missing health as failed without mutation", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ items: [] })) as unknown as typeof fetch;
    const proof = await runRepresentativeSupplyProof({
      baseUrl: "https://knowledge.example.com/",
      workspaceId: "workspace-1",
      jurisdictions: ["JP"],
      fetchImpl,
    });

    expect(proof.selectedJurisdictions).toEqual(["JP"]);
    expect(proof.summary).toEqual({ proven: 0, incomplete: 0, failed: 1 });
    expect(proof.entries[0]).toMatchObject({ jurisdiction: "JP", status: "FAILED" });
    expect(proof.mutationPerformed).toBe(false);
  });

  it("rejects jurisdictions outside the representative wave before making requests", async () => {
    const fetchMock = vi.fn();
    const fetchImpl = fetchMock as unknown as typeof fetch;
    await expect(
      runRepresentativeSupplyProof({
        baseUrl: "http://127.0.0.1:3000",
        workspaceId: "workspace-1",
        jurisdictions: ["FR"],
        fetchImpl,
      }),
    ).rejects.toThrow("Unsupported representative jurisdiction: FR");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
