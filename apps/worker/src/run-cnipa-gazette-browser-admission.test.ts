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
  operationId: "issue-429-browser-admission-r1",
  workspaceId: "wsp_01ARZ3NDEKTSV4RRFFQ69G5FAV",
  authorityMode: CNIPA_GAZETTE_BROWSER_ADMISSION_AUTHORITY_MODE,
  executionMode: "APPLY_DISPATCH_ONCE",
  workerMode: "PROVISION_ONE_SHOT",
  stage: "BROWSER_DATASET_ADMISSION",
  authorityIssueNumber: 885,
  announcementIssue: 429,
  announcementDate: "1990-01-01",
  sourceRecordCount: 1234,
  browserSourcePageSize: 100,
  browserSourcePageCount: 13,
  finalSourcePageRowCount: 34,
  logicalPageSize: 100,
  logicalPageCount: 13,
  finalLogicalPageRowCount: 34,
  range: { startPage: 1, endPage: 13 },
  announcementTypeSelection: "ALL",
  anncType: "",
  acquisitionMode: "MO_CNIPA_NORMAL_BROWSER_STREAM_V1",
  captureTool: "MO CNIPA Network Capture",
  captureToolVersion: "1.0.3",
  sourceDatasetSha256: datasetSha,
  datasetIdentityRef: {
    artifactId: "art_01ARZ3NDEKTSV4RRFFQ69G5FAV",
    canonicalUri: `cnipa://trademark-gazette/issue/429/dataset/${datasetSha}`,
    sha256: "a".repeat(64),
    sizeBytes: 735,
  },
  chunkRequests: [
    {
      range: { startPage: 1, endPage: 13 },
      requestRef: {
        artifactId: "art_01ARZ3NDEKTSV4RRFFQ69G5FAW",
        canonicalUri:
          `cnipa://trademark-gazette/issue/429/dataset/${datasetSha}` +
          "/fact-admission/chunk/1-13/request",
        sha256: "b".repeat(64),
        sizeBytes: 262104,
      },
    },
  ],
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

  it("accepts only the exact SHA-bound generic GO token", () => {
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
