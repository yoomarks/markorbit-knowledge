import { createHash, randomBytes } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import {
  VAULT_ORIGIN_STAGING_CONTRACT_VERSION,
  VAULT_ORIGIN_STAGING_FINALIZATION_CONTRACT_VERSION,
  VAULT_ORIGIN_STAGING_FINALIZATION_OBJECT_TYPE,
  VAULT_ORIGIN_STAGING_OBJECT_TYPE,
  VAULT_ORIGIN_STAGING_STATUS,
  VAULT_ORIGIN_STAGING_VERIFICATION_CONTRACT_VERSION,
  VAULT_ORIGIN_STAGING_VERIFICATION_OBJECT_TYPE,
  VAULT_ORIGIN_STAGING_VERIFIER,
  type VaultOriginStagingDocumentV1,
  type VaultOriginStagingFinalizationV1,
  type VaultOriginStagingVerificationCheckV1,
  type VaultOriginStagingVerificationEvidenceV1,
  type VaultOriginStagingVerificationOutcome,
} from "@markorbit/contracts";
import {
  RegistryConflictError,
  RegistryError,
  RegistryValidationError,
  initializeRegistry,
} from "./index";
import {
  ensureVaultImportExecutionRegistry,
  type VaultOriginStagingRepository,
} from "./vault-import-execution-registry";

const MIGRATION_ID = "0027_vault_origin_staging_verification";
const SHA256 = /^[a-f0-9]{64}$/u;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/u;
const MAX_LIMIT = 100;
const MAX_FRONTMATTER_BYTES = 32_768;

export type VerifyVaultOriginStagingInput = {
  workspaceId: string;
  vaultStagingDocumentId: string;
  idempotencyKey: string;
};

export type FinalizeVaultOriginStagingInput = {
  workspaceId: string;
  vaultStagingDocumentId: string;
  idempotencyKey: string;
};

export type VaultOriginStagingVerificationResult = {
  evidence: VaultOriginStagingVerificationEvidenceV1;
  replayed: boolean;
};

export type VaultOriginStagingFinalizationResult = {
  finalization: VaultOriginStagingFinalizationV1;
  verification: VaultOriginStagingVerificationEvidenceV1;
  replayed: boolean;
};

export interface VaultOriginStagingVerificationRepository {
  listDocuments(workspaceId: string, limit?: number): VaultOriginStagingDocumentV1[];
  getDocument(workspaceId: string, documentId: string): VaultOriginStagingDocumentV1 | null;
  verify(input: VerifyVaultOriginStagingInput): VaultOriginStagingVerificationResult;
  getVerificationByDocument(
    workspaceId: string,
    documentId: string,
  ): VaultOriginStagingVerificationEvidenceV1 | null;
  listVerifications(
    workspaceId: string,
    limit?: number,
  ): VaultOriginStagingVerificationEvidenceV1[];
  finalize(input: FinalizeVaultOriginStagingInput): VaultOriginStagingFinalizationResult;
  getFinalizationByDocument(
    workspaceId: string,
    documentId: string,
  ): VaultOriginStagingFinalizationV1 | null;
  listFinalizations(workspaceId: string, limit?: number): VaultOriginStagingFinalizationV1[];
}

function sha256(value: string | Uint8Array): string {
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

function typedId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${randomBytes(10).toString("hex")}`;
}

function required(value: string, field: string): string {
  const normalized = value?.trim();
  if (!normalized) throw new RegistryValidationError(`${field} is required`);
  return normalized;
}

function limit(value = 20): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RegistryValidationError("limit must be a positive integer");
  }
  return Math.min(value, MAX_LIMIT);
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
  return parsed;
}

function parseVerification(value: string): VaultOriginStagingVerificationEvidenceV1 {
  const parsed = JSON.parse(value) as VaultOriginStagingVerificationEvidenceV1;
  if (
    parsed?.contractVersion !== VAULT_ORIGIN_STAGING_VERIFICATION_CONTRACT_VERSION ||
    parsed.objectType !== VAULT_ORIGIN_STAGING_VERIFICATION_OBJECT_TYPE ||
    !parsed.id?.startsWith("vsv_") ||
    !parsed.workspaceId?.trim() ||
    !parsed.vaultStagingDocumentId?.startsWith("vst_") ||
    !parsed.importIntentId?.startsWith("vmi_") ||
    parsed.verifier?.verifierId !== VAULT_ORIGIN_STAGING_VERIFIER.verifierId ||
    parsed.verifier.version !== VAULT_ORIGIN_STAGING_VERIFIER.version ||
    !SHA256.test(parsed.contentSha256) ||
    !Number.isSafeInteger(parsed.sizeBytes) ||
    parsed.sizeBytes < 0 ||
    !["PASS", "PASS_WITH_WARNINGS", "FAIL"].includes(parsed.outcome) ||
    !Array.isArray(parsed.checks) ||
    !Array.isArray(parsed.warnings) ||
    Number.isNaN(Date.parse(parsed.createdAt))
  ) {
    throw new RegistryConflictError(
      "VAULT_ORIGIN_STAGING_VERIFICATION_PERSISTED_STATE_INVALID",
      "Persisted Vault-origin Staging verification is invalid",
    );
  }
  return parsed;
}

function parseFinalization(value: string): VaultOriginStagingFinalizationV1 {
  const parsed = JSON.parse(value) as VaultOriginStagingFinalizationV1;
  if (
    parsed?.contractVersion !== VAULT_ORIGIN_STAGING_FINALIZATION_CONTRACT_VERSION ||
    parsed.objectType !== VAULT_ORIGIN_STAGING_FINALIZATION_OBJECT_TYPE ||
    !parsed.id?.startsWith("vsf_") ||
    !parsed.workspaceId?.trim() ||
    !parsed.vaultStagingDocumentId?.startsWith("vst_") ||
    !parsed.importIntentId?.startsWith("vmi_") ||
    !parsed.verificationId?.startsWith("vsv_") ||
    !SHA256.test(parsed.contentSha256) ||
    !["VERIFIED", "BLOCKED"].includes(parsed.state) ||
    Number.isNaN(Date.parse(parsed.finalizedAt))
  ) {
    throw new RegistryConflictError(
      "VAULT_ORIGIN_STAGING_FINALIZATION_PERSISTED_STATE_INVALID",
      "Persisted Vault-origin Staging finalization is invalid",
    );
  }
  return parsed;
}

function check(
  code: string,
  status: VaultOriginStagingVerificationCheckV1["status"],
  message?: string,
): VaultOriginStagingVerificationCheckV1 {
  return message ? { code, status, message } : { code, status };
}

function evaluate(bytes: Uint8Array): {
  outcome: VaultOriginStagingVerificationOutcome;
  checks: VaultOriginStagingVerificationCheckV1[];
  warnings: string[];
} {
  const checks: VaultOriginStagingVerificationCheckV1[] = [
    check("VAULT_ORIGIN_CAS_INTEGRITY", "PASS"),
  ];
  const warnings: string[] = [];
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    checks.push(check("MARKDOWN_UTF8_VALID", "PASS"));
  } catch {
    checks.push(check("MARKDOWN_UTF8_VALID", "FAIL", "Markdown is not valid UTF-8"));
    return { outcome: "FAIL", checks, warnings };
  }

  if (text.includes("\u0000")) {
    checks.push(check("MARKDOWN_NUL_FREE", "FAIL", "Markdown contains NUL bytes"));
  } else {
    checks.push(check("MARKDOWN_NUL_FREE", "PASS"));
  }

  let body = text;
  if (text.startsWith("---\n")) {
    const closing = text.indexOf("\n---\n", 4);
    if (closing < 0) {
      checks.push(
        check(
          "FRONTMATTER_STRUCTURE_VALID",
          "FAIL",
          "Frontmatter opening delimiter has no closing delimiter",
        ),
      );
      body = "";
    } else {
      const raw = text.slice(4, closing);
      body = text.slice(closing + 5);
      if (new TextEncoder().encode(raw).byteLength > MAX_FRONTMATTER_BYTES) {
        checks.push(
          check(
            "FRONTMATTER_STRUCTURE_VALID",
            "FAIL",
            "Frontmatter exceeds the verification byte limit",
          ),
        );
      } else if (/(^|\s)(?:&|\*|!|<<:)/m.test(raw)) {
        checks.push(
          check(
            "FRONTMATTER_STRUCTURE_VALID",
            "FAIL",
            "YAML aliases, anchors, tags and merge keys are not accepted at this boundary",
          ),
        );
      } else {
        checks.push(check("FRONTMATTER_STRUCTURE_VALID", "PASS"));
      }
      if (/(^|\n)\s*["']?markorbit(?:\.|["']?\s*:)/iu.test(raw)) {
        checks.push(
          check(
            "MARKORBIT_RESERVED_NAMESPACE_CLEAR",
            "FAIL",
            "Vault-authored frontmatter may not claim the reserved markorbit namespace",
          ),
        );
      } else {
        checks.push(check("MARKORBIT_RESERVED_NAMESPACE_CLEAR", "PASS"));
      }
    }
  } else {
    checks.push(check("FRONTMATTER_STRUCTURE_VALID", "PASS"));
    checks.push(check("MARKORBIT_RESERVED_NAMESPACE_CLEAR", "PASS"));
  }

  if (body.trim()) {
    checks.push(check("MARKDOWN_BODY_PRESENT", "PASS"));
  } else {
    const message = "Markdown body is empty";
    checks.push(check("MARKDOWN_BODY_PRESENT", "WARN", message));
    warnings.push(message);
  }

  const outcome: VaultOriginStagingVerificationOutcome = checks.some(
    (item) => item.status === "FAIL",
  )
    ? "FAIL"
    : checks.some((item) => item.status === "WARN")
      ? "PASS_WITH_WARNINGS"
      : "PASS";
  return { outcome, checks, warnings };
}

export function ensureVaultOriginStagingVerification(database: DatabaseSync): void {
  initializeRegistry(database);
  ensureVaultImportExecutionRegistry(database);
  if (database.prepare("SELECT id FROM schema_migrations WHERE id = ?").get(MIGRATION_ID)) return;
  database.exec("BEGIN IMMEDIATE;");
  try {
    database.exec(`
      CREATE TABLE IF NOT EXISTS vault_origin_staging_verifications (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        vault_staging_document_id TEXT NOT NULL UNIQUE,
        import_intent_id TEXT NOT NULL,
        verifier_id TEXT NOT NULL,
        verifier_version TEXT NOT NULL,
        content_sha256 TEXT NOT NULL,
        size_bytes INTEGER NOT NULL CHECK (size_bytes >= 0),
        outcome TEXT NOT NULL CHECK (outcome IN ('PASS','PASS_WITH_WARNINGS','FAIL')),
        evidence_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (workspace_id) REFERENCES workspaces(id),
        FOREIGN KEY (vault_staging_document_id) REFERENCES vault_origin_staging_documents(id)
      ) STRICT;

      CREATE TABLE IF NOT EXISTS vault_origin_staging_verification_idempotency (
        workspace_id TEXT NOT NULL,
        vault_staging_document_id TEXT NOT NULL,
        verifier_id TEXT NOT NULL,
        verifier_version TEXT NOT NULL,
        idempotency_key TEXT NOT NULL,
        request_digest TEXT NOT NULL,
        verification_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (
          workspace_id,
          vault_staging_document_id,
          verifier_id,
          verifier_version,
          idempotency_key
        ),
        FOREIGN KEY (verification_id) REFERENCES vault_origin_staging_verifications(id)
      ) STRICT;

      CREATE TABLE IF NOT EXISTS vault_origin_staging_finalizations (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        vault_staging_document_id TEXT NOT NULL UNIQUE,
        verification_id TEXT NOT NULL UNIQUE,
        state TEXT NOT NULL CHECK (state IN ('VERIFIED','BLOCKED')),
        finalization_json TEXT NOT NULL,
        finalized_at TEXT NOT NULL,
        FOREIGN KEY (workspace_id) REFERENCES workspaces(id),
        FOREIGN KEY (vault_staging_document_id) REFERENCES vault_origin_staging_documents(id),
        FOREIGN KEY (verification_id) REFERENCES vault_origin_staging_verifications(id)
      ) STRICT;

      CREATE TABLE IF NOT EXISTS vault_origin_staging_finalization_idempotency (
        workspace_id TEXT NOT NULL,
        vault_staging_document_id TEXT NOT NULL,
        idempotency_key TEXT NOT NULL,
        request_digest TEXT NOT NULL,
        finalization_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (workspace_id, vault_staging_document_id, idempotency_key),
        FOREIGN KEY (finalization_id) REFERENCES vault_origin_staging_finalizations(id)
      ) STRICT;

      CREATE INDEX IF NOT EXISTS idx_vault_origin_staging_verifications_workspace
        ON vault_origin_staging_verifications(workspace_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_vault_origin_staging_finalizations_workspace
        ON vault_origin_staging_finalizations(workspace_id, finalized_at DESC);
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

export class SqliteVaultOriginStagingVerificationRepository implements VaultOriginStagingVerificationRepository {
  constructor(
    private readonly database: DatabaseSync,
    private readonly staging: VaultOriginStagingRepository,
    private readonly clock: () => Date = () => new Date(),
    private readonly verificationId: () => string = () => typedId("vsv"),
    private readonly finalizationId: () => string = () => typedId("vsf"),
  ) {
    ensureVaultOriginStagingVerification(database);
  }

  listDocuments(workspaceIdValue: string, limitValue = 20): VaultOriginStagingDocumentV1[] {
    const workspaceId = required(workspaceIdValue, "workspaceId");
    const rows = this.database
      .prepare(
        `SELECT document_json FROM vault_origin_staging_documents
         WHERE workspace_id = ? ORDER BY imported_at DESC, rowid DESC LIMIT ?`,
      )
      .all(workspaceId, limit(limitValue)) as Array<{ document_json: string }>;
    return rows.map((row) => parseDocument(row.document_json));
  }

  getDocument(
    workspaceIdValue: string,
    documentIdValue: string,
  ): VaultOriginStagingDocumentV1 | null {
    const workspaceId = required(workspaceIdValue, "workspaceId");
    const documentId = required(documentIdValue, "vaultStagingDocumentId");
    const row = this.database
      .prepare(
        `SELECT document_json FROM vault_origin_staging_documents
         WHERE workspace_id = ? AND id = ?`,
      )
      .get(workspaceId, documentId) as { document_json: string } | undefined;
    return row ? parseDocument(row.document_json) : null;
  }

  verify(input: VerifyVaultOriginStagingInput): VaultOriginStagingVerificationResult {
    const workspaceId = required(input.workspaceId, "workspaceId");
    const documentId = required(input.vaultStagingDocumentId, "vaultStagingDocumentId");
    if (!IDEMPOTENCY_KEY.test(input.idempotencyKey)) {
      throw new RegistryValidationError("Invalid Vault-origin verification idempotency key");
    }
    const document = this.requireDocument(workspaceId, documentId);
    const digest = sha256(
      stable({
        workspaceId,
        documentId,
        idempotencyKey: input.idempotencyKey,
        verifier: VAULT_ORIGIN_STAGING_VERIFIER,
        contentSha256: document.contentHash.value,
        sizeBytes: document.sizeBytes,
      }),
    );
    const replay = this.database
      .prepare(
        `SELECT request_digest, verification_id
         FROM vault_origin_staging_verification_idempotency
         WHERE workspace_id = ? AND vault_staging_document_id = ? AND verifier_id = ?
           AND verifier_version = ? AND idempotency_key = ?`,
      )
      .get(
        workspaceId,
        documentId,
        VAULT_ORIGIN_STAGING_VERIFIER.verifierId,
        VAULT_ORIGIN_STAGING_VERIFIER.version,
        input.idempotencyKey,
      ) as { request_digest: string; verification_id: string } | undefined;
    if (replay) {
      if (replay.request_digest !== digest) {
        throw new RegistryConflictError(
          "VAULT_ORIGIN_STAGING_VERIFICATION_IDEMPOTENCY_CONFLICT",
          "Verification idempotency key was reused with different immutable evidence",
        );
      }
      return {
        evidence: this.requireVerificationById(workspaceId, replay.verification_id),
        replayed: true,
      };
    }
    if (this.getVerificationByDocument(workspaceId, documentId)) {
      throw new RegistryConflictError(
        "VAULT_ORIGIN_STAGING_VERIFICATION_ALREADY_DECIDED",
        "Vault-origin Staging document already has verification evidence",
      );
    }

    const bytes = this.staging.readContent(workspaceId, documentId);
    const evaluated = evaluate(bytes);
    const now = this.clock().toISOString();
    const evidence: VaultOriginStagingVerificationEvidenceV1 = {
      contractVersion: VAULT_ORIGIN_STAGING_VERIFICATION_CONTRACT_VERSION,
      objectType: VAULT_ORIGIN_STAGING_VERIFICATION_OBJECT_TYPE,
      id: this.verificationId(),
      workspaceId,
      vaultStagingDocumentId: document.id,
      importIntentId: document.importIntentId,
      verifier: VAULT_ORIGIN_STAGING_VERIFIER,
      contentSha256: document.contentHash.value,
      sizeBytes: document.sizeBytes,
      outcome: evaluated.outcome,
      checks: evaluated.checks,
      warnings: evaluated.warnings,
      createdAt: now,
    };

    this.database.exec("BEGIN IMMEDIATE;");
    try {
      if (this.getVerificationByDocument(workspaceId, documentId)) {
        throw new RegistryConflictError(
          "VAULT_ORIGIN_STAGING_VERIFICATION_ALREADY_DECIDED",
          "Vault-origin Staging document was concurrently verified",
        );
      }
      this.database
        .prepare(
          `INSERT INTO vault_origin_staging_verifications
           (id, workspace_id, vault_staging_document_id, import_intent_id, verifier_id,
            verifier_version, content_sha256, size_bytes, outcome, evidence_json, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          evidence.id,
          workspaceId,
          documentId,
          document.importIntentId,
          evidence.verifier.verifierId,
          evidence.verifier.version,
          evidence.contentSha256,
          evidence.sizeBytes,
          evidence.outcome,
          JSON.stringify(evidence),
          now,
        );
      this.database
        .prepare(
          `INSERT INTO vault_origin_staging_verification_idempotency
           (workspace_id, vault_staging_document_id, verifier_id, verifier_version,
            idempotency_key, request_digest, verification_id, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          workspaceId,
          documentId,
          evidence.verifier.verifierId,
          evidence.verifier.version,
          input.idempotencyKey,
          digest,
          evidence.id,
          now,
        );
      this.database.exec("COMMIT;");
      return { evidence, replayed: false };
    } catch (error) {
      this.database.exec("ROLLBACK;");
      throw error;
    }
  }

  getVerificationByDocument(workspaceIdValue: string, documentIdValue: string) {
    const workspaceId = required(workspaceIdValue, "workspaceId");
    const documentId = required(documentIdValue, "vaultStagingDocumentId");
    const row = this.database
      .prepare(
        `SELECT evidence_json FROM vault_origin_staging_verifications
         WHERE workspace_id = ? AND vault_staging_document_id = ?`,
      )
      .get(workspaceId, documentId) as { evidence_json: string } | undefined;
    return row ? parseVerification(row.evidence_json) : null;
  }

  listVerifications(workspaceIdValue: string, limitValue = 20) {
    const workspaceId = required(workspaceIdValue, "workspaceId");
    const rows = this.database
      .prepare(
        `SELECT evidence_json FROM vault_origin_staging_verifications
         WHERE workspace_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?`,
      )
      .all(workspaceId, limit(limitValue)) as Array<{ evidence_json: string }>;
    return rows.map((row) => parseVerification(row.evidence_json));
  }

  finalize(input: FinalizeVaultOriginStagingInput): VaultOriginStagingFinalizationResult {
    const workspaceId = required(input.workspaceId, "workspaceId");
    const documentId = required(input.vaultStagingDocumentId, "vaultStagingDocumentId");
    if (!IDEMPOTENCY_KEY.test(input.idempotencyKey)) {
      throw new RegistryValidationError("Invalid Vault-origin finalization idempotency key");
    }
    const document = this.requireDocument(workspaceId, documentId);
    const verification = this.getVerificationByDocument(workspaceId, documentId);
    if (!verification) {
      throw new RegistryConflictError(
        "VAULT_ORIGIN_STAGING_FINALIZATION_VERIFICATION_MISSING",
        "Vault-origin Staging must have durable verification evidence before finalization",
      );
    }
    if (
      verification.importIntentId !== document.importIntentId ||
      verification.contentSha256 !== document.contentHash.value ||
      verification.sizeBytes !== document.sizeBytes
    ) {
      throw new RegistryConflictError(
        "VAULT_ORIGIN_STAGING_FINALIZATION_EVIDENCE_MISMATCH",
        "Verification evidence does not match the immutable Vault-origin Staging document",
      );
    }
    const digest = sha256(
      stable({
        workspaceId,
        documentId,
        idempotencyKey: input.idempotencyKey,
        verificationId: verification.id,
        contentSha256: document.contentHash.value,
        outcome: verification.outcome,
      }),
    );
    const replay = this.database
      .prepare(
        `SELECT request_digest, finalization_id
         FROM vault_origin_staging_finalization_idempotency
         WHERE workspace_id = ? AND vault_staging_document_id = ? AND idempotency_key = ?`,
      )
      .get(workspaceId, documentId, input.idempotencyKey) as
      { request_digest: string; finalization_id: string } | undefined;
    if (replay) {
      if (replay.request_digest !== digest) {
        throw new RegistryConflictError(
          "VAULT_ORIGIN_STAGING_FINALIZATION_IDEMPOTENCY_CONFLICT",
          "Finalization idempotency key was reused with different immutable evidence",
        );
      }
      return {
        finalization: this.requireFinalizationById(workspaceId, replay.finalization_id),
        verification,
        replayed: true,
      };
    }
    if (this.getFinalizationByDocument(workspaceId, documentId)) {
      throw new RegistryConflictError(
        "VAULT_ORIGIN_STAGING_FINALIZATION_ALREADY_DECIDED",
        "Vault-origin Staging document already has finalization evidence",
      );
    }

    const now = this.clock().toISOString();
    const finalization: VaultOriginStagingFinalizationV1 = {
      contractVersion: VAULT_ORIGIN_STAGING_FINALIZATION_CONTRACT_VERSION,
      objectType: VAULT_ORIGIN_STAGING_FINALIZATION_OBJECT_TYPE,
      id: this.finalizationId(),
      workspaceId,
      vaultStagingDocumentId: documentId,
      importIntentId: document.importIntentId,
      verificationId: verification.id,
      contentSha256: document.contentHash.value,
      state: verification.outcome === "FAIL" ? "BLOCKED" : "VERIFIED",
      finalizedAt: now,
    };

    this.database.exec("BEGIN IMMEDIATE;");
    try {
      if (this.getFinalizationByDocument(workspaceId, documentId)) {
        throw new RegistryConflictError(
          "VAULT_ORIGIN_STAGING_FINALIZATION_ALREADY_DECIDED",
          "Vault-origin Staging document was concurrently finalized",
        );
      }
      this.database
        .prepare(
          `INSERT INTO vault_origin_staging_finalizations
           (id, workspace_id, vault_staging_document_id, verification_id, state,
            finalization_json, finalized_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          finalization.id,
          workspaceId,
          documentId,
          verification.id,
          finalization.state,
          JSON.stringify(finalization),
          now,
        );
      this.database
        .prepare(
          `INSERT INTO vault_origin_staging_finalization_idempotency
           (workspace_id, vault_staging_document_id, idempotency_key, request_digest,
            finalization_id, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(workspaceId, documentId, input.idempotencyKey, digest, finalization.id, now);
      this.database.exec("COMMIT;");
      return { finalization, verification, replayed: false };
    } catch (error) {
      this.database.exec("ROLLBACK;");
      throw error;
    }
  }

  getFinalizationByDocument(workspaceIdValue: string, documentIdValue: string) {
    const workspaceId = required(workspaceIdValue, "workspaceId");
    const documentId = required(documentIdValue, "vaultStagingDocumentId");
    const row = this.database
      .prepare(
        `SELECT finalization_json FROM vault_origin_staging_finalizations
         WHERE workspace_id = ? AND vault_staging_document_id = ?`,
      )
      .get(workspaceId, documentId) as { finalization_json: string } | undefined;
    return row ? parseFinalization(row.finalization_json) : null;
  }

  listFinalizations(workspaceIdValue: string, limitValue = 20) {
    const workspaceId = required(workspaceIdValue, "workspaceId");
    const rows = this.database
      .prepare(
        `SELECT finalization_json FROM vault_origin_staging_finalizations
         WHERE workspace_id = ? ORDER BY finalized_at DESC, rowid DESC LIMIT ?`,
      )
      .all(workspaceId, limit(limitValue)) as Array<{ finalization_json: string }>;
    return rows.map((row) => parseFinalization(row.finalization_json));
  }

  private requireDocument(workspaceId: string, documentId: string): VaultOriginStagingDocumentV1 {
    const document = this.getDocument(workspaceId, documentId);
    if (!document) {
      throw new RegistryError(
        "VAULT_ORIGIN_STAGING_NOT_FOUND",
        `Vault-origin Staging document ${documentId} was not found`,
      );
    }
    return document;
  }

  private requireVerificationById(
    workspaceId: string,
    verificationId: string,
  ): VaultOriginStagingVerificationEvidenceV1 {
    const row = this.database
      .prepare(
        `SELECT evidence_json FROM vault_origin_staging_verifications
         WHERE workspace_id = ? AND id = ?`,
      )
      .get(workspaceId, verificationId) as { evidence_json: string } | undefined;
    if (!row) {
      throw new RegistryError(
        "VAULT_ORIGIN_STAGING_VERIFICATION_NOT_FOUND",
        `Vault-origin Staging verification ${verificationId} was not found`,
      );
    }
    return parseVerification(row.evidence_json);
  }

  private requireFinalizationById(
    workspaceId: string,
    finalizationId: string,
  ): VaultOriginStagingFinalizationV1 {
    const row = this.database
      .prepare(
        `SELECT finalization_json FROM vault_origin_staging_finalizations
         WHERE workspace_id = ? AND id = ?`,
      )
      .get(workspaceId, finalizationId) as { finalization_json: string } | undefined;
    if (!row) {
      throw new RegistryError(
        "VAULT_ORIGIN_STAGING_FINALIZATION_NOT_FOUND",
        `Vault-origin Staging finalization ${finalizationId} was not found`,
      );
    }
    return parseFinalization(row.finalization_json);
  }
}
