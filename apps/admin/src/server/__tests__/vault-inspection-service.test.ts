import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { VaultBindingV1, VaultExportRunV1, VaultInspectionRunV1 } from "@markorbit/contracts";
import type { VaultExportRunRepository } from "@markorbit/persistence/vault-export-runs";
import type { VaultInspectionRunRepository } from "@markorbit/persistence/vault-inspection-runs";
import type { VaultBindingRepository } from "@markorbit/persistence/vault-bindings";
import { VaultInspectionService } from "../vault-inspection-service";

const WORKSPACE = "wsp_01K08TEST000000000000000001";
const roots: string[] = [];

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function binding(status: VaultBindingV1["status"] = "ACTIVE"): VaultBindingV1 {
  return {
    contractVersion: "1.0",
    objectType: "VAULT_BINDING",
    id: "vlt_01K08TEST000000000000000001",
    workspaceId: WORKSPACE,
    name: "Review Vault",
    adapter: "LOCAL_FILESYSTEM",
    relativeRoot: "MarkOrbit/Review",
    status,
    revision: 4,
    createdAt: "2026-08-11T11:00:00.000Z",
    updatedAt: "2026-08-11T11:00:00.000Z",
  };
}

function managedRun(path: string, content: string, index: number): VaultExportRunV1 {
  const contentSha256 = sha256(content);
  const recordedAt = `2026-08-11T11:0${index}:00.000Z`;
  return {
    contractVersion: "1.0",
    objectType: "VAULT_EXPORT_RUN",
    id: `vex_01K08TEST00000000000000000${index}`,
    workspaceId: WORKSPACE,
    idempotencyKey: `vault-export:${String(index).padStart(64, "a")}`,
    rootFingerprintSha256: "b".repeat(64),
    binding: {
      bindingId: binding().id,
      revision: binding().revision,
      relativeRoot: binding().relativeRoot,
    },
    staging: {
      stagingDocumentId: `stg_01K08TEST00000000000000000${index}`,
      contentSha256,
      targetPath: path,
    },
    state: "SUCCEEDED",
    preparedAt: recordedAt,
    updatedAt: recordedAt,
    projectionReceipt: {
      vaultRelativePath: `${binding().relativeRoot}/${path}`,
      contentSha256,
      disposition: "WRITTEN",
      recordedAt,
    },
    result: {
      vaultRelativePath: `${binding().relativeRoot}/${path}`,
      contentSha256,
      disposition: "WRITTEN",
      recordedAt,
    },
  };
}

function bindingRepository(value: VaultBindingV1): VaultBindingRepository {
  return {
    getByWorkspaceId: () => value,
    configure: () => {
      throw new Error("not used");
    },
    setStatus: () => {
      throw new Error("not used");
    },
  };
}

function exportRepository(runs: VaultExportRunV1[]): VaultExportRunRepository {
  return {
    list: () => runs,
    prepare: () => {
      throw new Error("not used");
    },
    getById: () => null,
    getPendingByStaging: () => null,
    recordProjectionReceipt: () => {
      throw new Error("not used");
    },
    finalize: () => {
      throw new Error("not used");
    },
  };
}

class MemoryInspectionRepository implements VaultInspectionRunRepository {
  readonly items: VaultInspectionRunV1[] = [];

  record(run: VaultInspectionRunV1): VaultInspectionRunV1 {
    this.items.unshift(run);
    return run;
  }

  getById(workspaceId: string, runId: string): VaultInspectionRunV1 | null {
    return this.items.find((run) => run.workspaceId === workspaceId && run.id === runId) ?? null;
  }

  list(workspaceId: string, limit = 20): VaultInspectionRunV1[] {
    return this.items.filter((run) => run.workspaceId === workspaceId).slice(0, limit);
  }
}

function fixture(options?: { binding?: VaultBindingV1; runs?: VaultExportRunV1[]; root?: string }) {
  const root = options?.root ?? mkdtempSync(join(tmpdir(), "markorbit-k08-"));
  if (!roots.includes(root)) roots.push(root);
  const inspections = new MemoryInspectionRepository();
  const service = new VaultInspectionService({
    bindings: bindingRepository(options?.binding ?? binding()),
    exports: exportRepository(options?.runs ?? []),
    inspections,
    rootProvider: () => root,
    clock: () => new Date("2026-08-11T11:30:00.000Z"),
    idFactory: () => "vin_01K08TEST000000000000000001",
  });
  return { root, inspections, service };
}

afterEach(() => {
  while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true });
});

describe("Vault inspection service", () => {
  it("classifies unchanged, conflict, missing and untracked Markdown without modifying Vault bytes", () => {
    const unchanged = "# managed unchanged\n";
    const oldChanged = "# managed old\n";
    const editedChanged = "# managed edited\n";
    const runs = [
      managedRun("managed/unchanged.md", unchanged, 1),
      managedRun("managed/changed.md", oldChanged, 2),
      managedRun("managed/missing.md", "# deleted\n", 3),
    ];
    const { root, inspections, service } = fixture({ runs });
    const boundRoot = join(root, "MarkOrbit", "Review");
    mkdirSync(join(boundRoot, "managed"), { recursive: true });
    mkdirSync(join(boundRoot, "incoming"), { recursive: true });
    writeFileSync(join(boundRoot, "managed", "unchanged.md"), unchanged);
    writeFileSync(join(boundRoot, "managed", "changed.md"), editedChanged);
    writeFileSync(
      join(boundRoot, "incoming", "new.md"),
      "---\ntitle: New note\nsource: manual\n---\n# New\nSee [[Existing Note|alias]].\n",
    );
    writeFileSync(join(boundRoot, "ignored.txt"), "not markdown");

    const before = readFileSync(join(boundRoot, "incoming", "new.md"));
    const beforeMtime = statSync(join(boundRoot, "incoming", "new.md")).mtimeMs;
    const run = service.inspect(WORKSPACE);
    const after = readFileSync(join(boundRoot, "incoming", "new.md"));

    expect(after.equals(before)).toBe(true);
    expect(statSync(join(boundRoot, "incoming", "new.md")).mtimeMs).toBe(beforeMtime);
    expect(inspections.items).toHaveLength(1);
    expect(run.rootFingerprintSha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(
      run.candidates.map((candidate) => [candidate.bindingRelativePath, candidate.classification]),
    ).toEqual([
      ["incoming/new.md", "IMPORT_CANDIDATE"],
      ["managed/changed.md", "CONFLICT"],
      ["managed/missing.md", "MISSING"],
      ["managed/unchanged.md", "UNCHANGED"],
    ]);

    const incoming = run.candidates.find(
      (candidate) => candidate.bindingRelativePath === "incoming/new.md",
    );
    expect(incoming?.frontmatter).toEqual({
      status: "PARSED_SIMPLE",
      keys: ["title", "source"],
      fields: { title: "New note", source: "manual" },
    });
    expect(incoming?.wikiLinks).toEqual(["Existing Note"]);

    const conflict = run.candidates.find(
      (candidate) => candidate.bindingRelativePath === "managed/changed.md",
    );
    expect(conflict?.observedSha256).toBe(sha256(editedChanged));
    expect(conflict?.managedExport?.contentSha256).toBe(sha256(oldChanged));
  });

  it("never creates a missing configured Vault root during read-only inspection", () => {
    const parent = mkdtempSync(join(tmpdir(), "markorbit-k08-parent-"));
    roots.push(parent);
    const missingRoot = join(parent, "does-not-exist");
    const { service } = fixture({ root: missingRoot });

    expect(() => service.inspect(WORKSPACE)).toThrowError(/does not exist/u);
    expect(existsSync(missingRoot)).toBe(false);
  });

  it("fails closed when an intermediate Vault binding path segment is a symbolic link", () => {
    const { root, service } = fixture();
    const outsideTree = join(root, "outside-tree");
    mkdirSync(join(outsideTree, "Review"), { recursive: true });
    symlinkSync(outsideTree, join(root, "MarkOrbit"), "dir");

    expect(() => service.inspect(WORKSPACE)).toThrowError(/not symbolic links/u);
  });

  it("fails closed on symbolic links inside the bound Vault directory", () => {
    const { root, service } = fixture();
    const boundRoot = join(root, "MarkOrbit", "Review");
    mkdirSync(boundRoot, { recursive: true });
    const outside = join(root, "outside.md");
    writeFileSync(outside, "# outside\n");
    symlinkSync(outside, join(boundRoot, "linked.md"));

    expect(() => service.inspect(WORKSPACE)).toThrowError(/symbolic links/u);
  });

  it("requires an ACTIVE binding before reading any Vault files", () => {
    const { root, service } = fixture({ binding: binding("DISABLED") });
    const boundRoot = join(root, "MarkOrbit", "Review");
    mkdirSync(boundRoot, { recursive: true });
    writeFileSync(join(boundRoot, "note.md"), "# should not be read\n");

    expect(() => service.inspect(WORKSPACE)).toThrowError(/must be ACTIVE/u);
  });
});
