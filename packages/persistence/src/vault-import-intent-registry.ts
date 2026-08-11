import { createHash, randomBytes } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import {
  VAULT_IMPORT_INTENT_ACTION,
  VAULT_IMPORT_INTENT_CONTRACT_VERSION,
  VAULT_IMPORT_INTENT_OBJECT_TYPE,
  VAULT_IMPORT_INTENT_STATE,
  type VaultImportIntentCandidateSnapshotV1,
  type VaultImportIntentInspectionSnapshotV1,
  type VaultImportIntentV1,
} from "@markorbit/contracts";
import {
  RegistryConflictError,
  RegistryError,
  RegistryValidationError,
  initializeRegistry,
} from "./index";
import { normalizeObsidianTargetPath } from "./obsidian-vault-projection";
import { normalizeVaultRelativeRoot } from "./vault-binding-registry";

const MIGRATION_ID = "0025_vault_import_intents";
const SHA256 = /^[a-f0-9]{64}$/u;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/u;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const MAX_REVIEW_NOTE = 1000;

export type RecordVaultImportIntentInput = {
  workspaceId: string;
  idempotencyKey: string;
  inspection: VaultImportIntentInspectionSnapshotV1;
  candidate: VaultImportIntentCandidateSnapshotV1;
  reviewNote?: string;
};

export type VaultImportIntentRecordResult = {
  intent: VaultImportIntentV1;
  replayed: boolean;
};

export interface VaultImportIntentRepository {
  record(input: RecordVaultImportIntentInput): VaultImportIntentRecordResult;
  getById(workspaceId: string, intentId: string): VaultImportIntentV1 | null;
  getByCandidate(
    workspaceId: string,
    inspectionRunId: string,
    vaultRelativePath: string,
  ): VaultImportIntentV1 | null;
  list(workspaceId: string, limit?: number): VaultImportIntentV1[];
}

export function newVaultImportIntentId(): string {
  return `vmi_${Date.now().toString(36)}${randomBytes(10).toString("hex")}`;
}

function sha256(value: string): string {
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

function required(value: string, field: string): string {
  const normalized = value?.trim();
  if (!normalized) throw new RegistryValidationError(`${field} is required`);
  return normalized;
}

function normalizeReviewNote(value?: string): string | undefined {
  if (value === undefined) return undefined;
  const note = value.trim();
  if (!note) return undefined;
  if (note.length > MAX_REVIEW_NOTE || /[\u0000]/u.test(note)) {
    throw new RegistryValidationError(`reviewNote must be at most ${MAX_REVIEW_NOTE} characters`);
  }
  return note;
}

function validateInspection(
  value: VaultImportIntentInspectionSnapshotV1,
): VaultImportIntentInspectionSnapshotV1 {
  if (
    !value?.inspectionRunId?.startsWith("vin_") ||
    !SHA256.test(value.rootFingerprintSha256) ||
    Number.isNaN(Date.parse(value.observedAt)) ||
    !value.binding?.bindingId?.startsWith("vlt_") ||
    !Number.isSafeInteger(value.binding.revision) ||
    value.binding.revision < 1
  ) {
    throw new RegistryValidationError("Vault import intent inspection evidence is invalid");
  }
  return {
    inspectionRunId: value.inspectionRunId,
    rootFingerprintSha256: value.rootFingerprintSha256,
    observedAt: value.observedAt,
    binding: {
      bindingId: value.binding.bindingId,
      revision: value.binding.revision,
      relativeRoot: normalizeVaultRelativeRoot(value.binding.relativeRoot),
    },
  };
}

function validateCandidate(
  value: VaultImportIntentCandidateSnapshotV1,
  relativeRoot: string,
): VaultImportIntentCandidateSnapshotV1 {
  if (!value || !SHA256.test(value.observedSha256) || !Number.isSafeInteger(value.sizeBytes)) {
    throw new RegistryValidationError("Vault import intent candidate evidence is invalid");
  }
  if (value.sizeBytes < 0) {
    throw new RegistryValidationError("Vault import intent candidate size cannot be negative");
  }
  const bindingRelativePath = normalizeObsidianTargetPath(value.bindingRelativePath);
  const vaultRelativePath = `${relativeRoot}/${bindingRelativePath}`;
  if (value.vaultRelativePath !== vaultRelativePath) {
    throw new RegistryValidationError("Vault import intent candidate escaped its frozen binding");
  }
  return {
    vaultRelativePath,
    bindingRelativePath,
    observedSha256: value.observedSha256,
    sizeBytes: value.sizeBytes,
  };
}

function validateIntent(value: VaultImportIntentV1): VaultImportIntentV1 {
  if (
    value?.contractVersion !== VAULT_IMPORT_INTENT_CONTRACT_VERSION ||
    value.objectType !== VAULT_IMPORT_INTENT_OBJECT_TYPE ||
    !value.id?.startsWith("vmi_") ||
    !value.workspaceId?.trim() ||
    !IDEMPOTENCY_KEY.test(value.idempotencyKey) ||
    value.action !== VAULT_IMPORT_INTENT_ACTION ||
    value.state !== VAULT_IMPORT_INTENT_STATE ||
    Number.isNaN(Date.parse(value.reviewedAt))
  ) {
    throw new RegistryValidationError("Vault import intent is invalid");
  }
  const inspection = validateInspection(value.inspection);
  const candidate = validateCandidate(value.candidate, inspection.binding.relativeRoot);
  const reviewNote = normalizeReviewNote(value.reviewNote);
  return {
    contractVersion: VAULT_IMPORT_INTENT_CONTRACT_VERSION,
    objectType: VAULT_IMPORT_INTENT_OBJECT_TYPE,
    id: value.id,
    workspaceId: value.workspaceId.trim(),
    idempotencyKey: value.idempotencyKey,
    inspection,
    candidate,
    action: VAULT_IMPORT_INTENT_ACTION,
    state: VAULT_IMPORT_INTENT_STATE,
    ...(reviewNote ? { reviewNote } : {}),
    reviewedAt: value.reviewedAt,
  };
}

function parseIntent(value: string): VaultImportIntentV1 {
  try {
    return validateIntent(JSON.parse(value) as VaultImportIntentV1);
  } catch (error) {
    if (error instanceof RegistryValidationError) {
      throw new RegistryConflictError("VAULT_IMPORT_INTENT_PERSISTED_STATE_INVALID", error.message);
    }
    throw new RegistryConflictError(
      "VAULT_IMPORT_INTENT_PERSISTED_STATE_INVALID",
      "Persisted Vault import intent is not valid JSON",
    );
  }
}

function normalizeInput(input: RecordVaultImportIntentInput) {
  const workspaceId = required(input.workspaceId, "workspaceId");
  const idempotencyKey = required(input.idempotencyKey, "idempotencyKey");
  if (!IDEMPOTENCY_KEY.test(idempotencyKey)) {
    throw new RegistryValidationError("Vault import intent idempotencyKey is invalid");
  }
  const inspection = validateInspection(input.inspection);
  const candidate = validateCandidate(input.candidate, inspection.binding.relativeRoot);
  const reviewNote = normalizeReviewNote(input.reviewNote);
  const requestDigest = sha256(
    stable({ workspaceId, idempotencyKey, inspection, candidate, reviewNote }),
  );
  return { workspaceId, idempotencyKey, inspection, candidate, reviewNote, requestDigest };
}

function ensureRegistry(database: DatabaseSync): void {
  initializeRegistry(database);
  if (database.prepare("SELECT id FROM schema_migrations WHERE id = ?").get(MIGRATION_ID)) return;
  database.exec("BEGIN IMMEDIATE;");
  try {
    database.exec(`
      CREATE TABLE IF NOT EXISTS vault_import_intents (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        inspection_run_id TEXT NOT NULL,
        vault_relative_path TEXT NOT NULL,
        observed_sha256 TEXT NOT NULL,
        idempotency_key TEXT NOT NULL,
        request_digest TEXT NOT NULL,
        intent_json TEXT NOT NULL,
        reviewed_at TEXT NOT NULL,
        FOREIGN KEY (workspace_id) REFERENCES workspaces(id),
        UNIQUE (workspace_id, inspection_run_id, vault_relative_path),
        UNIQUE (workspace_id, idempotency_key)
      ) STRICT;

      CREATE INDEX IF NOT EXISTS idx_vault_import_intents_workspace
        ON vault_import_intents(workspace_id, reviewed_at DESC);
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

type IntentRow = { request_digest: string; intent_json: string };

export class SqliteVaultImportIntentRepository implements VaultImportIntentRepository {
  constructor(
    private readonly database: DatabaseSync,
    private readonly clock: () => Date = () => new Date(),
    private readonly idFactory: () => string = newVaultImportIntentId,
  ) {
    ensureRegistry(database);
  }

  record(inputValue: RecordVaultImportIntentInput): VaultImportIntentRecordResult {
    const input = normalizeInput(inputValue);
    if (!this.database.prepare("SELECT id FROM workspaces WHERE id = ?").get(input.workspaceId)) {
      throw new RegistryError(
        "WORKSPACE_NOT_FOUND",
        `Workspace ${input.workspaceId} was not found`,
      );
    }

    const byKey = this.database
      .prepare(
        `SELECT request_digest, intent_json FROM vault_import_intents
         WHERE workspace_id = ? AND idempotency_key = ?`,
      )
      .get(input.workspaceId, input.idempotencyKey) as IntentRow | undefined;
    if (byKey) return this.replayOrConflict(byKey, input.requestDigest, "IDEMPOTENCY_KEY");

    const byCandidate = this.findCandidateRow(
      input.workspaceId,
      input.inspection.inspectionRunId,
      input.candidate.vaultRelativePath,
    );
    if (byCandidate) return this.replayOrConflict(byCandidate, input.requestDigest, "CANDIDATE");

    const intent = validateIntent({
      contractVersion: VAULT_IMPORT_INTENT_CONTRACT_VERSION,
      objectType: VAULT_IMPORT_INTENT_OBJECT_TYPE,
      id: this.idFactory(),
      workspaceId: input.workspaceId,
      idempotencyKey: input.idempotencyKey,
      inspection: input.inspection,
      candidate: input.candidate,
      action: VAULT_IMPORT_INTENT_ACTION,
      state: VAULT_IMPORT_INTENT_STATE,
      ...(input.reviewNote ? { reviewNote: input.reviewNote } : {}),
      reviewedAt: this.clock().toISOString(),
    });

    try {
      this.database
        .prepare(
          `INSERT INTO vault_import_intents (
             id, workspace_id, inspection_run_id, vault_relative_path, observed_sha256,
             idempotency_key, request_digest, intent_json, reviewed_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          intent.id,
          intent.workspaceId,
          intent.inspection.inspectionRunId,
          intent.candidate.vaultRelativePath,
          intent.candidate.observedSha256,
          intent.idempotencyKey,
          input.requestDigest,
          JSON.stringify(intent),
          intent.reviewedAt,
        );
      return { intent, replayed: false };
    } catch (error) {
      const raced = this.database
        .prepare(
          `SELECT request_digest, intent_json FROM vault_import_intents
           WHERE workspace_id = ? AND (idempotency_key = ? OR
             (inspection_run_id = ? AND vault_relative_path = ?))
           LIMIT 1`,
        )
        .get(
          input.workspaceId,
          input.idempotencyKey,
          input.inspection.inspectionRunId,
          input.candidate.vaultRelativePath,
        ) as IntentRow | undefined;
      if (raced) return this.replayOrConflict(raced, input.requestDigest, "CANDIDATE");
      throw error;
    }
  }

  getById(workspaceIdValue: string, intentIdValue: string): VaultImportIntentV1 | null {
    const workspaceId = required(workspaceIdValue, "workspaceId");
    const intentId = required(intentIdValue, "intentId");
    const row = this.database
      .prepare("SELECT intent_json FROM vault_import_intents WHERE workspace_id = ? AND id = ?")
      .get(workspaceId, intentId) as { intent_json: string } | undefined;
    return row ? parseIntent(row.intent_json) : null;
  }

  getByCandidate(
    workspaceIdValue: string,
    inspectionRunIdValue: string,
    vaultRelativePathValue: string,
  ): VaultImportIntentV1 | null {
    const workspaceId = required(workspaceIdValue, "workspaceId");
    const inspectionRunId = required(inspectionRunIdValue, "inspectionRunId");
    const vaultRelativePath = required(vaultRelativePathValue, "vaultRelativePath");
    const row = this.findCandidateRow(workspaceId, inspectionRunId, vaultRelativePath);
    return row ? parseIntent(row.intent_json) : null;
  }

  list(workspaceIdValue: string, limitValue = DEFAULT_LIMIT): VaultImportIntentV1[] {
    const workspaceId = required(workspaceIdValue, "workspaceId");
    if (!Number.isSafeInteger(limitValue) || limitValue <= 0) {
      throw new RegistryValidationError("limit must be a positive integer");
    }
    const limit = Math.min(limitValue, MAX_LIMIT);
    const rows = this.database
      .prepare(
        `SELECT intent_json FROM vault_import_intents
         WHERE workspace_id = ? ORDER BY reviewed_at DESC, rowid DESC LIMIT ?`,
      )
      .all(workspaceId, limit) as Array<{ intent_json: string }>;
    return rows.map((row) => parseIntent(row.intent_json));
  }

  private findCandidateRow(
    workspaceId: string,
    inspectionRunId: string,
    vaultRelativePath: string,
  ): IntentRow | undefined {
    return this.database
      .prepare(
        `SELECT request_digest, intent_json FROM vault_import_intents
         WHERE workspace_id = ? AND inspection_run_id = ? AND vault_relative_path = ?`,
      )
      .get(workspaceId, inspectionRunId, vaultRelativePath) as IntentRow | undefined;
  }

  private replayOrConflict(
    row: IntentRow,
    requestDigest: string,
    dimension: "IDEMPOTENCY_KEY" | "CANDIDATE",
  ): VaultImportIntentRecordResult {
    if (row.request_digest === requestDigest) {
      return { intent: parseIntent(row.intent_json), replayed: true };
    }
    throw new RegistryConflictError(
      dimension === "IDEMPOTENCY_KEY"
        ? "VAULT_IMPORT_INTENT_IDEMPOTENCY_CONFLICT"
        : "VAULT_IMPORT_INTENT_CANDIDATE_CONFLICT",
      dimension === "IDEMPOTENCY_KEY"
        ? "Vault import intent idempotency key is already bound to different review evidence"
        : "Vault inspection candidate already has a different reviewed import intent",
    );
  }
}
