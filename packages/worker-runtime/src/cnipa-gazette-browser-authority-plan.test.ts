import { describe, expect, it } from "vitest";
import {
  cnipaGazetteBrowserAuthorityPlan,
  cnipaGazetteBrowserAuthorityPlanSha256,
  expectedCnipaGazetteBrowserAuthorityToken,
  parseCnipaGazetteBrowserAuthorityPlan,
} from "./cnipa-gazette-browser-authority-plan";

const plan = cnipaGazetteBrowserAuthorityPlan({
  operationId: "issue-75-browser-rc1-proof",
  workspaceId: "wsp_01ARZ3NDEKTSV4RRFFQ69G5FAV",
  dispatchMode: "PREPARE_ONLY",
  announcementIssue: 75,
  captureToolBundleName: "MO_CNIPA_Network_Capture_v1.0.0_Gazette_Stream_RC1.zip",
  captureToolBundleSha256: "f01e654ccfdf08ba1dfbcb33b5ec343767012c5409a847d617305f1e01e146d3",
});

describe("CNIPA Gazette browser authority plan", () => {
  it("freezes RC identity, full-issue scope and replay/mutation gates", () => {
    expect(plan).toMatchObject({
      announcementIssue: 75,
      announcementTypeSelection: "ALL",
      anncType: "",
      captureToolVersion: "1.0.0",
      minimumChromeVersion: 118,
      sourcePageSizeMode: "PRESERVE_CAPTURED_1_TO_100",
      dataEngineMutation: "DISABLED",
      historicalReplayActivated: false,
      dispatchMode: "PREPARE_ONLY",
    });
    expect(cnipaGazetteBrowserAuthorityPlanSha256(plan)).toMatch(/^[a-f0-9]{64}$/u);
  });

  it("derives a plan-bound #865 authority token", () => {
    const sha = cnipaGazetteBrowserAuthorityPlanSha256(plan);
    expect(expectedCnipaGazetteBrowserAuthorityToken(plan, sha)).toBe(
      `GO #865 CNIPA-GAZETTE-BROWSER issue-75-browser-rc1-proof PREPARE_ONLY ${sha}`,
    );
  });

  it("rejects scope drift and unknown keys", () => {
    expect(() =>
      parseCnipaGazetteBrowserAuthorityPlan({
        ...plan,
        announcementTypeSelection: "SOME",
      }),
    ).toThrow(/frozen browser-stream scope mismatch/);
    expect(() =>
      parseCnipaGazetteBrowserAuthorityPlan({
        ...plan,
        historicalReplayActivated: true,
      }),
    ).toThrow(/frozen browser-stream scope mismatch/);
    expect(() =>
      parseCnipaGazetteBrowserAuthorityPlan({
        ...plan,
        extra: true,
      }),
    ).toThrow(/unsupported keys/);
  });
});
