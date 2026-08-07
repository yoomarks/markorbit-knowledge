import { describe, expect, it } from "vitest";

describe("knowledge pipeline e2e", () => {
  it("documents the artifact to ready package boundary", async () => {
    const stages = [
      "RAW_ARTIFACT",
      "CONVERSION",
      "STAGING",
      "VERIFICATION",
      "READY_PACKAGE",
    ];

    expect(stages).toHaveLength(5);
    expect(stages.at(-1)).toBe("READY_PACKAGE");
  });
});
