import { resolve } from "node:path";
import {
  RegistryValidationError,
  SqliteSourceRepository,
  openRegistryDatabase,
  type SourceRepository,
} from "@markorbit/persistence";
import {
  SqliteCollectionPlanRepository,
  type CollectionPlanRepository,
} from "@markorbit/persistence/collection-plans";
import {
  SqliteConnectorRepository,
  type ConnectorRepository,
} from "@markorbit/persistence/connectors";
import {
  SqliteConverterRegistryRepository,
  type ConverterRegistryRepository,
} from "@markorbit/persistence/converters";
import {
  SqliteConversionRunLedgerRepository,
  type ConversionRunLedgerRepository,
} from "@markorbit/persistence/conversion-runs";
import {
  SqliteExecutionLedgerRepository,
  type ExecutionLedgerRepository,
} from "@markorbit/persistence/execution-ledger";
import {
  SqliteWorkerExecutionRepository,
  type WorkerExecutionRepository,
} from "@markorbit/persistence/worker-execution";
import {
  SqliteRawArtifactRepository,
  type RawArtifactRepository,
} from "@markorbit/persistence/raw-artifacts";
import {
  SqliteWorkerRegistryRepository,
  type WorkerRegistryRepository,
} from "@markorbit/persistence/workers";

const globalRegistry = globalThis as typeof globalThis & {
  markorbitRegistries?: {
    sources: SourceRepository;
    connectors: ConnectorRepository;
    plans: CollectionPlanRepository;
    runs: ExecutionLedgerRepository;
    workers: WorkerRegistryRepository;
    executions: WorkerExecutionRepository;
    artifacts: RawArtifactRepository;
    converters: ConverterRegistryRepository;
    conversionRuns: ConversionRunLedgerRepository;
  };
};

function defaultDatabasePath(): string {
  const repositoryRoot =
    process.env.MARKORBIT_REPOSITORY_ROOT ?? process.env.INIT_CWD ?? process.cwd();
  return resolve(repositoryRoot, ".data", "markorbit-knowledge.sqlite");
}

function defaultArtifactStorePath(): string {
  const repositoryRoot =
    process.env.MARKORBIT_REPOSITORY_ROOT ?? process.env.INIT_CWD ?? process.cwd();
  return resolve(repositoryRoot, ".data", "artifacts");
}

function artifactMaxBytes(): number | undefined {
  const configured = process.env.MARKORBIT_ARTIFACT_MAX_BYTES?.trim();
  if (!configured) return undefined;
  const parsed = Number(configured);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new RegistryValidationError(
      "MARKORBIT_ARTIFACT_MAX_BYTES must be a positive safe integer",
    );
  }
  return parsed;
}

function getRegistries() {
  if (!globalRegistry.markorbitRegistries) {
    const databasePath = process.env.MARKORBIT_KNOWLEDGE_DB_PATH ?? defaultDatabasePath();
    const database = openRegistryDatabase(databasePath);
    globalRegistry.markorbitRegistries = {
      sources: new SqliteSourceRepository(database),
      connectors: new SqliteConnectorRepository(database),
      plans: new SqliteCollectionPlanRepository(database),
      runs: new SqliteExecutionLedgerRepository(database),
      workers: new SqliteWorkerRegistryRepository(database),
      executions: new SqliteWorkerExecutionRepository(database),
      converters: new SqliteConverterRegistryRepository(database),
      conversionRuns: new SqliteConversionRunLedgerRepository(database),
      artifacts: new SqliteRawArtifactRepository(
        database,
        process.env.MARKORBIT_ARTIFACT_STORE_PATH ?? defaultArtifactStorePath(),
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        artifactMaxBytes(),
      ),
    };
  }
  return globalRegistry.markorbitRegistries;
}

export function getSourceRepository(): SourceRepository {
  return getRegistries().sources;
}

export function getConnectorRepository(): ConnectorRepository {
  return getRegistries().connectors;
}

export function getCollectionPlanRepository(): CollectionPlanRepository {
  return getRegistries().plans;
}

export function getExecutionLedgerRepository(): ExecutionLedgerRepository {
  return getRegistries().runs;
}

export function getWorkerRegistryRepository(): WorkerRegistryRepository {
  return getRegistries().workers;
}

export function getWorkerExecutionRepository(): WorkerExecutionRepository {
  return getRegistries().executions;
}

export function getRawArtifactRepository(): RawArtifactRepository {
  return getRegistries().artifacts;
}

export function getConverterRegistryRepository(): ConverterRegistryRepository {
  return getRegistries().converters;
}

export function getConversionRunLedgerRepository(): ConversionRunLedgerRepository {
  return getRegistries().conversionRuns;
}
