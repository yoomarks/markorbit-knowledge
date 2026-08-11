import { randomBytes } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import {
  VAULT_FRONTMATTER_STATUSES,
  VAULT_INSPECTION_CLASSIFICATIONS,
  VAULT_INSPECTION_CONTRACT_VERSION,
  VAULT_INSPECTION_OBJECT_TYPE,
  type VaultInspectionCandidateV1,
  type VaultInspectionRunV1,
} from "@markorbit/contracts";
import {
  RegistryConflictError,
  RegistryError,
  RegistryValidationError,
  initializeRegistry,
} from "./index";
import { normalizeObsidianTargetPath } from "./obsidian-vault-projection";
import { normalizeVaultRelativeRoot } from "./vault-binding-registry";

const MIGRATION_ID = "0024_vault_inspection_runs";
const SHA256 = /^[a-f0-9]{64}$/u;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export interface VaultInspectionRunRepository {
  record(run: VaultInspectionRunV1): VaultInspectionRunV1;
  getById(workspaceId: string, runId: string): VaultInspectionRunV1 | null;
  list(workspaceId: string, limit?: number): VaultInspectionRunV1[];
}

export function newVaultInspectionRunId(): string {
  return `vin_${Date.now().toString(36)}${randomBytes(10).toString("hex")}`;
}

function required(value: string, field: string): string {
  const normalized = value?.trim();
  if (!normalized) throw new RegistryValidationError(`${field} is required`);
  return normalized;
}

function validateFrontmatter(candidate: VaultInspectionCandidateV1): void {
  const frontmatter = candidate.frontmatter;
  if (
    !frontmatter ||
    !VAULT_FRONTMATTER_STATUSES.includes(frontmatter.status) ||
    !Array.isArray(frontmatter.keys) ||
    !frontmatter.keys.every(
      (key) => typeof key === "string" && key.length > 0 && key.length <= 100,
    ) ||
    !frontmatter.fields ||
    typeof frontmatter.fields !== "object" ||
    Array.isArray(frontmatter.fields)
  ) {
    throw new RegistryValidationError("Vault inspection frontmatter evidence is invalid");
  }
  for (const [key, value] of Object.entries(frontmatter.fields)) {
    if (!frontmatter.keys.includes(key) || typeof value !== "string" || value.length > 500) {
      throw new RegistryValidationError("Vault inspection frontmatter fields are invalid");
    }
  }
  if (
    (frontmatter.status === "NONE" ||
      frontmatter.status === "UNSUPPORTED" ||
      frontmatter.status === "MALFORMED") &&
    Object.keys(frontmatter.fields).length > 0
  ) {
    throw new RegistryValidationError(
      "Unparsed Vault frontmatter must not contain interpreted field values",
    );
  }
}

function validateCandidate(candidate: VaultInspectionCandidateV1, relativeRoot: string): void {
  if (!VAULT_INSPECTION_CLASSIFICATIONS.includes(candidate.classification)) {
    throw new RegistryValidationError("Vault inspection classification is invalid");
  }
  const bindingRelativePath = normalizeObsidianTargetPath(candidate.bindingRelativePath);
  const expectedVaultRelativePath = `${relativeRoot}/${bindingRelativePath}`;
  if (candidate.vaultRelativePath !== expectedVaultRelativePath) {
    throw new RegistryValidationError("Vault inspection candidate path escaped its frozen binding");
  }

  const missing = candidate.classification === "MISSING";
  if (missing) {
    if (candidate.observedSha256 !== undefined || candidate.sizeBytes !== undefined) {
      throw new RegistryValidationError(
        "Missing Vault candidates cannot contain observed file evidence",
      );
    }
  } else if (
    !candidate.observedSha256 ||
    !SHA256.test(candidate.observedSha256) ||
    !Number.isSafeInteger(candidate.sizeBytes) ||
    (candidate.sizeBytes ?? 0) < 0
  ) {
    throw new RegistryValidationError("Present Vault candidates require SHA-256 and positive size");
  }

  if (candidate.classification === "IMPORT_CANDIDATE" && candidate.managedExport) {
    throw new RegistryValidationError(
      "Untracked Vault import candidates cannot contain export evidence",
    );
  }
  if (candidate.classification !== "IMPORT_CANDIDATE" && !candidate.managedExport) {
    throw new RegistryValidationError("Tracked Vault candidates require managed export evidence");
  }
  if (candidate.managedExport) {
    if (
      !candidate.managedExport.exportRunId?.startsWith("vex_") ||
      !candidate.managedExport.stagingDocumentId?.trim() ||
      !SHA256.test(candidate.managedExport.contentSha256)
    ) {
      throw new RegistryValidationError("Vault inspection managed export evidence is invalid");
    }
    if (
      candidate.classification === "UNCHANGED" &&
      candidate.observedSha256 !== candidate.managedExport.contentSha256
    ) {
      throw new RegistryValidationError("UNCHANGED Vault candidate hash does not match its export");
    }
    if (
      candidate.classification === "CONFLICT" &&
      candidate.observedSha256 === candidate.managedExport.contentSha256
    ) {
      throw new RegistryValidationError(
        "CONFLICT Vault candidate must differ from its export hash",
      );
    }
  }

  validateFrontmatter(candidate);
  if (
    !Array.isArray(candidate.wikiLinks) ||
    candidate.wikiLinks.length > 100 ||
    !candidate.wikiLinks.every(
      (link) => typeof link === "string" && link.length > 0 && link.length <= 200,
    )
  ) {
    throw new RegistryValidationError("Vault inspection Wiki Link evidence is invalid");
  }
  if (missing && (candidate.frontmatter.status !== "NONE" || candidate.wikiLinks.length > 0)) {
    throw new RegistryValidationError(
      "Missing Vault candidates cannot contain parsed file metadata",
    );
  }
}

function validateRun(run: VaultInspectionRunV1): VaultInspectionRunV1 {
  if (
    run?.contractVersion !== VAULT_INSPECTION_CONTRACT_VERSION ||
    run.objectType !== VAULT_INSPECTION_OBJECT_TYPE ||
    !run.id?.startsWith("vin_") ||
    !run.workspaceId?.trim() ||
    !SHA256.test(run.rootFingerprintSha256) ||
    !run.binding?.bindingId?.startsWith("vlt_") ||
    !Number.isSafeInteger(run.binding.revision) ||
    run.binding.revision < 1 ||
    !Array.isArray(run.candidates) ||
    run.candidates.length > 1000 ||
    Number.isNaN(Date.parse(run.observedAt))
  ) {
    throw new RegistryValidationError("Vault inspection run is invalid");
  }
  const relativeRoot = normalizeVaultRelativeRoot(run.binding.relativeRoot);
  const seen = new Set<string>();
  for (const candidate of run.candidates) {
    validateCandidate(candidate, relativeRoot);
    if (seen.has(candidate.vaultRelativePath)) {
      throw new RegistryValidationError("Vault inspection contains duplicate candidate paths");
    }
    seen.add(candidate.vaultRelativePath);
  }
  return run;
}

function parseRun(value: string): VaultInspectionRunV1 {
  try {
    return validateRun(JSON.parse(value) as VaultInspectionRunV1);
  } catch (error) {
    if (error instanceof RegistryValidationError) {
      throw new RegistryConflictError("VAULT_INSPECTION_PERSISTED_STATE_INVALID", error.message);
    }
    throw new RegistryConflictError(
      "VAULT_INSPECTION_PERSISTED_STATE_INVALID",
      "Persisted Vault inspection run is not valid JSON",
    );
  }
}

function ensureRegistry(database: DatabaseSync): void {
  initializeRegistry(database);
  if (database.prepare("SELECT id FROM schema_migrations WHERE id = ?").get(MIGRATION_ID)) return;
  database.exec("BEGIN IMMEDIATE;");
  try {
    database.exec(`
      CREATE TABLE IF NOT EXISTS vault_inspection_runs (
        workspace_id TEXT NOT NULL,
        run_id TEXT NOT NULL,
        observed_at TEXT NOT NULL,
        document_json TEXT NOT NULL,
        PRIMARY KEY (workspace_id, run_id),
        FOREIGN KEY (workspace_id) REFERENCES workspaces(id)
      ) STRICT;

      CREATE INDEX IF NOT EXISTS idx_vault_inspection_runs_workspace
        ON vault_inspection_runs(workspace_id, observed_at DESC);
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

export class SqliteVaultInspectionRunRepository implements VaultInspectionRunRepository {
  constructor(private readonly database: DatabaseSync) {
    ensureRegistry(database);
  }

  record(runValue: VaultInspectionRunV1): VaultInspectionRunV1 {
    const run = validateRun(runValue);
    if (!this.database.prepare("SELECT id FROM workspaces WHERE id = ?").get(run.workspaceId)) {
      throw new RegistryError("WORKSPACE_NOT_FOUND", `Workspace ${run.workspaceId} was not found`);
    }
    try {
      this.database
        .prepare(
          `INSERT INTO vault_inspection_runs (workspace_id, run_id, observed_at, document_json)
           VALUES (?, ?, ?, ?)`,
        )
        .run(run.workspaceId, run.id, run.observedAt, JSON.stringify(run));
      return run;
    } catch (error) {
      const existing = this.getById(run.workspaceId, run.id);
      if (existing && JSON.stringify(existing) === JSON.stringify(run)) return existing;
      if (existing) {
        throw new RegistryConflictError(
          "VAULT_INSPECTION_RUN_ID_CONFLICT",
          "Vault inspection run ID is already bound to different evidence",
        );
      }
      throw error;
    }
  }

  getById(workspaceIdValue: string, runIdValue: string): VaultInspectionRunV1 | null {
    const workspaceId = required(workspaceIdValue, "workspaceId");
    const runId = required(runIdValue, "runId");
    const row = this.database
      .prepare(
        "SELECT document_json FROM vault_inspection_runs WHERE workspace_id = ? AND run_id = ?",
      )
      .get(workspaceId, runId) as { document_json: string } | undefined;
    return row ? parseRun(row.document_json) : null;
  }

  list(workspaceIdValue: string, limitValue = DEFAULT_LIMIT): VaultInspectionRunV1[] {
    const workspaceId = required(workspaceIdValue, "workspaceId");
    if (!Number.isSafeInteger(limitValue) || limitValue <= 0) {
      throw new RegistryValidationError("limit must be a positive integer");
    }
    const limit = Math.min(limitValue, MAX_LIMIT);
    const rows = this.database
      .prepare(
        `SELECT document_json FROM vault_inspection_runs
         WHERE workspace_id = ? ORDER BY observed_at DESC, rowid DESC LIMIT ?`,
      )
      .all(workspaceId, limit) as Array<{ document_json: string }>;
    return rows.map((row) => parseRun(row.document_json));
  }
}
