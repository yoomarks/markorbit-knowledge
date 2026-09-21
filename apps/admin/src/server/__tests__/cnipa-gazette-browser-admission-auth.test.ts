import { describe, expect, it } from "vitest";
import {
  CNIPA_GAZETTE_BROWSER_ADMISSION_AUTHORITY_MODE,
  cnipaGazetteBrowserAdmissionPlanSha256,
  expectedCnipaGazetteBrowserAdmissionAuthorityToken,
  parseCnipaGazetteBrowserAdmissionPlan,
} from "@markorbit/worker-runtime";
import {
  CNIPA_GAZETTE_BROWSER_ADMISSION_AUTHORITY_HEADER,
  CNIPA_GAZETTE_BROWSER_ADMISSION_INTERNAL_AUTHORIZATION_HEADER,
  authenticateCnipaGazetteBrowserAdmissionRequest,
} from "../cnipa-gazette-browser-admission-auth";

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
    canonicalUri: `cnipa://trademark-gazette/issue/75/dataset/${datasetSha}/fact-admission/chunk/1-6/request`,
    sha256: "b".repeat(64),
    sizeBytes: 262104,
  },
  dataEngineUrl: "http://127.0.0.1:8080",
  historicalReplayActivated: false,
};

describe("CNIPA Gazette browser admission auth", () => {
  it("accepts exact internal secret and exact #866 frozen-plan authority", () => {
    const plan = parseCnipaGazetteBrowserAdmissionPlan(rawPlan);
    const sha = cnipaGazetteBrowserAdmissionPlanSha256(plan);
    const token = expectedCnipaGazetteBrowserAdmissionAuthorityToken(plan, sha);
    const request = new Request("http://localhost", {
      headers: {
        [CNIPA_GAZETTE_BROWSER_ADMISSION_INTERNAL_AUTHORIZATION_HEADER]: "internal-secret",
        [CNIPA_GAZETTE_BROWSER_ADMISSION_AUTHORITY_HEADER]: token,
      },
    });
    expect(
      authenticateCnipaGazetteBrowserAdmissionRequest(
        request,
        { workspaceId: plan.workspaceId, frozenPlan: plan, planSha256: sha },
        "internal-secret",
      ),
    ).toMatchObject({ planSha256: sha });
  });

  it("rejects a wrong authority token", () => {
    const plan = parseCnipaGazetteBrowserAdmissionPlan(rawPlan);
    const sha = cnipaGazetteBrowserAdmissionPlanSha256(plan);
    const request = new Request("http://localhost", {
      headers: {
        [CNIPA_GAZETTE_BROWSER_ADMISSION_INTERNAL_AUTHORIZATION_HEADER]: "internal-secret",
        [CNIPA_GAZETTE_BROWSER_ADMISSION_AUTHORITY_HEADER]: "wrong",
      },
    });
    expect(() =>
      authenticateCnipaGazetteBrowserAdmissionRequest(
        request,
        { workspaceId: plan.workspaceId, frozenPlan: plan, planSha256: sha },
        "internal-secret",
      ),
    ).toThrow(/does not match the frozen plan/);
  });
});
