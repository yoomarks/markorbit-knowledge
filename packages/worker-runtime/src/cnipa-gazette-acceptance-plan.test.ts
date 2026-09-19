import { describe, expect, it } from "vitest";
import {
  CNIPA_GAZETTE_ACCEPTANCE_AUTHORITY_MODE,
  cnipaGazetteAcceptanceAcquisitionConfig,
  cnipaGazetteAcceptanceCollectionPlanPayload,
  cnipaGazetteAcceptanceConnectorManifest,
  cnipaGazetteAcceptancePlanSha256,
  cnipaGazetteAcceptanceSourcePayload,
  cnipaGazetteAcceptanceWorkerPayload,
  expectedCnipaGazetteAcceptanceAuthorityToken,
  parseCnipaGazetteAcceptancePlan,
} from "./cnipa-gazette-acceptance-plan";

const rawPlan = {
  version: 2,
  operationId: "issue-75-capture-full-chain-r2",
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
  acquisitionMode: "MO_CNIPA_NETWORK_CAPTURE_IMPORT",
  captureToolVersion: "0.9.4",
  captureFilePath: "D:\\captures\\MO_CNIPA_GAZETTE_75_SMALL_COMPLETE.json",
  captureFileSha256: "a".repeat(64),
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
      acquisitionMode: "MO_CNIPA_NETWORK_CAPTURE_IMPORT",
      captureToolVersion: "0.9.4",
      captureFilePath: "D:\\captures\\MO_CNIPA_GAZETTE_75_SMALL_COMPLETE.json",
      captureFileSha256: "a".repeat(64),
      dataEngineUrl: "http://127.0.0.1:8080",
    });

    expect(cnipaGazetteAcceptanceAcquisitionConfig(plan)).toEqual({
      intent: "IMPORT_SMALL_COMPLETE_CAPTURE",
      announcementIssue: 75,
      announcementDate: "1983-08-15",
      captureFilePath: "D:\\captures\\MO_CNIPA_GAZETTE_75_SMALL_COMPLETE.json",
      captureSha256: "a".repeat(64),
      captureToolVersion: "0.9.4",
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
      `GO #860 CNIPA-GAZETTE issue-75-capture-full-chain-r2 FULL_CHAIN ${sha}`,
    );
  });

  it("declares least-privilege stage identities", () => {
    const plan = parseCnipaGazetteAcceptancePlan(rawPlan);
    const acquisition = cnipaGazetteAcceptanceConnectorManifest("ACQUIRE");
    const publisher = cnipaGazetteAcceptanceConnectorManifest("PUBLISH_CHUNK");
    const finalize = cnipaGazetteAcceptanceConnectorManifest("BUILD_FINALIZE");
    expect(acquisition).toMatchObject({
      connectorId: "cnipa-gazette-capture-import",
      sourceTypes: ["MANUAL_UPLOAD"],
      supportedJobTypes: ["LOCAL_FILE_SCAN"],
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
      stage: "ACQUIRE",
      connectorConfig: cnipaGazetteAcceptanceAcquisitionConfig(plan),
    });
    expect(source.extensions["x-markorbit-historical-replay-activated"]).toBe(false);
    const collectionPlan = cnipaGazetteAcceptanceCollectionPlanPayload({
      sourceId: "src_01ARZ3NDEKTSV4RRFFQ69G5FAV",
      plan,
      stage: "ACQUIRE",
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
