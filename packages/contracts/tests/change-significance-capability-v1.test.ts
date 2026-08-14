import { describe, expect, it } from "vitest";
import {
  CHANGE_SIGNIFICANCE_CAPABILITY_ID,
  CHANGE_SIGNIFICANCE_CAPABILITY_VERSION,
  isChangeSignificanceResponseV1,
} from "../src/change-significance-capability-v1";

function validResponse() {
  return {
    version: CHANGE_SIGNIFICANCE_CAPABILITY_VERSION,
    capability: CHANGE_SIGNIFICANCE_CAPABILITY_ID,
    provider: { providerId: "shared-capability-test", model: "test-model" },
    generatedAt: "2026-08-15T02:00:00.000Z",
    level: "SIGNIFICANT" as const,
    summary: "The observed source body changed materially.",
    reason: "Multiple objective source signals differ from the previous observation.",
    signals: ["content hash changed"],
  };
}

describe("change significance capability v1", () => {
  it("accepts a provider-neutral response", () => {
    expect(isChangeSignificanceResponseV1(validResponse())).toBe(true);
  });

  it("rejects an unknown significance level", () => {
    const response = validResponse() as unknown as Record<string, unknown>;
    response.level = "CRITICAL";
    expect(isChangeSignificanceResponseV1(response)).toBe(false);
  });

  it("requires provider identity", () => {
    const response = validResponse() as unknown as { provider: Record<string, unknown> };
    response.provider = {};
    expect(isChangeSignificanceResponseV1(response)).toBe(false);
  });

  it("rejects an incompatible protocol version", () => {
    const response = validResponse() as unknown as Record<string, unknown>;
    response.version = "2.0";
    expect(isChangeSignificanceResponseV1(response)).toBe(false);
  });
});
