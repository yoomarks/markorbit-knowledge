import { resolve } from "node:path";
import type {
  CanonicalDownstreamDocumentV1,
  ReadyPackageContentExportV2,
  ReadyPackageV2,
} from "@markorbit/contracts";
import { RegistryValidationError } from "@markorbit/persistence";
import {
  SqliteCanonicalDownstreamDocumentRepository,
  type CanonicalDownstreamDocumentRepository,
} from "@markorbit/persistence/canonical-downstream-documents";
import {
  SqliteReadyPackageV2RegistryRepository,
  type ReadyPackageV2CreateResult,
  type ReadyPackageV2RegistryRepository,
} from "@markorbit/persistence/ready-packages-v2";
import {
  SqliteVaultOriginStagingRepository,
  type VaultOriginStagingRepository,
} from "@markorbit/persistence/vault-import-executions";
import { buildReadyPackageContentExportV2 } from "./ready-package-content-export-v2";
import { getRegistryDatabase } from "./source-registry";

export type ReadyPackageV2Overview = {
  candidates: CanonicalDownstreamDocumentV1[];
  readyPackages: ReadyPackageV2[];
};

export type ReadyPackageV2ServiceDependencies = {
  canonical: CanonicalDownstreamDocumentRepository;
  readyPackages: ReadyPackageV2RegistryRepository;
  staging: Pick<VaultOriginStagingRepository, "readContent">;
};

function required(value: string, field: string): string {
  const normalized = value?.trim();
  if (!normalized) throw new RegistryValidationError(`${field} is required`);
  return normalized;
}

function stagingStorePath(): string {
  const configured = process.env.MARKORBIT_STAGING_STORE_PATH?.trim();
  if (configured) return resolve(configured);
  const repositoryRoot =
    process.env.MARKORBIT_REPOSITORY_ROOT ?? process.env.INIT_CWD ?? process.cwd();
  return resolve(repositoryRoot, ".data", "staging");
}

export class ReadyPackageV2Service {
  constructor(private readonly dependencies: ReadyPackageV2ServiceDependencies) {}

  overview(workspaceIdValue: string): ReadyPackageV2Overview {
    const workspaceId = required(workspaceIdValue, "workspaceId");
    const readyPackages = this.dependencies.readyPackages.list(workspaceId, 50);
    const packaged = new Set(
      readyPackages.map((readyPackage) => readyPackage.evidence.canonicalDocumentId),
    );
    const candidates = this.dependencies.canonical
      .list(workspaceId, 50)
      .filter((document) => document.status === "READY" && !packaged.has(document.id));
    return { candidates, readyPackages };
  }

  create(workspaceIdValue: string, canonicalDocumentIdValue: string): ReadyPackageV2CreateResult {
    return this.dependencies.readyPackages.createFromCanonical({
      workspaceId: required(workspaceIdValue, "workspaceId"),
      canonicalDocumentId: required(canonicalDocumentIdValue, "canonicalDocumentId"),
    });
  }

  exportContent(
    workspaceIdValue: string,
    readyPackageIdValue: string,
  ): ReadyPackageContentExportV2 {
    return buildReadyPackageContentExportV2(
      {
        workspaceId: required(workspaceIdValue, "workspaceId"),
        readyPackageId: required(readyPackageIdValue, "readyPackageId"),
      },
      this.dependencies,
    );
  }
}

export function getConfiguredReadyPackageV2Service(): ReadyPackageV2Service {
  const database = getRegistryDatabase();
  const canonical = new SqliteCanonicalDownstreamDocumentRepository(database);
  const readyPackages = new SqliteReadyPackageV2RegistryRepository(database, canonical);
  const staging = new SqliteVaultOriginStagingRepository(database, stagingStorePath());
  return new ReadyPackageV2Service({ canonical, readyPackages, staging });
}
