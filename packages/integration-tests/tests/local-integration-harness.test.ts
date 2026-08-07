import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { LocalIntegrationHarness } from "../src/local-integration-harness";

describe("LocalIntegrationHarness", () => {
  it("assembles the real migration chain and control-plane repositories", () => {
    const harness = new LocalIntegrationHarness({
      clock: () => new Date("2026-07-19T01:00:00Z"),
    });
    try {
      expect(harness.migrationIds()).toContain("0013_staging_verification_pipeline");
      expect(harness.inspection.list({ workspaceId: "wsp_missing" })).toEqual({
        items: [],
        total: 0,
        limit: 25,
        offset: 0,
      });
      expect(existsSync(harness.casDirectory)).toBe(true);
    } finally {
      const root = harness.rootDirectory;
      harness.close();
      expect(existsSync(root)).toBe(false);
    }
  });

  it("provides deterministic local fixture input and single-use output boundaries", async () => {
    const harness = new LocalIntegrationHarness();
    try {
      const bytes = new TextEncoder().encode("integration harness\n");
      harness.reader.register("art_local", bytes);
      expect(
        await harness.reader.read({
          rawArtifactId: "art_local",
          expectedBytes: bytes.byteLength,
          expectedSha256: await crypto.subtle
            .digest("SHA-256", bytes)
            .then((value) => Buffer.from(value).toString("hex")),
        } as never),
      ).toEqual(bytes);

      const evidence = await harness.uploader.upload(
        {
          id: "cug_local",
          normalizedTargetPath: "00_Inbox/local.md",
          maximumBytes: 1000,
        } as never,
        bytes,
      );
      expect(evidence.targetPath).toBe("00_Inbox/local.md");
      await expect(
        harness.uploader.upload(
          {
            id: "cug_local",
            normalizedTargetPath: "00_Inbox/local.md",
            maximumBytes: 1000,
          } as never,
          bytes,
        ),
      ).rejects.toThrow("LOCAL_OUTPUT_GRANT_ALREADY_USED");
    } finally {
      harness.close();
    }
  });
});
