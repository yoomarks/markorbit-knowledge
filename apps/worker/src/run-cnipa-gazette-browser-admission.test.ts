import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  CNIPA_GAZETTE_BROWSER_ADMISSION_AUTHORITY_MODE,
  cnipaGazetteBrowserAdmissionPlanSha256,
  expectedCnipaGazetteBrowserAdmissionAuthorityToken,
  parseCnipaGazetteBrowserAdmissionPlan,
} from "@markorbit/worker-runtime";
import {
  assertCnipaGazetteBrowserAdmissionAuthority,
  assertCnipaGazetteBrowserAdmissionPathOutsideWorkingTree,
  parseCnipaGazetteBrowserAdmissionArguments,
} from "./run-cnipa-gazette-browser-admission";

const datasetSha = "6".repeat(64);
const plan = parseCnipaGazetteBrowserAdmissionPlan({
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
  dataEngineUrl: "http://127.0.0.1:8081",
  historicalReplayActivated: false,
});

describe("run CNIPA Gazette browser admission", () => {
  it("parses plan-only and apply CLI boundaries", () => {
    expect(
      parseCnipaGazetteBrowserAdmissionArguments(["--plan", "D:\\plans\\p.json"]),
    ).toMatchObject({
      apply: false,
    });
    expect(() =>
      parseCnipaGazetteBrowserAdmissionArguments(["--plan", "D:\\plans\\p.json", "--apply"]),
    ).toThrow(/--apply requires/);
  });

  it("requires plan/evidence paths outside the working tree", () => {
    const cwd = path.resolve("D:\\repo");
    expect(() =>
      assertCnipaGazetteBrowserAdmissionPathOutsideWorkingTree(path.resolve(cwd, "plan.json"), cwd),
    ).toThrow(/outside the repository/);
  });

  it("accepts only the exact SHA-bound #866 GO token", () => {
    const sha = cnipaGazetteBrowserAdmissionPlanSha256(plan);
    const token = expectedCnipaGazetteBrowserAdmissionAuthorityToken(plan, sha);
    expect(
      assertCnipaGazetteBrowserAdmissionAuthority({
        plan,
        planSha256: sha,
        expectedSha: sha,
        authorityToken: token,
      }),
    ).toMatch(/^[a-f0-9]{64}$/u);
    expect(() =>
      assertCnipaGazetteBrowserAdmissionAuthority({
        plan,
        planSha256: sha,
        expectedSha: sha,
        authorityToken: "wrong",
      }),
    ).toThrow(/GO token/);
  });
});
