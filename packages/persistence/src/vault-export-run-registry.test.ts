import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { DEFAULT_WORKSPACE, initializeRegistry } from "./index";
import { SqliteVaultExportRunRepository } from "./vault-export-run-registry";

const SHA_A = "a".repeat(64);
const SHA_B = "b".repeat(64);

function fixture() {
  const database = new DatabaseSync(":memory:");
  initializeRegistry(database);
  let tick = 0;
  const repository = new SqliteVaultExportRunRepository(
    database,
    () => new Date(`2026-08-11T10:0${tick++}:00.000Z`),
    () => "vex_01K07TEST000000000000000001",
  );
  return { database, repository };
}

function input(overrides: Partial<Parameters<SqliteVaultExportRunRepository["prepare"]>[0]> = {}) {
  return {
    workspaceId: DEFAULT_WORKSPACE.id,
    rootFingerprintSha256: SHA_A,
    binding: {
      bindingId: "vlt_01K06TEST000000000000000001",
      revision: 3,
      relativeRoot: "MarkOrbit/Global Public",
    },
    staging: {
      stagingDocumentId: "stg_01K07TEST000000000000000001",
      contentSha256: SHA_B,
      targetPath: "official/uspto/guide.md",
    },
    ...overrides,
  };
}

describe("Vault export run registry", () => {
  it("persists PENDING before projection and replays the exact frozen request", () => {
    const { repository } = fixture();
    const first = repository.prepare(input());
    const replay = repository.prepare(input());

    expect(first.replayed).toBe(false);
    expect(first.run).toMatchObject({
      id: "vex_01K07TEST000000000000000001",
      state: "PENDING",
      rootFingerprintSha256: SHA_A,
      binding: { revision: 3, relativeRoot: "MarkOrbit/Global Public" },
      staging: { targetPath: "official/uspto/guide.md", contentSha256: SHA_B },
    });
    expect(replay.replayed).toBe(true);
    expect(replay.run).toEqual(first.run);
    expect(
      repository.getPendingByStaging(DEFAULT_WORKSPACE.id, first.run.staging.stagingDocumentId),
    ).toEqual(first.run);
  });

  it("fails closed when an unresolved Staging export is submitted for a different destination", () => {
    const { repository } = fixture();
    repository.prepare(input());

    expect(() =>
      repository.prepare(
        input({
          rootFingerprintSha256: SHA_B,
        }),
      ),
    ).toThrowError(/frozen to another Vault destination/u);
  });

  it("persists projection receipt before terminal finalization and replays finalization locally", () => {
    const { repository } = fixture();
    const prepared = repository.prepare(input()).run;
    const withReceipt = repository.recordProjectionReceipt(DEFAULT_WORKSPACE.id, prepared.id, {
      vaultRelativePath: "MarkOrbit/Global Public/official/uspto/guide.md",
      contentSha256: SHA_B,
      disposition: "WRITTEN",
    });

    expect(withReceipt.state).toBe("PENDING");
    expect(withReceipt.projectionReceipt?.disposition).toBe("WRITTEN");
    expect(withReceipt.result).toBeUndefined();

    const finalized = repository.finalize(DEFAULT_WORKSPACE.id, prepared.id);
    expect(finalized.state).toBe("SUCCEEDED");
    expect(finalized.result).toEqual(finalized.projectionReceipt);
    expect(repository.finalize(DEFAULT_WORKSPACE.id, prepared.id)).toEqual(finalized);
  });

  it("rejects a second different projection receipt for the same frozen run", () => {
    const { repository } = fixture();
    const prepared = repository.prepare(input()).run;
    repository.recordProjectionReceipt(DEFAULT_WORKSPACE.id, prepared.id, {
      vaultRelativePath: "MarkOrbit/Global Public/official/uspto/guide.md",
      contentSha256: SHA_B,
      disposition: "WRITTEN",
    });

    expect(() =>
      repository.recordProjectionReceipt(DEFAULT_WORKSPACE.id, prepared.id, {
        vaultRelativePath: "MarkOrbit/Global Public/official/uspto/guide.md",
        contentSha256: SHA_B,
        disposition: "ALREADY_PRESENT",
      }),
    ).toThrowError(/different projection receipt/u);
  });
});
