import { describe, expect, it } from "vitest";
import { UsptoPipelineRunner } from "@markorbit/worker-runtime";

describe("USPTO pipeline integration", () => {
  it("converts source payload into normalized trademark record", async () => {
    const runner = new UsptoPipelineRunner();
    const result = await runner.run({
      applicationNumber: "TEST-001",
      mark: "MARK ORBIT",
      owner: "Example Owner",
      status: "LIVE",
    });

    expect(result.record.mark).toBe("MARK ORBIT");
    expect(result.artifact.sourceId).toBe("USPTO");
  });
});
