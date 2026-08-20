import { describe, expect, it } from "vitest";
import { RegistryValidationError } from "./index";
import { parseRepresentativeLiveCanarySummary } from "./source-compatibility-import";

describe("representative live canary compatibility import", () => {
  it("maps degraded CNIPA evidence, artifact gap and authority baseline into a governed observation", () => {
    const observations = parseRepresentativeLiveCanarySummary({
      version: "REPRESENTATIVE_SOURCE_LIVE_CANARY_RESULT_V2",
      observedAt: "2026-08-20T16:45:00.000Z",
      observations: [
        {
          jurisdiction: "CN",
          profile: "DYNAMIC_PORTAL",
          targetId: "cn-cnipa-trademark-search",
          family: "SEARCH",
          requestedUri: "https://sbj.cnipa.gov.cn/sbj/sbcx/",
          renderJavascript: true,
          expectedArtifactKinds: ["HTML", "JSON"],
          missingExpectedArtifactKinds: ["JSON"],
          state: "DEGRADED",
          elapsedMs: 12000,
          pagesAttempted: 1,
          artifactCount: 2,
          artifactKinds: ["HTML", "MARKDOWN"],
          finalUris: ["https://sbj.cnipa.gov.cn/sbj/sbcx/"],
          totalBytes: 10000,
          errorCode: "CANARY_ADAPTER_REQUIRED",
          errorMessage: "structured artifact contract incomplete",
          authorityBaseline: {
            targetId: "cn-cnipa-trademark-filing-guide",
            family: "FILING",
            requestedUri: "https://www.cnipa.gov.cn/art/2020/12/21/art_2488_155734.html",
            renderJavascript: false,
            expectedArtifactKinds: ["HTML", "MARKDOWN"],
            missingExpectedArtifactKinds: [],
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
      observedAt: "2026-08-20T16:45:00.000Z",
      renderJavascript: true,
      errorCode: "CANARY_ADAPTER_REQUIRED",
      baselineTargetId: "cn-cnipa-trademark-filing-guide",
      baselineState: "PASS",
      details: {
        expectedArtifactKinds: ["HTML", "JSON"],
        missingExpectedArtifactKinds: ["JSON"],
        artifactKinds: ["HTML", "MARKDOWN"],
        authorityBaseline: {
          expectedArtifactKinds: ["HTML", "MARKDOWN"],
          missingExpectedArtifactKinds: [],
          artifactKinds: ["HTML", "MARKDOWN"],
        },
      },
    });
  });

  it("keeps older V2 summaries without artifact-contract fields importable", () => {
    const observations = parseRepresentativeLiveCanarySummary({
      version: "REPRESENTATIVE_SOURCE_LIVE_CANARY_RESULT_V2",
      observedAt: "2026-08-18T00:00:00.000Z",
      observations: [
        {
          jurisdiction: "KR",
          profile: "MULTILINGUAL",
          targetId: "kr-moip-trademark-system",
          family: "PORTAL",
          requestedUri: "https://www.kipo.go.kr/en/",
          renderJavascript: false,
          state: "BLOCKED",
          elapsedMs: 75000,
          pagesAttempted: 0,
          artifactCount: 0,
          artifactKinds: [],
          finalUris: [],
          totalBytes: 0,
          errorCode: "CRAWL4AI_FETCH_FAILED",
        },
      ],
    });

    expect(observations[0]?.details).not.toHaveProperty("expectedArtifactKinds");
    expect(observations[0]?.details).not.toHaveProperty("missingExpectedArtifactKinds");
  });

  it("rejects unsupported, malformed or invalid artifact-contract summaries", () => {
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
    expect(() =>
      parseRepresentativeLiveCanarySummary({
        version: "REPRESENTATIVE_SOURCE_LIVE_CANARY_RESULT_V2",
        observedAt: "2026-08-20T16:45:00.000Z",
        observations: [
          {
            jurisdiction: "IN",
            profile: "DYNAMIC_PORTAL",
            targetId: "in-ipindia-trademark-search",
            family: "SEARCH",
            requestedUri: "https://tmrsearch.ipindia.gov.in/",
            renderJavascript: true,
            state: "DEGRADED",
            expectedArtifactKinds: ["HTML", 3],
          },
        ],
      }),
    ).toThrow(RegistryValidationError);
  });
});
