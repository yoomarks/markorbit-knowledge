import { resolve } from "node:path";
import type {
  CanonicalDownstreamDocumentV1,
  VaultOriginStagingDocumentV1,
  VaultOriginStagingFinalizationV1,
  VaultOriginStagingVerificationEvidenceV1,
} from "@markorbit/contracts";
import { RegistryConflictError, RegistryValidationError } from "@markorbit/persistence";
import {
  SqliteCanonicalDownstreamDocumentRepository,
  type CanonicalDownstreamDocumentRepository,
  type CanonicalDownstreamPromotionResult,
} from "@markorbit/persistence/canonical-downstream-documents";
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
import {
  SqliteVaultOriginStagingVerificationRepository,
  type VaultOriginStagingVerificationRepository,
} from "@markorbit/persistence/vault-origin-staging-verification";
import { getRegistryDatabase } from "./source-registry";

export type CanonicalDownstreamPromotionCandidate = {
  staging: VaultOriginStagingDocumentV1;
  verification: VaultOriginStagingVerificationEvidenceV1;
  finalization: VaultOriginStagingFinalizationV1;
};

export type CanonicalDownstreamPromotionOverview = {
  candidates: CanonicalDownstreamPromotionCandidate[];
  documents: CanonicalDownstreamDocumentV1[];
};

export type CanonicalDownstreamPromotionServiceDependencies = {
  intents: VaultImportIntentRepository;
  executions: VaultImportExecutionRepository;
  staging: VaultOriginStagingRepository;
  verifications: VaultOriginStagingVerificationRepository;
  canonical: CanonicalDownstreamDocumentRepository;
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

export class CanonicalDownstreamPromotionService {
  constructor(private readonly dependencies: CanonicalDownstreamPromotionServiceDependencies) {}

  overview(workspaceIdValue: string): CanonicalDownstreamPromotionOverview {
    const workspaceId = required(workspaceIdValue, "workspaceId");
    const documents = this.dependencies.canonical.list(workspaceId, 50);
    const promoted = new Set(documents.map((document) => document.origin.vaultStagingDocumentId));
    const candidates: CanonicalDownstreamPromotionCandidate[] = [];

    for (const finalization of this.dependencies.verifications.listFinalizations(workspaceId, 50)) {
      if (finalization.state !== "VERIFIED" || promoted.has(finalization.vaultStagingDocumentId)) {
        continue;
      }
      const staging = this.dependencies.verifications.getDocument(
        workspaceId,
        finalization.vaultStagingDocumentId,
      );
      const verification = this.dependencies.verifications.getVerificationByDocument(
        workspaceId,
        finalization.vaultStagingDocumentId,
      );
      if (!staging || !verification) {
        throw new RegistryConflictError(
          "CANONICAL_DOWNSTREAM_SOURCE_EVIDENCE_MISSING",
          "VERIFIED Vault-origin finalization is missing its immutable source evidence",
        );
      }
      candidates.push({ staging, verification, finalization });
    }

    return { candidates, documents };
  }

  promote(
    workspaceIdValue: string,
    vaultStagingDocumentIdValue: string,
  ): CanonicalDownstreamPromotionResult {
    const workspaceId = required(workspaceIdValue, "workspaceId");
    const vaultStagingDocumentId = required(
      vaultStagingDocumentIdValue,
      "vaultStagingDocumentId",
    );

    const existing = this.dependencies.canonical.getByVaultStagingDocument(
      workspaceId,
      vaultStagingDocumentId,
    );
    if (existing) return { document: existing, replayed: true };

    const staging = this.dependencies.verifications.getDocument(workspaceId, vaultStagingDocumentId);
    if (!staging) {
      throw new RegistryValidationError(
        `Vault-origin Staging document ${vaultStagingDocumentId} was not found`,
      );
    }
    const verification = this.dependencies.verifications.getVerificationByDocument(
      workspaceId,
      vaultStagingDocumentId,
    );
    const finalization = this.dependencies.verifications.getFinalizationByDocument(
      workspaceId,
      vaultStagingDocumentId,
    );
    if (!verification || !finalization) {
      throw new RegistryConflictError(
        "CANONICAL_DOWNSTREAM_VERIFICATION_MISSING",
        "Vault-origin Staging must have durable K11 verification and finalization before promotion",
      );
    }
    if (finalization.state !== "VERIFIED") {
      throw new RegistryConflictError(
        "CANONICAL_DOWNSTREAM_SOURCE_BLOCKED",
        "BLOCKED Vault-origin Staging cannot be promoted downstream",
      );
    }

    const intent = this.dependencies.intents.getById(workspaceId, staging.importIntentId);
    if (!intent) {
      throw new RegistryConflictError(
        "CANONICAL_DOWNSTREAM_IMPORT_INTENT_MISSING",
        "Vault-origin Staging import intent evidence is missing",
      );
    }
    const execution = this.dependencies.executions.getByImportIntent(workspaceId, staging.importIntentId);
    if (!execution) {
      throw new RegistryConflictError(
        "CANONICAL_DOWNSTREAM_IMPORT_EXECUTION_MISSING",
        "Vault-origin Staging import execution evidence is missing",
      );
    }

    const content = this.dependencies.staging.readContent(workspaceId, vaultStagingDocumentId);
    return this.dependencies.canonical.promoteVaultImport({
      workspaceId,
      intent,
      execution,
      staging,
      verification,
      finalization,
      content,
    });
  }
}

export function getConfiguredCanonicalDownstreamPromotionService(): CanonicalDownstreamPromotionService {
  const database = getRegistryDatabase();
  const staging = new SqliteVaultOriginStagingRepository(database, stagingStorePath());
  return new CanonicalDownstreamPromotionService({
    intents: new SqliteVaultImportIntentRepository(database),
    executions: new SqliteVaultImportExecutionRepository(database),
    staging,
    verifications: new SqliteVaultOriginStagingVerificationRepository(database, staging),
    canonical: new SqliteCanonicalDownstreamDocumentRepository(database),
  });
}
