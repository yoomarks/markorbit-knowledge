import { DatabaseSync } from "node:sqlite";
import { RegistryConflictError, RegistryValidationError, initializeRegistry } from "./index";
import { ensureExpertSourceRegistry } from "./expert-source-registry";

const MIGRATION_ID = "0022_expert_task_workspace_bindings";

export type ExpertTaskWorkspaceBinding = {
  taskId: string;
  workspaceId: string;
  boundAt: string;
};

function required(value: string, field: string): string {
  const normalized = value?.trim();
  if (!normalized) throw new RegistryValidationError(`${field} is required`);
  return normalized;
}

function ensureRegistry(database: DatabaseSync): void {
  initializeRegistry(database);
  ensureExpertSourceRegistry(database);
  if (database.prepare("SELECT id FROM schema_migrations WHERE id = ?").get(MIGRATION_ID)) return;

  database.exec("BEGIN IMMEDIATE;");
  try {
    database.exec(`
      CREATE TABLE IF NOT EXISTS expert_task_workspace_bindings (
        task_id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        bound_at TEXT NOT NULL,
        FOREIGN KEY(task_id) REFERENCES expert_question_tasks(task_id) ON DELETE CASCADE
      ) STRICT;

      CREATE INDEX IF NOT EXISTS expert_task_workspace_bindings_workspace_idx
        ON expert_task_workspace_bindings(workspace_id, task_id);
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

export class SqliteExpertTaskWorkspaceBindingRepository {
  constructor(
    private readonly database: DatabaseSync,
    private readonly clock: () => Date = () => new Date(),
  ) {
    ensureRegistry(database);
  }

  getWorkspaceId(taskId: string): string | null {
    const normalizedTaskId = required(taskId, "taskId");
    const row = this.database
      .prepare("SELECT workspace_id FROM expert_task_workspace_bindings WHERE task_id = ?")
      .get(normalizedTaskId) as { workspace_id: string } | undefined;
    return row?.workspace_id ?? null;
  }

  bind(taskId: string, workspaceId: string): ExpertTaskWorkspaceBinding {
    const normalizedTaskId = required(taskId, "taskId");
    const normalizedWorkspaceId = required(workspaceId, "workspaceId");
    const existingWorkspaceId = this.getWorkspaceId(normalizedTaskId);
    if (existingWorkspaceId) {
      if (existingWorkspaceId !== normalizedWorkspaceId) {
        throw new RegistryConflictError(
          "EXPERT_TASK_WORKSPACE_BINDING_CONFLICT",
          `Expert task ${normalizedTaskId} is already bound to a different workspace`,
        );
      }
      const existing = this.database
        .prepare(
          `SELECT task_id, workspace_id, bound_at
           FROM expert_task_workspace_bindings
           WHERE task_id = ?`,
        )
        .get(normalizedTaskId) as {
        task_id: string;
        workspace_id: string;
        bound_at: string;
      };
      return {
        taskId: existing.task_id,
        workspaceId: existing.workspace_id,
        boundAt: existing.bound_at,
      };
    }

    const boundAt = this.clock().toISOString();
    this.database
      .prepare(
        `INSERT INTO expert_task_workspace_bindings(task_id, workspace_id, bound_at)
         VALUES (?, ?, ?)`,
      )
      .run(normalizedTaskId, normalizedWorkspaceId, boundAt);
    return { taskId: normalizedTaskId, workspaceId: normalizedWorkspaceId, boundAt };
  }

  listTaskIds(workspaceId: string): string[] {
    const normalizedWorkspaceId = required(workspaceId, "workspaceId");
    return (
      this.database
        .prepare(
          `SELECT task_id
           FROM expert_task_workspace_bindings
           WHERE workspace_id = ?
           ORDER BY task_id ASC`,
        )
        .all(normalizedWorkspaceId) as { task_id: string }[]
    ).map((row) => row.task_id);
  }
}
