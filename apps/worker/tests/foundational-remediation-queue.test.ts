import { describe, expect, it } from "vitest";
import {
  buildFoundationalRemediationQueue,
  type FoundationalRemediationActionCode,
} from "../src/foundational-remediation-queue";
import type {
  FoundationalReadinessGate,
  FoundationalReadinessStage,
  FoundationalReadinessTarget,
} from "../src/source-foundational-readiness";

function target(
  targetId: string,
  stage: FoundationalReadinessStage,
  overrides: Partial<FoundationalReadinessTarget> = {},
): FoundationalReadinessTarget {
  return {
    targetId,
    stage,
    ready: stage === "READY",
    healthState: "READY",
    gaps: [],
    reason: stage === "READY" ? null : `REASON_${stage}`,
    retrievalQualityState: "READY",
    retrievalAuditDocumentCount: 1,
    retrievalAuditGaps: [],
    retrievalRelevanceState: "READY",
    retrievalRelevanceProbeCount: 1,
    retrievalRelevanceGaps: [],
    ...overrides,
  };
}

function gate(targets: FoundationalReadinessTarget[]): FoundationalReadinessGate {
  const stages: FoundationalReadinessStage[] = [
    "REGISTER",
    "COLLECT",
    "INGEST",
    "CONVERT",
    "INDEX",
    "QUALITY",
    "RELEVANCE",
    "HEALTH",
    "READY",
  ];
  const byStage = Object.fromEntries(stages.map((stage) => [stage, 0])) as Record<
    FoundationalReadinessStage,
    number
  >;
  for (const item of targets) byStage[item.stage] += 1;
  const readyCount = targets.filter((item) => item.ready).length;
  return {
    protocolVersion: "1.2",
    objectType: "FOUNDATIONAL_READINESS_GATE",
    jurisdiction: "US",
    state: readyCount === targets.length ? "READY" : "NOT_READY",
    totalCount: targets.length,
    readyCount,
    blockingCount: targets.length - readyCount,
    readyPercent:
      targets.length === 0 ? 0 : Number(((readyCount / targets.length) * 100).toFixed(2)),
    byStage,
    targets,
  };
}

function actionCodes(queue: ReturnType<typeof buildFoundationalRemediationQueue>) {
  return queue.items.flatMap((item) => item.actions.map((action) => action.code));
}

describe("foundational remediation queue", () => {
  it("omits READY targets and returns CLEAR when every target is ready", () => {
    const queue = buildFoundationalRemediationQueue(gate([target("one", "READY")]), "wsp_test");
    expect(queue).toMatchObject({
      state: "CLEAR",
      totalTargetCount: 1,
      actionableTargetCount: 0,
      items: [],
      executionPolicy: "ADVISORY_ONLY",
      collectionAuthorization: "UNCHANGED_EXPLICIT_ONLY",
      semanticJudgment: false,
    });
  });

  it("orders the queue by first actionable readiness stage", () => {
    const queue = buildFoundationalRemediationQueue(
      gate([
        target("health", "HEALTH"),
        target("relevance", "RELEVANCE"),
        target("quality", "QUALITY"),
        target("index", "INDEX"),
        target("convert", "CONVERT"),
        target("ingest", "INGEST"),
        target("collect", "COLLECT"),
        target("register", "REGISTER"),
      ]),
      "wsp_test",
    );
    expect(queue.items.map((item) => item.stage)).toEqual([
      "REGISTER",
      "COLLECT",
      "INGEST",
      "CONVERT",
      "INDEX",
      "QUALITY",
      "RELEVANCE",
      "HEALTH",
    ]);
    expect(queue.byStage).toEqual({
      REGISTER: 1,
      COLLECT: 1,
      INGEST: 1,
      CONVERT: 1,
      INDEX: 1,
      QUALITY: 1,
      RELEVANCE: 1,
      HEALTH: 1,
    });
  });

  it("keeps collection authorization explicit and never enables automatic execution", () => {
    const queue = buildFoundationalRemediationQueue(
      gate([
        target("collect", "COLLECT", {
          healthState: "BLOCKED",
          gaps: ["NO_ACQUISITION_EVIDENCE"],
        }),
      ]),
      "wsp_test",
    );
    const remediation = queue.items[0]?.actions[0];
    expect(remediation).toMatchObject({
      code: "DISPATCH_GOVERNED_COLLECTION",
      executionPath: "FOUNDATIONAL_OPERATOR_EXPLICIT_DISPATCH",
      collectionAuthorizationRequired: true,
      automaticExecution: false,
    });
  });

  it("routes structural QUALITY failures to the M16 planner and M17 explicit boundary", () => {
    const queue = buildFoundationalRemediationQueue(
      gate([
        target("quality", "QUALITY", {
          retrievalQualityState: "BLOCKED",
          retrievalAuditGaps: ["FTS_ROW_COUNT_MISMATCH"],
        }),
      ]),
      "wsp_test",
    );
    const remediation = queue.items[0]?.actions[0];
    expect(remediation).toMatchObject({
      code: "OPEN_RETRIEVAL_REMEDIATION_PLAN",
      executionPath: "M16_PLANNER_THEN_M17_EXPLICIT_OPERATOR",
      gapCodes: ["FTS_ROW_COUNT_MISMATCH"],
      automaticExecution: false,
    });
    expect(remediation?.endpoint).toContain("/api/foundational/retrieval-quality-remediation?");
    expect(remediation?.endpoint).toContain("workspaceId=wsp_test");
    expect(remediation?.endpoint).toContain("jurisdiction=US");
    expect(remediation?.endpoint).toContain("targetId=quality");
  });

  it("turns deterministic relevance gaps into target-scoped operator reviews without semantic scoring", () => {
    const queue = buildFoundationalRemediationQueue(
      gate([
        target("relevance", "RELEVANCE", {
          retrievalRelevanceState: "BLOCKED",
          retrievalRelevanceGaps: [
            "PROBE_NOT_CONFIGURED",
            "SOURCE_FILTERED_QUERY_MISS",
            "GLOBAL_TOP_K_MISS",
          ],
        }),
      ]),
      "wsp_test",
    );
    const codes = actionCodes(queue);
    expect(codes).toEqual<FoundationalRemediationActionCode[]>([
      "REVIEW_RELEVANCE_PROBE_CONFIG",
      "REVIEW_SOURCE_FILTERED_RETRIEVAL",
      "REVIEW_GLOBAL_RETRIEVAL_RANKING",
    ]);
    expect(queue.items[0]?.actions.every((item) => item.automaticExecution === false)).toBe(true);
    expect(
      queue.items[0]?.actions.every(
        (item) =>
          item.endpoint?.includes("/api/retrieval/relevance-audit?") === true &&
          item.endpoint.includes("workspaceId=wsp_test") &&
          item.endpoint.includes("jurisdiction=US") &&
          item.endpoint.includes("targetId=relevance"),
      ),
    ).toBe(true);
    expect(queue.semanticJudgment).toBe(false);
  });

  it("surfaces M19 relevance audit coverage inconsistencies separately from ranking misses", () => {
    const queue = buildFoundationalRemediationQueue(
      gate([
        target("relevance", "RELEVANCE", {
          retrievalRelevanceState: "BLOCKED",
          retrievalRelevanceGaps: [
            "RETRIEVAL_RELEVANCE_AUDIT_MISSING",
            "RETRIEVAL_RELEVANCE_NOT_APPLICABLE_WITH_CURRENT_DOCUMENT",
          ],
        }),
      ]),
      "wsp_test",
    );
    expect(actionCodes(queue)).toEqual(["REVIEW_RELEVANCE_AUDIT_COVERAGE"]);
  });

  it("provides deterministic action codes for every upstream supply stage", () => {
    const cases: Array<[FoundationalReadinessStage, FoundationalRemediationActionCode]> = [
      ["REGISTER", "REGISTER_SOURCE"],
      ["COLLECT", "DISPATCH_GOVERNED_COLLECTION"],
      ["INGEST", "REVIEW_INGEST_EVIDENCE"],
      ["CONVERT", "RUN_CONVERSION_RECOVERY"],
      ["INDEX", "REINDEX_VERIFIED_CANONICAL"],
      ["QUALITY", "OPEN_RETRIEVAL_REMEDIATION_PLAN"],
      ["RELEVANCE", "REVIEW_RELEVANCE_AUDIT"],
      ["HEALTH", "REVIEW_SUPPLY_HEALTH"],
    ];
    for (const [stage, expected] of cases) {
      const queue = buildFoundationalRemediationQueue(
        gate([target(`target-${stage.toLowerCase()}`, stage)]),
        "wsp_test",
      );
      expect(queue.items[0]?.actions[0]?.code).toBe(expected);
    }
  });
});
