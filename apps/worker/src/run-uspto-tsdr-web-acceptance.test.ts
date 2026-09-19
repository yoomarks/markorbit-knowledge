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
  robotsPolicy: "RFC9309_4XX_UNAVAILABLE_ALLOW_5XX_UNREACHABLE_FAIL_V1",
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

  it("binds selected-document GO to the frozen parent and OA locator", () => {
    const selected = parseUsptoTsdrWebAcceptancePlan({
      version: 1,
      operationId: "web-proof-99047647-final-action-r1",
      workspaceId: "wsp_01ARZ3NDEKTSV4RRFFQ69G5FAV",
      authorityMode: "INTERNAL_SERVICE_GO_V1",
      executionMode: "APPLY_DISPATCH_ONCE",
      workerMode: "PROVISION_ONE_SHOT",
      channel: "WEB",
      stage: "SELECTED_DOCUMENT",
      transportMode: "STATIC_HTTP_PINNED",
      robotsPolicy: "RFC9309_4XX_UNAVAILABLE_ALLOW_5XX_UNREACHABLE_FAIL_V1",
      serialNumber: "99047647",
      format: "PDF",
      purpose: "CASE_RESEARCH",
      businessChain: "OA",
      document: {
        sourceIndexArtifactId: "art_01M2X01M8RS5MNFC953RM7N6Y3",
        sourceIndexArtifactSha256:
          "3544fddfc90f59b94603e908857ddb0208b80920c0e517b4c7d59cf46e91b837",
        sourceDocumentId: "FREF20260722103245",
        sourceDocumentType: "Final Action",
        sourceDescription: "Final Action",
        sourceDisplayDate: "Jul. 22, 2026",
        sourcePageCount: 1,
        family: "OFFICE_ACTION",
        classifierIdentity: "uspto-tsdr-document-family",
        classifierVersion: "1.1.0",
        downloadUrl:
          "https://tsdrsec.uspto.gov/ts/cd/tmcasedoc/downloadproxy?url=/api/casedoc/cms/case/99047647/office-action/OfficeAction8740681.pdf",
      },
    });
    const sha = usptoTsdrWebAcceptancePlanSha256(selected);
    const token = expectedUsptoTsdrWebAcceptanceAuthorityToken(selected, sha);
    expect(token).toBe(
      `GO #842 TSDR-WEB web-proof-99047647-final-action-r1 SELECTED_DOCUMENT ${sha}`,
    );
    expect(
      assertUsptoTsdrWebAcceptanceAuthority({
        plan: selected,
        planSha256: sha,
        expectedSha: sha,
        authorityToken: token,
      }),
    ).toMatchObject({ authorityTokenSha256: expect.stringMatching(/^[a-f0-9]{64}$/u) });
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
