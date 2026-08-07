import { describe, expect, it } from "vitest";
import { ReadyPackageBuilder } from "@markorbit/worker-runtime";
import { CoreIntakeAdapter } from "@markorbit/worker-runtime";

describe("knowledge acquisition e2e boundary", () => {
  it("hands a verified ready package to core intake", async () => {
    const builder = new ReadyPackageBuilder();
    const adapter = new CoreIntakeAdapter();

    const pkg = builder.build({
      id: "ready-test",
      workspaceId: "workspace-test",
      artifactIds: ["artifact-1"],
      stagingDocumentId: "staging-1",
      digest: "sha256:test",
    });

    const result = adapter.accept(pkg);

    expect(pkg.evidence.artifactIds).toContain("artifact-1");
    expect(result.readyPackageId).toBe("ready-test");
  });
});
