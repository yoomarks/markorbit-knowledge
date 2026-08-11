import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_WORKSPACE, initializeRegistry } from "@markorbit/persistence";
import type { StagingContentRegistryRepository } from "@markorbit/persistence/staging-content";
import { SqliteVaultBindingRepository } from "@markorbit/persistence/vault-bindings";
import { SqliteVaultExportRunRepository } from "@markorbit/persistence/vault-export-runs";
import { VaultExportService } from "../vault-export-service";

const roots: string[] = [];
const STAGING_ID = "stg_01K07SERVICE0000000000000001";
const TARGET_PATH = "official/uspto/guide.md";
const CONTENT = Buffer.from("# USPTO Guide\n\nVerified staging content.\n", "utf8");
const CONTENT_SHA = createHash("sha256").update(CONTENT).digest("hex");

function root(): string {
  const value = mkdtempSync(join(tmpdir(), "markorbit-vault-export-"));
  roots.push(value);
  return value;
}

function fakeStaging(): StagingContentRegistryRepository {
  const record = {
    descriptor: {
      id: STAGING_ID,
      workspaceId: DEFAULT_WORKSPACE.id,
      status: "READY",
      targetPath: TARGET_PATH,
      contentHash: { algorithm: "SHA-256", value: CONTENT_SHA },
    },
    createdAt: "2026-08-11T10:00:00.000Z",
    updatedAt: "2026-08-11T10:00:00.000Z",
  };
  return {
    getDocument: (id: string, workspaceId: string) =>
      id === STAGING_ID && workspaceId === DEFAULT_WORKSPACE.id ? record : null,
    listDocuments: () => ({ items: [record], total: 1, limit: 50, offset: 0 }),
    readContent: (id: string, workspaceId: string) => {
      if (id !== STAGING_ID || workspaceId !== DEFAULT_WORKSPACE.id) throw new Error("not found");
      return CONTENT;
    },
    ingestGenerated: () => {
      throw new Error("not used");
    },
    getByConversionRun: () => null,
  } as unknown as StagingContentRegistryRepository;
}

function fixture(vaultRoot = root()) {
  const database = new DatabaseSync(":memory:");
  initializeRegistry(database);
  const bindings = new SqliteVaultBindingRepository(
    database,
    () => new Date("2026-08-11T10:00:00.000Z"),
    () => "vlt_01K07SERVICE0000000000000001",
  );
  bindings.configure({
    workspaceId: DEFAULT_WORKSPACE.id,
    name: "Review Vault",
    relativeRoot: "MarkOrbit/Global Public",
  });
  const exports = new SqliteVaultExportRunRepository(
    database,
    () => new Date("2026-08-11T10:01:00.000Z"),
    () => "vex_01K07SERVICE0000000000000001",
  );
  const staging = fakeStaging();
  const service = new VaultExportService({
    bindings,
    exports,
    staging,
    rootProvider: () => vaultRoot,
  });
  return { database, bindings, exports, staging, service, vaultRoot };
}

function fingerprint(path: string): string {
  return createHash("sha256").update(path, "utf8").digest("hex");
}

afterEach(() => {
  while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true });
});

describe("VaultExportService", () => {
  it("writes READY Staging only through the ACTIVE binding and records a durable success", () => {
    const { service, vaultRoot } = fixture();
    const run = service.submit(DEFAULT_WORKSPACE.id, STAGING_ID);

    expect(run.state).toBe("SUCCEEDED");
    expect(run.result?.disposition).toBe("WRITTEN");
    expect(run.result?.vaultRelativePath).toBe("MarkOrbit/Global Public/official/uspto/guide.md");
    expect(
      readFileSync(join(vaultRoot, "MarkOrbit", "Global Public", "official", "uspto", "guide.md")),
    ).toEqual(CONTENT);

    const replay = service.submit(DEFAULT_WORKSPACE.id, STAGING_ID);
    expect(replay.id).toBe(run.id);
    expect(replay).toEqual(run);
  });

  it("reconciles an unknown post-write outcome without re-authorizing a changed binding", () => {
    const { bindings, exports, service, vaultRoot } = fixture();
    const prepared = exports.prepare({
      workspaceId: DEFAULT_WORKSPACE.id,
      rootFingerprintSha256: fingerprint(vaultRoot),
      binding: {
        bindingId: "vlt_01K07SERVICE0000000000000001",
        revision: 1,
        relativeRoot: "MarkOrbit/Global Public",
      },
      staging: {
        stagingDocumentId: STAGING_ID,
        contentSha256: CONTENT_SHA,
        targetPath: TARGET_PATH,
      },
    }).run;
    const target = join(vaultRoot, "MarkOrbit", "Global Public", "official", "uspto");
    mkdirSync(target, { recursive: true });
    writeFileSync(join(target, "guide.md"), CONTENT);
    bindings.setStatus(DEFAULT_WORKSPACE.id, "DISABLED", 1);

    const recovered = service.submit(DEFAULT_WORKSPACE.id, STAGING_ID);
    expect(recovered.id).toBe(prepared.id);
    expect(recovered.state).toBe("SUCCEEDED");
    expect(recovered.result?.disposition).toBe("ALREADY_PRESENT");
  });

  it("refuses to write a pending frozen destination after the binding changes", () => {
    const { bindings, exports, service, vaultRoot } = fixture();
    exports.prepare({
      workspaceId: DEFAULT_WORKSPACE.id,
      rootFingerprintSha256: fingerprint(vaultRoot),
      binding: {
        bindingId: "vlt_01K07SERVICE0000000000000001",
        revision: 1,
        relativeRoot: "MarkOrbit/Global Public",
      },
      staging: {
        stagingDocumentId: STAGING_ID,
        contentSha256: CONTENT_SHA,
        targetPath: TARGET_PATH,
      },
    });
    bindings.configure({
      workspaceId: DEFAULT_WORKSPACE.id,
      name: "Review Vault",
      relativeRoot: "MarkOrbit/New Destination",
      expectedRevision: 1,
    });

    expect(() => service.submit(DEFAULT_WORKSPACE.id, STAGING_ID)).toThrowError(
      /frozen ACTIVE binding is no longer current/u,
    );
    expect(exports.getPendingByStaging(DEFAULT_WORKSPACE.id, STAGING_ID)?.state).toBe("PENDING");
  });

  it("never overwrites different Vault content and leaves the run PENDING for operator resolution", () => {
    const { exports, service, vaultRoot } = fixture();
    const target = join(vaultRoot, "MarkOrbit", "Global Public", "official", "uspto");
    mkdirSync(target, { recursive: true });
    writeFileSync(join(target, "guide.md"), "manual reviewer edit", "utf8");

    expect(() => service.submit(DEFAULT_WORKSPACE.id, STAGING_ID)).toThrowError(
      /different content/u,
    );
    expect(readFileSync(join(target, "guide.md"), "utf8")).toBe("manual reviewer edit");
    expect(exports.getPendingByStaging(DEFAULT_WORKSPACE.id, STAGING_ID)?.state).toBe("PENDING");
  });

  it("finalizes a persisted projection receipt without requiring the current filesystem root", () => {
    const vaultRoot = root();
    const { exports, staging, bindings } = fixture(vaultRoot);
    const prepared = exports.prepare({
      workspaceId: DEFAULT_WORKSPACE.id,
      rootFingerprintSha256: fingerprint(vaultRoot),
      binding: {
        bindingId: "vlt_01K07SERVICE0000000000000001",
        revision: 1,
        relativeRoot: "MarkOrbit/Global Public",
      },
      staging: {
        stagingDocumentId: STAGING_ID,
        contentSha256: CONTENT_SHA,
        targetPath: TARGET_PATH,
      },
    }).run;
    exports.recordProjectionReceipt(DEFAULT_WORKSPACE.id, prepared.id, {
      vaultRelativePath: "MarkOrbit/Global Public/official/uspto/guide.md",
      contentSha256: CONTENT_SHA,
      disposition: "WRITTEN",
    });
    const service = new VaultExportService({
      bindings,
      exports,
      staging,
      rootProvider: () => undefined,
    });

    const finalized = service.submit(DEFAULT_WORKSPACE.id, STAGING_ID);
    expect(finalized.state).toBe("SUCCEEDED");
    expect(finalized.result?.disposition).toBe("WRITTEN");
  });
});
