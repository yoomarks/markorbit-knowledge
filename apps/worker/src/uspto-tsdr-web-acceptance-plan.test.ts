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
  robotsPolicy: "RFC9309_4XX_UNAVAILABLE_ALLOW_5XX_UNREACHABLE_FAIL_V1",
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
      const plan = parseUsptoTsdrWebAcceptancePlan({
        ...base,
        stage,
        transportMode: "STATIC_HTTP_PINNED",
        robotsPolicy: "RFC9309_4XX_UNAVAILABLE_ALLOW_5XX_UNREACHABLE_FAIL_V1",
      });
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
        "x-markorbit-tsdr-web-robots-policy":
          "RFC9309_4XX_UNAVAILABLE_ALLOW_5XX_UNREACHABLE_FAIL_V1",
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
    expect(collectionPlan.output.artifactKinds).toEqual(["HTML"]);
  });

  it("uses static HTML output for the document index proof", () => {
    const plan = parseUsptoTsdrWebAcceptancePlan({
      ...base,
      stage: "DOCUMENT_INDEX",
      transportMode: "STATIC_HTTP_PINNED",
      robotsPolicy: "RFC9309_4XX_UNAVAILABLE_ALLOW_5XX_UNREACHABLE_FAIL_V1",
    });
    const collectionPlan = usptoTsdrWebAcceptanceCollectionPlanPayload("src_test", plan);
    expect(collectionPlan.output.artifactKinds).toEqual(["HTML"]);
    expect(collectionPlan.policy.renderJavascript).toBe(false);
  });

  it("freezes a selected OFFICE_ACTION PDF with immutable index lineage", () => {
    const plan = parseUsptoTsdrWebAcceptancePlan({
      ...base,
      operationId: "web-proof-99047647-final-action-r1",
      stage: "SELECTED_DOCUMENT",
      serialNumber: "99047647",
      format: "PDF",
      purpose: "CASE_RESEARCH",
      businessChain: "OA",
      document: {
        sourceIndexArtifactId: "art_01M2X01M8RS5MNFC953RM7N6Y3",
        sourceIndexArtifactSha256:
          "3544fddfc90f59b94603e908857ddb0208b80920c0e517b4c7d59cf46e91b837",
        sourceDocumentId: "FREF20260722103245",
        sourceDocumentType: "Final Action",
        sourceDescription: "Final Action",
        sourceDisplayDate: "Jul. 22, 2026",
        sourcePageCount: 1,
        family: "OFFICE_ACTION",
        classifierIdentity: "uspto-tsdr-document-family",
        classifierVersion: "1.1.0",
        downloadUrl:
          "https://tsdrsec.uspto.gov/ts/cd/tmcasedoc/downloadproxy?url=/api/casedoc/cms/case/99047647/office-action/OfficeAction8740681.pdf",
      },
    });
    if (plan.stage !== "SELECTED_DOCUMENT") {
      throw new Error("Expected selected-document plan");
    }
    expect(usptoTsdrWebAcceptanceTargetUrl(plan)).toBe(plan.document.downloadUrl);
    expect(() => usptoTsdrWebAcceptanceSourcePayload(plan)).toThrow(/reuses/u);
    const collectionPlan = usptoTsdrWebAcceptanceCollectionPlanPayload("src_index", plan);
    expect(collectionPlan.output.artifactKinds).toEqual(["PDF"]);
    expect(collectionPlan.policy).toMatchObject({
      maxDepth: 0,
      maxItems: 1,
      renderJavascript: false,
      respectRobots: true,
      rateLimitPerMinute: 4,
    });
    expect(collectionPlan.extensions).toMatchObject({
      "x-markorbit-tsdr-web-selected-parent-artifact-id": "art_01M2X01M8RS5MNFC953RM7N6Y3",
      "x-markorbit-tsdr-web-selected-document-id": "FREF20260722103245",
      "x-markorbit-tsdr-web-selected-document-family": "OFFICE_ACTION",
      "x-markorbit-tsdr-web-selected-classifier": "uspto-tsdr-document-family@1.1.0",
    });
  });

  it("uses IMAGE-only output for the mark asset proof", () => {
    const plan = parseUsptoTsdrWebAcceptancePlan({
      ...base,
      stage: "MARK_IMAGE",
      transportMode: "STATIC_HTTP_PINNED",
      robotsPolicy: "RFC9309_4XX_UNAVAILABLE_ALLOW_5XX_UNREACHABLE_FAIL_V1",
    });
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
    expect(() =>
      parseUsptoTsdrWebAcceptancePlan({ ...base, transportMode: "BROWSER_PROXY" }),
    ).toThrow(/transportMode/u);
    expect(() =>
      parseUsptoTsdrWebAcceptancePlan({
        ...base,
        robotsPolicy: "BROWSER_PROVIDER_NATIVE_V1",
      }),
    ).toThrow(/robotsPolicy/u);
  });
});
