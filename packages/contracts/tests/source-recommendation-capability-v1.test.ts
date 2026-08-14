import { describe, expect, it } from "vitest";
import {
  SOURCE_RECOMMENDATION_CAPABILITY_ID,
  SOURCE_RECOMMENDATION_CAPABILITY_VERSION,
  isSourceRecommendationResponseV1,
} from "../src/source-recommendation-capability-v1";

function validResponse() {
  return {
    version: SOURCE_RECOMMENDATION_CAPABILITY_VERSION,
    capability: SOURCE_RECOMMENDATION_CAPABILITY_ID,
    provider: { providerId: "shared-capability-test", model: "test-model" },
    generatedAt: "2026-08-15T02:00:00.000Z",
    items: [
      {
        url: "https://example.org/guidance",
        title: "Related official guidance",
        summary: "A durable public source related to the current source.",
        reason: "It provides an independent official reference.",
        relationshipHint: "OFFICIAL_LINK" as const,
        score: 93,
        priority: "HIGH" as const,
        evidenceUrls: ["https://example.org/about"],
      },
    ],
  };
}

describe("source recommendation capability v1", () => {
  it("accepts a provider-neutral source recommendation response", () => {
    expect(isSourceRecommendationResponseV1(validResponse())).toBe(true);
  });

  it("rejects non-http recommendation URLs", () => {
    const response = validResponse();
    response.items[0]!.url = "file:///tmp/private";
    expect(isSourceRecommendationResponseV1(response)).toBe(false);
  });

  it("rejects scores outside the normalized 0-100 range", () => {
    const response = validResponse();
    response.items[0]!.score = 101;
    expect(isSourceRecommendationResponseV1(response)).toBe(false);
  });

  it("rejects unknown relationship hints", () => {
    const response = validResponse() as unknown as {
      items: Array<Record<string, unknown>>;
    };
    response.items[0]!.relationshipHint = "SAME_TOPIC";
    expect(isSourceRecommendationResponseV1(response)).toBe(false);
  });
});
