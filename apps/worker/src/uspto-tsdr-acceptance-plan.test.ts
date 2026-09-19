import { describe, expect, it } from "vitest";
import {
  parseUsptoTsdrAcceptancePlan,
  usptoTsdrAcceptanceCollectionPlanPayload,
  usptoTsdrAcceptanceConnectorManifest,
  usptoTsdrAcceptancePlanSha256,
  usptoTsdrAcceptanceSourcePayload,
  usptoTsdrAcceptanceWorkerPayload,
} from "./uspto-tsdr-acceptance-plan";

const SECRET_REF = "sec_01ARZ3NDEKTSV4RRFFQ69G5FAV";
const WORKSPACE_ID = "wsp_01ARZ3NDEKTSV4RRFFQ69G5FAV";

function indexPlan() {
  return {
    version: 1,
    operationId: "oa-proof-90817045-index",
    workspaceId: WORKSPACE_ID,
    stage: "INDEX",
    serialNumber: "90817045",
    secretRef: SECRET_REF,
  } as const;
}

function selectedPlan() {
  return {
    version: 1,
    operationId: "oa-proof-90817045-pdf",
    workspaceId: WORKSPACE_ID,
    stage: "SELECTED_DOCUMENT",
    serialNumber: "90817045",
    secretRef: SECRET_REF,
    format: "PDF",
    purpose: "LIVE_BUSINESS_EVENT",
    businessChain: "OA",
    document: {
      sourceIndexArtifactId: "art_01ARZ3NDEKTSV4RRFFQ69G5FAW",
      sourceDocumentId: "OOA20250101120000",
      sourceDocumentType: "OFFICE ACTION",
      sourceDescription: "Non-final Office action",
      family: "OFFICE_ACTION",
      classifierIdentity: "uspto-tsdr-document-family",
      classifierVersion: "1.0.0",
    },
  } as const;
}

describe("USPTO TSDR acceptance frozen plan", () => {
  it("parses and hashes an index plan deterministically", () => {
    const parsed = parseUsptoTsdrAcceptancePlan(indexPlan());
    expect(parsed).toEqual(indexPlan());
    expect(usptoTsdrAcceptancePlanSha256(parsed)).toMatch(/^[a-f0-9]{64}$/);
    expect(usptoTsdrAcceptancePlanSha256(parsed)).toBe(usptoTsdrAcceptancePlanSha256(indexPlan()));
  });

  it("requires workspace authority to be frozen into every acceptance plan", () => {
    const { workspaceId: _workspaceId, ...withoutWorkspace } = indexPlan();
    expect(() => parseUsptoTsdrAcceptancePlan(withoutWorkspace)).toThrow(/workspaceId/);
  });

  it("changes the frozen SHA when workspace authority changes", () => {
    const first = parseUsptoTsdrAcceptancePlan(indexPlan());
    const second = parseUsptoTsdrAcceptancePlan({
      ...indexPlan(),
      workspaceId: "wsp_01ARZ3NDEKTSV4RRFFQ69G5FB0",
    });
    expect(usptoTsdrAcceptancePlanSha256(second)).not.toBe(usptoTsdrAcceptancePlanSha256(first));
  });

  it("builds a manual one-item index source and CollectionPlan with secretRef only", () => {
    const plan = parseUsptoTsdrAcceptancePlan(indexPlan());
    const source = usptoTsdrAcceptanceSourcePayload(plan);
    const collection = usptoTsdrAcceptanceCollectionPlanPayload(
      "src_01ARZ3NDEKTSV4RRFFQ69G5FAY",
      plan,
    );

    expect(source).toMatchObject({
      workspaceId: WORKSPACE_ID,
      connectorConfig: { intent: "CASE_DOCUMENT_INDEX", serialNumber: "90817045" },
      secretRef: SECRET_REF,
      canonicalUri: "https://tsdrapi.uspto.gov",
    });
    expect(JSON.stringify(source)).not.toContain("USPTO-API-KEY");
    expect(collection).toMatchObject({
      schedule: { mode: "MANUAL" },
      policy: { maxItems: 1, rateLimitPerMinute: 30, retry: { maxAttempts: 1 } },
      output: { artifactKinds: ["XML"] },
    });
    expect(collection.extensions["x-markorbit-tsdr-frozen-plan-sha256"]).toBe(
      usptoTsdrAcceptancePlanSha256(plan),
    );
  });

  it("requires immutable real-index lineage for a selected OA PDF plan", () => {
    const plan = parseUsptoTsdrAcceptancePlan(selectedPlan());
    const source = usptoTsdrAcceptanceSourcePayload(plan);
    const collection = usptoTsdrAcceptanceCollectionPlanPayload(
      "src_01ARZ3NDEKTSV4RRFFQ69G5FAY",
      plan,
    );

    expect(source.connectorConfig).toMatchObject({
      intent: "SELECTED_DOCUMENT_BINARY",
      document: {
        sourceIndexArtifactId: "art_01ARZ3NDEKTSV4RRFFQ69G5FAW",
        family: "OFFICE_ACTION",
      },
    });
    expect(collection).toMatchObject({
      schedule: { mode: "MANUAL" },
      policy: { rateLimitPerMinute: 4 },
      output: { artifactKinds: ["PDF"] },
    });
  });

  it("rejects an index plan that attempts to carry selected-document authority", () => {
    expect(() =>
      parseUsptoTsdrAcceptancePlan({
        ...indexPlan(),
        document: selectedPlan().document,
      }),
    ).toThrow(/unsupported keys.*document/);
  });

  it("rejects selected ZIP in acceptance v1 rather than widening the artifact contract", () => {
    expect(() =>
      parseUsptoTsdrAcceptancePlan({
        ...selectedPlan(),
        format: "ZIP",
      }),
    ).toThrow(/PDF only/);
  });

  it("rejects a raw secret value in place of a governed secretRef", () => {
    expect(() =>
      parseUsptoTsdrAcceptancePlan({
        ...indexPlan(),
        secretRef: "actual-provider-key",
      }),
    ).toThrow(/Schema v1 secret reference/);
  });

  it("keeps connector and worker bootstrap bounded to the dedicated TSDR provider", () => {
    expect(usptoTsdrAcceptanceConnectorManifest()).toMatchObject({
      connectorId: "uspto-tsdr",
      sourceTypes: ["API"],
      supportedJobTypes: ["API_COLLECTION"],
      outputArtifactKinds: ["XML", "PDF"],
    });
    expect(usptoTsdrAcceptanceWorkerPayload(WORKSPACE_ID)).toMatchObject({
      workspaceId: WORKSPACE_ID,
      supportedJobTypes: ["API_COLLECTION"],
      maxConcurrency: 1,
      connectorBindings: [{ connectorId: "uspto-tsdr", capabilities: ["COLLECT"] }],
    });
  });
});
