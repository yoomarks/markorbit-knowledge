import { describe, expect, it } from "vitest";
import {
  parseUsptoTsdrWebAcceptancePlan,
  usptoTsdrWebAcceptanceCollectionPlanPayload,
  usptoTsdrWebAcceptancePlanSha256,
  usptoTsdrWebAcceptanceSourcePayload,
  usptoTsdrWebAcceptanceTargetUrl,
  usptoTsdrWebAcceptanceWorkerPayload,
} from "./uspto-tsdr-web-acceptance-plan";

const base = {
  version: 1,
  operationId: "web-proof-90817045-status",
  workspaceId: "wsp_01ARZ3NDEKTSV4RRFFQ69G5FAV",
  authorityMode: "INTERNAL_SERVICE_GO_V1",
  executionMode: "APPLY_DISPATCH_ONCE",
  workerMode: "PROVISION_ONE_SHOT",
  channel: "WEB",
  stage: "STATUS",
  transportMode: "STATIC_HTTP_PINNED",
  serialNumber: "90817045",
} as const;

describe("TSDR Web acceptance plan", () => {
  it("freezes a STATUS proof without any secretRef", () => {
    const plan = parseUsptoTsdrWebAcceptancePlan(base);
    expect(plan).toEqual(base);
    expect("secretRef" in plan).toBe(false);
    expect(usptoTsdrWebAcceptanceTargetUrl(plan)).toBe(
      "https://tsdr.uspto.gov/statusview/sn90817045",
    );
    expect(usptoTsdrWebAcceptancePlanSha256(plan)).toMatch(/^[a-f0-9]{64}$/u);
  });

  it("derives the three official surfaces from serial and stage", () => {
    for (const [stage, url] of [
      ["STATUS", "https://tsdr.uspto.gov/statusview/sn90817045"],
      ["MARK_IMAGE", "https://tsdr.uspto.gov/img/90817045/large"],
      ["DOCUMENT_INDEX", "https://tsdr.uspto.gov/documentviewer?caseId=sn90817045"],
    ] as const) {
      const plan = parseUsptoTsdrWebAcceptancePlan({ ...base, stage, transportMode: stage === "DOCUMENT_INDEX" ? "BROWSER_PROXY" : "STATIC_HTTP_PINNED" });
      expect(usptoTsdrWebAcceptanceTargetUrl(plan)).toBe(url);
    }
  });

  it("builds a bounded official WEB Source and CollectionPlan", () => {
    const plan = parseUsptoTsdrWebAcceptancePlan(base);
    const source = usptoTsdrWebAcceptanceSourcePayload(plan);
    expect(source).toMatchObject({
      sourceType: "WEB",
      canonicalUri: "https://tsdr.uspto.gov/statusview/sn90817045",
      connector: { connectorId: "crawl4ai-web", version: "1.3.0" },
      extensions: {
        "x-markorbit-tsdr-acquisition-channel": "WEB",
        "x-markorbit-legal-effect-claim": false,
      },
    });
    expect(source).not.toHaveProperty("secretRef");

    const collectionPlan = usptoTsdrWebAcceptanceCollectionPlanPayload("src_test", plan);
    expect(collectionPlan.policy).toMatchObject({
      maxDepth: 0,
      maxItems: 1,
      respectRobots: true,
      rateLimitPerMinute: 6,
    });
    expect(collectionPlan.output.artifactKinds).toEqual(["HTML", "MARKDOWN"]);
  });

  it("uses IMAGE-only output for the mark asset proof", () => {
    const plan = parseUsptoTsdrWebAcceptancePlan({ ...base, stage: "MARK_IMAGE", transportMode: "STATIC_HTTP_PINNED" });
    expect(
      usptoTsdrWebAcceptanceCollectionPlanPayload("src_test", plan).output.artifactKinds,
    ).toEqual(["IMAGE"]);
  });

  it("freezes the one-shot WEB_CRAWL worker definition", () => {
    expect(usptoTsdrWebAcceptanceWorkerPayload(base.workspaceId)).toMatchObject({
      runtime: { runtimeId: "uspto-tsdr-web-worker", version: "1.0.0" },
      supportedJobTypes: ["WEB_CRAWL"],
      maxConcurrency: 1,
      connectorBindings: [
        {
          connectorId: "crawl4ai-web",
          version: "1.3.0",
          capabilities: ["COLLECT"],
        },
      ],
    });
  });

  it("rejects smuggled authority fields and cross-mode plans", () => {
    expect(() =>
      parseUsptoTsdrWebAcceptancePlan({ ...base, secretRef: "sec_01ARZ3NDEKTSV4RRFFQ69G5FAV" }),
    ).toThrow(/unsupported keys/u);
    expect(() => parseUsptoTsdrWebAcceptancePlan({ ...base, channel: "API" })).toThrow(/channel/u);
  });
});
