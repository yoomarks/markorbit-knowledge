import type { DatabaseSync } from "node:sqlite";
import { RegistryConflictError } from "@markorbit/persistence";
import {
  authenticateCaseProducerRequest,
  CaseProducerAccessError,
  type CaseProducerWorkspacePrincipalV1,
} from "./case-producer-auth";
import { getRegistryDatabase } from "./source-registry";

const INITIALIZED_DATABASES = new WeakSet<DatabaseSync>();

function ensureExpertTaskWorkspaceBindings(database: DatabaseSync): void {
  if (INITIALIZED_DATABASES.has(database)) return;
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
  INITIALIZED_DATABASES.add(database);
}

export function authenticateExpertReadRequest(
  request: Request,
  internalServiceSecret = process.env.MO_INTERNAL_SERVICE_SECRET,
): CaseProducerWorkspacePrincipalV1 {
  return authenticateCaseProducerRequest(request, internalServiceSecret);
}

export function authenticateExpertMutationRequest(
  request: Request,
  internalServiceSecret = process.env.MO_INTERNAL_SERVICE_SECRET,
): CaseProducerWorkspacePrincipalV1 {
  const principal = authenticateExpertReadRequest(request, internalServiceSecret);
  if (principal.role === "READ_ONLY") {
    throw new CaseProducerAccessError(
      "PERMISSION_DENIED",
      403,
      "READ_ONLY Workspace Principals cannot mutate Expert tasks.",
    );
  }
  return principal;
}

export class ExpertTaskWorkspaceBindingRepository {
  constructor(private readonly database: DatabaseSync) {
    ensureExpertTaskWorkspaceBindings(database);
  }

  bind(taskId: string, workspaceId: string): void {
    const existing = this.database
      .prepare("SELECT workspace_id FROM expert_task_workspace_bindings WHERE task_id = ?")
      .get(taskId) as { workspace_id: string } | undefined;
    if (existing) {
      if (existing.workspace_id !== workspaceId) {
        throw new RegistryConflictError(
          "EXPERT_TASK_WORKSPACE_BINDING_CONFLICT",
          `Expert task ${taskId} is already bound to a different workspace`,
        );
      }
      return;
    }
    this.database
      .prepare(
        `INSERT INTO expert_task_workspace_bindings(task_id, workspace_id, bound_at)
         VALUES (?, ?, ?)`,
      )
      .run(taskId, workspaceId, new Date().toISOString());
  }

  authorize(taskId: string, workspaceId: string): void {
    const row = this.database
      .prepare("SELECT workspace_id FROM expert_task_workspace_bindings WHERE task_id = ?")
      .get(taskId) as { workspace_id: string } | undefined;
    if (!row) {
      throw new CaseProducerAccessError(
        "EXPERT_TASK_WORKSPACE_UNBOUND",
        403,
        "Expert task has no durable workspace binding and is inaccessible through the API.",
      );
    }
    if (row.workspace_id !== workspaceId) {
      throw new CaseProducerAccessError(
        "WORKSPACE_MISMATCH",
        403,
        "Workspace Principal does not match the Expert task workspace.",
      );
    }
  }

  listTaskIds(workspaceId: string): string[] {
    return (
      this.database
        .prepare(
          `SELECT task_id
           FROM expert_task_workspace_bindings
           WHERE workspace_id = ?
           ORDER BY task_id ASC`,
        )
        .all(workspaceId) as { task_id: string }[]
    ).map((row) => row.task_id);
  }
}

function bindings(): ExpertTaskWorkspaceBindingRepository {
  return new ExpertTaskWorkspaceBindingRepository(getRegistryDatabase());
}

export function bindExpertTaskWorkspace(taskId: string, workspaceId: string): void {
  bindings().bind(taskId, workspaceId);
}

export function authorizeExpertTaskWorkspace(taskId: string, workspaceId: string): void {
  bindings().authorize(taskId, workspaceId);
}

export function listExpertTaskIdsForWorkspace(workspaceId: string): string[] {
  return bindings().listTaskIds(workspaceId);
}
