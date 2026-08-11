import { createHash, randomBytes } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import {
  VAULT_EXPORT_CONTRACT_VERSION,
  VAULT_EXPORT_DISPOSITIONS,
  VAULT_EXPORT_OBJECT_TYPE,
  VAULT_EXPORT_STATES,
  type VaultExportBindingSnapshotV1,
  type VaultExportReceiptV1,
  type VaultExportRunV1,
  type VaultExportStagingSnapshotV1,
} from "@markorbit/contracts";
import {
  RegistryConflictError,
  RegistryError,
  RegistryValidationError,
  initializeRegistry,
} from "./index";
import { normalizeObsidianTargetPath } from "./obsidian-vault-projection";
import { normalizeVaultRelativeRoot } from "./vault-binding-registry";

const MIGRATION_ID = "0023_vault_export_runs";
const SHA256 = /^[a-f0-9]{64}$/u;
const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 1000;

export type PrepareVaultExportRunInput = {
  workspaceId: string;
  rootFingerprintSha256: string;
  binding: VaultExportBindingSnapshotV1;
  staging: VaultExportStagingSnapshotV1;
};

export type PrepareVaultExportRunResult = {
  run: VaultExportRunV1;
  replayed: boolean;
};

export interface VaultExportRunRepository {
  prepare(input: PrepareVaultExportRunInput): PrepareVaultExportRunResult;
  getById(workspaceId: string, runId: string): VaultExportRunV1 | null;
  getPendingByStaging(workspaceId: string, stagingDocumentId: string): VaultExportRunV1 | null;
  recordProjectionReceipt(
    workspaceId: string,
    runId: string,
    receipt: Omit<VaultExportReceiptV1, "recordedAt">,
  ): VaultExportRunV1;
  finalize(workspaceId: string, runId: string): VaultExportRunV1;
  list(workspaceId: string, limit?: number): VaultExportRunV1[];
}

function exportRunId(): string {
  return `vex_${Date.now().toString(36)}${randomBytes(10).toString("hex")}`;
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
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

function required(value: string, field: string): string {
  const normalized = value?.trim();
  if (!normalized) throw new RegistryValidationError(`${field} is required`);
  return normalized;
}

function validateBinding(binding: VaultExportBindingSnapshotV1): VaultExportBindingSnapshotV1 {
  const bindingId = required(binding?.bindingId, "binding.bindingId");
  if (!bindingId.startsWith("vlt_")) {
    throw new RegistryValidationError("binding.bindingId is invalid");
  }
  if (!Number.isSafeInteger(binding.revision) || binding.revision < 1) {
    throw new RegistryValidationError("binding.revision must be a positive integer");
  }
  return {
    bindingId,
    revision: binding.revision,
    relativeRoot: normalizeVaultRelativeRoot(binding.relativeRoot),
  };
}

function validateStaging(staging: VaultExportStagingSnapshotV1): VaultExportStagingSnapshotV1 {
  const stagingDocumentId = required(staging?.stagingDocumentId, "staging.stagingDocumentId");
  if (!SHA256.test(staging.contentSha256)) {
    throw new RegistryValidationError("staging.contentSha256 must be SHA-256");
  }
  return {
    stagingDocumentId,
    contentSha256: staging.contentSha256,
    targetPath: normalizeObsidianTargetPath(staging.targetPath),
  };
}

function idempotencyKey(input: PrepareVaultExportRunInput): string {
  return `vault-export:${sha256(
    stable({
      workspaceId: input.workspaceId,
      rootFingerprintSha256: input.rootFingerprintSha256,
      binding: input.binding,
      staging: input.staging,
    }),
  )}`;
}

function validateReceipt(receipt: VaultExportReceiptV1, run: VaultExportRunV1): void {
  if (
    !receipt ||
    typeof receipt.vaultRelativePath !== "string" ||
    !receipt.vaultRelativePath.trim() ||
    !SHA256.test(receipt.contentSha256) ||
    !VAULT_EXPORT_DISPOSITIONS.includes(receipt.disposition) ||
    Number.isNaN(Date.parse(receipt.recordedAt)) ||
    receipt.contentSha256 !== run.staging.contentSha256
  ) {
    throw new RegistryValidationError("Persisted Vault export receipt is invalid");
  }
}

function parseRun(value: string): VaultExportRunV1 {
  let run: VaultExportRunV1;
  try {
    run = JSON.parse(value) as VaultExportRunV1;
  } catch {
    throw new RegistryConflictError(
      "VAULT_EXPORT_PERSISTED_STATE_INVALID",
      "Persisted Vault export run is not valid JSON",
    );
  }
  if (
    run?.contractVersion !== VAULT_EXPORT_CONTRACT_VERSION ||
    run.objectType !== VAULT_EXPORT_OBJECT_TYPE ||
    !run.id?.startsWith("vex_") ||
    !run.workspaceId?.trim() ||
    !run.idempotencyKey?.startsWith("vault-export:") ||
    !SHA256.test(run.rootFingerprintSha256) ||
    !VAULT_EXPORT_STATES.includes(run.state) ||
    Number.isNaN(Date.parse(run.preparedAt)) ||
    Number.isNaN(Date.parse(run.updatedAt))
  ) {
    throw new RegistryConflictError(
      "VAULT_EXPORT_PERSISTED_STATE_INVALID",
      "Persisted Vault export run is invalid",
    );
  }
  run.binding = validateBinding(run.binding);
  run.staging = validateStaging(run.staging);
  const expectedKey = idempotencyKey({
    workspaceId: run.workspaceId,
    rootFingerprintSha256: run.rootFingerprintSha256,
    binding: run.binding,
    staging: run.staging,
  });
  if (run.idempotencyKey !== expectedKey) {
    throw new RegistryConflictError(
      "VAULT_EXPORT_PERSISTED_STATE_INVALID",
      "Persisted Vault export idempotency key does not match its frozen request",
    );
  }
  if (run.projectionReceipt) validateReceipt(run.projectionReceipt, run);
  if (run.state === "SUCCEEDED") {
    if (!run.result) {
      throw new RegistryConflictError(
        "VAULT_EXPORT_PERSISTED_STATE_INVALID",
        "Succeeded Vault export is missing its result",
      );
    }
    validateReceipt(run.result, run);
    if (!run.projectionReceipt || stable(run.result) !== stable(run.projectionReceipt)) {
      throw new RegistryConflictError(
        "VAULT_EXPORT_PERSISTED_STATE_INVALID",
        "Vault export result does not match the persisted projection receipt",
      );
    }
  } else if (run.result) {
    throw new RegistryConflictError(
      "VAULT_EXPORT_PERSISTED_STATE_INVALID",
      "Pending Vault export cannot contain a terminal result",
    );
  }
  return run;
}

function ensureRegistry(database: DatabaseSync): void {
  initializeRegistry(database);
  if (database.prepare("SELECT id FROM schema_migrations WHERE id = ?").get(MIGRATION_ID)) return;
  database.exec("BEGIN IMMEDIATE;");
  try {
    database.exec(`
      CREATE TABLE IF NOT EXISTS vault_export_runs (
        workspace_id TEXT NOT NULL,
        run_id TEXT NOT NULL,
        staging_document_id TEXT NOT NULL,
        idempotency_key TEXT NOT NULL,
        state TEXT NOT NULL CHECK (state IN ('PENDING','SUCCEEDED')),
        document_json TEXT NOT NULL,
        prepared_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (workspace_id, run_id),
        UNIQUE (workspace_id, idempotency_key),
        FOREIGN KEY (workspace_id) REFERENCES workspaces(id)
      ) STRICT;

      CREATE INDEX IF NOT EXISTS idx_vault_export_runs_workspace
        ON vault_export_runs(workspace_id, prepared_at DESC);

      CREATE UNIQUE INDEX IF NOT EXISTS idx_vault_export_runs_pending_staging
        ON vault_export_runs(workspace_id, staging_document_id)
        WHERE state = 'PENDING';
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

export class SqliteVaultExportRunRepository implements VaultExportRunRepository {
  constructor(
    private readonly database: DatabaseSync,
    private readonly clock: () => Date = () => new Date(),
    private readonly idFactory: () => string = exportRunId,
  ) {
    ensureRegistry(database);
  }

  prepare(inputValue: PrepareVaultExportRunInput): PrepareVaultExportRunResult {
    const input: PrepareVaultExportRunInput = {
      workspaceId: required(inputValue.workspaceId, "workspaceId"),
      rootFingerprintSha256: inputValue.rootFingerprintSha256,
      binding: validateBinding(inputValue.binding),
      staging: validateStaging(inputValue.staging),
    };
    if (!SHA256.test(input.rootFingerprintSha256)) {
      throw new RegistryValidationError("rootFingerprintSha256 must be SHA-256");
    }
    if (!this.database.prepare("SELECT id FROM workspaces WHERE id = ?").get(input.workspaceId)) {
      throw new RegistryError(
        "WORKSPACE_NOT_FOUND",
        `Workspace ${input.workspaceId} was not found`,
      );
    }
    const key = idempotencyKey(input);

    this.database.exec("BEGIN IMMEDIATE;");
    try {
      const pending = this.getPendingByStaging(input.workspaceId, input.staging.stagingDocumentId);
      if (pending) {
        if (pending.idempotencyKey !== key) {
          throw new RegistryConflictError(
            "VAULT_EXPORT_PENDING_DESTINATION_CONFLICT",
            "A pending export for this Staging document is frozen to another Vault destination",
          );
        }
        this.database.exec("COMMIT;");
        return { run: pending, replayed: true };
      }

      const existingRow = this.database
        .prepare(
          `SELECT document_json FROM vault_export_runs
           WHERE workspace_id = ? AND idempotency_key = ?`,
        )
        .get(input.workspaceId, key) as { document_json: string } | undefined;
      if (existingRow) {
        const existing = parseRun(existingRow.document_json);
        this.database.exec("COMMIT;");
        return { run: existing, replayed: true };
      }

      const timestamp = this.clock().toISOString();
      const id = this.idFactory().trim();
      if (!id.startsWith("vex_") || id.length <= 4) {
        throw new RegistryValidationError("Vault export run ID is invalid");
      }
      const run: VaultExportRunV1 = {
        contractVersion: VAULT_EXPORT_CONTRACT_VERSION,
        objectType: VAULT_EXPORT_OBJECT_TYPE,
        id,
        workspaceId: input.workspaceId,
        idempotencyKey: key,
        rootFingerprintSha256: input.rootFingerprintSha256,
        binding: input.binding,
        staging: input.staging,
        state: "PENDING",
        preparedAt: timestamp,
        updatedAt: timestamp,
      };
      this.database
        .prepare(
          `INSERT INTO vault_export_runs
           (workspace_id, run_id, staging_document_id, idempotency_key, state,
            document_json, prepared_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          run.workspaceId,
          run.id,
          run.staging.stagingDocumentId,
          run.idempotencyKey,
          run.state,
          JSON.stringify(run),
          run.preparedAt,
          run.updatedAt,
        );
      this.database.exec("COMMIT;");
      return { run, replayed: false };
    } catch (error) {
      this.database.exec("ROLLBACK;");
      throw error;
    }
  }

  getById(workspaceIdValue: string, runIdValue: string): VaultExportRunV1 | null {
    const workspaceId = required(workspaceIdValue, "workspaceId");
    const runId = required(runIdValue, "runId");
    const row = this.database
      .prepare("SELECT document_json FROM vault_export_runs WHERE workspace_id = ? AND run_id = ?")
      .get(workspaceId, runId) as { document_json: string } | undefined;
    return row ? parseRun(row.document_json) : null;
  }

  getPendingByStaging(
    workspaceIdValue: string,
    stagingDocumentIdValue: string,
  ): VaultExportRunV1 | null {
    const workspaceId = required(workspaceIdValue, "workspaceId");
    const stagingDocumentId = required(stagingDocumentIdValue, "stagingDocumentId");
    const row = this.database
      .prepare(
        `SELECT document_json FROM vault_export_runs
         WHERE workspace_id = ? AND staging_document_id = ? AND state = 'PENDING'
         ORDER BY prepared_at DESC, rowid DESC LIMIT 1`,
      )
      .get(workspaceId, stagingDocumentId) as { document_json: string } | undefined;
    return row ? parseRun(row.document_json) : null;
  }

  recordProjectionReceipt(
    workspaceId: string,
    runId: string,
    receiptInput: Omit<VaultExportReceiptV1, "recordedAt">,
  ): VaultExportRunV1 {
    const run = this.getById(workspaceId, runId);
    if (!run)
      throw new RegistryError("VAULT_EXPORT_NOT_FOUND", `Vault export ${runId} was not found`);
    if (
      receiptInput.contentSha256 !== run.staging.contentSha256 ||
      !receiptInput.vaultRelativePath?.trim() ||
      !VAULT_EXPORT_DISPOSITIONS.includes(receiptInput.disposition)
    ) {
      throw new RegistryConflictError(
        "VAULT_EXPORT_RECEIPT_MISMATCH",
        "Vault projection receipt does not match the frozen export request",
      );
    }
    if (run.projectionReceipt) {
      if (
        run.projectionReceipt.vaultRelativePath !== receiptInput.vaultRelativePath ||
        run.projectionReceipt.contentSha256 !== receiptInput.contentSha256 ||
        run.projectionReceipt.disposition !== receiptInput.disposition
      ) {
        throw new RegistryConflictError(
          "VAULT_EXPORT_RECEIPT_CONFLICT",
          "Vault export already has a different projection receipt",
        );
      }
      return run;
    }
    if (run.state !== "PENDING") {
      throw new RegistryConflictError(
        "VAULT_EXPORT_STATE_CONFLICT",
        "Projection receipts may only be added to pending Vault exports",
      );
    }
    const recordedAt = this.clock().toISOString();
    const next: VaultExportRunV1 = {
      ...run,
      projectionReceipt: { ...receiptInput, recordedAt },
      updatedAt: recordedAt,
    };
    const result = this.database
      .prepare(
        `UPDATE vault_export_runs SET document_json = ?, updated_at = ?
         WHERE workspace_id = ? AND run_id = ? AND state = 'PENDING'`,
      )
      .run(JSON.stringify(next), next.updatedAt, workspaceId, runId);
    if (Number(result.changes) !== 1) {
      const replay = this.getById(workspaceId, runId);
      if (replay?.projectionReceipt) return replay;
      throw new RegistryConflictError(
        "VAULT_EXPORT_RECEIPT_RECORD_CONFLICT",
        "Vault export changed before its projection receipt could be recorded",
      );
    }
    return next;
  }

  finalize(workspaceId: string, runId: string): VaultExportRunV1 {
    const run = this.getById(workspaceId, runId);
    if (!run)
      throw new RegistryError("VAULT_EXPORT_NOT_FOUND", `Vault export ${runId} was not found`);
    if (run.state === "SUCCEEDED") return run;
    if (!run.projectionReceipt) {
      throw new RegistryConflictError(
        "VAULT_EXPORT_PROJECTION_RECEIPT_MISSING",
        "Vault export cannot finalize before its projection receipt is persisted",
      );
    }
    const updatedAt = this.clock().toISOString();
    const next: VaultExportRunV1 = {
      ...run,
      state: "SUCCEEDED",
      result: run.projectionReceipt,
      updatedAt,
    };
    const result = this.database
      .prepare(
        `UPDATE vault_export_runs
         SET state = 'SUCCEEDED', document_json = ?, updated_at = ?
         WHERE workspace_id = ? AND run_id = ? AND state = 'PENDING'`,
      )
      .run(JSON.stringify(next), updatedAt, workspaceId, runId);
    if (Number(result.changes) !== 1) {
      const replay = this.getById(workspaceId, runId);
      if (replay?.state === "SUCCEEDED") return replay;
      throw new RegistryConflictError(
        "VAULT_EXPORT_FINALIZATION_CONFLICT",
        "Vault export changed before finalization could be recorded",
      );
    }
    return next;
  }

  list(workspaceIdValue: string, limitValue = DEFAULT_LIMIT): VaultExportRunV1[] {
    const workspaceId = required(workspaceIdValue, "workspaceId");
    if (!Number.isSafeInteger(limitValue) || limitValue <= 0) {
      throw new RegistryValidationError("limit must be a positive integer");
    }
    const limit = Math.min(limitValue, MAX_LIMIT);
    const rows = this.database
      .prepare(
        `SELECT document_json FROM vault_export_runs
         WHERE workspace_id = ?
         ORDER BY prepared_at DESC, rowid DESC LIMIT ?`,
      )
      .all(workspaceId, limit) as Array<{ document_json: string }>;
    return rows.map((row) => parseRun(row.document_json));
  }
}
