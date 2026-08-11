import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import type { VaultInspectionRunV1 } from "@markorbit/contracts";
import { DEFAULT_WORKSPACE, initializeRegistry } from "./index";
import { SqliteVaultInspectionRunRepository } from "./vault-inspection-run-registry";

function run(id = "vin_01K08TEST000000000000000001"): VaultInspectionRunV1 {
  return {
    contractVersion: "1.0",
    objectType: "VAULT_INSPECTION_RUN",
    id,
    workspaceId: DEFAULT_WORKSPACE.id,
    rootFingerprintSha256: "a".repeat(64),
    binding: {
      bindingId: "vlt_01K08TEST000000000000000001",
      revision: 3,
      relativeRoot: "MarkOrbit/Review",
    },
    candidates: [
      {
        vaultRelativePath: "MarkOrbit/Review/incoming/new-note.md",
        bindingRelativePath: "incoming/new-note.md",
        classification: "IMPORT_CANDIDATE",
        observedSha256: "b".repeat(64),
        sizeBytes: 42,
        frontmatter: {
          status: "PARSED_SIMPLE",
          keys: ["title", "source"],
          fields: { title: "New note", source: "manual" },
        },
        wikiLinks: ["Existing Note"],
      },
      {
        vaultRelativePath: "MarkOrbit/Review/managed/missing.md",
        bindingRelativePath: "managed/missing.md",
        classification: "MISSING",
        managedExport: {
          exportRunId: "vex_01K07TEST000000000000000001",
          stagingDocumentId: "stg_01K07TEST000000000000000001",
          contentSha256: "c".repeat(64),
        },
        frontmatter: { status: "NONE", keys: [], fields: {} },
        wikiLinks: [],
      },
    ],
    observedAt: "2026-08-11T11:20:00.000Z",
  };
}

describe("Vault inspection run registry", () => {
  it("persists immutable read-only inspection evidence and lists newest first", () => {
    const database = new DatabaseSync(":memory:");
    initializeRegistry(database);
    const repository = new SqliteVaultInspectionRunRepository(database);

    const first = repository.record(run());
    const second = repository.record({
      ...run("vin_01K08TEST000000000000000002"),
      observedAt: "2026-08-11T11:21:00.000Z",
    });

    expect(repository.getById(DEFAULT_WORKSPACE.id, first.id)).toEqual(first);
    expect(repository.list(DEFAULT_WORKSPACE.id, 10).map((item) => item.id)).toEqual([
      second.id,
      first.id,
    ]);
  });

  it("replays an exact run ID but rejects different evidence under the same ID", () => {
    const database = new DatabaseSync(":memory:");
    initializeRegistry(database);
    const repository = new SqliteVaultInspectionRunRepository(database);
    const original = run();

    expect(repository.record(original)).toEqual(original);
    expect(repository.record(original)).toEqual(original);
    expect(() =>
      repository.record({
        ...original,
        rootFingerprintSha256: "d".repeat(64),
      }),
    ).toThrowError(/already bound to different evidence/u);
  });

  it("rejects candidates whose path or tracked hash semantics do not match frozen evidence", () => {
    const database = new DatabaseSync(":memory:");
    initializeRegistry(database);
    const repository = new SqliteVaultInspectionRunRepository(database);
    const original = run();

    expect(() =>
      repository.record({
        ...original,
        candidates: [
          {
            ...original.candidates[0],
            vaultRelativePath: "OtherRoot/incoming/new-note.md",
          },
        ],
      }),
    ).toThrowError(/escaped its frozen binding/u);
  });
});
