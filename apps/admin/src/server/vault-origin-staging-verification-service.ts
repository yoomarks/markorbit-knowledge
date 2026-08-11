import { resolve } from "node:path";
import type {
  VaultOriginStagingDocumentV1,
  VaultOriginStagingFinalizationV1,
  VaultOriginStagingVerificationEvidenceV1,
} from "@markorbit/contracts";
import { RegistryValidationError } from "@markorbit/persistence";
import { SqliteVaultOriginStagingRepository } from "@markorbit/persistence/vault-import-executions";
import {
  SqliteVaultOriginStagingVerificationRepository,
  type VaultOriginStagingVerificationRepository,
} from "@markorbit/persistence/vault-origin-staging-verification";
import { getRegistryDatabase } from "./source-registry";

export type VaultOriginStagingVerificationOverview = {
  documents: VaultOriginStagingDocumentV1[];
  verifications: VaultOriginStagingVerificationEvidenceV1[];
  finalizations: VaultOriginStagingFinalizationV1[];
};

export type VaultOriginStagingVerificationServiceDependencies = {
  repository: VaultOriginStagingVerificationRepository;
};

function required(value: string, field: string): string {
  const normalized = value?.trim();
  if (!normalized) throw new RegistryValidationError(`${field} is required`);
  return normalized;
}

function stagingStorePath(): string {
  const configured = process.env.MARKORBIT_STAGING_STORE_PATH?.trim();
  if (configured) return resolve(configured);
  const repositoryRoot =
    process.env.MARKORBIT_REPOSITORY_ROOT ?? process.env.INIT_CWD ?? process.cwd();
  return resolve(repositoryRoot, ".data", "staging");
}

export class VaultOriginStagingVerificationService {
  constructor(private readonly dependencies: VaultOriginStagingVerificationServiceDependencies) {}

  overview(workspaceIdValue: string): VaultOriginStagingVerificationOverview {
    const workspaceId = required(workspaceIdValue, "workspaceId");
    return {
      documents: this.dependencies.repository.listDocuments(workspaceId, 50),
      verifications: this.dependencies.repository.listVerifications(workspaceId, 50),
      finalizations: this.dependencies.repository.listFinalizations(workspaceId, 50),
    };
  }

  verify(workspaceIdValue: string, documentIdValue: string, idempotencyKeyValue: string) {
    return this.dependencies.repository.verify({
      workspaceId: required(workspaceIdValue, "workspaceId"),
      vaultStagingDocumentId: required(documentIdValue, "vaultStagingDocumentId"),
      idempotencyKey: required(idempotencyKeyValue, "idempotencyKey"),
    });
  }

  finalize(workspaceIdValue: string, documentIdValue: string, idempotencyKeyValue: string) {
    return this.dependencies.repository.finalize({
      workspaceId: required(workspaceIdValue, "workspaceId"),
      vaultStagingDocumentId: required(documentIdValue, "vaultStagingDocumentId"),
      idempotencyKey: required(idempotencyKeyValue, "idempotencyKey"),
    });
  }
}

export function getConfiguredVaultOriginStagingVerificationService(): VaultOriginStagingVerificationService {
  const database = getRegistryDatabase();
  const staging = new SqliteVaultOriginStagingRepository(database, stagingStorePath());
  return new VaultOriginStagingVerificationService({
    repository: new SqliteVaultOriginStagingVerificationRepository(database, staging),
  });
}
