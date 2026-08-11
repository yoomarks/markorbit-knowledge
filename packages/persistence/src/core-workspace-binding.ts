import { DatabaseSync } from "node:sqlite";
import {
  RegistryConflictError,
  RegistryError,
  RegistryValidationError,
  initializeRegistry,
} from "./index";

const MIGRATION_ID = "0021_core_workspace_bindings";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type CoreWorkspaceBinding = {
  knowledgeWorkspaceId: string;
  coreWorkspaceId: string;
  createdAt: string;
  updatedAt: string;
};

export interface CoreWorkspaceBindingRepository {
  getByKnowledgeWorkspaceId(knowledgeWorkspaceId: string): CoreWorkspaceBinding | null;
  bind(knowledgeWorkspaceId: string, coreWorkspaceId: string): CoreWorkspaceBinding;
}

export function isCanonicalCoreWorkspaceId(value: string | null | undefined): value is string {
  return typeof value === "string" && UUID.test(value.trim());
}

export function normalizeCanonicalCoreWorkspaceId(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!UUID.test(normalized)) {
    throw new RegistryValidationError("coreWorkspaceId must be a canonical UUID", {
      issueCode: "CORE_WORKSPACE_BINDING_INVALID",
    });
  }
  return normalized;
}

function ensureCoreWorkspaceBindingRegistry(database: DatabaseSync): void {
  initializeRegistry(database);
  if (database.prepare("SELECT id FROM schema_migrations WHERE id = ?").get(MIGRATION_ID)) return;

  database.exec("BEGIN IMMEDIATE;");
  try {
    database.exec(`
      CREATE TABLE IF NOT EXISTS core_workspace_bindings (
        knowledge_workspace_id TEXT PRIMARY KEY,
        core_workspace_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (knowledge_workspace_id) REFERENCES workspaces(id)
      ) STRICT;

      CREATE INDEX IF NOT EXISTS idx_core_workspace_bindings_core_workspace
        ON core_workspace_bindings(core_workspace_id);
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

function bindingFromRow(row: {
  knowledge_workspace_id: string;
  core_workspace_id: string;
  created_at: string;
  updated_at: string;
}): CoreWorkspaceBinding {
  if (!isCanonicalCoreWorkspaceId(row.core_workspace_id)) {
    throw new RegistryConflictError(
      "CORE_WORKSPACE_BINDING_INVALID",
      `Persisted Core workspace binding for ${row.knowledge_workspace_id} is not a UUID`,
    );
  }
  return {
    knowledgeWorkspaceId: row.knowledge_workspace_id,
    coreWorkspaceId: row.core_workspace_id.toLowerCase(),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class SqliteCoreWorkspaceBindingRepository implements CoreWorkspaceBindingRepository {
  constructor(
    private readonly database: DatabaseSync,
    private readonly clock: () => Date = () => new Date(),
  ) {
    ensureCoreWorkspaceBindingRegistry(database);
  }

  getByKnowledgeWorkspaceId(knowledgeWorkspaceId: string): CoreWorkspaceBinding | null {
    const normalizedWorkspaceId = knowledgeWorkspaceId?.trim();
    if (!normalizedWorkspaceId) throw new RegistryValidationError("knowledgeWorkspaceId is required");
    const row = this.database
      .prepare(
        `SELECT knowledge_workspace_id, core_workspace_id, created_at, updated_at
         FROM core_workspace_bindings
         WHERE knowledge_workspace_id = ?`,
      )
      .get(normalizedWorkspaceId) as
      | {
          knowledge_workspace_id: string;
          core_workspace_id: string;
          created_at: string;
          updated_at: string;
        }
      | undefined;
    return row ? bindingFromRow(row) : null;
  }

  bind(knowledgeWorkspaceId: string, coreWorkspaceId: string): CoreWorkspaceBinding {
    const normalizedWorkspaceId = knowledgeWorkspaceId?.trim();
    if (!normalizedWorkspaceId) throw new RegistryValidationError("knowledgeWorkspaceId is required");
    const normalizedCoreWorkspaceId = normalizeCanonicalCoreWorkspaceId(coreWorkspaceId);

    const workspace = this.database
      .prepare("SELECT id FROM workspaces WHERE id = ?")
      .get(normalizedWorkspaceId);
    if (!workspace) {
      throw new RegistryError(
        "WORKSPACE_NOT_FOUND",
        `Workspace ${normalizedWorkspaceId} was not found`,
      );
    }

    const existing = this.getByKnowledgeWorkspaceId(normalizedWorkspaceId);
    if (existing) {
      if (existing.coreWorkspaceId !== normalizedCoreWorkspaceId) {
        throw new RegistryConflictError(
          "CORE_WORKSPACE_BINDING_CONFLICT",
          `Workspace ${normalizedWorkspaceId} is already bound to a different Core workspace`,
        );
      }
      return existing;
    }

    const timestamp = this.clock().toISOString();
    this.database
      .prepare(
        `INSERT INTO core_workspace_bindings
         (knowledge_workspace_id, core_workspace_id, created_at, updated_at)
         VALUES (?, ?, ?, ?)`,
      )
      .run(normalizedWorkspaceId, normalizedCoreWorkspaceId, timestamp, timestamp);

    return {
      knowledgeWorkspaceId: normalizedWorkspaceId,
      coreWorkspaceId: normalizedCoreWorkspaceId,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
  }
}
