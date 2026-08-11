import { createHash, randomBytes } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import {
  CANONICAL_DOWNSTREAM_DOCUMENT_CONTRACT_VERSION,
  CANONICAL_DOWNSTREAM_DOCUMENT_OBJECT_TYPE,
  CANONICAL_DOWNSTREAM_DOCUMENT_STATUS,
  CANONICAL_DOWNSTREAM_ORIGIN_KIND,
  type CanonicalDownstreamDocumentV1,
  type VaultImportExecutionV1,
  type VaultImportIntentV1,
  type VaultOriginStagingDocumentV1,
  type VaultOriginStagingFinalizationV1,
  type VaultOriginStagingVerificationEvidenceV1,
} from "@markorbit/contracts";
import {
  RegistryConflictError,
  RegistryError,
  RegistryValidationError,
  initializeRegistry,
} from "./index";

const MIGRATION_ID = "0028_canonical_downstream_document";
const SHA256 = /^[a-f0-9]{64}$/u;
const MAX_LIMIT = 100;

export type PromoteCanonicalVaultImportInput = {
  workspaceId: string;
  intent: VaultImportIntentV1;
  execution: VaultImportExecutionV1;
  staging: VaultOriginStagingDocumentV1;
  verification: VaultOriginStagingVerificationEvidenceV1;
  finalization: VaultOriginStagingFinalizationV1;
  content: Uint8Array;
};

export type CanonicalDownstreamPromotionResult = {
  document: CanonicalDownstreamDocumentV1;
  replayed: boolean;
};

export interface CanonicalDownstreamDocumentRepository {
  promoteVaultImport(input: PromoteCanonicalVaultImportInput): CanonicalDownstreamPromotionResult;
  getById(workspaceId: string, documentId: string): CanonicalDownstreamDocumentV1 | null;
  getByVaultStagingDocument(
    workspaceId: string,
    vaultStagingDocumentId: string,
  ): CanonicalDownstreamDocumentV1 | null;
  list(workspaceId: string, limit?: number): CanonicalDownstreamDocumentV1[];
}

function sha256(value: Uint8Array | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function stable(value: unknown): string {
  if (value === undefined) return "null";
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .filter((key) => (value as Record<string, unknown>)[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stable((value as Record<string, unknown>)[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function typedId(): string {
  return `cdd_${Date.now().toString(36)}${randomBytes(10).toString("hex")}`;
}

function required(value: string, field: string): string {
  const normalized = value?.trim();
  if (!normalized) throw new RegistryValidationError(`${field} is required`);
  return normalized;
}

function timestamp(value: string, field: string): string {
  if (Number.isNaN(Date.parse(value))) throw new RegistryValidationError(`${field} is invalid`);
  return value;
}

function limit(value = 20): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RegistryValidationError("limit must be a positive integer");
  }
  return Math.min(value, MAX_LIMIT);
}

function parseDocument(value: string): CanonicalDownstreamDocumentV1 {
  const parsed = JSON.parse(value) as CanonicalDownstreamDocumentV1;
  if (
    parsed?.contractVersion !== CANONICAL_DOWNSTREAM_DOCUMENT_CONTRACT_VERSION ||
    parsed.objectType !== CANONICAL_DOWNSTREAM_DOCUMENT_OBJECT_TYPE ||
    !parsed.id?.startsWith("cdd_") ||
    !parsed.workspaceId?.trim() ||
    parsed.status !== CANONICAL_DOWNSTREAM_DOCUMENT_STATUS ||
    parsed.origin?.kind !== CANONICAL_DOWNSTREAM_ORIGIN_KIND ||
    !parsed.origin.inspectionRunId?.startsWith("vin_") ||
    !parsed.origin.importIntentId?.startsWith("vmi_") ||
    !parsed.origin.importExecutionId?.startsWith("vie_") ||
    !parsed.origin.vaultStagingDocumentId?.startsWith("vst_") ||
    !parsed.origin.verificationId?.startsWith("vsv_") ||
    !["PASS", "PASS_WITH_WARNINGS"].includes(parsed.origin.verificationOutcome) ||
    !parsed.origin.finalizationId?.startsWith("vsf_") ||
    !SHA256.test(parsed.origin.rootFingerprintSha256) ||
    !parsed.origin.binding?.bindingId?.startsWith("vlt_") ||
    !Number.isSafeInteger(parsed.origin.binding.revision) ||
    parsed.origin.binding.revision < 1 ||
    !parsed.origin.binding.relativeRoot?.trim() ||
    !parsed.origin.vaultRelativePath?.trim() ||
    !parsed.origin.bindingRelativePath?.trim() ||
    Number.isNaN(Date.parse(parsed.origin.observedAt)) ||
    Number.isNaN(Date.parse(parsed.origin.reviewedAt)) ||
    Number.isNaN(Date.parse(parsed.origin.importedAt)) ||
    Number.isNaN(Date.parse(parsed.origin.verifiedAt)) ||
    !SHA256.test(parsed.content?.sha256) ||
    !Number.isSafeInteger(parsed.content.sizeBytes) ||
    parsed.content.sizeBytes < 0 ||
    parsed.content.contentAddressedRef !== `cas:sha256:${parsed.content.sha256}` ||
    parsed.content.mediaType !== "text/markdown" ||
    parsed.content.encoding !== "utf-8" ||
    parsed.legalTruthVerified !== false ||
    Number.isNaN(Date.parse(parsed.promotedAt))
  ) {
    throw new RegistryConflictError(
      "CANONICAL_DOWNSTREAM_DOCUMENT_PERSISTED_STATE_INVALID",
      "Persisted canonical downstream document is invalid",
    );
  }
  return parsed;
}

function sameBinding(
  left: { bindingId: string; revision: number; relativeRoot: string },
  right: { bindingId: string; revision: number; relativeRoot: string },
): boolean {
  return (
    left.bindingId === right.bindingId &&
    left.revision === right.revision &&
    left.relativeRoot === right.relativeRoot
  );
}

function validateChain(input: PromoteCanonicalVaultImportInput): void {
  const workspaceId = required(input.workspaceId, "workspaceId");
  const { intent, execution, staging, verification, finalization } = input;
  if (
    intent.workspaceId !== workspaceId ||
    execution.workspaceId !== workspaceId ||
    staging.workspaceId !== workspaceId ||
    verification.workspaceId !== workspaceId ||
    finalization.workspaceId !== workspaceId
  ) {
    throw new RegistryConflictError(
      "CANONICAL_DOWNSTREAM_WORKSPACE_MISMATCH",
      "Vault import promotion evidence crosses Workspace boundaries",
    );
  }
  if (
    intent.id !== staging.importIntentId ||
    intent.id !== execution.importIntentId ||
    intent.id !== verification.importIntentId ||
    intent.id !== finalization.importIntentId
  ) {
    throw new RegistryConflictError(
      "CANONICAL_DOWNSTREAM_IMPORT_INTENT_MISMATCH",
      "Vault import promotion evidence belongs to different import intents",
    );
  }
  if (execution.state !== "SUCCEEDED" || !execution.result) {
    throw new RegistryConflictError(
      "CANONICAL_DOWNSTREAM_IMPORT_EXECUTION_NOT_SUCCEEDED",
      "Canonical promotion requires a successful Vault import execution",
    );
  }
  if (
    execution.result.vaultStagingDocumentId !== staging.id ||
    execution.result.contentSha256 !== staging.contentHash.value ||
    execution.result.sizeBytes !== staging.sizeBytes ||
    execution.result.contentAddressedRef !== staging.contentAddressedRef
  ) {
    throw new RegistryConflictError(
      "CANONICAL_DOWNSTREAM_IMPORT_RECEIPT_MISMATCH",
      "Vault import execution receipt does not match the Staging document",
    );
  }
  if (
    staging.inspectionRunId !== intent.inspection.inspectionRunId ||
    staging.vaultRelativePath !== intent.candidate.vaultRelativePath ||
    staging.bindingRelativePath !== intent.candidate.bindingRelativePath ||
    staging.contentHash.value !== intent.candidate.observedSha256 ||
    staging.sizeBytes !== intent.candidate.sizeBytes ||
    !sameBinding(staging.binding, intent.inspection.binding) ||
    !sameBinding(execution.binding, intent.inspection.binding) ||
    execution.rootFingerprintSha256 !== intent.inspection.rootFingerprintSha256
  ) {
    throw new RegistryConflictError(
      "CANONICAL_DOWNSTREAM_REVIEWED_EVIDENCE_MISMATCH",
      "Vault-origin Staging no longer matches the reviewed inspection evidence",
    );
  }
  if (
    verification.vaultStagingDocumentId !== staging.id ||
    verification.contentSha256 !== staging.contentHash.value ||
    verification.sizeBytes !== staging.sizeBytes ||
    !["PASS", "PASS_WITH_WARNINGS"].includes(verification.outcome)
  ) {
    throw new RegistryConflictError(
      "CANONICAL_DOWNSTREAM_VERIFICATION_INVALID",
      "Canonical promotion requires passing verification bound to the exact Staging bytes",
    );
  }
  if (
    finalization.state !== "VERIFIED" ||
    finalization.vaultStagingDocumentId !== staging.id ||
    finalization.verificationId !== verification.id ||
    finalization.contentSha256 !== staging.contentHash.value
  ) {
    throw new RegistryConflictError(
      "CANONICAL_DOWNSTREAM_FINALIZATION_INVALID",
      "Canonical promotion requires VERIFIED finalization bound to the exact verification",
    );
  }
  if (!(input.content instanceof Uint8Array)) {
    throw new RegistryValidationError("Canonical promotion content must be bytes");
  }
  if (
    input.content.byteLength !== staging.sizeBytes ||
    sha256(input.content) !== staging.contentHash.value
  ) {
    throw new RegistryConflictError(
      "CANONICAL_DOWNSTREAM_CAS_INTEGRITY_FAILURE",
      "Canonical promotion content does not match immutable Vault-origin Staging evidence",
    );
  }
  timestamp(intent.inspection.observedAt, "inspection.observedAt");
  timestamp(intent.reviewedAt, "intent.reviewedAt");
  timestamp(staging.importedAt, "staging.importedAt");
  timestamp(verification.createdAt, "verification.createdAt");
}

function passingVerificationOutcome(
  value: VaultOriginStagingVerificationEvidenceV1["outcome"],
): "PASS" | "PASS_WITH_WARNINGS" {
  if (value === "PASS" || value === "PASS_WITH_WARNINGS") return value;
  throw new RegistryConflictError(
    "CANONICAL_DOWNSTREAM_VERIFICATION_INVALID",
    "Canonical promotion requires passing verification bound to the exact Staging bytes",
  );
}

function frozenEvidence(input: PromoteCanonicalVaultImportInput) {
  const verificationOutcome = passingVerificationOutcome(input.verification.outcome);
  return {
    workspaceId: input.workspaceId,
    origin: {
      kind: CANONICAL_DOWNSTREAM_ORIGIN_KIND,
      inspectionRunId: input.intent.inspection.inspectionRunId,
      importIntentId: input.intent.id,
      importExecutionId: input.execution.id,
      vaultStagingDocumentId: input.staging.id,
      verificationId: input.verification.id,
      verificationOutcome,
      finalizationId: input.finalization.id,
      rootFingerprintSha256: input.intent.inspection.rootFingerprintSha256,
      binding: input.intent.inspection.binding,
      vaultRelativePath: input.staging.vaultRelativePath,
      bindingRelativePath: input.staging.bindingRelativePath,
      observedAt: input.intent.inspection.observedAt,
      reviewedAt: input.intent.reviewedAt,
      importedAt: input.staging.importedAt,
      verifiedAt: input.verification.createdAt,
    },
    content: {
      sha256: input.staging.contentHash.value,
      sizeBytes: input.staging.sizeBytes,
      contentAddressedRef: input.staging.contentAddressedRef,
      mediaType: "text/markdown" as const,
      encoding: "utf-8" as const,
    },
    legalTruthVerified: false as const,
  };
}

export function ensureCanonicalDownstreamDocumentRegistry(database: DatabaseSync): void {
  initializeRegistry(database);
  if (database.prepare("SELECT id FROM schema_migrations WHERE id = ?").get(MIGRATION_ID)) return;
  database.exec("BEGIN IMMEDIATE;");
  try {
    database.exec(`
      CREATE TABLE IF NOT EXISTS canonical_downstream_documents (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        origin_kind TEXT NOT NULL CHECK (origin_kind = 'VAULT_IMPORT'),
        vault_staging_document_id TEXT NOT NULL,
        import_intent_id TEXT NOT NULL,
        verification_id TEXT NOT NULL,
        finalization_id TEXT NOT NULL,
        content_sha256 TEXT NOT NULL,
        frozen_digest TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status = 'READY'),
        document_json TEXT NOT NULL,
        promoted_at TEXT NOT NULL,
        FOREIGN KEY (workspace_id) REFERENCES workspaces(id),
        UNIQUE (workspace_id, vault_staging_document_id)
      ) STRICT;

      CREATE INDEX IF NOT EXISTS idx_canonical_downstream_workspace_promoted
        ON canonical_downstream_documents(workspace_id, promoted_at DESC, id DESC);
      CREATE INDEX IF NOT EXISTS idx_canonical_downstream_content_sha256
        ON canonical_downstream_documents(workspace_id, content_sha256);
    `);
    database
      .prepare("INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)")
      .run(MIGRATION_ID, new Date().toISOString());
    database.exec("COMMIT;");
  } catch (error) {
    database.exec("ROLLBACK;");
    throw error;
  }
}

export class SqliteCanonicalDownstreamDocumentRepository implements CanonicalDownstreamDocumentRepository {
  constructor(
    private readonly database: DatabaseSync,
    private readonly clock: () => Date = () => new Date(),
    private readonly idFactory: () => string = () => typedId(),
  ) {
    ensureCanonicalDownstreamDocumentRegistry(database);
  }

  promoteVaultImport(input: PromoteCanonicalVaultImportInput): CanonicalDownstreamPromotionResult {
    validateChain(input);
    const frozen = frozenEvidence(input);
    const frozenDigest = sha256(stable(frozen));
    const existing = this.getByVaultStagingDocument(input.workspaceId, input.staging.id);
    if (existing) {
      const row = this.database
        .prepare(
          `SELECT frozen_digest FROM canonical_downstream_documents
           WHERE workspace_id = ? AND vault_staging_document_id = ?`,
        )
        .get(input.workspaceId, input.staging.id) as { frozen_digest: string } | undefined;
      if (!row || row.frozen_digest !== frozenDigest) {
        throw new RegistryConflictError(
          "CANONICAL_DOWNSTREAM_FROZEN_EVIDENCE_CONFLICT",
          "Vault-origin Staging is already promoted with different immutable evidence",
        );
      }
      return { document: existing, replayed: true };
    }
    if (!this.database.prepare("SELECT id FROM workspaces WHERE id = ?").get(input.workspaceId)) {
      throw new RegistryError(
        "WORKSPACE_NOT_FOUND",
        `Workspace ${input.workspaceId} was not found`,
      );
    }

    const promotedAt = this.clock().toISOString();
    const document: CanonicalDownstreamDocumentV1 = {
      contractVersion: CANONICAL_DOWNSTREAM_DOCUMENT_CONTRACT_VERSION,
      objectType: CANONICAL_DOWNSTREAM_DOCUMENT_OBJECT_TYPE,
      id: this.idFactory(),
      workspaceId: input.workspaceId,
      status: CANONICAL_DOWNSTREAM_DOCUMENT_STATUS,
      origin: frozen.origin,
      content: frozen.content,
      legalTruthVerified: false,
      promotedAt,
    };

    this.database.exec("BEGIN IMMEDIATE;");
    try {
      const raced = this.getByVaultStagingDocument(input.workspaceId, input.staging.id);
      if (raced) {
        const row = this.database
          .prepare(
            `SELECT frozen_digest FROM canonical_downstream_documents
             WHERE workspace_id = ? AND vault_staging_document_id = ?`,
          )
          .get(input.workspaceId, input.staging.id) as { frozen_digest: string } | undefined;
        if (!row || row.frozen_digest !== frozenDigest) {
          throw new RegistryConflictError(
            "CANONICAL_DOWNSTREAM_FROZEN_EVIDENCE_CONFLICT",
            "Vault-origin Staging was concurrently promoted with different immutable evidence",
          );
        }
        this.database.exec("COMMIT;");
        return { document: raced, replayed: true };
      }
      this.database
        .prepare(
          `INSERT INTO canonical_downstream_documents
           (id, workspace_id, origin_kind, vault_staging_document_id, import_intent_id,
            verification_id, finalization_id, content_sha256, frozen_digest, status,
            document_json, promoted_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          document.id,
          document.workspaceId,
          document.origin.kind,
          document.origin.vaultStagingDocumentId,
          document.origin.importIntentId,
          document.origin.verificationId,
          document.origin.finalizationId,
          document.content.sha256,
          frozenDigest,
          document.status,
          JSON.stringify(document),
          promotedAt,
        );
      this.database.exec("COMMIT;");
      return { document, replayed: false };
    } catch (error) {
      this.database.exec("ROLLBACK;");
      throw error;
    }
  }

  getById(workspaceIdValue: string, documentIdValue: string): CanonicalDownstreamDocumentV1 | null {
    const workspaceId = required(workspaceIdValue, "workspaceId");
    const documentId = required(documentIdValue, "documentId");
    const row = this.database
      .prepare(
        `SELECT document_json FROM canonical_downstream_documents
         WHERE workspace_id = ? AND id = ?`,
      )
      .get(workspaceId, documentId) as { document_json: string } | undefined;
    return row ? parseDocument(row.document_json) : null;
  }

  getByVaultStagingDocument(
    workspaceIdValue: string,
    vaultStagingDocumentIdValue: string,
  ): CanonicalDownstreamDocumentV1 | null {
    const workspaceId = required(workspaceIdValue, "workspaceId");
    const vaultStagingDocumentId = required(vaultStagingDocumentIdValue, "vaultStagingDocumentId");
    const row = this.database
      .prepare(
        `SELECT document_json FROM canonical_downstream_documents
         WHERE workspace_id = ? AND vault_staging_document_id = ?`,
      )
      .get(workspaceId, vaultStagingDocumentId) as { document_json: string } | undefined;
    return row ? parseDocument(row.document_json) : null;
  }

  list(workspaceIdValue: string, limitValue = 20): CanonicalDownstreamDocumentV1[] {
    const workspaceId = required(workspaceIdValue, "workspaceId");
    const rows = this.database
      .prepare(
        `SELECT document_json FROM canonical_downstream_documents
         WHERE workspace_id = ? ORDER BY promoted_at DESC, id DESC LIMIT ?`,
      )
      .all(workspaceId, limit(limitValue)) as Array<{ document_json: string }>;
    return rows.map((row) => parseDocument(row.document_json));
  }
}
