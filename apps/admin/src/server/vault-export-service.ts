import { createHash } from "node:crypto";
import { isAbsolute, resolve } from "node:path";
import type { VaultBindingV1, VaultExportRunV1 } from "@markorbit/contracts";
import {
  RegistryConflictError,
  RegistryError,
  RegistryValidationError,
} from "@markorbit/persistence";
import {
  LocalObsidianVaultProjectionRepository,
  type ObsidianVaultProjectionRepository,
} from "@markorbit/persistence/obsidian-vault-projection";
import type { StagingContentRegistryRepository } from "@markorbit/persistence/staging-content";
import {
  SqliteVaultBindingRepository,
  type VaultBindingRepository,
} from "@markorbit/persistence/vault-bindings";
import {
  SqliteVaultExportRunRepository,
  type VaultExportRunRepository,
} from "@markorbit/persistence/vault-export-runs";
import { obsidianVaultFilesystemReadiness } from "./obsidian-vault-readiness";
import { getRegistryDatabase, getStagingContentRepository } from "./source-registry";

export type VaultExportEligibleStaging = {
  stagingDocumentId: string;
  targetPath: string;
  contentSha256: string;
};

export type VaultExportOverview = {
  binding: VaultBindingV1 | null;
  filesystem: ReturnType<typeof obsidianVaultFilesystemReadiness>;
  eligible: VaultExportEligibleStaging[];
  runs: VaultExportRunV1[];
};

export type VaultExportServiceDependencies = {
  bindings: VaultBindingRepository;
  exports: VaultExportRunRepository;
  staging: StagingContentRegistryRepository;
  rootProvider?: () => string | undefined;
  projectorFactory?: (
    staging: StagingContentRegistryRepository,
    root: string,
    relativeRoot: string,
  ) => ObsidianVaultProjectionRepository;
};

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function requireWorkspaceId(value: string): string {
  const workspaceId = value?.trim();
  if (!workspaceId) throw new RegistryValidationError("workspaceId is required");
  return workspaceId;
}

function requireStagingDocumentId(value: string): string {
  const stagingDocumentId = value?.trim();
  if (!stagingDocumentId) throw new RegistryValidationError("stagingDocumentId is required");
  return stagingDocumentId;
}

function expectedVaultRelativePath(run: VaultExportRunV1): string {
  return `${run.binding.relativeRoot}/${run.staging.targetPath}`;
}

function bindingMatchesRun(binding: VaultBindingV1 | null, run: VaultExportRunV1): boolean {
  return Boolean(
    binding &&
      binding.status === "ACTIVE" &&
      binding.id === run.binding.bindingId &&
      binding.revision === run.binding.revision &&
      binding.relativeRoot === run.binding.relativeRoot,
  );
}

export class VaultExportService {
  private readonly rootProvider: () => string | undefined;
  private readonly projectorFactory: VaultExportServiceDependencies["projectorFactory"];

  constructor(private readonly dependencies: VaultExportServiceDependencies) {
    this.rootProvider =
      dependencies.rootProvider ?? (() => process.env.MARKORBIT_OBSIDIAN_VAULT_ROOT);
    this.projectorFactory =
      dependencies.projectorFactory ??
      ((staging, root, relativeRoot) =>
        new LocalObsidianVaultProjectionRepository(staging, root, {
          mode: "BOUND_ROOT",
          relativeRoot,
        }));
  }

  overview(workspaceIdValue: string): VaultExportOverview {
    const workspaceId = requireWorkspaceId(workspaceIdValue);
    const binding = this.dependencies.bindings.getByWorkspaceId(workspaceId);
    const filesystem = obsidianVaultFilesystemReadiness(this.rootProvider());
    const eligible = this.dependencies.staging
      .listDocuments({ workspaceId, status: "READY", limit: 50, offset: 0 })
      .items.map((record) => ({
        stagingDocumentId: record.descriptor.id,
        targetPath: record.descriptor.targetPath,
        contentSha256: record.descriptor.contentHash.value,
      }));
    return {
      binding,
      filesystem,
      eligible,
      runs: this.dependencies.exports.list(workspaceId, 30),
    };
  }

  submit(workspaceIdValue: string, stagingDocumentIdValue: string): VaultExportRunV1 {
    const workspaceId = requireWorkspaceId(workspaceIdValue);
    const stagingDocumentId = requireStagingDocumentId(stagingDocumentIdValue);

    const pending = this.dependencies.exports.getPendingByStaging(workspaceId, stagingDocumentId);
    if (pending) return this.continuePending(pending);

    const root = this.requireRoot();
    const binding = this.dependencies.bindings.getByWorkspaceId(workspaceId);
    if (!binding) {
      throw new RegistryConflictError(
        "VAULT_EXPORT_BINDING_MISSING",
        "Workspace must have a Vault binding before export",
      );
    }
    if (binding.status !== "ACTIVE") {
      throw new RegistryConflictError(
        "VAULT_EXPORT_BINDING_DISABLED",
        "Workspace Vault binding must be ACTIVE before export",
      );
    }
    const record = this.dependencies.staging.getDocument(stagingDocumentId, workspaceId);
    if (!record) {
      throw new RegistryError(
        "STAGING_DOCUMENT_NOT_FOUND",
        `Staging document ${stagingDocumentId} was not found`,
      );
    }
    if (record.descriptor.status !== "READY") {
      throw new RegistryConflictError(
        "VAULT_EXPORT_REQUIRES_READY_STAGING",
        "Only verified READY Staging documents may be exported",
      );
    }

    const prepared = this.dependencies.exports.prepare({
      workspaceId,
      rootFingerprintSha256: sha256(root),
      binding: {
        bindingId: binding.id,
        revision: binding.revision,
        relativeRoot: binding.relativeRoot,
      },
      staging: {
        stagingDocumentId,
        contentSha256: record.descriptor.contentHash.value,
        targetPath: record.descriptor.targetPath,
      },
    });
    return prepared.run.state === "SUCCEEDED" ? prepared.run : this.continuePending(prepared.run);
  }

  private requireRoot(): string {
    const raw = this.rootProvider()?.trim();
    const readiness = obsidianVaultFilesystemReadiness(raw);
    if (!readiness.configured || !raw) {
      throw new RegistryConflictError(
        readiness.issueCode ?? "OBSIDIAN_VAULT_ROOT_NOT_CONFIGURED",
        "Server Obsidian Vault root is not ready for filesystem export",
      );
    }
    if (!isAbsolute(raw)) {
      throw new RegistryConflictError(
        "OBSIDIAN_VAULT_ROOT_MUST_BE_ABSOLUTE",
        "Server Obsidian Vault root must be absolute",
      );
    }
    return resolve(raw);
  }

  private continuePending(run: VaultExportRunV1): VaultExportRunV1 {
    if (run.state === "SUCCEEDED") return run;
    if (run.projectionReceipt) {
      return this.dependencies.exports.finalize(run.workspaceId, run.id);
    }

    const record = this.dependencies.staging.getDocument(
      run.staging.stagingDocumentId,
      run.workspaceId,
    );
    if (!record) {
      throw new RegistryConflictError(
        "VAULT_EXPORT_FROZEN_STAGING_MISSING",
        "Pending Vault export Staging document no longer exists",
      );
    }
    if (
      record.descriptor.status !== "READY" ||
      record.descriptor.contentHash.value !== run.staging.contentSha256 ||
      record.descriptor.targetPath !== run.staging.targetPath
    ) {
      throw new RegistryConflictError(
        "VAULT_EXPORT_FROZEN_STAGING_MISMATCH",
        "Pending Vault export no longer matches the frozen READY Staging evidence",
      );
    }

    const root = this.requireRoot();
    if (sha256(root) !== run.rootFingerprintSha256) {
      throw new RegistryConflictError(
        "VAULT_EXPORT_PENDING_ROOT_MISMATCH",
        "Pending Vault export is frozen to a different server Vault root configuration",
      );
    }

    const projector = this.projectorFactory!(
      this.dependencies.staging,
      root,
      run.binding.relativeRoot,
    );
    const inspection = projector.inspect(run.workspaceId, run.staging.stagingDocumentId);
    if (
      inspection.contentSha256 !== run.staging.contentSha256 ||
      inspection.vaultRelativePath !== expectedVaultRelativePath(run)
    ) {
      throw new RegistryConflictError(
        "VAULT_EXPORT_PROJECTION_SCOPE_MISMATCH",
        "Vault projection inspection escaped the frozen export scope",
      );
    }

    if (inspection.state === "MATCH") {
      const recorded = this.dependencies.exports.recordProjectionReceipt(run.workspaceId, run.id, {
        vaultRelativePath: inspection.vaultRelativePath,
        contentSha256: inspection.contentSha256,
        disposition: "ALREADY_PRESENT",
      });
      return this.dependencies.exports.finalize(recorded.workspaceId, recorded.id);
    }
    if (inspection.state === "CONFLICT") {
      throw new RegistryConflictError(
        "VAULT_EXPORT_TARGET_CONTENT_CONFLICT",
        "Vault target contains different content; export remains PENDING and nothing was overwritten",
      );
    }

    const currentBinding = this.dependencies.bindings.getByWorkspaceId(run.workspaceId);
    if (!bindingMatchesRun(currentBinding, run)) {
      throw new RegistryConflictError(
        "VAULT_EXPORT_PENDING_BINDING_MISMATCH",
        "Pending Vault export cannot write because its frozen ACTIVE binding is no longer current",
      );
    }

    const projection = projector.project(run.workspaceId, run.staging.stagingDocumentId, {
      conflictPolicy: "FAIL_IF_DIFFERENT",
    });
    if (
      projection.contentSha256 !== run.staging.contentSha256 ||
      projection.vaultRelativePath !== expectedVaultRelativePath(run)
    ) {
      throw new RegistryConflictError(
        "VAULT_EXPORT_PROJECTION_RESULT_MISMATCH",
        "Vault projection result does not match the frozen export request",
      );
    }
    const recorded = this.dependencies.exports.recordProjectionReceipt(run.workspaceId, run.id, {
      vaultRelativePath: projection.vaultRelativePath,
      contentSha256: projection.contentSha256,
      disposition: projection.written ? "WRITTEN" : "ALREADY_PRESENT",
    });
    return this.dependencies.exports.finalize(recorded.workspaceId, recorded.id);
  }
}

export function getConfiguredVaultExportService(): VaultExportService {
  const database = getRegistryDatabase();
  return new VaultExportService({
    bindings: new SqliteVaultBindingRepository(database),
    exports: new SqliteVaultExportRunRepository(database),
    staging: getStagingContentRepository(),
  });
}
