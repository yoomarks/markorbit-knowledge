import { describe, expect, it } from "vitest";
import { CoreIntakeAdapter, IntakePipelineOrchestrator } from "../src/index";

describe("IntakePipelineOrchestrator", () => {
  it("does not report Core acceptance when only the side-effect-free adapter ran", async () => {
    const orchestrator = new IntakePipelineOrchestrator(new CoreIntakeAdapter());

    const receipt = await orchestrator.handoff({
      readyPackageId: "rdp_test",
      sourceId: "src_test",
      artifactId: "art_test",
    });

    expect(receipt).toEqual({
      readyPackageId: "rdp_test",
      accepted: false,
      transportStatus: "NOT_SUBMITTED",
    });
  });
});
