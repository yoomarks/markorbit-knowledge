import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  VAULT_IMPORT_EXECUTION_CONTRACT_VERSION,
  VAULT_IMPORT_EXECUTION_OBJECT_TYPE,
  VAULT_IMPORT_REJECTION_CODES,
  VAULT_ORIGIN_STAGING_CONTRACT_VERSION,
  VAULT_ORIGIN_STAGING_OBJECT_TYPE,
  VAULT_ORIGIN_STAGING_STATUS,
  type VaultImportExecutionBindingSnapshotV1,
  type VaultImportExecutionCandidateSnapshotV1,
  type VaultImportExecutionV1,
  type VaultImportRejectionCode,
  type VaultImportStagingReceiptV1,
  type VaultOriginStagingDocumentV1,
} from "@markorbit/contracts";
import {
  RegistryConflictError,
  RegistryError,
  RegistryValidationError,
  initializeRegistry,
} from "./index";
import { normalizeObsidianTargetPath } from "./obsidian-vault-projection";
import { normalizeVaultRelativeRoot } from "./vault-binding-registry";

const MIGRATION_ID = "0026_vault_import_execution";
const SHA256 = /^[a-f0-9]{64}$/u;
const MAX_CONTENT_BYTES = 5_000_000;
const MAX_LIMIT = 100;

export type IngestVaultOriginStagingInput = {
  workspaceId: string;
  importIntentId: string;
  inspectionRunId: string;
  binding: VaultImportExecutionBindingSnapshotV1;
  candidate: VaultImportExecutionCandidateSnapshotV1;
  content: Uint8Array;
};

export type VaultOriginStagingIngestResult = {
  document: VaultOriginStagingDocumentV1;
  replayed: boolean;
  contentCreated: boolean;
};

export interface VaultOriginStagingRepository {
  ingest(input: IngestVaultOriginStagingInput): VaultOriginStagingIngestResult;
  getByImportIntent(
    workspaceId: string,
    importIntentId: string,
  ): VaultOriginStagingDocumentV1 | null;
  readContent(workspaceId: string, documentId: string): Uint8Array;
}

export type PrepareVaultImportExecutionInput = {
  workspaceId: string;
  importIntentId: string;
  rootFingerprintSha256: string;
  binding: VaultImportExecutionBindingSnapshotV1;
  candidate: VaultImportExecutionCandidateSnapshotV1;
};

export interface VaultImportExecutionRepository {
  prepare(input: PrepareVaultImportExecutionInput): VaultImportExecutionV1;
  getByImportIntent(workspaceId: string, importIntentId: string): VaultImportExecutionV1 | null;
  list(workspaceId: string, limit?: number): VaultImportExecutionV1[];
  recordStagingReceipt(
    workspaceId: string,
    executionId: string,
    receipt: VaultImportStagingReceiptV1,
  ): VaultImportExecutionV1;
  reject(
    workspaceId: string,
    executionId: string,
    code: VaultImportRejectionCode,
  ): VaultImportExecutionV1;
  finalize(workspaceId: string, executionId: string): VaultImportExecutionV1;
}

function sha256(value: Uint8Array | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function typedId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${randomBytes(10).toString("hex")}`;
}

function required(value: string, field: string): string {
  const normalized = value?.trim();
  if (!normalized) throw new RegistryValidationError(`${field} is required`);
  return normalized;
}

function normalizeBinding(
  value: VaultImportExecutionBindingSnapshotV1,
): VaultImportExecutionBindingSnapshotV1 {
  if (
    !value?.bindingId?.startsWith("vlt_") ||
    !Number.isSafeInteger(value.revision) ||
    value.revision < 1
  ) {
    throw new RegistryValidationError("Vault import execution Binding snapshot is invalid");
  }
  return {
    bindingId: value.bindingId,
    revision: value.revision,
    relativeRoot: normalizeVaultRelativeRoot(value.relativeRoot),
  };
}

function normalizeCandidate(
  value: VaultImportExecutionCandidateSnapshotV1,
  relativeRoot: string,
): VaultImportExecutionCandidateSnapshotV1 {
  if (!value || !SHA256.test(value.observedSha256) || !Number.isSafeInteger(value.sizeBytes)) {
    throw new RegistryValidationError("Vault import execution candidate is invalid");
  }
  if (value.sizeBytes < 0 || value.sizeBytes > MAX_CONTENT_BYTES) {
    throw new RegistryValidationError("Vault import execution candidate size is outside limits");
  }
  const bindingRelativePath = normalizeObsidianTargetPath(value.bindingRelativePath);
  const vaultRelativePath = `${relativeRoot}/${bindingRelativePath}`;
  if (value.vaultRelativePath !== vaultRelativePath) {
    throw new RegistryValidationError(
      "Vault import execution candidate escaped its frozen Binding",
    );
  }
  return {
    vaultRelativePath,
    bindingRelativePath,
    observedSha256: value.observedSha256,
    sizeBytes: value.sizeBytes,
  };
}

function normalizeReceipt(value: VaultImportStagingReceiptV1): VaultImportStagingReceiptV1 {
  if (
    !value?.vaultStagingDocumentId?.startsWith("vst_") ||
    !SHA256.test(value.contentSha256) ||
    !Number.isSafeInteger(value.sizeBytes) ||
    value.sizeBytes < 0 ||
    value.contentAddressedRef !== `cas:sha256:${value.contentSha256}` ||
    Number.isNaN(Date.parse(value.recordedAt))
  ) {
    throw new RegistryValidationError("Vault import Staging receipt is invalid");
  }
  return { ...value };
}

function parseDocument(value: string): VaultOriginStagingDocumentV1 {
  const parsed = JSON.parse(value) as VaultOriginStagingDocumentV1;
  if (
    parsed?.contractVersion !== VAULT_ORIGIN_STAGING_CONTRACT_VERSION ||
    parsed.objectType !== VAULT_ORIGIN_STAGING_OBJECT_TYPE ||
    !parsed.id?.startsWith("vst_") ||
    !parsed.workspaceId?.trim() ||
    !parsed.importIntentId?.startsWith("vmi_") ||
    !parsed.inspectionRunId?.startsWith("vin_") ||
    parsed.contentHash?.algorithm !== "SHA-256" ||
    !SHA256.test(parsed.contentHash.value) ||
    !Number.isSafeInteger(parsed.sizeBytes) ||
    parsed.sizeBytes < 0 ||
    parsed.contentAddressedRef !== `cas:sha256:${parsed.contentHash.value}` ||
    parsed.mediaType !== "text/markdown" ||
    parsed.encoding !== "utf-8" ||
    parsed.status !== VAULT_ORIGIN_STAGING_STATUS ||
    Number.isNaN(Date.parse(parsed.importedAt))
  ) {
    throw new RegistryConflictError(
      "VAULT_ORIGIN_STAGING_PERSISTED_STATE_INVALID",
      "Persisted Vault-origin Staging document is invalid",
    );
  }
  const binding = normalizeBinding(parsed.binding);
  const candidate = normalizeCandidate(
    {
      vaultRelativePath: parsed.vaultRelativePath,
      bindingRelativePath: parsed.bindingRelativePath,
      observedSha256: parsed.contentHash.value,
      sizeBytes: parsed.sizeBytes,
    },
    binding.relativeRoot,
  );
  return { ...parsed, binding, ...candidate };
}

function parseExecution(value: string): VaultImportExecutionV1 {
  const parsed = JSON.parse(value) as VaultImportExecutionV1;
  if (
    parsed?.contractVersion !== VAULT_IMPORT_EXECUTION_CONTRACT_VERSION ||
    parsed.objectType !== VAULT_IMPORT_EXECUTION_OBJECT_TYPE ||
    !parsed.id?.startsWith("vie_") ||
    !parsed.workspaceId?.trim() ||
    !parsed.importIntentId?.startsWith("vmi_") ||
    !["PENDING", "SUCCEEDED", "REJECTED"].includes(parsed.state) ||
    !SHA256.test(parsed.rootFingerprintSha256) ||
    Number.isNaN(Date.parse(parsed.preparedAt)) ||
    Number.isNaN(Date.parse(parsed.updatedAt))
  ) {
    throw new RegistryConflictError(
      "VAULT_IMPORT_EXECUTION_PERSISTED_STATE_INVALID",
      "Persisted Vault import execution is invalid",
    );
  }
  const binding = normalizeBinding(parsed.binding);
  const candidate = normalizeCandidate(parsed.candidate, binding.relativeRoot);
  const stagingReceipt = parsed.stagingReceipt
    ? normalizeReceipt(parsed.stagingReceipt)
    : undefined;
  const result = parsed.result ? normalizeReceipt(parsed.result) : undefined;
  if (parsed.state === "PENDING" && (parsed.rejection || parsed.result)) {
    throw new RegistryConflictError(
      "VAULT_IMPORT_EXECUTION_PERSISTED_STATE_INVALID",
      "Pending Vault import execution contains terminal evidence",
    );
  }
  if (
    parsed.state === "REJECTED" &&
    (!parsed.rejection ||
      !VAULT_IMPORT_REJECTION_CODES.includes(parsed.rejection.code) ||
      Number.isNaN(Date.parse(parsed.rejection.recordedAt)) ||
      stagingReceipt ||
      result)
  ) {
    throw new RegistryConflictError(
      "VAULT_IMPORT_EXECUTION_PERSISTED_STATE_INVALID",
      "Rejected Vault import execution evidence is invalid",
    );
  }
  if (
    parsed.state === "SUCCEEDED" &&
    (!stagingReceipt || !result || JSON.stringify(stagingReceipt) !== JSON.stringify(result))
  ) {
    throw new RegistryConflictError(
      "VAULT_IMPORT_EXECUTION_PERSISTED_STATE_INVALID",
      "Succeeded Vault import execution requires the persisted Staging receipt as result",
    );
  }
  return {
    ...parsed,
    binding,
    candidate,
    ...(stagingReceipt ? { stagingReceipt } : {}),
    ...(result ? { result } : {}),
  };
}

export function ensureVaultImportExecutionRegistry(database: DatabaseSync): void {
  initializeRegistry(database);
  if (database.prepare("SELECT id FROM schema_migrations WHERE id = ?").get(MIGRATION_ID)) return;
  database.exec("BEGIN IMMEDIATE;");
  try {
    database.exec(`
      CREATE TABLE IF NOT EXISTS vault_origin_staging_content_objects (
        sha256 TEXT PRIMARY KEY,
        size_bytes INTEGER NOT NULL CHECK (size_bytes >= 0),
        storage_ref TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL
      ) STRICT;

      CREATE TABLE IF NOT EXISTS vault_origin_staging_documents (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        import_intent_id TEXT NOT NULL UNIQUE,
        vault_relative_path TEXT NOT NULL,
        content_sha256 TEXT NOT NULL,
        document_json TEXT NOT NULL,
        imported_at TEXT NOT NULL,
        FOREIGN KEY (workspace_id) REFERENCES workspaces(id),
        FOREIGN KEY (content_sha256) REFERENCES vault_origin_staging_content_objects(sha256)
      ) STRICT;

      CREATE INDEX IF NOT EXISTS idx_vault_origin_staging_workspace
        ON vault_origin_staging_documents(workspace_id, imported_at DESC);

      CREATE TABLE IF NOT EXISTS vault_import_executions (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        import_intent_id TEXT NOT NULL UNIQUE,
        state TEXT NOT NULL CHECK (state IN ('PENDING','SUCCEEDED','REJECTED')),
        frozen_digest TEXT NOT NULL,
        execution_json TEXT NOT NULL,
        prepared_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (workspace_id) REFERENCES workspaces(id)
      ) STRICT;

      CREATE INDEX IF NOT EXISTS idx_vault_import_executions_workspace
        ON vault_import_executions(workspace_id, updated_at DESC);
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

export class SqliteVaultOriginStagingRepository implements VaultOriginStagingRepository {
  constructor(
    private readonly database: DatabaseSync,
    private readonly storageRoot: string,
    private readonly clock: () => Date = () => new Date(),
    private readonly idFactory: () => string = () => typedId("vst"),
  ) {
    ensureVaultImportExecutionRegistry(database);
    mkdirSync(storageRoot, { recursive: true });
  }

  ingest(input: IngestVaultOriginStagingInput): VaultOriginStagingIngestResult {
    const workspaceId = required(input.workspaceId, "workspaceId");
    const importIntentId = required(input.importIntentId, "importIntentId");
    const inspectionRunId = required(input.inspectionRunId, "inspectionRunId");
    const binding = normalizeBinding(input.binding);
    const candidate = normalizeCandidate(input.candidate, binding.relativeRoot);
    if (!(input.content instanceof Uint8Array) || input.content.byteLength > MAX_CONTENT_BYTES) {
      throw new RegistryValidationError("Vault-origin Staging content exceeds limits");
    }
    const contentHash = sha256(input.content);
    if (
      contentHash !== candidate.observedSha256 ||
      input.content.byteLength !== candidate.sizeBytes
    ) {
      throw new RegistryConflictError(
        "VAULT_ORIGIN_STAGING_FROZEN_EVIDENCE_MISMATCH",
        "Vault-origin Staging bytes do not match the reviewed import intent",
      );
    }
    const existing = this.getByImportIntent(workspaceId, importIntentId);
    if (existing) {
      if (
        existing.inspectionRunId !== inspectionRunId ||
        existing.vaultRelativePath !== candidate.vaultRelativePath ||
        existing.contentHash.value !== contentHash ||
        existing.sizeBytes !== input.content.byteLength
      ) {
        throw new RegistryConflictError(
          "VAULT_ORIGIN_STAGING_IMPORT_INTENT_CONFLICT",
          "Import intent is already bound to different Vault-origin Staging evidence",
        );
      }
      return { document: existing, replayed: true, contentCreated: false };
    }
    if (!this.database.prepare("SELECT id FROM workspaces WHERE id = ?").get(workspaceId)) {
      throw new RegistryError("WORKSPACE_NOT_FOUND", `Workspace ${workspaceId} was not found`);
    }

    const storageRef = join("sha256", contentHash.slice(0, 2), `${contentHash}.md`).replaceAll(
      "\\",
      "/",
    );
    const absolutePath = join(this.storageRoot, storageRef);
    const temporaryPath = `${absolutePath}.${randomBytes(8).toString("hex")}.tmp`;
    const now = this.clock().toISOString();
    let contentCreated = false;
    try {
      if (existsSync(absolutePath)) {
        this.verifyStoredBytes(absolutePath, contentHash, input.content.byteLength);
      } else {
        mkdirSync(dirname(absolutePath), { recursive: true });
        writeFileSync(temporaryPath, input.content, { flag: "wx" });
        renameSync(temporaryPath, absolutePath);
        contentCreated = true;
      }

      const document: VaultOriginStagingDocumentV1 = {
        contractVersion: VAULT_ORIGIN_STAGING_CONTRACT_VERSION,
        objectType: VAULT_ORIGIN_STAGING_OBJECT_TYPE,
        id: this.idFactory(),
        workspaceId,
        importIntentId,
        inspectionRunId,
        binding,
        vaultRelativePath: candidate.vaultRelativePath,
        bindingRelativePath: candidate.bindingRelativePath,
        contentHash: { algorithm: "SHA-256", value: contentHash },
        sizeBytes: input.content.byteLength,
        contentAddressedRef: `cas:sha256:${contentHash}`,
        mediaType: "text/markdown",
        encoding: "utf-8",
        status: VAULT_ORIGIN_STAGING_STATUS,
        importedAt: now,
      };

      this.database.exec("BEGIN IMMEDIATE;");
      try {
        const raced = this.getByImportIntent(workspaceId, importIntentId);
        if (raced) {
          this.database.exec("COMMIT;");
          return { document: raced, replayed: true, contentCreated: false };
        }
        this.database
          .prepare(
            `INSERT OR IGNORE INTO vault_origin_staging_content_objects
             (sha256, size_bytes, storage_ref, created_at) VALUES (?, ?, ?, ?)`,
          )
          .run(contentHash, input.content.byteLength, storageRef, now);
        this.database
          .prepare(
            `INSERT INTO vault_origin_staging_documents
             (id, workspace_id, import_intent_id, vault_relative_path, content_sha256,
              document_json, imported_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            document.id,
            workspaceId,
            importIntentId,
            document.vaultRelativePath,
            contentHash,
            JSON.stringify(document),
            now,
          );
        this.database.exec("COMMIT;");
        return { document, replayed: false, contentCreated };
      } catch (error) {
        this.database.exec("ROLLBACK;");
        throw error;
      }
    } catch (error) {
      if (existsSync(temporaryPath)) rmSync(temporaryPath, { force: true });
      if (contentCreated && !this.isContentReferenced(contentHash))
        rmSync(absolutePath, { force: true });
      throw error;
    }
  }

  getByImportIntent(workspaceIdValue: string, importIntentIdValue: string) {
    const workspaceId = required(workspaceIdValue, "workspaceId");
    const importIntentId = required(importIntentIdValue, "importIntentId");
    const row = this.database
      .prepare(
        `SELECT document_json FROM vault_origin_staging_documents
         WHERE workspace_id = ? AND import_intent_id = ?`,
      )
      .get(workspaceId, importIntentId) as { document_json: string } | undefined;
    return row ? parseDocument(row.document_json) : null;
  }

  readContent(workspaceIdValue: string, documentIdValue: string): Uint8Array {
    const workspaceId = required(workspaceIdValue, "workspaceId");
    const documentId = required(documentIdValue, "documentId");
    const row = this.database
      .prepare(
        `SELECT d.document_json, o.storage_ref
         FROM vault_origin_staging_documents d
         JOIN vault_origin_staging_content_objects o ON o.sha256 = d.content_sha256
         WHERE d.workspace_id = ? AND d.id = ?`,
      )
      .get(workspaceId, documentId) as { document_json: string; storage_ref: string } | undefined;
    if (!row)
      throw new RegistryError(
        "VAULT_ORIGIN_STAGING_NOT_FOUND",
        "Vault-origin Staging document was not found",
      );
    const document = parseDocument(row.document_json);
    const bytes = readFileSync(join(this.storageRoot, row.storage_ref));
    if (sha256(bytes) !== document.contentHash.value || bytes.byteLength !== document.sizeBytes) {
      throw new RegistryConflictError(
        "VAULT_ORIGIN_STAGING_STORAGE_INTEGRITY_FAILURE",
        "Vault-origin Staging CAS bytes no longer match persisted evidence",
      );
    }
    return bytes;
  }

  private verifyStoredBytes(path: string, expectedHash: string, expectedSize: number): void {
    const bytes = readFileSync(path);
    if (bytes.byteLength !== expectedSize || sha256(bytes) !== expectedHash) {
      throw new RegistryConflictError(
        "VAULT_ORIGIN_STAGING_CAS_COLLISION",
        "Existing Staging CAS path contains bytes that do not match its SHA-256 identity",
      );
    }
  }

  private isContentReferenced(contentHash: string): boolean {
    const own = this.database
      .prepare("SELECT 1 FROM vault_origin_staging_content_objects WHERE sha256 = ?")
      .get(contentHash);
    if (own) return true;
    try {
      return Boolean(
        this.database
          .prepare("SELECT 1 FROM staging_content_objects WHERE sha256 = ?")
          .get(contentHash),
      );
    } catch {
      return false;
    }
  }
}

function frozenDigest(input: PrepareVaultImportExecutionInput): string {
  const binding = normalizeBinding(input.binding);
  const candidate = normalizeCandidate(input.candidate, binding.relativeRoot);
  return sha256(
    JSON.stringify({
      workspaceId: required(input.workspaceId, "workspaceId"),
      importIntentId: required(input.importIntentId, "importIntentId"),
      rootFingerprintSha256: input.rootFingerprintSha256,
      binding,
      candidate,
    }),
  );
}

export class SqliteVaultImportExecutionRepository implements VaultImportExecutionRepository {
  constructor(
    private readonly database: DatabaseSync,
    private readonly clock: () => Date = () => new Date(),
    private readonly idFactory: () => string = () => typedId("vie"),
  ) {
    ensureVaultImportExecutionRegistry(database);
  }

  prepare(input: PrepareVaultImportExecutionInput): VaultImportExecutionV1 {
    const workspaceId = required(input.workspaceId, "workspaceId");
    const importIntentId = required(input.importIntentId, "importIntentId");
    if (!SHA256.test(input.rootFingerprintSha256)) {
      throw new RegistryValidationError("Vault import execution root fingerprint is invalid");
    }
    const binding = normalizeBinding(input.binding);
    const candidate = normalizeCandidate(input.candidate, binding.relativeRoot);
    const digest = frozenDigest({ ...input, workspaceId, importIntentId, binding, candidate });
    const existing = this.getByImportIntent(workspaceId, importIntentId);
    if (existing) {
      const row = this.database
        .prepare("SELECT frozen_digest FROM vault_import_executions WHERE id = ?")
        .get(existing.id) as { frozen_digest: string };
      if (row.frozen_digest !== digest) {
        throw new RegistryConflictError(
          "VAULT_IMPORT_EXECUTION_FROZEN_EVIDENCE_CONFLICT",
          "Import intent already has an execution with different frozen evidence",
        );
      }
      return existing;
    }
    if (!this.database.prepare("SELECT id FROM workspaces WHERE id = ?").get(workspaceId)) {
      throw new RegistryError("WORKSPACE_NOT_FOUND", `Workspace ${workspaceId} was not found`);
    }
    const now = this.clock().toISOString();
    const execution: VaultImportExecutionV1 = {
      contractVersion: VAULT_IMPORT_EXECUTION_CONTRACT_VERSION,
      objectType: VAULT_IMPORT_EXECUTION_OBJECT_TYPE,
      id: this.idFactory(),
      workspaceId,
      importIntentId,
      state: "PENDING",
      rootFingerprintSha256: input.rootFingerprintSha256,
      binding,
      candidate,
      preparedAt: now,
      updatedAt: now,
    };
    this.database
      .prepare(
        `INSERT INTO vault_import_executions
         (id, workspace_id, import_intent_id, state, frozen_digest, execution_json, prepared_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        execution.id,
        workspaceId,
        importIntentId,
        execution.state,
        digest,
        JSON.stringify(execution),
        now,
        now,
      );
    return execution;
  }

  getByImportIntent(workspaceIdValue: string, importIntentIdValue: string) {
    const workspaceId = required(workspaceIdValue, "workspaceId");
    const importIntentId = required(importIntentIdValue, "importIntentId");
    const row = this.database
      .prepare(
        `SELECT execution_json FROM vault_import_executions
         WHERE workspace_id = ? AND import_intent_id = ?`,
      )
      .get(workspaceId, importIntentId) as { execution_json: string } | undefined;
    return row ? parseExecution(row.execution_json) : null;
  }

  list(workspaceIdValue: string, limitValue = 20): VaultImportExecutionV1[] {
    const workspaceId = required(workspaceIdValue, "workspaceId");
    if (!Number.isSafeInteger(limitValue) || limitValue <= 0) {
      throw new RegistryValidationError("limit must be a positive integer");
    }
    const rows = this.database
      .prepare(
        `SELECT execution_json FROM vault_import_executions
         WHERE workspace_id = ? ORDER BY updated_at DESC, rowid DESC LIMIT ?`,
      )
      .all(workspaceId, Math.min(limitValue, MAX_LIMIT)) as Array<{ execution_json: string }>;
    return rows.map((row) => parseExecution(row.execution_json));
  }

  recordStagingReceipt(
    workspaceIdValue: string,
    executionIdValue: string,
    receiptValue: VaultImportStagingReceiptV1,
  ): VaultImportExecutionV1 {
    const current = this.requireExecution(workspaceIdValue, executionIdValue);
    const receipt = normalizeReceipt(receiptValue);
    if (current.state !== "PENDING") return current;
    if (current.stagingReceipt) {
      if (JSON.stringify(current.stagingReceipt) !== JSON.stringify(receipt)) {
        throw new RegistryConflictError(
          "VAULT_IMPORT_EXECUTION_RECEIPT_CONFLICT",
          "Vault import execution already has a different Staging receipt",
        );
      }
      return current;
    }
    if (
      receipt.contentSha256 !== current.candidate.observedSha256 ||
      receipt.sizeBytes !== current.candidate.sizeBytes
    ) {
      throw new RegistryConflictError(
        "VAULT_IMPORT_EXECUTION_RECEIPT_EVIDENCE_MISMATCH",
        "Staging receipt does not match the frozen Vault candidate",
      );
    }
    return this.save({
      ...current,
      stagingReceipt: receipt,
      updatedAt: this.clock().toISOString(),
    });
  }

  reject(
    workspaceIdValue: string,
    executionIdValue: string,
    code: VaultImportRejectionCode,
  ): VaultImportExecutionV1 {
    const current = this.requireExecution(workspaceIdValue, executionIdValue);
    if (!VAULT_IMPORT_REJECTION_CODES.includes(code)) {
      throw new RegistryValidationError("Vault import rejection code is invalid");
    }
    if (current.state !== "PENDING") return current;
    if (current.stagingReceipt) {
      throw new RegistryConflictError(
        "VAULT_IMPORT_EXECUTION_REJECT_AFTER_STAGING",
        "Vault import execution cannot be rejected after Staging persistence",
      );
    }
    const now = this.clock().toISOString();
    return this.save({
      ...current,
      state: "REJECTED",
      rejection: { code, recordedAt: now },
      updatedAt: now,
    });
  }

  finalize(workspaceIdValue: string, executionIdValue: string): VaultImportExecutionV1 {
    const current = this.requireExecution(workspaceIdValue, executionIdValue);
    if (current.state !== "PENDING") return current;
    if (!current.stagingReceipt) {
      throw new RegistryConflictError(
        "VAULT_IMPORT_EXECUTION_RECEIPT_REQUIRED",
        "Vault import execution requires a persisted Staging receipt before finalization",
      );
    }
    return this.save({
      ...current,
      state: "SUCCEEDED",
      result: current.stagingReceipt,
      updatedAt: this.clock().toISOString(),
    });
  }

  private requireExecution(workspaceIdValue: string, executionIdValue: string) {
    const workspaceId = required(workspaceIdValue, "workspaceId");
    const executionId = required(executionIdValue, "executionId");
    const row = this.database
      .prepare(
        "SELECT execution_json FROM vault_import_executions WHERE workspace_id = ? AND id = ?",
      )
      .get(workspaceId, executionId) as { execution_json: string } | undefined;
    if (!row)
      throw new RegistryError(
        "VAULT_IMPORT_EXECUTION_NOT_FOUND",
        "Vault import execution was not found",
      );
    return parseExecution(row.execution_json);
  }

  private save(execution: VaultImportExecutionV1): VaultImportExecutionV1 {
    const validated = parseExecution(JSON.stringify(execution));
    this.database
      .prepare(
        `UPDATE vault_import_executions SET state = ?, execution_json = ?, updated_at = ?
         WHERE id = ? AND workspace_id = ?`,
      )
      .run(
        validated.state,
        JSON.stringify(validated),
        validated.updatedAt,
        validated.id,
        validated.workspaceId,
      );
    return validated;
  }
}
