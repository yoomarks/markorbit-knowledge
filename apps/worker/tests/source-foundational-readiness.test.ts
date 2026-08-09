import { describe, expect, it } from "vitest";
import type { CoverageTarget } from "../src/source-coverage-bootstrap";
import { foundationalSupplyPlanName } from "../src/source-coverage-operations";
import {
  deriveFoundationalReadinessStage,
  evaluateUsFoundationalReadiness,
  operateUsFoundationalBatch,
  type FoundationalSupplyHealthItem,
} from "../src/source-foundational-readiness";

function target(id: string): CoverageTarget {
  const canonicalUri = `https://www.uspto.gov/trademarks/${id}`;
  return {
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
  };
}

function health(
  targetId: string,
  overrides: Partial<FoundationalSupplyHealthItem> = {},
): FoundationalSupplyHealthItem {
  return {
    targetId,
    state: "READY",
    registrationState: "REGISTERED",
    latestRunStatus: "COMPLETED",
    artifactCount: 1,
    readyDocumentCount: 1,
    currentDocumentCount: 1,
    freshnessState: "FRESH",
    gaps: [],
    ...overrides,
  };
}

function apiHealth(item: FoundationalSupplyHealthItem) {
  return {
    targetId: item.targetId,
    state: item.state,
    registrationState: item.registrationState,
    latestRun: item.latestRunStatus ? { status: item.latestRunStatus } : null,
    acquisition: { artifactCount: item.artifactCount },
    normalization: { readyDocumentCount: item.readyDocumentCount },
    retrieval: { currentDocumentCount: item.currentDocumentCount },
    freshness: { state: item.freshnessState },
    gaps: item.gaps,
  };
}

function controlPlane(targets: CoverageTarget[], healthItems: FoundationalSupplyHealthItem[]) {
  const runRequests: Array<{ planId: string; idempotencyKey: string | null }> = [];
  const sourceIds = new Map(targets.map((item, index) => [item.id, `src_${index + 1}`]));
  const planIds = new Map(targets.map((item, index) => [item.id, `pln_${index + 1}`]));

  const fetchImpl: typeof fetch = async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input.toString());
    const method = init?.method ?? "GET";
    if (url.pathname === "/api/source-coverage" && method === "GET") {
      return Response.json({
        targets,
        registration: targets.map((item) => ({
          targetId: item.id,
          state: "REGISTERED",
          sourceIds: [sourceIds.get(item.id)],
        })),
      });
    }
    if (url.pathname === "/api/plans" && method === "GET") {
      const sourceId = url.searchParams.get("sourceId");
      const targetEntry = [...sourceIds.entries()].find(([, value]) => value === sourceId);
      if (!targetEntry) throw new Error(`Unknown source ${sourceId}`);
      const [targetId] = targetEntry;
      return Response.json({
        items: [
          {
            plan: {
              id: planIds.get(targetId),
              name: foundationalSupplyPlanName(targetId),
              status: "ACTIVE",
              schedule: { mode: "MANUAL" },
            },
          },
        ],
      });
    }
    if (url.pathname === "/api/source-supply-health" && method === "GET") {
      return Response.json({ items: healthItems.map(apiHealth) });
    }
    if (url.pathname === "/api/runs" && method === "POST") {
      const body = JSON.parse(String(init?.body)) as { planId: string };
      const headers = new Headers(init?.headers);
      runRequests.push({
        planId: body.planId,
        idempotencyKey: headers.get("Idempotency-Key"),
      });
      return Response.json({
        record: { run: { id: `run_${runRequests.length}` } },
      });
    }
    throw new Error(`Unexpected request ${method} ${url.pathname}`);
  };

  return { fetchImpl, runRequests, planIds };
}

describe("US FOUNDATIONAL readiness gate", () => {
  it("requires all 11 foundational targets to be READY", () => {
    const targetIds = Array.from({ length: 11 }, (_, index) => `us-foundational-${index + 1}`);
    const gate = evaluateUsFoundationalReadiness(
      targetIds,
      targetIds.map((targetId) => health(targetId)),
    );
    expect(gate).toMatchObject({
      state: "READY",
      totalCount: 11,
      readyCount: 11,
      blockingCount: 0,
      readyPercent: 100,
    });
    expect(gate.byStage.READY).toBe(11);
  });

  it("reports the first actionable pipeline stage for blocked supply", () => {
    expect(
      deriveFoundationalReadinessStage(
        health("unregistered", {
          state: "BLOCKED",
          registrationState: "UNREGISTERED",
          artifactCount: 0,
          readyDocumentCount: 0,
          currentDocumentCount: 0,
          freshnessState: "UNOBSERVED",
          gaps: ["SOURCE_UNREGISTERED"],
        }),
      ),
    ).toBe("REGISTER");
    expect(
      deriveFoundationalReadinessStage(
        health("ingest", {
          state: "BLOCKED",
          artifactCount: 0,
          readyDocumentCount: 0,
          currentDocumentCount: 0,
          freshnessState: "UNOBSERVED",
          gaps: ["NO_ACQUISITION_EVIDENCE"],
        }),
      ),
    ).toBe("INGEST");
    expect(
      deriveFoundationalReadinessStage(
        health("convert", {
          state: "DEGRADED",
          readyDocumentCount: 0,
          currentDocumentCount: 0,
          gaps: ["NO_NORMALIZED_DOCUMENT", "NO_RETRIEVAL_DOCUMENT"],
        }),
      ),
    ).toBe("CONVERT");
    expect(
      deriveFoundationalReadinessStage(
        health("index", {
          state: "DEGRADED",
          currentDocumentCount: 0,
          gaps: ["NO_RETRIEVAL_DOCUMENT"],
        }),
      ),
    ).toBe("INDEX");
  });

  it("keeps review and unapproved batch requests at zero dispatch", async () => {
    const targets = [target("us-one"), target("us-two")];
    const harness = controlPlane(
      targets,
      targets.map((item) => health(item.id)),
    );

    const review = await operateUsFoundationalBatch({
      baseUrl: "http://127.0.0.1:3000",
      workspaceId: "wsp_test",
      fetchImpl: harness.fetchImpl,
    });
    expect(review.mode).toBe("REVIEW");
    expect(review.requestedTargetIds).toEqual([]);
    expect(review.collectionAuthorization).toBe("NONE");
    expect(harness.runRequests).toEqual([]);

    const unapproved = await operateUsFoundationalBatch({
      baseUrl: "http://127.0.0.1:3000",
      workspaceId: "wsp_test",
      dispatchAll: true,
      fetchImpl: harness.fetchImpl,
    });
    expect(unapproved.mode).toBe("REVIEW");
    expect(unapproved.approvalRequired).toBe(true);
    expect(unapproved.requestedTargetIds).toEqual(["us-one", "us-two"]);
    expect(unapproved.approvedTargetIds).toEqual([]);
    expect(unapproved.runs).toEqual([]);
    expect(harness.runRequests).toEqual([]);
  });

  it("dispatches only explicitly approved targets", async () => {
    const targets = [target("us-one"), target("us-two")];
    const harness = controlPlane(
      targets,
      targets.map((item) => health(item.id)),
    );

    const result = await operateUsFoundationalBatch({
      baseUrl: "http://127.0.0.1:3000",
      workspaceId: "wsp_test",
      dispatchTargetIds: ["us-two"],
      approveDispatch: true,
      fetchImpl: harness.fetchImpl,
    });

    expect(result.mode).toBe("DISPATCH");
    expect(result.approvedTargetIds).toEqual(["us-two"]);
    expect(result.collectionAuthorization).toBe("EXPLICIT_TARGET_MANUAL_RUNS_DISPATCHED");
    expect(result.runs.map((run) => run.targetId)).toEqual(["us-two"]);
    expect(harness.runRequests.map((request) => request.planId)).toEqual([
      harness.planIds.get("us-two"),
    ]);
  });
});
