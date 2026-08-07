import { describe, expect, it } from "vitest";
import { CoreIntakeAdapter } from "@markorbit/worker-runtime";

describe("knowledge pipeline boundary", () => {
  it("keeps core intake behind the ready package boundary", async () => {
    const adapter = new CoreIntakeAdapter();
    expect(adapter).toBeDefined();
  });
});
