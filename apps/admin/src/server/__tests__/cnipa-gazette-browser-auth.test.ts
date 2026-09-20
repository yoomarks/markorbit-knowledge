import { describe, expect, it } from "vitest";
import {
  cnipaGazetteBrowserAuthorityPlan,
  cnipaGazetteBrowserAuthorityPlanSha256,
  expectedCnipaGazetteBrowserAuthorityToken,
} from "@markorbit/worker-runtime";
import {
  authenticateCnipaGazetteBrowserRequest,
  CNIPA_GAZETTE_BROWSER_AUTHORITY_HEADER,
  CNIPA_GAZETTE_BROWSER_INTERNAL_AUTHORIZATION_HEADER,
} from "../cnipa-gazette-browser-auth";

const plan = cnipaGazetteBrowserAuthorityPlan({
  operationId: "issue-75-browser-rc1-proof",
  workspaceId: "wsp_01ARZ3NDEKTSV4RRFFQ69G5FAV",
  dispatchMode: "PREPARE_ONLY",
  announcementIssue: 75,
  captureToolBundleName: "MO_CNIPA_Network_Capture_v1.0.0_Gazette_Stream_RC1.zip",
  captureToolBundleSha256: "f01e654ccfdf08ba1dfbcb33b5ec343767012c5409a847d617305f1e01e146d3",
});
const sha = cnipaGazetteBrowserAuthorityPlanSha256(plan);
const token = expectedCnipaGazetteBrowserAuthorityToken(plan, sha);

function request(authority = token, internal = "internal-secret") {
  return new Request("http://localhost/api/internal/cnipa-gazette/browser-stream", {
    method: "POST",
    headers: {
      [CNIPA_GAZETTE_BROWSER_AUTHORITY_HEADER]: authority,
      [CNIPA_GAZETTE_BROWSER_INTERNAL_AUTHORIZATION_HEADER]: internal,
    },
  });
}

describe("CNIPA Gazette browser-stream authority", () => {
  it("accepts matching internal secret + exact frozen plan token", () => {
    expect(
      authenticateCnipaGazetteBrowserRequest(
        request(),
        { workspaceId: plan.workspaceId, frozenPlan: plan, planSha256: sha },
        "internal-secret",
      ),
    ).toMatchObject({
      actorId: expect.stringMatching(/^cnipa-gazette-browser:[a-f0-9]{32}$/u),
      planSha256: sha,
    });
  });

  it("rejects internal secret, workspace, plan SHA and GO-token drift", () => {
    expect(() =>
      authenticateCnipaGazetteBrowserRequest(
        request(token, "wrong"),
        { workspaceId: plan.workspaceId, frozenPlan: plan, planSha256: sha },
        "internal-secret",
      ),
    ).toThrow(/Internal service authentication/);
    expect(() =>
      authenticateCnipaGazetteBrowserRequest(
        request(),
        { workspaceId: "wsp_01ARZ3NDEKTSV4RRFFQ69G5FAA", frozenPlan: plan, planSha256: sha },
        "internal-secret",
      ),
    ).toThrow(/authority is invalid/);
    expect(() =>
      authenticateCnipaGazetteBrowserRequest(
        request(),
        { workspaceId: plan.workspaceId, frozenPlan: plan, planSha256: "0".repeat(64) },
        "internal-secret",
      ),
    ).toThrow(/authority is invalid/);
    expect(() =>
      authenticateCnipaGazetteBrowserRequest(
        request("GO wrong"),
        { workspaceId: plan.workspaceId, frozenPlan: plan, planSha256: sha },
        "internal-secret",
      ),
    ).toThrow(/does not match/);
  });
});
