import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { openRegistryDatabase } from "@markorbit/persistence";
import { SqliteAiKnowledgeAssignmentRepository } from "@markorbit/persistence/ai-knowledge-assignments";
import { SqliteAiSourcePackRepository } from "@markorbit/persistence/ai-source-packs";
import { SqliteRawArtifactRepository } from "@markorbit/persistence/raw-artifacts";
import {
  prepareAiGroundedExecutionV1,
  type PreparedAiGroundedExecutionV1,
} from "@markorbit/worker-runtime/ai-grounded-execution-preparer";
import type {
  AiSourceSnapshotResolver,
  RenderAiGroundedProviderInputOptions,
} from "@markorbit/worker-runtime/ai-source-pack-renderer";

export type AdkGroundedExecutionPreparationConfig = {
  databasePath: string;
  storageRoot: string;
  bindingId: string;
  outputPath: string;
};

export type AdkGroundedPreparedExecutionFileV1 = {
  protocolVersion: "1.0";
  objectType: "ADK_GROUNDED_PREPARED_EXECUTION_FILE";
  preparation: PreparedAiGroundedExecutionV1;
  boundaries: {
    providerCallsExecuted: false;
    providerSecretsRead: false;
    externalBrowsingExecuted: false;
    legalTruthVerified: false;
    executionAuthorityGranted: false;
  };
};

export class PersistedAiGroundedExecutionPreparationError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "PersistedAiGroundedExecutionPreparationError";
  }
}

function required(environment: NodeJS.ProcessEnv, name: string): string {
  const value = environment[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
}

export function loadAdkGroundedExecutionPreparationConfig(
  environment: NodeJS.ProcessEnv = process.env,
): AdkGroundedExecutionPreparationConfig {
  return {
    databasePath: resolve(required(environment, "MARKORBIT_ADK_GROUNDED_DB_PATH")),
    storageRoot: resolve(required(environment, "MARKORBIT_ADK_GROUNDED_STORAGE_ROOT")),
    bindingId: required(environment, "MARKORBIT_ADK_GROUNDED_BINDING_ID"),
    outputPath: resolve(required(environment, "MARKORBIT_ADK_GROUNDED_OUTPUT_PATH")),
  };
}

export async function preparePersistedAiGroundedExecutionV1(input: {
  database: DatabaseSync;
  bindingId: string;
  resolver: AiSourceSnapshotResolver;
  preparedAt?: string;
  rendererOptions?: RenderAiGroundedProviderInputOptions;
}): Promise<PreparedAiGroundedExecutionV1> {
  const sourcePacks = new SqliteAiSourcePackRepository(input.database);
  const assignments = new SqliteAiKnowledgeAssignmentRepository(input.database);
  const binding = sourcePacks.getBinding(input.bindingId);
  if (!binding) {
    throw new PersistedAiGroundedExecutionPreparationError(
      "AI_GROUNDED_BINDING_NOT_FOUND",
      `Grounded execution binding ${input.bindingId} was not found`,
    );
  }

  const assignment = assignments.getAssignment(binding.assignmentId);
  if (!assignment) {
    throw new PersistedAiGroundedExecutionPreparationError(
      "AI_GROUNDED_ASSIGNMENT_NOT_FOUND",
      `Grounded execution assignment ${binding.assignmentId} was not found`,
    );
  }

  const sourcePack = sourcePacks.getSourcePack(binding.sourcePackId, binding.sourcePackRevision);
  if (!sourcePack) {
    throw new PersistedAiGroundedExecutionPreparationError(
      "AI_GROUNDED_SOURCE_PACK_NOT_FOUND",
      `Grounded execution source pack ${binding.sourcePackId}@${binding.sourcePackRevision} was not found`,
    );
  }

  return prepareAiGroundedExecutionV1({
    assignment,
    binding,
    sourcePack,
    resolver: input.resolver,
    ...(input.preparedAt ? { preparedAt: input.preparedAt } : {}),
    ...(input.rendererOptions ? { rendererOptions: input.rendererOptions } : {}),
  });
}

function localRawArtifactResolver(
  rawArtifacts: SqliteRawArtifactRepository,
): AiSourceSnapshotResolver {
  return {
    resolve: async (source) => {
      const artifact = rawArtifacts.getArtifact(source.artifactId);
      if (!artifact) return undefined;
      const content = rawArtifacts.contentPath(source.artifactId);
      const bytes = await readFile(content.path);
      return {
        sourceId: artifact.artifact.sourceId,
        artifactId: artifact.artifact.id,
        mediaType: content.mimeType,
        bytes: new Uint8Array(bytes),
      };
    },
  };
}

export async function prepareAdkGroundedExecutionFile(
  config: AdkGroundedExecutionPreparationConfig,
): Promise<AdkGroundedPreparedExecutionFileV1> {
  if (!existsSync(config.databasePath)) {
    throw new Error(`Grounded execution database does not exist: ${config.databasePath}`);
  }
  if (!existsSync(config.storageRoot)) {
    throw new Error(`Grounded execution artifact storage does not exist: ${config.storageRoot}`);
  }
  if (existsSync(config.outputPath)) {
    throw new Error(`Grounded execution output already exists: ${config.outputPath}`);
  }

  const database = openRegistryDatabase(config.databasePath);
  try {
    const rawArtifacts = new SqliteRawArtifactRepository(database, config.storageRoot);
    const preparation = await preparePersistedAiGroundedExecutionV1({
      database,
      bindingId: config.bindingId,
      resolver: localRawArtifactResolver(rawArtifacts),
    });
    const output: AdkGroundedPreparedExecutionFileV1 = {
      protocolVersion: "1.0",
      objectType: "ADK_GROUNDED_PREPARED_EXECUTION_FILE",
      preparation,
      boundaries: {
        providerCallsExecuted: false,
        providerSecretsRead: false,
        externalBrowsingExecuted: false,
        legalTruthVerified: false,
        executionAuthorityGranted: false,
      },
    };
    mkdirSync(dirname(config.outputPath), { recursive: true });
    writeFileSync(config.outputPath, `${JSON.stringify(output, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
    return output;
  } finally {
    database.close();
  }
}

async function main(): Promise<void> {
  const output = await prepareAdkGroundedExecutionFile(loadAdkGroundedExecutionPreparationConfig());
  process.stdout.write(`${JSON.stringify(output.envelope ?? output.preparation.envelope, null, 2)}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    process.stderr.write(
      `${JSON.stringify({
        event: "adk.grounded-execution.preparation.failed",
        message: error instanceof Error ? error.message : String(error),
      })}\n`,
    );
    process.exitCode = 1;
  });
}
