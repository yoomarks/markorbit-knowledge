import { describe, expect, it } from "vitest";
import {
  CNIPA_GAZETTE_ACCEPTANCE_AUTHORITY_MODE,
  cnipaGazetteAcceptancePlanSha256,
  expectedCnipaGazetteAcceptanceAuthorityToken,
  parseCnipaGazetteAcceptancePlan,
} from "@markorbit/worker-runtime";
import {
  CNIPA_GAZETTE_ACCEPTANCE_AUTHORITY_HEADER,
  CNIPA_GAZETTE_ACCEPTANCE_INTERNAL_AUTHORIZATION_HEADER,
  authenticateCnipaGazetteAcceptanceRequest,
} from "../cnipa-gazette-acceptance-auth";

const plan = parseCnipaGazetteAcceptancePlan({
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
  captureToolBundleSha256: "5b1e4a788c261b2662827f6789bba7f10fa56d0c5699bcd6bd9fa373fe0afa2a",
  dataEngineUrl: "http://127.0.0.1:8080",
});
const sha = cnipaGazetteAcceptancePlanSha256(plan);
const token = expectedCnipaGazetteAcceptanceAuthorityToken(plan, sha);

function request(authority = token, internal = "internal-secret") {
  return new Request("http://localhost/api/internal/cnipa-gazette/acceptance", {
    method: "POST",
    headers: {
      [CNIPA_GAZETTE_ACCEPTANCE_INTERNAL_AUTHORIZATION_HEADER]: internal,
      [CNIPA_GAZETTE_ACCEPTANCE_AUTHORITY_HEADER]: authority,
    },
  });
}

describe("CNIPA Gazette acceptance authority", () => {
  it("authorizes only the exact frozen plan and GO token", () => {
    expect(
      authenticateCnipaGazetteAcceptanceRequest(
        request(),
        { workspaceId: plan.workspaceId, frozenPlan: plan, planSha256: sha },
        "internal-secret",
      ),
    ).toMatchObject({
      actorId: expect.stringMatching(/^cnipa-gazette-acceptance:[a-f0-9]{32}$/u),
      planSha256: sha,
    });
  });

  it("rejects a token for a different frozen plan", () => {
    expect(() =>
      authenticateCnipaGazetteAcceptanceRequest(
        request("GO #860 CNIPA-GAZETTE wrong FULL_CHAIN " + sha),
        { workspaceId: plan.workspaceId, frozenPlan: plan, planSha256: sha },
        "internal-secret",
      ),
    ).toThrowError(expect.objectContaining({ code: "CNIPA_GAZETTE_ACCEPTANCE_AUTHORITY_INVALID" }));
  });

  it("rejects workspace/SHA drift and missing internal service authentication", () => {
    expect(() =>
      authenticateCnipaGazetteAcceptanceRequest(
        request(),
        {
          workspaceId: "wsp_01ARZ3NDEKTSV4RRFFQ69G5FAW",
          frozenPlan: plan,
          planSha256: sha,
        },
        "internal-secret",
      ),
    ).toThrow();

    expect(() =>
      authenticateCnipaGazetteAcceptanceRequest(
        request(token, "wrong"),
        { workspaceId: plan.workspaceId, frozenPlan: plan, planSha256: sha },
        "internal-secret",
      ),
    ).toThrowError(expect.objectContaining({ code: "INTERNAL_SERVICE_UNAUTHORIZED" }));
  });
});
