import { describe, expect, it } from "vitest";
import {
  deriveFoundationalReadinessStage,
  parseFoundationalSupplyHealth,
} from "../src/source-foundational-readiness";

function payload(compatibility: Record<string, unknown> | undefined) {
  return {
    items: [
      {
        targetId: "cn-cnipa-trademark-search",
        sourceIds: ["source-cnipa-search"],
        state: "READY",
        registrationState: "REGISTERED",
        latestRun: { status: "COMPLETED" },
        acquisition: { artifactCount: 2 },
        normalization: { readyDocumentCount: 1 },
        retrieval: { currentDocumentCount: 1 },
        freshness: { state: "FRESH" },
        ...(compatibility ? { compatibility } : {}),
        gaps: [],
      },
    ],
  };
}

describe("worker foundational compatibility parsing", () => {
  it("preserves stale compatibility so worker readiness sees the same HEALTH debt as Admin", () => {
    const [item] = parseFoundationalSupplyHealth(
      payload({
        state: "BLOCKED",
        freshness: "STALE",
        observedAt: "2026-08-15T00:00:00.000Z",
      }),
    );

    expect(item).toMatchObject({
      compatibilityState: "BLOCKED",
      compatibilityFreshness: "STALE",
      compatibilityObservedAt: "2026-08-15T00:00:00.000Z",
    });
    expect(deriveFoundationalReadinessStage(item)).toBe("HEALTH");
  });

  it("defaults legacy health payloads to neutral UNOBSERVED compatibility", () => {
    const [item] = parseFoundationalSupplyHealth(payload(undefined));

    expect(item).toMatchObject({
      compatibilityState: "UNOBSERVED",
      compatibilityFreshness: "UNOBSERVED",
      compatibilityObservedAt: null,
    });
    expect(deriveFoundationalReadinessStage(item)).toBe("READY");
  });

  it("rejects unknown compatibility vocabulary instead of silently dropping it", () => {
    expect(() =>
      parseFoundationalSupplyHealth(
        payload({ state: "UNKNOWN", freshness: "FRESH", observedAt: null }),
      ),
    ).toThrow(/compatibility.state/);
    expect(() =>
      parseFoundationalSupplyHealth(
        payload({ state: "PASS", freshness: "ANCIENT", observedAt: null }),
      ),
    ).toThrow(/compatibility.freshness/);
  });
});
