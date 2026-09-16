import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { CONTROL_PLANE_KNOWLEDGE_READ_AUTHORITY } from "@markorbit/contracts";
import {
  buildPlatformOperationsPortfolio,
  type PlatformOperationsPortfolio,
} from "@markorbit/persistence/platform-operations-portfolio";
import { getRegistryDatabase } from "./source-registry";

export type KnowledgePlatformAdministrationOwnerResultV1 = {
  schemaVersion: 1;
  objectType: "KNOWLEDGE_PLATFORM_ADMINISTRATION_OWNER_RESULT";
  owner: "KNOWLEDGE";
  access: "READ_ONLY";
  requiredUpstreamAuthority: typeof CONTROL_PLANE_KNOWLEDGE_READ_AUTHORITY;
  observedAt: string;
  portfolio: {
    availability: "AVAILABLE";
    facts: PlatformOperationsPortfolio;
  };
};

function configuredDatabasePath(): string {
  if (process.env.MARKORBIT_KNOWLEDGE_DB_PATH) return process.env.MARKORBIT_KNOWLEDGE_DB_PATH;
  const repositoryRoot =
    process.env.MARKORBIT_REPOSITORY_ROOT ?? process.env.INIT_CWD ?? process.cwd();
  return resolve(repositoryRoot, ".data", "markorbit-knowledge.sqlite");
}

function configuredWalBytes(): number {
  const databasePath = configuredDatabasePath();
  if (databasePath === ":memory:") return 0;
  const walPath = `${databasePath}-wal`;
  return existsSync(walPath) ? statSync(walPath).size : 0;
}

export function getKnowledgePlatformAdministrationOwnerView(
  observedAt = new Date(),
  database: DatabaseSync = getRegistryDatabase(),
  walBytes = configuredWalBytes(),
): KnowledgePlatformAdministrationOwnerResultV1 {
  const facts = buildPlatformOperationsPortfolio(database, { observedAt, walBytes });
  return {
    schemaVersion: 1,
    objectType: "KNOWLEDGE_PLATFORM_ADMINISTRATION_OWNER_RESULT",
    owner: "KNOWLEDGE",
    access: "READ_ONLY",
    requiredUpstreamAuthority: CONTROL_PLANE_KNOWLEDGE_READ_AUTHORITY,
    observedAt: observedAt.toISOString(),
    portfolio: { availability: "AVAILABLE", facts },
  };
}
