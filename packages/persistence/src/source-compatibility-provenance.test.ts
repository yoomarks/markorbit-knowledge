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
  it("retains source and workflow revisions in GitHub run provenance", () => {
    const [observation] = parseRepresentativeLiveCanarySummary(
      summary({
        provider: "GITHUB_ACTIONS",
        repository: "yoomarks/markorbit-knowledge",
        runId: "32318087892",
        runAttempt: "1",
        commitSha: "6a72a92d9e57237c3266f05e75388258f728b830",
        workflowSha: "5325b2d2a4eef2a239e4f72f6b88d3f630a8f31d",
        workflow: "Representative Source Live Canary",
        eventName: "pull_request",
        sourceRef: "agent/live-canary-evidence-provenance-v1",
        serverUrl: "https://github.com",
      }),
    );

    expect(observation?.details).toMatchObject({
      evidenceContext: {
        provider: "GITHUB_ACTIONS",
        repository: "yoomarks/markorbit-knowledge",
        runId: "32318087892",
        runAttempt: "1",
        commitSha: "6a72a92d9e57237c3266f05e75388258f728b830",
        workflowSha: "5325b2d2a4eef2a239e4f72f6b88d3f630a8f31d",
        workflow: "Representative Source Live Canary",
        eventName: "pull_request",
        sourceRef: "agent/live-canary-evidence-provenance-v1",
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
          runId: "32318087892",
        }),
      ),
    ).toThrow(RegistryValidationError);
  });

  it("rejects malformed git revisions instead of preserving ambiguous provenance", () => {
    expect(() =>
      parseRepresentativeLiveCanarySummary(
        summary({
          provider: "GITHUB_ACTIONS",
          repository: "yoomarks/markorbit-knowledge",
          runId: "32318087892",
          runAttempt: "1",
          commitSha: "not-a-sha",
          workflowSha: "5325b2d2a4eef2a239e4f72f6b88d3f630a8f31d",
          workflow: "Representative Source Live Canary",
          eventName: "pull_request",
        }),
      ),
    ).toThrow(RegistryValidationError);
  });
});
