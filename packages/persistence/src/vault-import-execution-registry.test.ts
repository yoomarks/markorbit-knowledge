import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_WORKSPACE, initializeRegistry } from "./index";
import {
  SqliteVaultImportExecutionRepository,
  SqliteVaultOriginStagingRepository,
} from "./vault-import-execution-registry";

const roots: string[] = [];
const BINDING = {
  bindingId: "vlt_01K10TEST000000000000000001",
  revision: 4,
  relativeRoot: "MarkOrbit/Review",
} as const;
const CANDIDATE = {
  vaultRelativePath: "MarkOrbit/Review/incoming/new.md",
  bindingRelativePath: "incoming/new.md",
  observedSha256: "f2ca1bb6c7e907d06dafe4687e579fce76b37e4e93b7605022da52e6ccc26fd2",
  sizeBytes: 5,
} as const;
const CONTENT = new TextEncoder().encode("hello");

function storageRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "markorbit-k10-staging-"));
  roots.push(root);
  return root;
}

function database(): DatabaseSync {
  const value = new DatabaseSync(":memory:");
  initializeRegistry(value);
  return value;
}

afterEach(() => {
  while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true });
});

describe("Vault-origin Staging persistence", () => {
  it("persists reviewed bytes in the shared CAS layout and exactly replays by import intent", () => {
    const db = database();
    const root = storageRoot();
    const repository = new SqliteVaultOriginStagingRepository(
      db,
      root,
      () => new Date("2026-08-11T14:00:00.000Z"),
      () => "vst_01K10TEST000000000000000001",
    );
    const input = {
      workspaceId: DEFAULT_WORKSPACE.id,
      importIntentId: "vmi_01K10TEST000000000000000001",
      inspectionRunId: "vin_01K10TEST000000000000000001",
      binding: BINDING,
      candidate: CANDIDATE,
      content: CONTENT,
    };

    const first = repository.ingest(input);
    const replay = repository.ingest(input);

    expect(first.replayed).toBe(false);
    expect(first.document.status).toBe("IMPORTED_UNVERIFIED");
    expect(first.document.contentAddressedRef).toBe(`cas:sha256:${CANDIDATE.observedSha256}`);
    expect(replay.replayed).toBe(true);
    expect(replay.document).toEqual(first.document);
    expect(Buffer.from(repository.readContent(DEFAULT_WORKSPACE.id, first.document.id))).toEqual(
      Buffer.from(CONTENT),
    );
  });

  it("supports an observed empty Markdown file without inventing conversion provenance", () => {
    const db = database();
    const repository = new SqliteVaultOriginStagingRepository(db, storageRoot());
    const empty = new Uint8Array();
    const emptyHash = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
    const result = repository.ingest({
      workspaceId: DEFAULT_WORKSPACE.id,
      importIntentId: "vmi_01K10TEST000000000000000002",
      inspectionRunId: "vin_01K10TEST000000000000000002",
      binding: BINDING,
      candidate: {
        vaultRelativePath: "MarkOrbit/Review/incoming/empty.md",
        bindingRelativePath: "incoming/empty.md",
        observedSha256: emptyHash,
        sizeBytes: 0,
      },
      content: empty,
    });

    expect(result.document.sizeBytes).toBe(0);
    expect(result.document.objectType).toBe("VAULT_ORIGIN_STAGING_DOCUMENT");
    expect(JSON.stringify(result.document)).not.toMatch(/conversionRun|workerId|rawArtifact/u);
  });

  it("rejects bytes that no longer match the frozen reviewed candidate", () => {
    const db = database();
    const repository = new SqliteVaultOriginStagingRepository(db, storageRoot());
    expect(() =>
      repository.ingest({
        workspaceId: DEFAULT_WORKSPACE.id,
        importIntentId: "vmi_01K10TEST000000000000000003",
        inspectionRunId: "vin_01K10TEST000000000000000003",
        binding: BINDING,
        candidate: CANDIDATE,
        content: new TextEncoder().encode("changed"),
      }),
    ).toThrowError(/do not match the reviewed import intent/u);
  });
});

describe("Vault import execution ledger", () => {
  it("persists PENDING before receipt and finalizes only from the durable receipt", () => {
    const db = database();
    const repository = new SqliteVaultImportExecutionRepository(
      db,
      () => new Date("2026-08-11T14:10:00.000Z"),
      () => "vie_01K10TEST000000000000000001",
    );
    const pending = repository.prepare({
      workspaceId: DEFAULT_WORKSPACE.id,
      importIntentId: "vmi_01K10TEST000000000000000004",
      rootFingerprintSha256: "a".repeat(64),
      binding: BINDING,
      candidate: CANDIDATE,
    });
    expect(pending.state).toBe("PENDING");
    expect(() => repository.finalize(DEFAULT_WORKSPACE.id, pending.id)).toThrowError(
      /requires a persisted Staging receipt/u,
    );

    const receipt = {
      vaultStagingDocumentId: "vst_01K10TEST000000000000000004",
      contentSha256: CANDIDATE.observedSha256,
      sizeBytes: CANDIDATE.sizeBytes,
      contentAddressedRef: `cas:sha256:${CANDIDATE.observedSha256}`,
      recordedAt: "2026-08-11T14:11:00.000Z",
    } as const;
    const withReceipt = repository.recordStagingReceipt(DEFAULT_WORKSPACE.id, pending.id, receipt);
    expect(withReceipt.state).toBe("PENDING");
    expect(withReceipt.stagingReceipt).toEqual(receipt);

    const completed = repository.finalize(DEFAULT_WORKSPACE.id, pending.id);
    expect(completed.state).toBe("SUCCEEDED");
    expect(completed.result).toEqual(receipt);
    expect(repository.finalize(DEFAULT_WORKSPACE.id, pending.id)).toEqual(completed);
  });

  it("records stale source evidence as an immutable terminal rejection", () => {
    const db = database();
    const repository = new SqliteVaultImportExecutionRepository(db);
    const pending = repository.prepare({
      workspaceId: DEFAULT_WORKSPACE.id,
      importIntentId: "vmi_01K10TEST000000000000000005",
      rootFingerprintSha256: "b".repeat(64),
      binding: BINDING,
      candidate: CANDIDATE,
    });
    const rejected = repository.reject(
      DEFAULT_WORKSPACE.id,
      pending.id,
      "VAULT_IMPORT_SOURCE_CHANGED",
    );
    expect(rejected.state).toBe("REJECTED");
    expect(rejected.rejection?.code).toBe("VAULT_IMPORT_SOURCE_CHANGED");
    expect(repository.reject(DEFAULT_WORKSPACE.id, pending.id, "VAULT_IMPORT_SOURCE_MISSING")).toEqual(
      rejected,
    );
  });

  it("reopens durable execution state and rejects conflicting frozen evidence", () => {
    const db = database();
    const first = new SqliteVaultImportExecutionRepository(db);
    const input = {
      workspaceId: DEFAULT_WORKSPACE.id,
      importIntentId: "vmi_01K10TEST000000000000000006",
      rootFingerprintSha256: "c".repeat(64),
      binding: BINDING,
      candidate: CANDIDATE,
    };
    const execution = first.prepare(input);
    const reopened = new SqliteVaultImportExecutionRepository(db);
    expect(reopened.getByImportIntent(DEFAULT_WORKSPACE.id, input.importIntentId)).toEqual(execution);
    expect(() =>
      reopened.prepare({ ...input, rootFingerprintSha256: "d".repeat(64) }),
    ).toThrowError(/different frozen evidence/u);
  });
});
