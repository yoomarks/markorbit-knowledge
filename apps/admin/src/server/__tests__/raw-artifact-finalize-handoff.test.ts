import { describe, expect, it } from "vitest";
import { RegistryError } from "@markorbit/persistence";
import { createFinalizedRawArtifactHandoff } from "../raw-artifact-finalize-handoff";

const WORKSPACE = "wsp_01H00000000000000000000000";

describe("finalized RawArtifact automatic conversion handoff", () => {
  it("preserves the automatic conversion dispatch result", () => {
    const handoff = createFinalizedRawArtifactHandoff((artifactId, workspaceId) => {
      expect(artifactId).toBe("art_01H00000000000000000000000");
      expect(workspaceId).toBe(WORKSPACE);
      return {
        status: "ENQUEUED",
        artifactId,
        conversionProfileId: "cvp_01H00000000000000000000000",
        conversionRunId: "cvr_01H00000000000000000000000",
      };
    });

    expect(handoff("art_01H00000000000000000000000", WORKSPACE)).toEqual({
      status: "ENQUEUED",
      artifactId: "art_01H00000000000000000000000",
      conversionProfileId: "cvp_01H00000000000000000000000",
      conversionRunId: "cvr_01H00000000000000000000000",
    });
  });

  it("does not fail finalized evidence when governed conversion dispatch fails", () => {
    const handoff = createFinalizedRawArtifactHandoff(() => {
      throw new RegistryError("CONVERSION_DISPATCH_UNAVAILABLE", "converter queue unavailable");
    });

    expect(handoff("art_01H00000000000000000000001", WORKSPACE)).toEqual({
      status: "FAILED",
      artifactId: "art_01H00000000000000000000001",
      code: "CONVERSION_DISPATCH_UNAVAILABLE",
    });
  });

  it("uses a stable fallback code for unexpected dispatch failures", () => {
    const handoff = createFinalizedRawArtifactHandoff(() => {
      throw new Error("unexpected failure");
    });

    expect(handoff("art_01H00000000000000000000002", WORKSPACE)).toEqual({
      status: "FAILED",
      artifactId: "art_01H00000000000000000000002",
      code: "AUTO_CONVERSION_DISPATCH_FAILED",
    });
  });
});
