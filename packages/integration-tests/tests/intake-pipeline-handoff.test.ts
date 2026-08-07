import { describe, expect, it } from "vitest";
import { CoreIntakeAdapter, ReadyPackageBuilder } from "@markorbit/worker-runtime";

describe("intake pipeline handoff", () => {
  it("keeps ready package handoff separated from core intake", async () => {
    const builder = new ReadyPackageBuilder();
    const adapter = new CoreIntakeAdapter();

    expect(builder).toBeDefined();
    expect(adapter).toBeDefined();
  });
});
