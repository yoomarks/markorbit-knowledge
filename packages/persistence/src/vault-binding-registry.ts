import { randomBytes } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import type { VaultBindingStatus, VaultBindingV1 } from "@markorbit/contracts";
import {
  VAULT_BINDING_CONTRACT_VERSION,
  VAULT_BINDING_OBJECT_TYPE,
  VAULT_BINDING_STATUSES,
} from "@markorbit/contracts";
import {
  RegistryConflictError,
  RegistryError,
  RegistryValidationError,
  initializeRegistry,
} from "./index";

const MIGRATION_ID = "0022_vault_bindings";
const PORTABLE_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._ -]{0,79}$/u;
const RESERVED_WINDOWS_NAMES = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\..*)?$/iu;
const MAX_RELATIVE_ROOT_LENGTH = 240;

export type ConfigureVaultBindingInput = {
  workspaceId: string;
  name: string;
  relativeRoot: string;
  expectedRevision?: number;
};

export interface VaultBindingRepository {
  getByWorkspaceId(workspaceId: string): VaultBindingV1 | null;
  configure(input: ConfigureVaultBindingInput): VaultBindingV1;
  setStatus(
    workspaceId: string,
    status: VaultBindingStatus,
    expectedRevision: number,
  ): VaultBindingV1;
}

function bindingId(): string {
  return `vlt_${Date.now().toString(36)}${randomBytes(10).toString("hex")}`;
}

function requireWorkspaceId(value: string): string {
  const workspaceId = value?.trim();
  if (!workspaceId) throw new RegistryValidationError("workspaceId is required");
  return workspaceId;
}

function normalizeName(value: string): string {
  const name = value?.trim();
  if (!name || name.length > 80 || /[\u0000-\u001f\u007f]/u.test(name)) {
    throw new RegistryValidationError("Vault binding name must be 1-80 printable characters");
  }
  return name;
}

export function normalizeVaultRelativeRoot(value: string): string {
  const relativeRoot = value?.trim();
  if (!relativeRoot || relativeRoot.length > MAX_RELATIVE_ROOT_LENGTH) {
    throw new RegistryValidationError("Vault relativeRoot must be 1-240 characters");
  }
  if (
    relativeRoot.startsWith("/") ||
    relativeRoot.endsWith("/") ||
    relativeRoot.includes("\\") ||
    relativeRoot.includes("\0")
  ) {
    throw new RegistryValidationError(
      "Vault relativeRoot must be a portable relative directory using forward slashes",
    );
  }
  const segments = relativeRoot.split("/");
  if (
    segments.some(
      (segment) =>
        !segment ||
        segment === "." ||
        segment === ".." ||
        !PORTABLE_SEGMENT.test(segment) ||
        segment.endsWith(".") ||
        segment.endsWith(" ") ||
        RESERVED_WINDOWS_NAMES.test(segment),
    )
  ) {
    throw new RegistryValidationError(
      "Vault relativeRoot contains an unsafe or non-portable directory segment",
    );
  }
  return segments.join("/");
}

function requireExpectedRevision(value: number | undefined): number {
  if (!Number.isSafeInteger(value) || (value ?? 0) < 1) {
    throw new RegistryConflictError(
      "VAULT_BINDING_REVISION_REQUIRED",
      "Updating an existing Vault binding requires its current positive revision",
    );
  }
  return value as number;
}

function ensureWorkspace(database: DatabaseSync, workspaceId: string): void {
  if (!database.prepare("SELECT id FROM workspaces WHERE id = ?").get(workspaceId)) {
    throw new RegistryError("WORKSPACE_NOT_FOUND", `Workspace ${workspaceId} was not found`);
  }
}

function ensureVaultBindingRegistry(database: DatabaseSync): void {
  initializeRegistry(database);
  if (database.prepare("SELECT id FROM schema_migrations WHERE id = ?").get(MIGRATION_ID)) return;

  database.exec("BEGIN IMMEDIATE;");
  try {
    database.exec(`
      CREATE TABLE IF NOT EXISTS vault_bindings (
        workspace_id TEXT PRIMARY KEY,
        binding_id TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        adapter TEXT NOT NULL CHECK (adapter = 'LOCAL_FILESYSTEM'),
        relative_root TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('ACTIVE','DISABLED')),
        revision INTEGER NOT NULL CHECK (revision >= 1),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (workspace_id) REFERENCES workspaces(id)
      ) STRICT;

      CREATE INDEX IF NOT EXISTS idx_vault_bindings_status
        ON vault_bindings(status, updated_at DESC);
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

type BindingRow = {
  workspace_id: string;
  binding_id: string;
  name: string;
  adapter: string;
  relative_root: string;
  status: string;
  revision: number;
  created_at: string;
  updated_at: string;
};

function bindingFromRow(row: BindingRow): VaultBindingV1 {
  const status = row.status as VaultBindingStatus;
  if (
    !row.binding_id.startsWith("vlt_") ||
    row.adapter !== "LOCAL_FILESYSTEM" ||
    !VAULT_BINDING_STATUSES.includes(status) ||
    !Number.isSafeInteger(row.revision) ||
    row.revision < 1 ||
    Number.isNaN(Date.parse(row.created_at)) ||
    Number.isNaN(Date.parse(row.updated_at))
  ) {
    throw new RegistryConflictError(
      "VAULT_BINDING_PERSISTED_STATE_INVALID",
      `Persisted Vault binding for ${row.workspace_id} is invalid`,
    );
  }
  return {
    contractVersion: VAULT_BINDING_CONTRACT_VERSION,
    objectType: VAULT_BINDING_OBJECT_TYPE,
    id: row.binding_id,
    workspaceId: row.workspace_id,
    name: normalizeName(row.name),
    adapter: "LOCAL_FILESYSTEM",
    relativeRoot: normalizeVaultRelativeRoot(row.relative_root),
    status,
    revision: row.revision,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class SqliteVaultBindingRepository implements VaultBindingRepository {
  constructor(
    private readonly database: DatabaseSync,
    private readonly clock: () => Date = () => new Date(),
    private readonly idFactory: () => string = bindingId,
  ) {
    ensureVaultBindingRegistry(database);
  }

  getByWorkspaceId(workspaceIdValue: string): VaultBindingV1 | null {
    const workspaceId = requireWorkspaceId(workspaceIdValue);
    const row = this.database
      .prepare(
        `SELECT workspace_id, binding_id, name, adapter, relative_root, status,
                revision, created_at, updated_at
         FROM vault_bindings
         WHERE workspace_id = ?`,
      )
      .get(workspaceId) as BindingRow | undefined;
    return row ? bindingFromRow(row) : null;
  }

  configure(input: ConfigureVaultBindingInput): VaultBindingV1 {
    const workspaceId = requireWorkspaceId(input.workspaceId);
    const name = normalizeName(input.name);
    const relativeRoot = normalizeVaultRelativeRoot(input.relativeRoot);
    ensureWorkspace(this.database, workspaceId);

    this.database.exec("BEGIN IMMEDIATE;");
    try {
      const existing = this.getByWorkspaceId(workspaceId);
      if (!existing) {
        if (input.expectedRevision !== undefined && input.expectedRevision !== 0) {
          throw new RegistryConflictError(
            "VAULT_BINDING_REVISION_CONFLICT",
            "Vault binding does not exist at the expected revision",
          );
        }
        const timestamp = this.clock().toISOString();
        const id = this.idFactory().trim();
        if (!id.startsWith("vlt_") || id.length <= 4) {
          throw new RegistryValidationError("Vault binding ID is invalid");
        }
        this.database
          .prepare(
            `INSERT INTO vault_bindings
             (workspace_id, binding_id, name, adapter, relative_root, status,
              revision, created_at, updated_at)
             VALUES (?, ?, ?, 'LOCAL_FILESYSTEM', ?, 'ACTIVE', 1, ?, ?)`,
          )
          .run(workspaceId, id, name, relativeRoot, timestamp, timestamp);
        this.database.exec("COMMIT;");
        return {
          contractVersion: VAULT_BINDING_CONTRACT_VERSION,
          objectType: VAULT_BINDING_OBJECT_TYPE,
          id,
          workspaceId,
          name,
          adapter: "LOCAL_FILESYSTEM",
          relativeRoot,
          status: "ACTIVE",
          revision: 1,
          createdAt: timestamp,
          updatedAt: timestamp,
        };
      }

      const expectedRevision = requireExpectedRevision(input.expectedRevision);
      if (existing.revision !== expectedRevision) {
        throw new RegistryConflictError(
          "VAULT_BINDING_REVISION_CONFLICT",
          `Vault binding revision is ${existing.revision}, not ${expectedRevision}`,
        );
      }
      if (existing.name === name && existing.relativeRoot === relativeRoot) {
        this.database.exec("COMMIT;");
        return existing;
      }

      const updatedAt = this.clock().toISOString();
      const nextRevision = existing.revision + 1;
      const result = this.database
        .prepare(
          `UPDATE vault_bindings
           SET name = ?, relative_root = ?, revision = ?, updated_at = ?
           WHERE workspace_id = ? AND revision = ?`,
        )
        .run(name, relativeRoot, nextRevision, updatedAt, workspaceId, expectedRevision);
      if (Number(result.changes) !== 1) {
        throw new RegistryConflictError(
          "VAULT_BINDING_REVISION_CONFLICT",
          "Vault binding changed before this update could be committed",
        );
      }
      this.database.exec("COMMIT;");
      return {
        ...existing,
        name,
        relativeRoot,
        revision: nextRevision,
        updatedAt,
      };
    } catch (error) {
      this.database.exec("ROLLBACK;");
      throw error;
    }
  }

  setStatus(
    workspaceIdValue: string,
    status: VaultBindingStatus,
    expectedRevisionValue: number,
  ): VaultBindingV1 {
    const workspaceId = requireWorkspaceId(workspaceIdValue);
    if (!VAULT_BINDING_STATUSES.includes(status)) {
      throw new RegistryValidationError("Vault binding status is invalid");
    }
    const expectedRevision = requireExpectedRevision(expectedRevisionValue);

    this.database.exec("BEGIN IMMEDIATE;");
    try {
      const existing = this.getByWorkspaceId(workspaceId);
      if (!existing) {
        throw new RegistryError(
          "VAULT_BINDING_NOT_FOUND",
          `Vault binding for ${workspaceId} was not found`,
        );
      }
      if (existing.revision !== expectedRevision) {
        throw new RegistryConflictError(
          "VAULT_BINDING_REVISION_CONFLICT",
          `Vault binding revision is ${existing.revision}, not ${expectedRevision}`,
        );
      }
      if (existing.status === status) {
        this.database.exec("COMMIT;");
        return existing;
      }

      const updatedAt = this.clock().toISOString();
      const nextRevision = existing.revision + 1;
      const result = this.database
        .prepare(
          `UPDATE vault_bindings
           SET status = ?, revision = ?, updated_at = ?
           WHERE workspace_id = ? AND revision = ?`,
        )
        .run(status, nextRevision, updatedAt, workspaceId, expectedRevision);
      if (Number(result.changes) !== 1) {
        throw new RegistryConflictError(
          "VAULT_BINDING_REVISION_CONFLICT",
          "Vault binding changed before this status update could be committed",
        );
      }
      this.database.exec("COMMIT;");
      return {
        ...existing,
        status,
        revision: nextRevision,
        updatedAt,
      };
    } catch (error) {
      this.database.exec("ROLLBACK;");
      throw error;
    }
  }
}
