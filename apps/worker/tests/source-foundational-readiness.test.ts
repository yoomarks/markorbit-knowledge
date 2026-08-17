import { describe, expect, it } from "vitest";
import type { CoverageTarget } from "../src/source-coverage-bootstrap";
import { foundationalSupplyPlanName } from "../src/source-coverage-operations";
import {
  FOUNDATIONAL_READINESS_PROTOCOL_VERSION,
  deriveFoundationalReadinessStage,
  evaluateFoundationalRetrievalQuality,
  evaluateFoundationalRetrievalRelevance,
  evaluateUsFoundationalReadiness,
  evaluateWipoFoundationalReadiness,
  operateFoundationalBatch,
  operateUsFoundationalBatch,
  type FoundationalRetrievalQualityItem,
  type FoundationalRetrievalRelevanceItem,
  type FoundationalSupplyHealthItem,
} from "../src/source-foundational-readiness";

function target(id: string, jurisdiction = "US"): CoverageTarget {
  const host = jurisdiction === "WO" ? "www.wipo.int" : "www.uspto.gov";
  const canonicalUri = `https://${host}/trademarks/${id}`;
  return {
    id,
    jurisdiction,
    authorityName:
      jurisdiction === "WO"
        ? "World Intellectual Property Organization"
        : "United States Patent and Trademark Office",
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
    sourceIds: [`src_${targetId}`],
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

function quality(
  sourceId: string,
  overrides: Partial<FoundationalRetrievalQualityItem> = {},
): FoundationalRetrievalQualityItem {
  return {
    sourceId,
    state: "READY",
    gaps: [],
    isCurrent: true,
    ...overrides,
  };
}

function relevance(
  targetId: string,
  overrides: Partial<FoundationalRetrievalRelevanceItem> = {},
): FoundationalRetrievalRelevanceItem {
  return {
    targetId,
    state: "READY",
    gaps: [],
    probeCount: 1,
    ...overrides,
  };
}

function apiHealth(item: FoundationalSupplyHealthItem) {
  return {
    targetId: item.targetId,
    sourceIds: item.sourceIds,
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

function apiRelevance(item: FoundationalRetrievalRelevanceItem) {
  return {
    targetId: item.targetId,
    state: item.state,
    gaps: item.gaps,
    probes: Array.from({ length: item.probeCount }, (_, index) => ({ probeId: `probe_${index}` })),
  };
}

function controlPlane(
  targets: CoverageTarget[],
  healthItems: FoundationalSupplyHealthItem[],
  qualityItems: FoundationalRetrievalQualityItem[],
  relevanceItems: FoundationalRetrievalRelevanceItem[] = healthItems.map((item) =>
    relevance(item.targetId),
  ),
) {
  const runRequests: Array<{ planId: string; idempotencyKey: string | null }> = [];
  const sourceIds = new Map(targets.map((item, index) => [item.id, `src_${index + 1}`]));
  const planIds = new Map(targets.map((item, index) => [item.id, `pln_${index + 1}`]));
  const normalizedHealth = healthItems.map((item) => ({
    ...item,
    sourceIds: [sourceIds.get(item.targetId)!],
  }));
  const normalizedQuality = qualityItems.map((item, index) => ({
    ...item,
    sourceId: sourceIds.get(targets[index]?.id) ?? item.sourceId,
  }));

  const fetchImpl: typeof fetch = async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input.toString());
    const method = init?.method ?? "GET";
    if (url.pathname === "/api/source-coverage" && method === "GET") {
      const jurisdiction = url.searchParams.get("jurisdiction");
      expect(targets.every((item) => item.jurisdiction === jurisdiction)).toBe(true);
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
      return Response.json({ items: normalizedHealth.map(apiHealth) });
    }
    if (url.pathname === "/api/retrieval/audit" && method === "GET") {
      return Response.json({ items: normalizedQuality });
    }
    if (url.pathname === "/api/retrieval/relevance-audit" && method === "GET") {
      return Response.json({ items: relevanceItems.map(apiRelevance), semanticJudgment: false });
    }
    if (url.pathname === "/api/runs" && method === "POST") {
      const body = JSON.parse(String(init?.body)) as { planId: string };
      const headers = new Headers(init?.headers);
      runRequests.push({
        planId: body.planId,
        idempotencyKey: headers.get("Idempotency-Key"),
      });
      return Response.json({ record: { run: { id: `run_${runRequests.length}` } } });
    }
    throw new Error(`Unexpected request ${method} ${url.pathname}`);
  };

  return { fetchImpl, runRequests, planIds };
}

describe("FOUNDATIONAL readiness gate", () => {
  it("requires all US foundational targets, retrieval audits, and relevance probes to be READY", () => {
    const targetIds = Array.from({ length: 11 }, (_, index) => `us-foundational-${index + 1}`);
    const healthItems = targetIds.map((targetId) => health(targetId));
    const gate = evaluateUsFoundationalReadiness(
      targetIds,
      healthItems,
      healthItems.map((item) => quality(item.sourceIds[0])),
      targetIds.map((targetId) => relevance(targetId)),
    );
    expect(gate).toMatchObject({
      protocolVersion: FOUNDATIONAL_READINESS_PROTOCOL_VERSION,
      jurisdiction: "US",
      state: "READY",
      totalCount: 11,
      readyCount: 11,
      blockingCount: 0,
      readyPercent: 100,
    });
    expect(gate.byStage.READY).toBe(11);
    expect(gate.byStage.RELEVANCE).toBe(0);
  });

  it("blocks readiness at QUALITY before evaluating relevance as the actionable stage", () => {
    const degradedHealth = health("degraded");
    const degraded = evaluateUsFoundationalReadiness(
      [degradedHealth.targetId],
      [degradedHealth],
      [
        quality(degradedHealth.sourceIds[0], {
          state: "DEGRADED",
          gaps: ["DUPLICATE_CHUNK_CONTENT"],
        }),
      ],
      [
        relevance(degradedHealth.targetId, {
          state: "BLOCKED",
          gaps: ["SOURCE_FILTERED_QUERY_MISS"],
        }),
      ],
    );
    expect(degraded.targets[0]).toMatchObject({
      stage: "QUALITY",
      retrievalQualityState: "DEGRADED",
      retrievalRelevanceState: "BLOCKED",
      ready: false,
    });

    const missingHealth = health("missing");
    const missing = evaluateFoundationalRetrievalQuality(missingHealth, []);
    expect(missing).toEqual({
      state: "MISSING",
      documentCount: 0,
      gaps: ["RETRIEVAL_AUDIT_MISSING"],
    });

    const mismatchHealth = health("mismatch", { currentDocumentCount: 2 });
    const mismatch = evaluateFoundationalRetrievalQuality(mismatchHealth, [
      quality(mismatchHealth.sourceIds[0]),
    ]);
    expect(mismatch.state).toBe("BLOCKED");
    expect(mismatch.gaps).toContain("RETRIEVAL_AUDIT_COVERAGE_MISMATCH");
  });

  it("blocks readiness at RELEVANCE when deterministic smoke probes are degraded, blocked, or missing", () => {
    const degradedHealth = health("relevance-degraded");
    const degraded = evaluateUsFoundationalReadiness(
      [degradedHealth.targetId],
      [degradedHealth],
      [quality(degradedHealth.sourceIds[0])],
      [
        relevance(degradedHealth.targetId, {
          state: "DEGRADED",
          gaps: ["GLOBAL_TOP_K_MISS"],
        }),
      ],
    );
    expect(degraded.targets[0]).toMatchObject({
      stage: "RELEVANCE",
      retrievalQualityState: "READY",
      retrievalRelevanceState: "DEGRADED",
      retrievalRelevanceProbeCount: 1,
      reason: "GLOBAL_TOP_K_MISS",
      ready: false,
    });

    const blockedHealth = health("relevance-blocked");
    const blocked = evaluateUsFoundationalReadiness(
      [blockedHealth.targetId],
      [blockedHealth],
      [quality(blockedHealth.sourceIds[0])],
      [
        relevance(blockedHealth.targetId, {
          state: "BLOCKED",
          gaps: ["SOURCE_FILTERED_QUERY_MISS"],
        }),
      ],
    );
    expect(blocked.targets[0]).toMatchObject({
      stage: "RELEVANCE",
      retrievalRelevanceState: "BLOCKED",
      reason: "SOURCE_FILTERED_QUERY_MISS",
    });

    const missingHealth = health("relevance-missing");
    const missing = evaluateFoundationalRetrievalRelevance(missingHealth, []);
    expect(missing).toEqual({
      state: "MISSING",
      probeCount: 0,
      gaps: ["RETRIEVAL_RELEVANCE_AUDIT_MISSING"],
    });

    const inconsistent = evaluateFoundationalRetrievalRelevance(missingHealth, [
      relevance(missingHealth.targetId, {
        state: "NOT_APPLICABLE",
        gaps: ["NO_CURRENT_RETRIEVAL_DOCUMENT"],
        probeCount: 0,
      }),
    ]);
    expect(inconsistent.state).toBe("BLOCKED");
    expect(inconsistent.gaps).toContain(
      "RETRIEVAL_RELEVANCE_NOT_APPLICABLE_WITH_CURRENT_DOCUMENTS",
    );
  });

  it("uses the same quality and relevance gate for WIPO foundational supply", () => {
    const healthItems = [health("wo-one"), health("wo-two")];
    const gate = evaluateWipoFoundationalReadiness(
      healthItems.map((item) => item.targetId),
      healthItems,
      healthItems.map((item) => quality(item.sourceIds[0])),
      healthItems.map((item) => relevance(item.targetId)),
    );
    expect(gate).toMatchObject({ jurisdiction: "WO", state: "READY", readyCount: 2 });
  });

  it("reports the first actionable supply-pipeline stage before quality and relevance", () => {
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

  it("keeps review and unapproved requests at zero dispatch while loading quality and relevance", async () => {
    const targets = [target("us-one"), target("us-two")];
    const healthItems = targets.map((item) => health(item.id));
    const harness = controlPlane(
      targets,
      healthItems,
      healthItems.map((item) => quality(item.sourceIds[0])),
    );

    const review = await operateUsFoundationalBatch({
      baseUrl: "http://127.0.0.1:3000",
      workspaceId: "wsp_test",
      fetchImpl: harness.fetchImpl,
    });
    expect(review.mode).toBe("REVIEW");
    expect(review.readiness.state).toBe("READY");
    expect(review.readiness.targets.every((item) => item.retrievalRelevanceState === "READY")).toBe(
      true,
    );
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
    expect(unapproved.approvedTargetIds).toEqual([]);
    expect(unapproved.runs).toEqual([]);
    expect(harness.runRequests).toEqual([]);
  });

  it("dispatches only explicitly approved WIPO targets through the generic operator", async () => {
    const targets = [target("wo-one", "WO"), target("wo-two", "WO")];
    const healthItems = targets.map((item) => health(item.id));
    const harness = controlPlane(
      targets,
      healthItems,
      healthItems.map((item) => quality(item.sourceIds[0])),
    );

    const result = await operateFoundationalBatch({
      jurisdiction: "WO",
      baseUrl: "http://127.0.0.1:3000",
      workspaceId: "wsp_test",
      dispatchTargetIds: ["wo-two"],
      approveDispatch: true,
      fetchImpl: harness.fetchImpl,
    });

    expect(result).toMatchObject({ jurisdiction: "WO", mode: "DISPATCH" });
    expect(result.readiness.state).toBe("READY");
    expect(result.approvedTargetIds).toEqual(["wo-two"]);
    expect(result.collectionAuthorization).toBe("EXPLICIT_TARGET_MANUAL_RUNS_DISPATCHED");
    expect(result.runs.map((run) => run.targetId)).toEqual(["wo-two"]);
    expect(harness.runRequests.map((request) => request.planId)).toEqual([
      harness.planIds.get("wo-two"),
    ]);
  });
});
