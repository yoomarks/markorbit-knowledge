import { describe, expect, it } from "vitest";
import {
  CNIPA_GAZETTE_BROWSER_ADMISSION_AUTHORITY_MODE,
  cnipaGazetteBrowserAdmissionPlanSha256,
  cnipaGazetteBrowserAdmissionSourcePayload,
  expectedCnipaGazetteBrowserAdmissionAuthorityToken,
  parseCnipaGazetteBrowserAdmissionPlan,
} from "./cnipa-gazette-browser-admission-plan";

const datasetSha = "6".repeat(64);
const rawPlan = {
  version: 1,
  operationId: "issue-75-browser-admission-r1",
  workspaceId: "wsp_01ARZ3NDEKTSV4RRFFQ69G5FAV",
  authorityMode: CNIPA_GAZETTE_BROWSER_ADMISSION_AUTHORITY_MODE,
  executionMode: "APPLY_DISPATCH_ONCE",
  workerMode: "PROVISION_ONE_SHOT",
  stage: "BROWSER_DATASET_ADMISSION",
  announcementIssue: 75,
  announcementDate: "1983-08-15",
  sourceRecordCount: 576,
  browserSourcePageSize: 10,
  browserSourcePageCount: 58,
  logicalPageSize: 100,
  logicalPageCount: 6,
  finalLogicalPageRowCount: 76,
  range: { startPage: 1, endPage: 6 },
  announcementTypeSelection: "ALL",
  anncType: "",
  acquisitionMode: "MO_CNIPA_NORMAL_BROWSER_STREAM_V1",
  captureTool: "MO CNIPA Network Capture",
  captureToolVersion: "1.0.3",
  sourceDatasetSha256: datasetSha,
  datasetIdentityRef: {
    artifactId: "art_01ARZ3NDEKTSV4RRFFQ69G5FAV",
    canonicalUri: `cnipa://trademark-gazette/issue/75/dataset/${datasetSha}`,
    sha256: "a".repeat(64),
    sizeBytes: 735,
  },
  chunkRequestRef: {
    artifactId: "art_01ARZ3NDEKTSV4RRFFQ69G5FAW",
    canonicalUri:
      `cnipa://trademark-gazette/issue/75/dataset/${datasetSha}/fact-admission/chunk/1-6/request`,
    sha256: "b".repeat(64),
    sizeBytes: 262104,
  },
  dataEngineUrl: "http://127.0.0.1:8080/",
  historicalReplayActivated: false,
};

describe("CNIPA Gazette browser admission plan", () => {
  it("freezes the bounded issue-75 browser dataset and downstream seed refs", () => {
    const plan = parseCnipaGazetteBrowserAdmissionPlan(rawPlan);
    expect(plan).toMatchObject({
      sourceRecordCount: 576,
      browserSourcePageCount: 58,
      logicalPageCount: 6,
      captureToolVersion: "1.0.3",
      sourceDatasetSha256: datasetSha,
      dataEngineUrl: "http://127.0.0.1:8080",
      historicalReplayActivated: false,
    });
  });

  it("fails closed on widened scope or mismatched seed canonical URIs", () => {
    expect(() =>
      parseCnipaGazetteBrowserAdmissionPlan({ ...rawPlan, browserSourcePageCount: 59 }),
    ).toThrow(/issue-75 frozen scope mismatch/);
    expect(() =>
      parseCnipaGazetteBrowserAdmissionPlan({
        ...rawPlan,
        chunkRequestRef: { ...rawPlan.chunkRequestRef, canonicalUri: "cnipa://wrong" },
      }),
    ).toThrow(/CHUNK request canonical URI mismatch/);
  });

  it("binds the exact frozen plan SHA into the #866 GO token", () => {
    const plan = parseCnipaGazetteBrowserAdmissionPlan(rawPlan);
    const sha = cnipaGazetteBrowserAdmissionPlanSha256(plan);
    expect(expectedCnipaGazetteBrowserAdmissionAuthorityToken(plan, sha)).toBe(
      `GO #866 CNIPA-GAZETTE-BROWSER-ADMISSION issue-75-browser-admission-r1 FULL_CHAIN ${sha}`,
    );
  });

  it("binds browser-admission plan identity into downstream Sources", () => {
    const plan = parseCnipaGazetteBrowserAdmissionPlan(rawPlan);
    const source = cnipaGazetteBrowserAdmissionSourcePayload({
      plan,
      stage: "PUBLISH_CHUNK",
      connectorConfig: {
        intent: "PUBLISH_DURABLE_REQUEST",
        requestArtifactRef: plan.chunkRequestRef,
      },
    });
    expect(source.extensions).toMatchObject({
      "x-markorbit-gazette-browser-admission-stage": "PUBLISH_CHUNK",
      "x-markorbit-historical-replay-activated": false,
    });
  });
});
