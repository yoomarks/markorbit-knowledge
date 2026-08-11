import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { DEFAULT_WORKSPACE, initializeRegistry } from "./index";
import { SqliteVaultBindingRepository, normalizeVaultRelativeRoot } from "./vault-binding-registry";

function fixture() {
  const database = new DatabaseSync(":memory:");
  initializeRegistry(database);
  let tick = 0;
  const repository = new SqliteVaultBindingRepository(
    database,
    () => new Date(`2026-08-11T09:4${tick++}:00.000Z`),
    () => "vlt_01K06TEST000000000000000001",
  );
  return { database, repository };
}

describe("Vault binding registry", () => {
  it("creates one active local-filesystem binding per Workspace and updates with optimistic revision", () => {
    const { repository } = fixture();
    const created = repository.configure({
      workspaceId: DEFAULT_WORKSPACE.id,
      name: "Primary Review Vault",
      relativeRoot: "MarkOrbit/Global Public",
    });

    expect(created).toMatchObject({
      contractVersion: "1.0",
      objectType: "VAULT_BINDING",
      id: "vlt_01K06TEST000000000000000001",
      workspaceId: DEFAULT_WORKSPACE.id,
      adapter: "LOCAL_FILESYSTEM",
      relativeRoot: "MarkOrbit/Global Public",
      status: "ACTIVE",
      revision: 1,
    });

    const replay = repository.configure({
      workspaceId: DEFAULT_WORKSPACE.id,
      name: "Primary Review Vault",
      relativeRoot: "MarkOrbit/Global Public",
      expectedRevision: 1,
    });
    expect(replay).toEqual(created);

    const updated = repository.configure({
      workspaceId: DEFAULT_WORKSPACE.id,
      name: "Primary Review Vault",
      relativeRoot: "MarkOrbit/Review Queue",
      expectedRevision: 1,
    });
    expect(updated.revision).toBe(2);
    expect(updated.relativeRoot).toBe("MarkOrbit/Review Queue");

    expect(() =>
      repository.configure({
        workspaceId: DEFAULT_WORKSPACE.id,
        name: "Stale update",
        relativeRoot: "MarkOrbit/Stale",
        expectedRevision: 1,
      }),
    ).toThrowError(/revision is 2, not 1/u);
  });

  it("requires an explicit current revision before mutating an existing binding", () => {
    const { repository } = fixture();
    repository.configure({
      workspaceId: DEFAULT_WORKSPACE.id,
      name: "Primary Review Vault",
      relativeRoot: "MarkOrbit/Global Public",
    });

    expect(() =>
      repository.configure({
        workspaceId: DEFAULT_WORKSPACE.id,
        name: "Changed",
        relativeRoot: "MarkOrbit/Changed",
      }),
    ).toThrowError(/requires its current positive revision/u);
  });

  it("persists disable and re-enable transitions as revisioned control-plane state", () => {
    const { repository } = fixture();
    repository.configure({
      workspaceId: DEFAULT_WORKSPACE.id,
      name: "Primary Review Vault",
      relativeRoot: "MarkOrbit/Global Public",
    });

    const disabled = repository.setStatus(DEFAULT_WORKSPACE.id, "DISABLED", 1);
    expect(disabled.status).toBe("DISABLED");
    expect(disabled.revision).toBe(2);

    const active = repository.setStatus(DEFAULT_WORKSPACE.id, "ACTIVE", 2);
    expect(active.status).toBe("ACTIVE");
    expect(active.revision).toBe(3);
  });

  it("rejects path traversal, absolute paths, backslashes and non-portable reserved names", () => {
    for (const value of [
      "../escape",
      "/absolute/path",
      "MarkOrbit\\WindowsStyle",
      "MarkOrbit//Empty",
      "MarkOrbit/CON",
      "MarkOrbit/folder.",
    ]) {
      expect(() => normalizeVaultRelativeRoot(value)).toThrow();
    }
  });

  it("accepts portable nested Vault directories without exposing a server filesystem root", () => {
    expect(normalizeVaultRelativeRoot("MarkOrbit/Global Public/Review_2026")).toBe(
      "MarkOrbit/Global Public/Review_2026",
    );
  });
});
