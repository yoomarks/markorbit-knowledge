import process from "node:process";
import { openRegistryDatabase } from "@markorbit/persistence";
import { SqliteCoreWorkspaceBindingRepository } from "@markorbit/persistence/core-workspace-bindings";
import { SqliteWorkspaceRepository } from "@markorbit/persistence/workspaces";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

const databasePath = required("MARKORBIT_KNOWLEDGE_DB_PATH");
const coreWorkspaceId = required("MARKORBIT_CALIBRATION_WORKSPACE_ID");
const knowledgeWorkspaceId = required("MARKORBIT_CI_KNOWLEDGE_WORKSPACE_ID");
const database = openRegistryDatabase(databasePath);
try {
  const workspaces = new SqliteWorkspaceRepository(
    database,
    () => new Date("2026-09-16T00:00:00.000Z"),
    () => knowledgeWorkspaceId,
  );
  const existing = workspaces.getById(knowledgeWorkspaceId);
  const workspace =
    existing ??
    workspaces.create({
      slug: `ci-${coreWorkspaceId.slice(0, 8)}`,
      name: "CI Admin Knowledge Workspace",
    });
  if (workspace.status !== "ACTIVE" || workspace.dataDomain !== "WORKSPACE_PRIVATE") {
    throw new Error("CI Knowledge workspace must be active and private");
  }
  const binding = new SqliteCoreWorkspaceBindingRepository(database).bind(
    workspace.id,
    coreWorkspaceId,
  );
  process.stdout.write(
    `${JSON.stringify({ event: "ci-admin-knowledge-workspace.bootstrap", binding })}\n`,
  );
} finally {
  database.close();
}
