import type { DatabaseSync } from "node:sqlite";
import {
  SCHEMA_V1_VERSION,
  WORKSPACE_STATUSES,
  isWorkspace,
  type DataDomain,
  type Extensions,
  type SyncMode,
  type Workspace,
  type WorkspaceStatus,
} from "@markorbit/contracts";
import {
  DEFAULT_WORKSPACE,
  RegistryConflictError,
  RegistryError,
  RegistryValidationError,
  generateTypedId,
  initializeRegistry,
} from "./index";

const MIGRATION_ID = "1131_workspace_registry";
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export type CreateWorkspaceInput = {
  slug: string;
  name: string;
  dataDomain?: DataDomain;
  defaultLocale?: string;
  timezone?: string;
  syncMode?: SyncMode;
  retentionPolicy?: Workspace["retentionPolicy"];
  extensions?: Extensions;
};

export type WorkspaceListFilters = {
  status?: WorkspaceStatus;
  dataDomain?: DataDomain;
};

export interface WorkspaceRepository {
  create(input: CreateWorkspaceInput): Workspace;
  getById(id: string): Workspace | null;
  getBySlug(slug: string): Workspace | null;
  list(filters?: WorkspaceListFilters): Workspace[];
  updateStatus(id: string, status: WorkspaceStatus, expectedUpdatedAt: string): Workspace;
}

function ensureWorkspaceRegistry(database: DatabaseSync): void {
  initializeRegistry(database);
  if (database.prepare("SELECT id FROM schema_migrations WHERE id = ?").get(MIGRATION_ID)) return;
  database.exec("BEGIN IMMEDIATE;");
  try {
    database.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_workspaces_slug
        ON workspaces(json_extract(document_json, '$.slug'));
      CREATE INDEX IF NOT EXISTS idx_workspaces_status_domain
        ON workspaces(
          json_extract(document_json, '$.status'),
          json_extract(document_json, '$.dataDomain')
        );
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

function normalizeSlug(value: string): string {
  const slug = value.trim().toLowerCase();
  if (!SLUG.test(slug)) {
    throw new RegistryValidationError("Workspace slug is invalid");
  }
  return slug;
}

function parseWorkspace(value: string): Workspace {
  const parsed = JSON.parse(value) as unknown;
  if (!isWorkspace(parsed)) {
    throw new RegistryValidationError("Persisted Workspace no longer satisfies Schema v1");
  }
  return parsed;
}

function workspaceNotFound(id: string): never {
  throw new RegistryError("WORKSPACE_NOT_FOUND", `Workspace ${id} was not found`, { id });
}
export class SqliteWorkspaceRepository implements WorkspaceRepository {
  constructor(
    private readonly database: DatabaseSync,
    private readonly clock: () => Date = () => new Date(),
    private readonly idFactory: () => string = () => generateTypedId("wsp"),
  ) {
    ensureWorkspaceRegistry(database);
  }

  create(input: CreateWorkspaceInput): Workspace {
    const slug = normalizeSlug(input.slug);
    const name = input.name.trim();
    if (!name) throw new RegistryValidationError("Workspace name is required");
    if (input.dataDomain === "PUBLIC") {
      throw new RegistryValidationError("PUBLIC is reserved for Global Knowledge");
    }
    const timestamp = this.clock().toISOString();
    const workspace: Workspace = {
      schemaVersion: SCHEMA_V1_VERSION,
      objectType: "WORKSPACE",
      id: this.idFactory(),
      slug,
      name,
      dataDomain: input.dataDomain ?? "WORKSPACE_PRIVATE",
      status: "ACTIVE",
      defaultLocale: input.defaultLocale?.trim() || "en-US",
      timezone: input.timezone?.trim() || "UTC",
      syncPolicy: { mode: input.syncMode ?? "RAW", allowPublicPromotion: false },
      retentionPolicy: input.retentionPolicy ?? {
        rawArtifactDays: null,
        derivedDocumentDays: null,
      },
      createdAt: timestamp,
      updatedAt: timestamp,
      ...(input.extensions ? { extensions: input.extensions } : {}),
    };
    if (!isWorkspace(workspace)) {
      throw new RegistryValidationError("Workspace input does not satisfy Schema v1");
    }
    try {
      this.database
        .prepare(
          `INSERT INTO workspaces (id, document_json, created_at, updated_at)
           VALUES (?, ?, ?, ?)`,
        )
        .run(workspace.id, JSON.stringify(workspace), timestamp, timestamp);
    } catch (error) {
      if (error instanceof Error && error.message.includes("idx_workspaces_slug")) {
        throw new RegistryConflictError(
          "WORKSPACE_SLUG_CONFLICT",
          `Workspace slug ${workspace.slug} already exists`,
        );
      }
      throw error;
    }
    return workspace;
  }
  getById(id: string): Workspace | null {
    const row = this.database
      .prepare("SELECT document_json FROM workspaces WHERE id = ?")
      .get(id.trim()) as { document_json: string } | undefined;
    return row ? parseWorkspace(row.document_json) : null;
  }

  getBySlug(slug: string): Workspace | null {
    const normalized = normalizeSlug(slug);
    const row = this.database
      .prepare(
        `SELECT document_json FROM workspaces
         WHERE json_extract(document_json, '$.slug') = ?`,
      )
      .get(normalized) as { document_json: string } | undefined;
    return row ? parseWorkspace(row.document_json) : null;
  }

  list(filters: WorkspaceListFilters = {}): Workspace[] {
    if (filters.status && !WORKSPACE_STATUSES.includes(filters.status)) {
      throw new RegistryValidationError("Unknown Workspace status filter");
    }
    const rows = this.database
      .prepare("SELECT document_json FROM workspaces ORDER BY created_at ASC, id ASC")
      .all() as Array<{ document_json: string }>;
    return rows
      .map((row) => parseWorkspace(row.document_json))
      .filter((workspace) => !filters.status || workspace.status === filters.status)
      .filter((workspace) => !filters.dataDomain || workspace.dataDomain === filters.dataDomain);
  }
  updateStatus(id: string, status: WorkspaceStatus, expectedUpdatedAt: string): Workspace {
    if (!WORKSPACE_STATUSES.includes(status)) {
      throw new RegistryValidationError("Unknown Workspace status");
    }
    const current = this.getById(id) ?? workspaceNotFound(id);
    if (current.id === DEFAULT_WORKSPACE.id && status !== "ACTIVE") {
      throw new RegistryConflictError(
        "GLOBAL_WORKSPACE_IMMUTABLE",
        "Global Public Knowledge workspace cannot be suspended or archived",
      );
    }
    if (current.updatedAt !== expectedUpdatedAt) {
      throw new RegistryConflictError(
        "WORKSPACE_VERSION_CONFLICT",
        `Workspace ${id} was modified by another writer`,
      );
    }
    const updatedAt = this.clock().toISOString();
    const next: Workspace = { ...current, status, updatedAt };
    const result = this.database
      .prepare(
        `UPDATE workspaces SET document_json = ?, updated_at = ?
         WHERE id = ? AND updated_at = ?`,
      )
      .run(JSON.stringify(next), updatedAt, id, expectedUpdatedAt);
    if (Number(result.changes) !== 1) {
      throw new RegistryConflictError(
        "WORKSPACE_VERSION_CONFLICT",
        `Workspace ${id} was modified by another writer`,
      );
    }
    return next;
  }
}
