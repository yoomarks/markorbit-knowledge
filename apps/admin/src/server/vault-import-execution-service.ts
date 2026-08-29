import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync } from "node:fs";
import { isAbsolute, resolve, sep } from "node:path";
import type {
  VaultBindingV1,
  VaultImportExecutionV1,
  VaultImportIntentV1,
} from "@markorbit/contracts";
import { RegistryConflictError, RegistryValidationError } from "@markorbit/persistence";
import {
  SqliteVaultBindingRepository,
  type VaultBindingRepository,
} from "@markorbit/persistence/vault-bindings";
import {
  SqliteVaultImportExecutionRepository,
  SqliteVaultOriginStagingRepository,
  type VaultImportExecutionRepository,
  type VaultOriginStagingRepository,
} from "@markorbit/persistence/vault-import-executions";
import {
  SqliteVaultImportIntentRepository,
  type VaultImportIntentRepository,
} from "@markorbit/persistence/vault-import-intents";
import { getRegistryDatabase } from "./source-registry";

export type VaultImportExecutionOverview = {
  binding: VaultBindingV1 | null;
  rootConfigured: boolean;
  pendingIntents: VaultImportIntentV1[];
  executions: VaultImportExecutionV1[];
};

export type VaultImportExecutionServiceDependencies = {
  bindings: VaultBindingRepository;
  intents: VaultImportIntentRepository;
  executions: VaultImportExecutionRepository;
  staging: VaultOriginStagingRepository;
  rootProvider?: () => string | undefined;
  clock?: () => Date;
};

function sha256(value: Uint8Array | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function required(value: string, field: string): string {
  const normalized = value?.trim();
  if (!normalized) throw new RegistryValidationError(`${field} is required`);
  return normalized;
}

function assertBindingMatches(current: VaultBindingV1 | null, intent: VaultImportIntentV1): void {
  if (!current) {
    throw new RegistryConflictError(
      "VAULT_IMPORT_EXECUTION_BINDING_MISSING",
      "Workspace Vault Binding no longer exists",
    );
  }
  if (current.status !== "ACTIVE") {
    throw new RegistryConflictError(
      "VAULT_IMPORT_EXECUTION_BINDING_DISABLED",
      "Workspace Vault Binding must remain ACTIVE during import execution",
    );
  }
  const frozen = intent.inspection.binding;
  if (
    current.id !== frozen.bindingId ||
    current.revision !== frozen.revision ||
    current.relativeRoot !== frozen.relativeRoot
  ) {
    throw new RegistryConflictError(
      "VAULT_IMPORT_EXECUTION_BINDING_CHANGED",
      "Vault Binding changed after review; run a new inspection and approval",
    );
  }
}

function assertDirectory(path: string, code: string): void {
  const stat = lstatSync(/* turbopackIgnore: true */ path);
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw new RegistryConflictError(code, "Vault import path must contain only real directories");
  }
}

function requireRoot(rawValue: string | undefined, expectedFingerprint: string): string {
  const raw = rawValue?.trim();
  if (!raw) {
    throw new RegistryConflictError(
      "VAULT_IMPORT_EXECUTION_ROOT_NOT_CONFIGURED",
      "Server Obsidian Vault root is not configured",
    );
  }
  if (!isAbsolute(raw)) {
    throw new RegistryConflictError(
      "VAULT_IMPORT_EXECUTION_ROOT_MUST_BE_ABSOLUTE",
      "Server Obsidian Vault root must be an absolute path",
    );
  }
  const root = resolve(/* turbopackIgnore: true */ raw);
  if (sha256(root) !== expectedFingerprint) {
    throw new RegistryConflictError(
      "VAULT_IMPORT_EXECUTION_ROOT_CHANGED",
      "Configured Vault root differs from the root reviewed by the operator",
    );
  }
  if (!existsSync(/* turbopackIgnore: true */ root)) {
    throw new RegistryConflictError(
      "VAULT_IMPORT_EXECUTION_ROOT_NOT_FOUND",
      "Configured Vault root does not exist",
    );
  }
  assertDirectory(root, "VAULT_IMPORT_EXECUTION_ROOT_INVALID");
  return root;
}

function resolveDirectorySegments(root: string, segments: string[]): string | null {
  let current = root;
  for (const segment of segments) {
    const next = resolve(/* turbopackIgnore: true */ current, segment);
    if (next === current || !next.startsWith(`${current}${sep}`)) {
      throw new RegistryConflictError(
        "VAULT_IMPORT_EXECUTION_PATH_ESCAPE",
        "Vault import path escaped the configured root",
      );
    }
    if (!existsSync(/* turbopackIgnore: true */ next)) return null;
    assertDirectory(next, "VAULT_IMPORT_EXECUTION_DIRECTORY_INVALID");
    current = next;
  }
  return current;
}

function readFrozenCandidate(root: string, intent: VaultImportIntentV1): Uint8Array | null {
  const bound = resolveDirectorySegments(root, intent.inspection.binding.relativeRoot.split("/"));
  if (!bound) return null;
  const segments = intent.candidate.bindingRelativePath.split("/");
  const fileName = segments.pop();
  if (!fileName) {
    throw new RegistryConflictError(
      "VAULT_IMPORT_EXECUTION_PATH_INVALID",
      "Reviewed Vault path is invalid",
    );
  }
  const parent = resolveDirectorySegments(bound, segments);
  if (!parent) return null;
  const absolutePath = resolve(/* turbopackIgnore: true */ parent, fileName);
  if (absolutePath === parent || !absolutePath.startsWith(`${parent}${sep}`)) {
    throw new RegistryConflictError(
      "VAULT_IMPORT_EXECUTION_PATH_ESCAPE",
      "Reviewed Vault file escaped the approved Binding",
    );
  }
  if (!existsSync(/* turbopackIgnore: true */ absolutePath)) return null;
  const stat = lstatSync(/* turbopackIgnore: true */ absolutePath);
  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw new RegistryConflictError(
      "VAULT_IMPORT_EXECUTION_TARGET_INVALID",
      "Reviewed Vault target must remain a regular file and not a symbolic link",
    );
  }
  return readFileSync(/* turbopackIgnore: true */ absolutePath);
}

function stagingStorePath(): string {
  const configured = process.env.MARKORBIT_STAGING_STORE_PATH?.trim();
  if (configured) return resolve(/* turbopackIgnore: true */ configured);
  const repositoryRoot =
    process.env.MARKORBIT_REPOSITORY_ROOT ?? process.env.INIT_CWD ?? process.cwd();
  return resolve(/* turbopackIgnore: true */ repositoryRoot, ".data", "staging");
}

export class VaultImportExecutionService {
  private readonly rootProvider: () => string | undefined;
  private readonly clock: () => Date;

  constructor(private readonly dependencies: VaultImportExecutionServiceDependencies) {
    this.rootProvider =
      dependencies.rootProvider ?? (() => process.env.MARKORBIT_OBSIDIAN_VAULT_ROOT);
    this.clock = dependencies.clock ?? (() => new Date());
  }

  overview(workspaceIdValue: string): VaultImportExecutionOverview {
    const workspaceId = required(workspaceIdValue, "workspaceId");
    return {
      binding: this.dependencies.bindings.getByWorkspaceId(workspaceId),
      rootConfigured: Boolean(this.rootProvider()?.trim()),
      pendingIntents: this.dependencies.intents
        .list(workspaceId, 50)
        .filter((intent) => intent.state === "PENDING_EXECUTION"),
      executions: this.dependencies.executions.list(workspaceId, 50),
    };
  }

  execute(workspaceIdValue: string, importIntentIdValue: string): VaultImportExecutionV1 {
    const workspaceId = required(workspaceIdValue, "workspaceId");
    const importIntentId = required(importIntentIdValue, "importIntentId");
    const intent = this.dependencies.intents.getById(workspaceId, importIntentId);
    if (!intent) {
      throw new RegistryValidationError(`Vault import intent ${importIntentId} was not found`);
    }
    if (intent.state !== "PENDING_EXECUTION") {
      throw new RegistryConflictError(
        "VAULT_IMPORT_EXECUTION_INTENT_NOT_PENDING",
        "Only a reviewed PENDING_EXECUTION Vault import intent may execute",
      );
    }

    const existing = this.dependencies.executions.getByImportIntent(workspaceId, importIntentId);
    if (existing?.state === "SUCCEEDED" || existing?.state === "REJECTED") return existing;
    if (existing?.stagingReceipt) {
      return this.dependencies.executions.finalize(workspaceId, existing.id);
    }

    assertBindingMatches(this.dependencies.bindings.getByWorkspaceId(workspaceId), intent);
    const root = requireRoot(this.rootProvider(), intent.inspection.rootFingerprintSha256);

    const execution =
      existing ??
      this.dependencies.executions.prepare({
        workspaceId,
        importIntentId,
        rootFingerprintSha256: intent.inspection.rootFingerprintSha256,
        binding: intent.inspection.binding,
        candidate: intent.candidate,
      });

    const bytes = readFrozenCandidate(root, intent);
    if (!bytes) {
      return this.dependencies.executions.reject(
        workspaceId,
        execution.id,
        "VAULT_IMPORT_SOURCE_MISSING",
      );
    }
    if (
      bytes.byteLength !== intent.candidate.sizeBytes ||
      sha256(bytes) !== intent.candidate.observedSha256
    ) {
      return this.dependencies.executions.reject(
        workspaceId,
        execution.id,
        "VAULT_IMPORT_SOURCE_CHANGED",
      );
    }

    const staged = this.dependencies.staging.ingest({
      workspaceId,
      importIntentId,
      inspectionRunId: intent.inspection.inspectionRunId,
      binding: intent.inspection.binding,
      candidate: intent.candidate,
      content: bytes,
    });
    const receipt = {
      vaultStagingDocumentId: staged.document.id,
      contentSha256: staged.document.contentHash.value,
      sizeBytes: staged.document.sizeBytes,
      contentAddressedRef: staged.document.contentAddressedRef,
      recordedAt: this.clock().toISOString(),
    };
    const withReceipt = this.dependencies.executions.recordStagingReceipt(
      workspaceId,
      execution.id,
      receipt,
    );
    return this.dependencies.executions.finalize(workspaceId, withReceipt.id);
  }
}

export function getConfiguredVaultImportExecutionService(): VaultImportExecutionService {
  const database = getRegistryDatabase();
  return new VaultImportExecutionService({
    bindings: new SqliteVaultBindingRepository(database),
    intents: new SqliteVaultImportIntentRepository(database),
    executions: new SqliteVaultImportExecutionRepository(database),
    staging: new SqliteVaultOriginStagingRepository(database, stagingStorePath()),
  });
}
