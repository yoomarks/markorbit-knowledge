import { describe, expect, it } from "vitest";
import { parseRadarDiscoveryIntakeRequest } from "./radar-source-intake-request";

function validPlan() {
  return {
    version: "radar-source-intake-v1",
    mode: "PLAN",
    inputLabel: "radar",
    generatedAt: "2026-08-18T01:30:00.000Z",
    mutationPerformed: false,
    activationAuthorized: false,
    collectionAuthorized: false,
    sourceProposals: [],
    candidateProposals: [],
    coverageGaps: [],
    subscriptionEvidence: [],
    routingEvidence: [],
    issues: [],
    summary: {
      filesPresent: 5,
      sourceRows: 0,
      sourceProposals: 0,
      candidateRows: 0,
      candidateProposals: 0,
      coverageGapRows: 0,
      subscriptionRows: 0,
      routingRows: 0,
      errors: 0,
      warnings: 0,
    },
  };
}

describe("Radar Discovery intake request validation", () => {
  it("accepts only the explicit workspace plus a zero-authority PLAN", () => {
    const parsed = parseRadarDiscoveryIntakeRequest({
      workspaceId: "  wsp_radar  ",
      plan: validPlan(),
    });

    expect(parsed.workspaceId).toBe("wsp_radar");
    expect(parsed.plan).toMatchObject({
      version: "radar-source-intake-v1",
      mode: "PLAN",
      mutationPerformed: false,
      activationAuthorized: false,
      collectionAuthorized: false,
    });
  });

  it.each(["mutationPerformed", "activationAuthorized", "collectionAuthorized"] as const)(
    "rejects a tampered %s authorization flag",
    (field) => {
      expect(() =>
        parseRadarDiscoveryIntakeRequest({
          workspaceId: "wsp_radar",
          plan: { ...validPlan(), [field]: true },
        }),
      ).toThrow(/zero-mutation, zero-authorization PLAN/);
    },
  );

  it("rejects unknown top-level fields instead of silently accepting operator drift", () => {
    expect(() =>
      parseRadarDiscoveryIntakeRequest({
        workspaceId: "wsp_radar",
        plan: validPlan(),
        autoActivate: true,
      }),
    ).toThrow(/Unknown Radar Discovery intake field/);
  });

  it("rejects malformed summary error counts", () => {
    expect(() =>
      parseRadarDiscoveryIntakeRequest({
        workspaceId: "wsp_radar",
        plan: { ...validPlan(), summary: { ...validPlan().summary, errors: -1 } },
      }),
    ).toThrow(/summary\.errors must be a non-negative integer/);
  });
});
