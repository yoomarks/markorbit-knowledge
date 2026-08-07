import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { SqliteConversionRunLedgerRepository } from "@markorbit/persistence/conversion-runs";
import { SqliteConversionRuntimePersistenceRepository } from "@markorbit/persistence/conversion-runtime";
import { SqliteConversionRuntimeTransitionRepository } from "@markorbit/persistence/conversion-runtime-transitions";
import { SqliteStagingContentRegistryRepository } from "@markorbit/persistence/staging-content";
import { SqliteStagingVerificationRepository } from "@markorbit/persistence/staging-verification";
import { ControlPlaneVerifiedStagingFinalizer } from "@markorbit/persistence/verified-staging-finalization";
import {
  LocalRawArtifactMemoryReader,
  LocalSingleOutputUploader,
  PersistenceControlledFixtureControlPlane,
} from "@markorbit/persistence/local-pipeline-adapter";
import { SqliteConversionPipelineInspectionRepository } from "@markorbit/persistence/conversion-pipeline-inspection";

export type LocalIntegrationHarnessOptions = {
  clock?: () => Date;
  rootDirectory?: string;
};

export class LocalIntegrationHarness {
  readonly rootDirectory: string;
  readonly casDirectory: string;
  readonly database: DatabaseSync;
  readonly runs: SqliteConversionRunLedgerRepository;
  readonly claims: SqliteConversionRuntimePersistenceRepository;
  readonly transitions: SqliteConversionRuntimeTransitionRepository;
  readonly staging: SqliteStagingContentRegistryRepository;
  readonly verifications: SqliteStagingVerificationRepository;
  readonly finalizer: ControlPlaneVerifiedStagingFinalizer;
  readonly inspection: SqliteConversionPipelineInspectionRepository;
  readonly controlPlane: PersistenceControlledFixtureControlPlane;
  readonly reader = new LocalRawArtifactMemoryReader();
  readonly uploader = new LocalSingleOutputUploader();

  private closed = false;
  private readonly ownsRootDirectory: boolean;

  constructor(options: LocalIntegrationHarnessOptions = {}) {
    const clock = options.clock ?? (() => new Date());
    this.ownsRootDirectory = options.rootDirectory === undefined;
    this.rootDirectory =
      options.rootDirectory ?? mkdtempSync(join(tmpdir(), "markorbit-integration-"));
    this.casDirectory = join(this.rootDirectory, "staging-cas");
    this.database = new DatabaseSync(join(this.rootDirectory, "knowledge.sqlite"));
    this.database.exec("PRAGMA foreign_keys = ON;");

    this.runs = new SqliteConversionRunLedgerRepository(this.database, clock);
    this.claims = new SqliteConversionRuntimePersistenceRepository(this.database, clock);
    this.transitions = new SqliteConversionRuntimeTransitionRepository(this.database, clock);
    this.staging = new SqliteStagingContentRegistryRepository(
      this.database,
      this.casDirectory,
      clock,
    );
    this.verifications = new SqliteStagingVerificationRepository(
      this.database,
      this.staging,
      clock,
    );
    this.finalizer = new ControlPlaneVerifiedStagingFinalizer(
      this.staging,
      this.verifications,
      this.transitions,
    );
    this.inspection = new SqliteConversionPipelineInspectionRepository(this.database);
    this.controlPlane = new PersistenceControlledFixtureControlPlane(
      this.claims,
      this.runs,
      this.staging,
      this.verifications,
      this.finalizer,
    );
  }

  migrationIds(): string[] {
    return (
      this.database.prepare("SELECT id FROM schema_migrations ORDER BY id").all() as Array<{
        id: string;
      }>
    ).map((row) => row.id);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.database.close();
    if (this.ownsRootDirectory) rmSync(this.rootDirectory, { recursive: true, force: true });
  }
}
