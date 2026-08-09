import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { StagingDocumentDescriptor } from "@markorbit/contracts";
import { LocalObsidianVaultProjectionRepository } from "../src/obsidian-vault-projection";
import type {
  StagingContentRegistryRepository,
  StagingDocumentRecord,
} from "../src/staging-content-registry";

const cleanup: string[] = [];
afterEach(() => cleanup.splice(0).forEach((path) => rmSync(path, { recursive: true, force: true })));

function descriptor(
  status: StagingDocumentDescriptor["status"] = "READY",
  targetPath = "sources/uspto/trademarks.md",
): StagingDocumentDescriptor {
  return {
    contractVersion: "1.0",
    objectType: "STAGING_DOCUMENT_DESCRIPTOR",
    id: "std_01H00000000000000000000000",
    workspaceId: "wsp_01H00000000000000000000000",
    sourceId: "src_01H00000000000000000000000",
    rawArtifactId: "art_01H00000000000000000000000",
    conversionRunId: "cvr_01H00000000000000000000000",
    title: "USPTO Trademarks",
    targetPath,
    outputFormat: "MARKDOWN",
    contentHash: { algorithm: "SHA-256", value: "a".repeat(64) },
    sizeBytes: 20,
    contentAddressedRef: `cas:sha256:${"a".repeat(64)}`,
    frontmatterSummary: { fieldCount: 0, fields: [] },
    converter: { converterId: "builtin-markdown-staging", version: "1.0.0" },
    generatedAt: "2026-08-09T00:00:00.000Z",
    validation: { outcome: "PASS", checks: [], warnings: [] },
    status,
  };
}

function staging(
  value = new TextEncoder().encode("---\nmarkorbit:\n---\n# USPTO\n"),
  status: StagingDocumentDescriptor["status"] = "READY",
  targetPath = "sources/uspto/trademarks.md",
): StagingContentRegistryRepository {
  const record: StagingDocumentRecord = {
    descriptor: descriptor(status, targetPath),
    createdAt: "2026-08-09T00:00:00.000Z",
    updatedAt: "2026-08-09T00:00:00.000Z",
  };
  return {
    ingestGenerated() {
      throw new Error("not used");
    },
    getDocument(id, workspaceId) {
      return id === record.descriptor.id && workspaceId === record.descriptor.workspaceId
        ? record
        : null;
    },
    getByConversionRun() {
      return null;
    },
    listDocuments() {
      return { items: [record], total: 1, limit: 25, offset: 0 };
    },
    readContent(id, workspaceId) {
      if (id !== record.descriptor.id || workspaceId !== record.descriptor.workspaceId) {
        throw new Error("missing");
      }
      return value;
    },
  };
}

function vaultRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "markorbit-obsidian-"));
  cleanup.push(root);
  return root;
}

describe("Local Obsidian Vault projection", () => {
  it("writes verified canonical Markdown under workspace and target path", () => {
    const bytes = new TextEncoder().encode("---\nmarkorbit:\n---\n# USPTO\n");
    const root = vaultRoot();
    const projector = new LocalObsidianVaultProjectionRepository(staging(bytes), root);
    const result = projector.project(
      "wsp_01H00000000000000000000000",
      "std_01H00000000000000000000000",
    );

    expect(result.written).toBe(true);
    expect(result.vaultRelativePath).toBe(
      "wsp_01H00000000000000000000000/sources/uspto/trademarks.md",
    );
    expect(
      readFileSync(
        join(
          root,
          "wsp_01H00000000000000000000000",
          "sources",
          "uspto",
          "trademarks.md",
        ),
      ).equals(Buffer.from(bytes)),
    ).toBe(true);

    const replay = projector.project(
      "wsp_01H00000000000000000000000",
      "std_01H00000000000000000000000",
    );
    expect(replay.written).toBe(false);
  });

  it("rejects unverified staging and unsafe target paths", () => {
    expect(() =>
      new LocalObsidianVaultProjectionRepository(staging(undefined, "BLOCKED"), vaultRoot()).project(
        "wsp_01H00000000000000000000000",
        "std_01H00000000000000000000000",
      ),
    ).toThrow("OBSIDIAN_PROJECTION_REQUIRES_READY_STAGING");

    expect(() =>
      new LocalObsidianVaultProjectionRepository(
        staging(undefined, "READY", "../escape.md"),
        vaultRoot(),
      ).project(
        "wsp_01H00000000000000000000000",
        "std_01H00000000000000000000000",
      ),
    ).toThrow("unsafe path segment");
  });
});
