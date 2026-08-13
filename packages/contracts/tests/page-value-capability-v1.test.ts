import { describe, expect, it } from "vitest";
import {
  PAGE_VALUE_CAPABILITY_ID,
  PAGE_VALUE_CAPABILITY_VERSION,
  isPageValueScreeningResponseV1,
} from "../src/page-value-capability-v1";

function validResponse() {
  return {
    version: PAGE_VALUE_CAPABILITY_VERSION,
    capability: PAGE_VALUE_CAPABILITY_ID,
    provider: { providerId: "shared-capability-test", model: "test-model" },
    generatedAt: "2026-08-13T10:00:00.000Z",
    items: [
      {
        candidateId: "candidate-1",
        title: "Official guidance",
        summary: "A concise description of the page.",
        pageType: "GUIDANCE",
        valuePoints: ["official procedure", "durable reference"],
        score: 92,
        priority: "HIGH" as const,
      },
    ],
  };
}

describe("page value capability v1", () => {
  it("accepts a provider-neutral ranked screening response", () => {
    expect(isPageValueScreeningResponseV1(validResponse())).toBe(true);
  });

  it("rejects scores outside the normalized 0-100 range", () => {
    const response = validResponse();
    response.items[0]!.score = 101;
    expect(isPageValueScreeningResponseV1(response)).toBe(false);
  });

  it("rejects unknown priority values", () => {
    const response = validResponse() as unknown as {
      items: Array<Record<string, unknown>>;
    };
    response.items[0]!.priority = "URGENT";
    expect(isPageValueScreeningResponseV1(response)).toBe(false);
  });
});
