import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { DEFAULT_WORKSPACE, initializeRegistry } from "./index";
import { SqliteVaultImportIntentRepository } from "./vault-import-intent-registry";

const INSPECTION = {
  inspectionRunId: "vin_01K09TEST000000000000000001",
  rootFingerprintSha256: "a".repeat(64),
  observedAt: "2026-08-11T13:20:00.000Z",
  binding: {
    bindingId: "vlt_01K09TEST000000000000000001",
    revision: 4,
    relativeRoot: "MarkOrbit/Review",
  },
} as const;

function input(overrides: Record<string, unknown> = {}) {
  return {
    workspaceId: DEFAULT_WORKSPACE.id,
    idempotencyKey: `vault-import-intent:${"b".repeat(64)}`,
    inspection: INSPECTION,
    candidate: {
      vaultRelativePath: "MarkOrbit/Review/incoming/new-note.md",
      bindingRelativePath: "incoming/new-note.md",
      observedSha256: "c".repeat(64),
      sizeBytes: 42,
    },
    reviewNote: "Reviewed by operator",
    ...overrides,
  };
}

describe("Vault import intent registry", () => {
  it("persists an immutable pending intent and exact replay returns the original record", () => {
    const database = new DatabaseSync(":memory:");
    initializeRegistry(database);
    const repository = new SqliteVaultImportIntentRepository(
      database,
      () => new Date("2026-08-11T13:21:00.000Z"),
      () => "vmi_01K09TEST000000000000000001",
    );

    const first = repository.record(input());
    const replay = repository.record(input());

    expect(first.replayed).toBe(false);
    expect(first.intent.action).toBe("IMPORT_TO_STAGING");
    expect(first.intent.state).toBe("PENDING_EXECUTION");
    expect(first.intent.candidate.observedSha256).toBe("c".repeat(64));
    expect(replay.replayed).toBe(true);
    expect(replay.intent).toEqual(first.intent);
    expect(repository.getById(DEFAULT_WORKSPACE.id, first.intent.id)).toEqual(first.intent);
  });

  it("rejects a different review under the same frozen inspection candidate", () => {
    const database = new DatabaseSync(":memory:");
    initializeRegistry(database);
    const repository = new SqliteVaultImportIntentRepository(database);

    repository.record(input());
    expect(() =>
      repository.record(input({ reviewNote: "Different approval evidence" })),
    ).toThrowError(/different review evidence|different reviewed import intent/u);
  });

  it("rejects reusing one idempotency key for different candidate evidence", () => {
    const database = new DatabaseSync(":memory:");
    initializeRegistry(database);
    const repository = new SqliteVaultImportIntentRepository(database);

    repository.record(input());
    expect(() =>
      repository.record(
        input({
          candidate: {
            vaultRelativePath: "MarkOrbit/Review/incoming/other.md",
            bindingRelativePath: "incoming/other.md",
            observedSha256: "d".repeat(64),
            sizeBytes: 1,
          },
        }),
      ),
    ).toThrowError(/idempotency key is already bound/u);
  });

  it("survives repository re-instantiation and accepts zero-byte Markdown evidence", () => {
    const database = new DatabaseSync(":memory:");
    initializeRegistry(database);
    const firstRepository = new SqliteVaultImportIntentRepository(database);
    const recorded = firstRepository.record(
      input({
        idempotencyKey: `vault-import-intent:${"e".repeat(64)}`,
        candidate: {
          vaultRelativePath: "MarkOrbit/Review/incoming/empty.md",
          bindingRelativePath: "incoming/empty.md",
          observedSha256: "f".repeat(64),
          sizeBytes: 0,
        },
      }),
    );

    const reopened = new SqliteVaultImportIntentRepository(database);
    expect(reopened.list(DEFAULT_WORKSPACE.id, 10)).toEqual([recorded.intent]);
  });

  it("fails closed when candidate paths escape the frozen binding", () => {
    const database = new DatabaseSync(":memory:");
    initializeRegistry(database);
    const repository = new SqliteVaultImportIntentRepository(database);

    expect(() =>
      repository.record(
        input({
          candidate: {
            vaultRelativePath: "OtherRoot/new-note.md",
            bindingRelativePath: "incoming/new-note.md",
            observedSha256: "c".repeat(64),
            sizeBytes: 42,
          },
        }),
      ),
    ).toThrowError(/escaped its frozen binding/u);
  });
});
