import { describe, expect, it } from "vitest";
import { RegistryValidationError } from "./index";
import { parseRepresentativeLiveCanarySummary } from "./source-compatibility-import";

describe("representative live canary compatibility import", () => {
  it("maps degraded CNIPA evidence and authority baseline into a governed observation", () => {
    const observations = parseRepresentativeLiveCanarySummary({
      version: "REPRESENTATIVE_SOURCE_LIVE_CANARY_RESULT_V2",
      observedAt: "2026-08-18T00:00:00.000Z",
      observations: [
        {
          jurisdiction: "CN",
          profile: "DYNAMIC_PORTAL",
          targetId: "cn-cnipa-trademark-search",
          family: "SEARCH",
          requestedUri: "https://wcjs.sbj.cnipa.gov.cn/txnT01.do",
          renderJavascript: true,
          state: "DEGRADED",
          elapsedMs: 75000,
          pagesAttempted: 0,
          artifactCount: 0,
          artifactKinds: [],
          finalUris: [],
          totalBytes: 0,
          errorCode: "CANARY_ADAPTER_REQUIRED",
          errorMessage: "primary interaction timed out",
          authorityBaseline: {
            targetId: "cn-cnipa-trademark-filing-guide",
            family: "FILING",
            requestedUri: "https://www.cnipa.gov.cn/art/2020/12/21/art_2488_155734.html",
            renderJavascript: false,
            state: "PASS",
            elapsedMs: 2100,
            pagesAttempted: 1,
            artifactCount: 2,
            artifactKinds: ["HTML", "MARKDOWN"],
            finalUris: ["https://www.cnipa.gov.cn/art/2020/12/21/art_2488_155734.html"],
            totalBytes: 10000,
          },
        },
      ],
    });

    expect(observations).toHaveLength(1);
    expect(observations[0]).toMatchObject({
      targetId: "cn-cnipa-trademark-search",
      jurisdiction: "CN",
      state: "DEGRADED",
      observedAt: "2026-08-18T00:00:00.000Z",
      renderJavascript: true,
      errorCode: "CANARY_ADAPTER_REQUIRED",
      baselineTargetId: "cn-cnipa-trademark-filing-guide",
      baselineState: "PASS",
    });
  });

  it("rejects unsupported or malformed summaries", () => {
    expect(() =>
      parseRepresentativeLiveCanarySummary({ version: "OLD", observedAt: "now", observations: [] }),
    ).toThrow(RegistryValidationError);
    expect(() =>
      parseRepresentativeLiveCanarySummary({
        version: "REPRESENTATIVE_SOURCE_LIVE_CANARY_RESULT_V2",
        observedAt: "2026-08-18T00:00:00.000Z",
        observations: [{ state: "UNKNOWN" }],
      }),
    ).toThrow(RegistryValidationError);
  });
});
