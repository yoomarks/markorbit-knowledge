import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  US_TRADEMARK_ASSIGNMENT_LIBRARY_ID,
  US_TRADEMARK_LIBRARY_WORKFLOWS,
  seedUsTrademarkAssignmentLibrary,
} from "@markorbit/persistence/us-trademark-assignment-library";

function required(environment: NodeJS.ProcessEnv, name: string): string {
  const value = environment[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
}

export function loadAdkAssignmentLibraryBootstrapConfig(
  environment: NodeJS.ProcessEnv = process.env,
): { databasePath: string } {
  return {
    databasePath: resolve(required(environment, "MARKORBIT_ADK_LIBRARY_DB_PATH")),
  };
}

async function main(): Promise<void> {
  const config = loadAdkAssignmentLibraryBootstrapConfig();
  const database = new DatabaseSync(config.databasePath);
  database.exec("PRAGMA foreign_keys = ON;");

  try {
    const library = seedUsTrademarkAssignmentLibrary(database);
    process.stdout.write(
      `${JSON.stringify(
        {
          event: "adk.assignment-library.bootstrap.completed",
          databasePath: config.databasePath,
          libraryId: library.libraryId,
          revision: library.revision,
          jurisdiction: library.jurisdiction,
          domain: library.domain,
          workflows: library.entries.map((entry) => entry.workflow),
          assignmentIds: library.entries.map((entry) => entry.assignmentId),
          workflowCount: library.entries.length,
          expectedLibraryId: US_TRADEMARK_ASSIGNMENT_LIBRARY_ID,
          expectedWorkflows: US_TRADEMARK_LIBRARY_WORKFLOWS,
          boundaries: library.boundaries,
        },
        null,
        2,
      )}\n`,
    );
  } finally {
    database.close();
  }
}

main().catch((error) => {
  process.stderr.write(
    `${JSON.stringify({
      event: "adk.assignment-library.bootstrap.failed",
      message: error instanceof Error ? error.message : String(error),
    })}\n`,
  );
  process.exitCode = 1;
});
