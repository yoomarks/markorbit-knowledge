import { describe, expect, it } from "vitest";
import {
  CNIPA_GAZETTE_BROWSER_ADMISSION_AUTHORITY_MODE,
  cnipaGazetteBrowserAdmissionArtifactNames,
  cnipaGazetteBrowserAdmissionPlanSha256,
  cnipaGazetteBrowserAdmissionSourcePayload,
  expectedCnipaGazetteBrowserAdmissionAuthorityToken,
  parseCnipaGazetteBrowserAdmissionPlan,
} from "./cnipa-gazette-browser-admission-plan";

const datasetSha = "6".repeat(64);

function rawPlan(issue = 75, authorityIssueNumber = 866) {
  const sourceRecordCount = issue === 75 ? 576 : 1234;
  const browserSourcePageSize = issue === 75 ? 10 : 100;
  const browserSourcePageCount = Math.ceil(sourceRecordCount / browserSourcePageSize);
  const finalSourcePageRowCount =
    sourceRecordCount - (browserSourcePageCount - 1) * browserSourcePageSize;
  const logicalPageCount = Math.ceil(sourceRecordCount / 100);
  const finalLogicalPageRowCount = sourceRecordCount - (logicalPageCount - 1) * 100;
  return {
    version: 1,
    operationId: `issue-${issue}-browser-admission-r1`,
    workspaceId: "wsp_01ARZ3NDEKTSV4RRFFQ69G5FAV",
    authorityMode: CNIPA_GAZETTE_BROWSER_ADMISSION_AUTHORITY_MODE,
    executionMode: "APPLY_DISPATCH_ONCE",
    workerMode: "PROVISION_ONE_SHOT",
    stage: "BROWSER_DATASET_ADMISSION",
    authorityIssueNumber,
    announcementIssue: issue,
    announcementDate: issue === 75 ? "1983-08-15" : "1990-01-01",
    sourceRecordCount,
    browserSourcePageSize,
    browserSourcePageCount,
    finalSourcePageRowCount,
    logicalPageSize: 100,
    logicalPageCount,
    finalLogicalPageRowCount,
    range: { startPage: 1, endPage: logicalPageCount },
    announcementTypeSelection: "ALL",
    anncType: "",
    acquisitionMode: "MO_CNIPA_NORMAL_BROWSER_STREAM_V1",
    captureTool: "MO CNIPA Network Capture",
    captureToolVersion: "1.0.3",
    sourceDatasetSha256: datasetSha,
    datasetIdentityRef: {
      artifactId: "art_01ARZ3NDEKTSV4RRFFQ69G5FAV",
      canonicalUri: `cnipa://trademark-gazette/issue/${issue}/dataset/${datasetSha}`,
      sha256: "a".repeat(64),
      sizeBytes: 735,
    },
    chunkRequestRef: {
      artifactId: "art_01ARZ3NDEKTSV4RRFFQ69G5FAW",
      canonicalUri:
        `cnipa://trademark-gazette/issue/${issue}/dataset/${datasetSha}` +
        `/fact-admission/chunk/1-${logicalPageCount}/request`,
      sha256: "b".repeat(64),
      sizeBytes: 262104,
    },
    dataEngineUrl: "http://127.0.0.1:8080/",
    historicalReplayActivated: false,
  };
}

describe("CNIPA Gazette browser admission plan", () => {
  it("preserves the bounded issue-75 browser dataset contract", () => {
    const plan = parseCnipaGazetteBrowserAdmissionPlan(rawPlan());
    expect(plan).toMatchObject({
      authorityIssueNumber: 866,
      announcementIssue: 75,
      sourceRecordCount: 576,
      browserSourcePageCount: 58,
      finalSourcePageRowCount: 6,
      logicalPageCount: 6,
      finalLogicalPageRowCount: 76,
      dataEngineUrl: "http://127.0.0.1:8080",
      historicalReplayActivated: false,
    });
  });

  it("accepts a non-75 single-issue frozen plan", () => {
    const plan = parseCnipaGazetteBrowserAdmissionPlan(rawPlan(429, 885));
    expect(plan).toMatchObject({
      authorityIssueNumber: 885,
      announcementIssue: 429,
      sourceRecordCount: 1234,
      browserSourcePageSize: 100,
      browserSourcePageCount: 13,
      finalSourcePageRowCount: 34,
      logicalPageCount: 13,
      finalLogicalPageRowCount: 34,
    });
    expect(cnipaGazetteBrowserAdmissionArtifactNames(plan)).toEqual({
      chunkRequest: "cnipa-gazette-issue-429-chunk-1-13-fact-admission-request.json",
      chunkReceipt: "cnipa-gazette-issue-429-chunk-1-13-fact-admission-receipt.json",
      finalizeRequest: "cnipa-gazette-issue-429-fact-admission-finalize-request.json",
      finalizeReceipt: "cnipa-gazette-issue-429-fact-admission-finalize-receipt.json",
    });
  });

  it("fails closed on arithmetic drift or mismatched seed canonical URIs", () => {
    const fixture = rawPlan(429, 885);
    expect(() =>
      parseCnipaGazetteBrowserAdmissionPlan({ ...fixture, browserSourcePageCount: 14 }),
    ).toThrow(/frozen single-issue scope mismatch/);
    expect(() =>
      parseCnipaGazetteBrowserAdmissionPlan({
        ...fixture,
        chunkRequestRef: { ...fixture.chunkRequestRef, canonicalUri: "cnipa://wrong" },
      }),
    ).toThrow(/CHUNK request canonical URI mismatch/);
  });

  it("binds the tracking authority issue and exact frozen plan SHA into the GO token", () => {
    const plan = parseCnipaGazetteBrowserAdmissionPlan(rawPlan(429, 885));
    const sha = cnipaGazetteBrowserAdmissionPlanSha256(plan);
    expect(expectedCnipaGazetteBrowserAdmissionAuthorityToken(plan, sha)).toBe(
      `GO #885 CNIPA-GAZETTE-BROWSER-ADMISSION issue-429-browser-admission-r1 FULL_CHAIN ${sha}`,
    );
  });

  it("binds the actual Gazette issue into downstream Source identity", () => {
    const plan = parseCnipaGazetteBrowserAdmissionPlan(rawPlan(429, 885));
    const source = cnipaGazetteBrowserAdmissionSourcePayload({
      plan,
      stage: "PUBLISH_CHUNK",
      connectorConfig: {
        intent: "PUBLISH_DURABLE_REQUEST",
        requestArtifactRef: plan.chunkRequestRef,
      },
    });
    expect(source.tags).toContain("issue-429");
    expect(source.extensions).toMatchObject({
      "x-markorbit-gazette-browser-admission-stage": "PUBLISH_CHUNK",
      "x-markorbit-historical-replay-activated": false,
    });
  });
});
