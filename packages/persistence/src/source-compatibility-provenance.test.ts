import { describe, expect, it } from "vitest";
import { RegistryValidationError } from "./index";
import { parseRepresentativeLiveCanarySummary } from "./source-compatibility-import";

function summary(evidenceContext: unknown) {
  return {
    version: "REPRESENTATIVE_SOURCE_LIVE_CANARY_RESULT_V2",
    observedAt: "2026-08-20T00:22:22.447Z",
    evidenceContext,
    observations: [
      {
        jurisdiction: "KR",
        profile: "MULTILINGUAL",
        targetId: "kr-moip-trademark-system",
        family: "PORTAL",
        requestedUri: "https://www.kipo.go.kr/en/HtmlApp?c=9300010&catmenu=ek04_01_01",
        renderJavascript: false,
        state: "BLOCKED",
        elapsedMs: 78940,
        pagesAttempted: 0,
        artifactCount: 0,
        artifactKinds: [],
        finalUris: [],
        totalBytes: 0,
        errorCode: "CRAWL4AI_FETCH_FAILED",
        errorMessage: "Page.goto: Timeout 75000ms exceeded.",
      },
    ],
  };
}

describe("live canary compatibility provenance", () => {
  it("retains complete GitHub run provenance in observation details", () => {
    const [observation] = parseRepresentativeLiveCanarySummary(
      summary({
        provider: "GITHUB_ACTIONS",
        repository: "yoomarks/markorbit-knowledge",
        runId: "32317279058",
        runAttempt: "1",
        commitSha: "fd0cdd739c344d7a024e795968aa7267fa9f1f23",
        workflow: "Representative Source Live Canary",
        eventName: "pull_request",
        serverUrl: "https://github.com",
      }),
    );

    expect(observation?.details).toMatchObject({
      evidenceContext: {
        provider: "GITHUB_ACTIONS",
        repository: "yoomarks/markorbit-knowledge",
        runId: "32317279058",
        runAttempt: "1",
        commitSha: "fd0cdd739c344d7a024e795968aa7267fa9f1f23",
        workflow: "Representative Source Live Canary",
        eventName: "pull_request",
        serverUrl: "https://github.com",
      },
    });
  });

  it("fails closed when a supplied evidence context is incomplete", () => {
    expect(() =>
      parseRepresentativeLiveCanarySummary(
        summary({
          provider: "GITHUB_ACTIONS",
          repository: "yoomarks/markorbit-knowledge",
          runId: "32317279058",
        }),
      ),
    ).toThrow(RegistryValidationError);
  });
});
