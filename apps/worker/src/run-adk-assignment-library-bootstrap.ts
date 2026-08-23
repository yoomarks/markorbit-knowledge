import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  TRADEMARK_ASSIGNMENT_LIBRARY_JURISDICTIONS,
  getTrademarkAssignmentLibraryMetadata,
  isTrademarkAssignmentLibraryJurisdiction,
  seedAllTrademarkAssignmentLibraries,
  seedTrademarkAssignmentLibrary,
  type TrademarkAssignmentLibraryJurisdiction,
} from "@markorbit/persistence/trademark-assignment-library-catalog";

type BootstrapScope = TrademarkAssignmentLibraryJurisdiction | "ALL";

function required(environment: NodeJS.ProcessEnv, name: string): string {
  const value = environment[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
}

function parseScope(value: string | undefined): BootstrapScope {
  const normalized = value?.trim().toUpperCase() || "US";
  if (normalized === "ALL") return "ALL";
  if (isTrademarkAssignmentLibraryJurisdiction(normalized)) return normalized;
  throw new Error(
    `Unsupported MARKORBIT_ADK_LIBRARY_JURISDICTION ${normalized}; expected ${[
      ...TRADEMARK_ASSIGNMENT_LIBRARY_JURISDICTIONS,
      "ALL",
    ].join(",")}`,
  );
}

export function loadAdkAssignmentLibraryBootstrapConfig(
  environment: NodeJS.ProcessEnv = process.env,
): { databasePath: string; jurisdiction: BootstrapScope } {
  return {
    databasePath: resolve(required(environment, "MARKORBIT_ADK_LIBRARY_DB_PATH")),
    jurisdiction: parseScope(environment.MARKORBIT_ADK_LIBRARY_JURISDICTION),
  };
}

function describeLibrary(library: ReturnType<typeof seedTrademarkAssignmentLibrary>) {
  const metadata = getTrademarkAssignmentLibraryMetadata(
    library.jurisdiction as TrademarkAssignmentLibraryJurisdiction,
  );
  return {
    libraryId: library.libraryId,
    revision: library.revision,
    jurisdiction: library.jurisdiction,
    domain: library.domain,
    workflows: library.entries.map((entry) => entry.workflow),
    assignmentIds: library.entries.map((entry) => entry.assignmentId),
    workflowCount: library.entries.length,
    expectedLibraryId: metadata.libraryId,
    expectedWorkflows: metadata.workflows,
    boundaries: library.boundaries,
  };
}

async function main(): Promise<void> {
  const config = loadAdkAssignmentLibraryBootstrapConfig();
  const database = new DatabaseSync(config.databasePath);
  database.exec("PRAGMA foreign_keys = ON;");

  try {
    if (config.jurisdiction === "ALL") {
      const libraries = seedAllTrademarkAssignmentLibraries(database).map(describeLibrary);
      process.stdout.write(
        `${JSON.stringify(
          {
            event: "adk.assignment-library.bootstrap.completed",
            databasePath: config.databasePath,
            requestedJurisdiction: "ALL",
            libraries,
          },
          null,
          2,
        )}\n`,
      );
      return;
    }

    const library = describeLibrary(seedTrademarkAssignmentLibrary(database, config.jurisdiction));
    process.stdout.write(
      `${JSON.stringify(
        {
          event: "adk.assignment-library.bootstrap.completed",
          databasePath: config.databasePath,
          requestedJurisdiction: config.jurisdiction,
          ...library,
        },
        null,
        2,
      )}\n`,
    );
  } finally {
    database.close();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    process.stderr.write(
      `${JSON.stringify({
        event: "adk.assignment-library.bootstrap.failed",
        message: error instanceof Error ? error.message : String(error),
      })}\n`,
    );
    process.exitCode = 1;
  });
}
