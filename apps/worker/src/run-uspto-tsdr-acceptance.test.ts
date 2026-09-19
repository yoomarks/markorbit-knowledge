import { describe, expect, it } from "vitest";
import {
  assertUsptoTsdrAcceptanceAuthority,
  expectedUsptoTsdrAcceptanceAuthorityToken,
  parseUsptoTsdrAcceptanceArguments,
} from "./run-uspto-tsdr-acceptance";
import {
  parseUsptoTsdrAcceptancePlan,
  usptoTsdrAcceptancePlanSha256,
} from "./uspto-tsdr-acceptance-plan";

const plan = parseUsptoTsdrAcceptancePlan({
  version: 1,
  operationId: "oa-proof-90817045-index",
  workspaceId: "wsp_01ARZ3NDEKTSV4RRFFQ69G5FAV",
  authorityMode: "INTERNAL_SERVICE_GO_V1",
  stage: "INDEX",
  serialNumber: "90817045",
  secretRef: "sec_01ARZ3NDEKTSV4RRFFQ69G5FAV",
});
const sha = usptoTsdrAcceptancePlanSha256(plan);
const token = expectedUsptoTsdrAcceptanceAuthorityToken(plan, sha);

describe("USPTO TSDR acceptance runner authority", () => {
  it("keeps validation-only as the CLI default", () => {
    expect(parseUsptoTsdrAcceptanceArguments(["--plan", "C:\\tmp\\plan.json"])).toMatchObject({
      apply: false,
      dispatch: false,
    });
  });

  it("requires apply before dispatch", () => {
    expect(() =>
      parseUsptoTsdrAcceptanceArguments(["--plan", "C:\\tmp\\plan.json", "--dispatch"]),
    ).toThrow(/dispatch requires --apply/);
  });

  it("requires both exact SHA and authority token for apply", () => {
    expect(() =>
      parseUsptoTsdrAcceptanceArguments(["--plan", "C:\\tmp\\plan.json", "--apply"]),
    ).toThrow(/expected-sha and --authority-token/);
  });

  it("admits only the exact newly-derived GO token for this plan and stage", () => {
    expect(
      assertUsptoTsdrAcceptanceAuthority({
        plan,
        planSha256: sha,
        expectedSha: sha,
        authorityToken: token,
      }).authorityTokenSha256,
    ).toMatch(/^[a-f0-9]{64}$/);

    expect(() =>
      assertUsptoTsdrAcceptanceAuthority({
        plan,
        planSha256: sha,
        expectedSha: sha,
        authorityToken: token.replace("INDEX", "SELECTED_DOCUMENT"),
      }),
    ).toThrow(/authority token/);
  });

  it("rejects an old GO token after any frozen plan hash change", () => {
    expect(() =>
      assertUsptoTsdrAcceptanceAuthority({
        plan,
        planSha256: sha,
        expectedSha: "0".repeat(64),
        authorityToken: token,
      }),
    ).toThrow(/expected SHA/);
  });
});
