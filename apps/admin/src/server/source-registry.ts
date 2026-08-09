import { resolve } from "node:path";
import type { DatabaseSync } from "node:sqlite";
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
  SqliteConversionRuntimePersistenceRepository,
  type ConversionRuntimePersistenceRepository,
} from "@markorbit/persistence/conversion-runtime";
import {
  SqliteConversionRuntimeTransitionRepository,
  type ConversionRuntimeTransitionRepository,
} from "@markorbit/persistence/conversion-runtime-transitions";
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
  SqliteReadyPackageRegistryRepository,
  type ReadyPackageRegistryRepository,
} from "@markorbit/persistence/ready-packages";
import {
  SqliteRetrievalIndexRepository,
  type RetrievalIndexRepository,
} from "@markorbit/persistence/retrieval-index";
import {
  SqliteSourceDiscoveryRepository,
  type SourceDiscoveryRepository,
} from "@markorbit/persistence/source-discovery";
import {
  SqliteSourceGraphRepository,
  type SourceGraphRepository,
} from "@markorbit/persistence/source-graph";
import {
  SqliteSourceIntelligenceRepository,
  type SourceIntelligenceRepository,
} from "@markorbit/persistence/source-intelligence";
import {
  SqliteSourceIntelligenceObservationReviewRepository,
  type SourceIntelligenceObservationReviewRepository,
} from "@markorbit/persistence/source-intelligence-reviews";
import {
  SqliteStagingContentRegistryRepository,
  type StagingContentRegistryRepository,
} from "@markorbit/persistence/staging-content";
import {
  SqliteStagingVerificationRepository,
  type StagingVerificationRepository,
} from "@markorbit/persistence/staging-verification";
import {
  ControlPlaneVerifiedStagingFinalizer,
  type VerifiedStagingFinalizationRepository,
} from "@markorbit/persistence/verified-staging-finalization";
import {
  SqliteWorkerRegistryRepository,
  type WorkerRegistryRepository,
} from "@markorbit/persistence/workers";
import { ensureM3CanonicalDocumentConverters } from "./m3-converter-bootstrap";

const globalRegistry = globalThis as typeof globalThis & {
  markorbitRegistries?: {
    database: DatabaseSync;
    sources: SourceRepository;
    discovery: SourceDiscoveryRepository;
    graph: SourceGraphRepository;
    intelligence: SourceIntelligenceRepository;
    intelligenceReviews: SourceIntelligenceObservationReviewRepository;
    connectors: ConnectorRepository;
    plans: CollectionPlanRepository;
    runs: ExecutionLedgerRepository;
    workers: WorkerRegistryRepository;
    executions: WorkerExecutionRepository;
    artifacts: RawArtifactRepository;
    converters: ConverterRegistryRepository;
    conversionRuns: ConversionRunLedgerRepository;
    conversionRuntime: ConversionRuntimePersistenceRepository;
    conversionTransitions: ConversionRuntimeTransitionRepository;
    staging: StagingContentRegistryRepository;
    stagingVerification: StagingVerificationRepository;
    stagingFinalizer: VerifiedStagingFinalizationRepository;
    readyPackages: ReadyPackageRegistryRepository;
    retrieval: RetrievalIndexRepository;
  };
};

function repositoryRoot(): string {
  return process.env.MARKORBIT_REPOSITORY_ROOT ?? process.env.INIT_CWD ?? process.cwd();
}

function defaultDatabasePath(): string {
  return resolve(repositoryRoot(), ".data", "markorbit-knowledge.sqlite");
}

function defaultArtifactStorePath(): string {
  return resolve(repositoryRoot(), ".data", "artifacts");
}

function defaultStagingStorePath(): string {
  return resolve(repositoryRoot(), ".data", "staging");
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
    const staging = new SqliteStagingContentRegistryRepository(
      database,
      process.env.MARKORBIT_STAGING_STORE_PATH ?? defaultStagingStorePath(),
    );
    const conversionTransitions = new SqliteConversionRuntimeTransitionRepository(database);
    const stagingVerification = new SqliteStagingVerificationRepository(database, staging);
    const converters = new SqliteConverterRegistryRepository(database);
    ensureM3CanonicalDocumentConverters(converters);
    globalRegistry.markorbitRegistries = {
      database,
      sources: new SqliteSourceRepository(database),
      discovery: new SqliteSourceDiscoveryRepository(database),
      graph: new SqliteSourceGraphRepository(database),
      intelligence: new SqliteSourceIntelligenceRepository(database),
      intelligenceReviews: new SqliteSourceIntelligenceObservationReviewRepository(database),
      connectors: new SqliteConnectorRepository(database),
      plans: new SqliteCollectionPlanRepository(database),
      runs: new SqliteExecutionLedgerRepository(database),
      workers: new SqliteWorkerRegistryRepository(database),
      executions: new SqliteWorkerExecutionRepository(database),
      converters,
      conversionRuns: new SqliteConversionRunLedgerRepository(database),
      conversionRuntime: new SqliteConversionRuntimePersistenceRepository(database),
      conversionTransitions,
      staging,
      stagingVerification,
      stagingFinalizer: new ControlPlaneVerifiedStagingFinalizer(
        staging,
        stagingVerification,
        conversionTransitions,
      ),
      readyPackages: new SqliteReadyPackageRegistryRepository(database),
      retrieval: new SqliteRetrievalIndexRepository(database),
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

export function getRegistryDatabase(): DatabaseSync {
  return getRegistries().database;
}

export function withRegistryTransaction<T>(operation: () => T): T {
  const database = getRegistryDatabase();
  database.exec("BEGIN IMMEDIATE;");
  try {
    const result = operation();
    database.exec("COMMIT;");
    return result;
  } catch (error) {
    database.exec("ROLLBACK;");
    throw error;
  }
}

export function getSourceRepository(): SourceRepository {
  return getRegistries().sources;
}

export function getSourceDiscoveryRepository(): SourceDiscoveryRepository {
  return getRegistries().discovery;
}

export function getSourceGraphRepository(): SourceGraphRepository {
  return getRegistries().graph;
}

export function getSourceIntelligenceRepository(): SourceIntelligenceRepository {
  return getRegistries().intelligence;
}

export function getSourceIntelligenceReviewRepository(): SourceIntelligenceObservationReviewRepository {
  return getRegistries().intelligenceReviews;
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

export function getConversionRuntimeRepository(): ConversionRuntimePersistenceRepository {
  return getRegistries().conversionRuntime;
}

export function getConversionRuntimeTransitionRepository(): ConversionRuntimeTransitionRepository {
  return getRegistries().conversionTransitions;
}

export function getStagingContentRepository(): StagingContentRegistryRepository {
  return getRegistries().staging;
}

export function getStagingVerificationRepository(): StagingVerificationRepository {
  return getRegistries().stagingVerification;
}

export function getVerifiedStagingFinalizer(): VerifiedStagingFinalizationRepository {
  return getRegistries().stagingFinalizer;
}

export function getReadyPackageRepository(): ReadyPackageRegistryRepository {
  return getRegistries().readyPackages;
}

export function getRetrievalIndexRepository(): RetrievalIndexRepository {
  return getRegistries().retrieval;
}
