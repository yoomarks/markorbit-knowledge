import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import type { VaultBindingV1, VaultImportIntentV1 } from "@markorbit/contracts";
import { DEFAULT_WORKSPACE, initializeRegistry } from "@markorbit/persistence";
import type { VaultBindingRepository } from "@markorbit/persistence/vault-bindings";
import {
  SqliteVaultImportExecutionRepository,
  SqliteVaultOriginStagingRepository,
  type VaultImportExecutionRepository,
} from "@markorbit/persistence/vault-import-executions";
import type {
  VaultImportIntentRecordResult,
  VaultImportIntentRepository,
} from "@markorbit/persistence/vault-import-intents";
import { VaultImportExecutionService } from "../vault-import-execution-service";

const roots: string[] = [];
const CONTENT = "# reviewed\n";

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function binding(overrides: Partial<VaultBindingV1> = {}): VaultBindingV1 {
  return {
    contractVersion: "1.0",
    objectType: "VAULT_BINDING",
    id: "vlt_01K10SERVICE0000000000000001",
    workspaceId: DEFAULT_WORKSPACE.id,
    name: "Review Vault",
    adapter: "LOCAL_FILESYSTEM",
    relativeRoot: "MarkOrbit/Review",
    status: "ACTIVE",
    revision: 4,
    createdAt: "2026-08-11T14:00:00.000Z",
    updatedAt: "2026-08-11T14:00:00.000Z",
    ...overrides,
  };
}

function intent(root: string): VaultImportIntentV1 {
  return {
    contractVersion: "1.0",
    objectType: "VAULT_IMPORT_INTENT",
    id: "vmi_01K10SERVICE0000000000000001",
    workspaceId: DEFAULT_WORKSPACE.id,
    idempotencyKey: `vault-import-intent:${"a".repeat(64)}`,
    inspection: {
      inspectionRunId: "vin_01K10SERVICE0000000000000001",
      rootFingerprintSha256: sha256(resolve(root)),
      observedAt: "2026-08-11T14:01:00.000Z",
      binding: {
        bindingId: binding().id,
        revision: binding().revision,
        relativeRoot: binding().relativeRoot,
      },
    },
    candidate: {
      vaultRelativePath: "MarkOrbit/Review/incoming/new.md",
      bindingRelativePath: "incoming/new.md",
      observedSha256: sha256(CONTENT),
      sizeBytes: Buffer.byteLength(CONTENT),
    },
    action: "IMPORT_TO_STAGING",
    state: "PENDING_EXECUTION",
    reviewedAt: "2026-08-11T14:02:00.000Z",
  };
}

class FixedIntentRepository implements VaultImportIntentRepository {
  constructor(private readonly value: VaultImportIntentV1) {}
  record(): VaultImportIntentRecordResult {
    throw new Error("not used");
  }
  getById(workspaceId: string, intentId: string) {
    return workspaceId === this.value.workspaceId && intentId === this.value.id ? this.value : null;
  }
  getByCandidate() {
    return null;
  }
  list(workspaceId: string) {
    return workspaceId === this.value.workspaceId ? [this.value] : [];
  }
}

function bindingRepository(value: VaultBindingV1 | null): VaultBindingRepository {
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

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "markorbit-k10-vault-"));
  const stagingRoot = mkdtempSync(join(tmpdir(), "markorbit-k10-cas-"));
  roots.push(root, stagingRoot);
  mkdirSync(join(root, "MarkOrbit", "Review", "incoming"), { recursive: true });
  writeFileSync(join(root, "MarkOrbit", "Review", "incoming", "new.md"), CONTENT);
  const db = new DatabaseSync(":memory:");
  initializeRegistry(db);
  const executionRepository = new SqliteVaultImportExecutionRepository(
    db,
    () => new Date("2026-08-11T14:03:00.000Z"),
    () => "vie_01K10SERVICE0000000000000001",
  );
  const staging = new SqliteVaultOriginStagingRepository(
    db,
    stagingRoot,
    () => new Date("2026-08-11T14:04:00.000Z"),
    () => "vst_01K10SERVICE0000000000000001",
  );
  const reviewed = intent(root);
  return { root, db, reviewed, executionRepository, staging };
}

function service(options: {
  root: string;
  reviewed: VaultImportIntentV1;
  executions: VaultImportExecutionRepository;
  staging: SqliteVaultOriginStagingRepository;
  currentBinding?: VaultBindingV1 | null;
  rootProvider?: () => string | undefined;
}) {
  return new VaultImportExecutionService({
    bindings: bindingRepository(
      options.currentBinding === undefined ? binding() : options.currentBinding,
    ),
    intents: new FixedIntentRepository(options.reviewed),
    executions: options.executions,
    staging: options.staging,
    rootProvider: options.rootProvider ?? (() => options.root),
    clock: () => new Date("2026-08-11T14:05:00.000Z"),
  });
}

afterEach(() => {
  while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true });
});

describe("Vault import execution service", () => {
  it("imports only live bytes that exactly match the reviewed K08 evidence", () => {
    const f = fixture();
    const subject = service({
      root: f.root,
      reviewed: f.reviewed,
      executions: f.executionRepository,
      staging: f.staging,
    });

    const execution = subject.execute(DEFAULT_WORKSPACE.id, f.reviewed.id);

    expect(execution.state).toBe("SUCCEEDED");
    expect(execution.result?.contentSha256).toBe(f.reviewed.candidate.observedSha256);
    const staged = f.staging.getByImportIntent(DEFAULT_WORKSPACE.id, f.reviewed.id);
    expect(staged?.status).toBe("IMPORTED_UNVERIFIED");
    expect(JSON.stringify(staged)).not.toMatch(/conversionRun|workerId|rawArtifact/u);
  });

  it("terminally rejects changed live bytes and replays rejection without filesystem access", () => {
    const f = fixture();
    writeFileSync(join(f.root, "MarkOrbit", "Review", "incoming", "new.md"), "# changed\n");
    const first = service({
      root: f.root,
      reviewed: f.reviewed,
      executions: f.executionRepository,
      staging: f.staging,
    }).execute(DEFAULT_WORKSPACE.id, f.reviewed.id);
    expect(first.state).toBe("REJECTED");
    expect(first.rejection?.code).toBe("VAULT_IMPORT_SOURCE_CHANGED");

    rmSync(f.root, { recursive: true, force: true });
    const replay = service({
      root: f.root,
      reviewed: f.reviewed,
      executions: f.executionRepository,
      staging: f.staging,
      currentBinding: null,
      rootProvider: () => undefined,
    }).execute(DEFAULT_WORKSPACE.id, f.reviewed.id);
    expect(replay).toEqual(first);
  });

  it("recovers after Staging committed but execution receipt persistence was interrupted", () => {
    const f = fixture();
    let failReceipt = true;
    const unreliable: VaultImportExecutionRepository = {
      prepare: (input) => f.executionRepository.prepare(input),
      getByImportIntent: (workspaceId, importIntentId) =>
        f.executionRepository.getByImportIntent(workspaceId, importIntentId),
      list: (workspaceId, limit) => f.executionRepository.list(workspaceId, limit),
      recordStagingReceipt: (workspaceId, executionId, receipt) => {
        if (failReceipt) {
          failReceipt = false;
          throw new Error("simulated crash after Staging commit");
        }
        return f.executionRepository.recordStagingReceipt(workspaceId, executionId, receipt);
      },
      reject: (workspaceId, executionId, code) =>
        f.executionRepository.reject(workspaceId, executionId, code),
      finalize: (workspaceId, executionId) =>
        f.executionRepository.finalize(workspaceId, executionId),
    };
    const subject = service({
      root: f.root,
      reviewed: f.reviewed,
      executions: unreliable,
      staging: f.staging,
    });

    expect(() => subject.execute(DEFAULT_WORKSPACE.id, f.reviewed.id)).toThrowError(
      /simulated crash/u,
    );
    const durableStaging = f.staging.getByImportIntent(DEFAULT_WORKSPACE.id, f.reviewed.id);
    expect(durableStaging).not.toBeNull();
    expect(
      f.executionRepository.getByImportIntent(DEFAULT_WORKSPACE.id, f.reviewed.id)?.state,
    ).toBe("PENDING");

    const completed = subject.execute(DEFAULT_WORKSPACE.id, f.reviewed.id);
    expect(completed.state).toBe("SUCCEEDED");
    expect(f.staging.getByImportIntent(DEFAULT_WORKSPACE.id, f.reviewed.id)).toEqual(
      durableStaging,
    );
  });

  it("finalizes locally after receipt persistence even when Vault root and Binding are unavailable", () => {
    const f = fixture();
    let failFinalize = true;
    const unreliable: VaultImportExecutionRepository = {
      prepare: (input) => f.executionRepository.prepare(input),
      getByImportIntent: (workspaceId, importIntentId) =>
        f.executionRepository.getByImportIntent(workspaceId, importIntentId),
      list: (workspaceId, limit) => f.executionRepository.list(workspaceId, limit),
      recordStagingReceipt: (workspaceId, executionId, receipt) =>
        f.executionRepository.recordStagingReceipt(workspaceId, executionId, receipt),
      reject: (workspaceId, executionId, code) =>
        f.executionRepository.reject(workspaceId, executionId, code),
      finalize: (workspaceId, executionId) => {
        if (failFinalize) {
          failFinalize = false;
          throw new Error("simulated crash before local finalization");
        }
        return f.executionRepository.finalize(workspaceId, executionId);
      },
    };
    const first = service({
      root: f.root,
      reviewed: f.reviewed,
      executions: unreliable,
      staging: f.staging,
    });
    expect(() => first.execute(DEFAULT_WORKSPACE.id, f.reviewed.id)).toThrowError(
      /simulated crash/u,
    );
    const pending = f.executionRepository.getByImportIntent(DEFAULT_WORKSPACE.id, f.reviewed.id);
    expect(pending?.state).toBe("PENDING");
    expect(pending?.stagingReceipt).toBeDefined();

    rmSync(f.root, { recursive: true, force: true });
    const recovered = service({
      root: f.root,
      reviewed: f.reviewed,
      executions: unreliable,
      staging: f.staging,
      currentBinding: null,
      rootProvider: () => undefined,
    }).execute(DEFAULT_WORKSPACE.id, f.reviewed.id);
    expect(recovered.state).toBe("SUCCEEDED");
    expect(recovered.result).toEqual(pending?.stagingReceipt);
  });

  it("fails closed on a symlink target after PENDING is durable and does not create Staging", () => {
    const f = fixture();
    const target = join(f.root, "MarkOrbit", "Review", "incoming", "new.md");
    rmSync(target);
    const outside = join(f.root, "outside.md");
    writeFileSync(outside, CONTENT);
    symlinkSync(outside, target);
    const subject = service({
      root: f.root,
      reviewed: f.reviewed,
      executions: f.executionRepository,
      staging: f.staging,
    });

    expect(() => subject.execute(DEFAULT_WORKSPACE.id, f.reviewed.id)).toThrowError(
      /regular file/u,
    );
    expect(
      f.executionRepository.getByImportIntent(DEFAULT_WORKSPACE.id, f.reviewed.id)?.state,
    ).toBe("PENDING");
    expect(f.staging.getByImportIntent(DEFAULT_WORKSPACE.id, f.reviewed.id)).toBeNull();
  });
});
