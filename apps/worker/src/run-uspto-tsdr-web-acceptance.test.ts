import { describe, expect, it } from "vitest";
import {
  assertUsptoTsdrWebAcceptanceAuthority,
  expectedUsptoTsdrWebAcceptanceAuthorityToken,
  parseUsptoTsdrWebAcceptanceArguments,
} from "./run-uspto-tsdr-web-acceptance";
import {
  parseUsptoTsdrWebAcceptancePlan,
  usptoTsdrWebAcceptancePlanSha256,
} from "./uspto-tsdr-web-acceptance-plan";

const plan = parseUsptoTsdrWebAcceptancePlan({
  version: 1,
  operationId: "web-proof-90817045-status",
  workspaceId: "wsp_01ARZ3NDEKTSV4RRFFQ69G5FAV",
  authorityMode: "INTERNAL_SERVICE_GO_V1",
  executionMode: "APPLY_DISPATCH_ONCE",
  workerMode: "PROVISION_ONE_SHOT",
  channel: "WEB",
  stage: "STATUS",
  transportMode: "STATIC_HTTP_PINNED",
  serialNumber: "90817045",
});

describe("TSDR Web acceptance runner authority", () => {
  it("keeps validate-only as the default", () => {
    expect(parseUsptoTsdrWebAcceptanceArguments(["--plan", "/tmp/plan.json"])).toMatchObject({
      apply: false,
      dispatch: false,
    });
  });

  it("requires apply and dispatch together", () => {
    expect(() =>
      parseUsptoTsdrWebAcceptanceArguments(["--plan", "/tmp/plan.json", "--apply"]),
    ).toThrow(/requires --dispatch/u);
    expect(() =>
      parseUsptoTsdrWebAcceptanceArguments(["--plan", "/tmp/plan.json", "--dispatch"]),
    ).toThrow(/requires --apply/u);
  });

  it("requires exact SHA and exact stage-scoped GO", () => {
    const sha = usptoTsdrWebAcceptancePlanSha256(plan);
    const token = expectedUsptoTsdrWebAcceptanceAuthorityToken(plan, sha);
    expect(
      assertUsptoTsdrWebAcceptanceAuthority({
        plan,
        planSha256: sha,
        expectedSha: sha,
        authorityToken: token,
      }),
    ).toMatchObject({ authorityTokenSha256: expect.stringMatching(/^[a-f0-9]{64}$/u) });

    expect(() =>
      assertUsptoTsdrWebAcceptanceAuthority({
        plan,
        planSha256: sha,
        expectedSha: sha,
        authorityToken: token.replace("STATUS", "DOCUMENT_INDEX"),
      }),
    ).toThrow(/authority token/u);
  });
});
