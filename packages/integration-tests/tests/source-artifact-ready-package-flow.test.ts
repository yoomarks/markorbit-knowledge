import { describe, expect, it } from "vitest";

import { MemoryArtifactStorage } from "@markorbit/worker-runtime";
import { ReadyPackageBuilder } from "@markorbit/worker-runtime";

describe("source artifact ready package flow", () => {
  it("stores artifact and creates ready package evidence", async () => {
    const storage = new MemoryArtifactStorage();
    const artifact = {
      id: "artifact-1",
      sourceId: "uspto",
      contentType: "application/json",
      payload: "{}",
      metadata: { kind: "trademark-record" },
      capturedAt: new Date().toISOString(),
    };

    await storage.put(artifact);
    const saved = await storage.get(artifact.id);

    const pkg = new ReadyPackageBuilder().create({
      id: "package-1",
      workspaceId: "workspace-1",
      artifactIds: [saved!.id],
      stagingDocumentId: "staging-1",
      digest: "digest-1",
    });

    expect(saved?.sourceId).toBe("uspto");
    expect(pkg.evidence.artifactIds).toContain("artifact-1");
  });
});
