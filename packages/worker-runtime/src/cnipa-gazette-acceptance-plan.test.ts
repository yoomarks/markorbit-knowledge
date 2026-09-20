import { describe, expect, it } from "vitest";
import {
  CNIPA_GAZETTE_ACCEPTANCE_AUTHORITY_MODE,
  cnipaGazetteAcceptanceCaptureImportConfig,
  cnipaGazetteAcceptanceCollectionPlanPayload,
  cnipaGazetteAcceptanceConnectorManifest,
  cnipaGazetteAcceptancePlanSha256,
  cnipaGazetteAcceptanceSourcePayload,
  cnipaGazetteAcceptanceWorkerPayload,
  expectedCnipaGazetteAcceptanceAuthorityToken,
  parseCnipaGazetteAcceptancePlan,
} from "./cnipa-gazette-acceptance-plan";

const rawPlan = {
  version: 1,
  operationId: "issue-75-full-chain-r1",
  workspaceId: "wsp_01ARZ3NDEKTSV4RRFFQ69G5FAV",
  authorityMode: CNIPA_GAZETTE_ACCEPTANCE_AUTHORITY_MODE,
  executionMode: "APPLY_DISPATCH_ONCE",
  workerMode: "PROVISION_ONE_SHOT",
  stage: "FULL_CHAIN",
  announcementIssue: 75,
  announcementDate: "1983-08-15",
  sourceRecordCount: 576,

  sourcePageCount: 6,
  pageSize: 100,
  finalPageRowCount: 76,
  range: { startPage: 1, endPage: 6 },
  announcementTypeSelection: "ALL",
  anncType: "",
  acquisitionMode: "MO_CNIPA_NETWORK_CAPTURE_V094_IMPORT",
  captureTool: "MO CNIPA Network Capture",
  captureToolVersion: "0.9.4",
  captureExportSchema: "mo-cnipa-gazette-small-complete-v1",
  captureToolBundleSha256: "4ae00c31ed2cc417e1d47bf47b84378f84a7e4a77c2dbb15cc43a237b69ea5c2",
  dataEngineUrl: "http://127.0.0.1:8080/",
};

describe("CNIPA Gazette bounded acceptance plan", () => {
  it("freezes issue 75 to the known complete six-page dataset", () => {
    const plan = parseCnipaGazetteAcceptancePlan(rawPlan);
    expect(plan).toMatchObject({
      announcementIssue: 75,
      announcementDate: "1983-08-15",
      sourceRecordCount: 576,
      sourcePageCount: 6,
      pageSize: 100,
      finalPageRowCount: 76,
      range: { startPage: 1, endPage: 6 },
      anncType: "",
      acquisitionMode: "MO_CNIPA_NETWORK_CAPTURE_V094_IMPORT",
      captureToolVersion: "0.9.4",
      captureExportSchema: "mo-cnipa-gazette-small-complete-v1",
      dataEngineUrl: "http://127.0.0.1:8080",
    });

    expect(
      cnipaGazetteAcceptanceCaptureImportConfig(plan, {
        sha256: "a".repeat(64),
        sizeBytes: 123456,
        originalName: "MO_CNIPA_GAZETTE_75_SMALL_COMPLETE.json",
      }),
    ).toMatchObject({
      intent: "IMPORT_V094_SMALL_COMPLETE",
      captureSha256: "a".repeat(64),
      captureSizeBytes: 123456,
      announcementIssue: 75,
      range: { startPage: 1, endPage: 6 },
      pagesPerCheckpoint: 6,
      requestTemplate: { anncIssue: "75", anncType: "", pageSize: 100 },
    });
  });

  it("fails closed when the bounded issue expectation is widened or changed", () => {
    expect(() => parseCnipaGazetteAcceptancePlan({ ...rawPlan, announcementIssue: 76 })).toThrow(
      /issue-75 frozen scope mismatch/,
    );
    expect(() => parseCnipaGazetteAcceptancePlan({ ...rawPlan, sourcePageCount: 7 })).toThrow(
      /issue-75 frozen scope mismatch/,
    );
    expect(() => parseCnipaGazetteAcceptancePlan({ ...rawPlan, anncType: "TMZCSQ" })).toThrow(
      /issue-75 frozen scope mismatch/,
    );
  });

  it("binds the exact frozen plan SHA into the GO token", () => {
    const plan = parseCnipaGazetteAcceptancePlan(rawPlan);

    const sha = cnipaGazetteAcceptancePlanSha256(plan);
    expect(sha).toMatch(/^[a-f0-9]{64}$/u);
    expect(expectedCnipaGazetteAcceptanceAuthorityToken(plan, sha)).toBe(
      `GO #860 CNIPA-GAZETTE issue-75-full-chain-r1 FULL_CHAIN ${sha}`,
    );
  });

  it("declares least-privilege stage identities", () => {
    const plan = parseCnipaGazetteAcceptancePlan(rawPlan);
    const acquisition = cnipaGazetteAcceptanceConnectorManifest("IMPORT_CAPTURE");
    const publisher = cnipaGazetteAcceptanceConnectorManifest("PUBLISH_CHUNK");
    const finalize = cnipaGazetteAcceptanceConnectorManifest("BUILD_FINALIZE");
    expect(acquisition).toMatchObject({
      connectorId: "cnipa-gazette-capture-import",
      sourceTypes: ["DATABASE"],
      outputArtifactKinds: ["JSON"],
    });
    expect(publisher).toMatchObject({
      connectorId: "cnipa-gazette-fact-admission-publisher",
      sourceTypes: ["DATABASE"],
    });
    expect(finalize).toMatchObject({
      connectorId: "cnipa-gazette-finalize-request-builder",
      sourceTypes: ["DATABASE"],
    });

    const source = cnipaGazetteAcceptanceSourcePayload({
      plan,
      stage: "IMPORT_CAPTURE",
      connectorConfig: cnipaGazetteAcceptanceCaptureImportConfig(plan, {
        sha256: "a".repeat(64),
        sizeBytes: 123456,
        originalName: "MO_CNIPA_GAZETTE_75_SMALL_COMPLETE.json",
      }),
    });
    expect(source.extensions["x-markorbit-historical-replay-activated"]).toBe(false);
    const collectionPlan = cnipaGazetteAcceptanceCollectionPlanPayload({
      sourceId: "src_01ARZ3NDEKTSV4RRFFQ69G5FAV",
      plan,
      stage: "IMPORT_CAPTURE",
    });
    expect(collectionPlan).toMatchObject({
      schedule: { mode: "MANUAL" },
      output: { artifactKinds: ["JSON"] },
      policy: { maxItems: 20, retry: { maxAttempts: 1, backoffSeconds: 0 } },
    });
    expect(cnipaGazetteAcceptanceWorkerPayload(plan.workspaceId, "PUBLISH_FINALIZE")).toMatchObject(
      {
        maxConcurrency: 1,
        connectorBindings: [
          { connectorId: "cnipa-gazette-fact-admission-publisher", capabilities: ["COLLECT"] },
        ],
      },
    );
  });
});
