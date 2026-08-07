import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import {
  CONVERSION_RUNTIME_VERSION,
  type ConversionClaimRequest,
  type ConversionFailedReport,
  type ConversionOutputReadyReport,
  type ConversionProgressReport,
  type ConversionStartedReport,
  type ConversionWorkerCapability,
  type RuntimeReportBase,
} from "@markorbit/contracts";
import { SqliteCollectionPlanRepository } from "@markorbit/persistence/collection-plans";
import { SqliteConverterRegistryRepository } from "@markorbit/persistence/converters";
import { SqliteExecutionLedgerRepository } from "@markorbit/persistence/execution-ledger";
import { SqliteRawArtifactRepository } from "@markorbit/persistence/raw-artifacts";
import { SqliteSourceRepository } from "@markorbit/persistence";
import { SqliteWorkerExecutionRepository } from "@markorbit/persistence/worker-execution";
import { SqliteWorkerRegistryRepository } from "@markorbit/persistence/workers";
import {
  ControlledFixturePipeline,
  type FixtureConversionContext,
  type FixtureConversionRuntimeClient,
  type FixtureUploadEvidence,
} from "@markorbit/worker-runtime";
import { LocalIntegrationHarness } from "./local-integration-harness";

const WORKSPACE_ID = "wsp_01ARZ3NDEKTSV4RRFFQ69G5FAV";
const MAXIMUM_INPUT_BYTES = 1_000_000;
const EXECUTION_KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;

function sha256(value: Uint8Array | string): string {
  return createHash("sha256").update(value).digest("hex");
}

async function* oneChunk(value: Uint8Array) {
  yield value;
}

export type ManualFixtureRunnerInput = {
  inputPath: string;
  outputDirectory: string;
  executionKey?: string;
  clock?: () => Date;
};

export type ManualFixtureRunnerSummary = {
  status: "COMPLETED" | "FAILED";
  workspaceId: string;
  conversionRunId: string;
  stagingDocumentId: string;
  verificationOutcome: "PASS" | "PASS_WITH_WARNINGS" | "FAIL";
  observedPhase: "COMPLETED" | "FAILED";
  input: {
    fileName: string;
    sizeBytes: number;
    sha256: string;
  };
  output: {
    rootDirectory: string;
    databasePath: string;
    casDirectory: string;
    targetPath: string;
    sizeBytes: number;
    sha256: string;
  };
};

export class ManualFixtureRunnerError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ManualFixtureRunnerError";
  }
}

class RepositoryRuntimeClient implements FixtureConversionRuntimeClient {
  private progressOrdinal = 0;

  constructor(
    private readonly harness: LocalIntegrationHarness,
    private readonly credential: string,
    private readonly clock: () => Date,
  ) {}

  private base(
    context: FixtureConversionContext,
    id: string,
    idempotencyKey: string,
    expectedCurrentStatus: RuntimeReportBase["expectedCurrentStatus"],
  ): RuntimeReportBase {
    return {
      contractVersion: CONVERSION_RUNTIME_VERSION,
      objectType: "CONVERSION_PROGRESS_REPORT",
      id,
      workspaceId: context.workspaceId,
      workerId: context.workerId,
      workerCredentialId: "worker-credential-local-runner",
      conversionRunId: context.conversionRunId,
      conversionAttemptId: context.conversionAttemptId,
      conversionLeaseId: context.lease.id,
      leaseGeneration: context.lease.generation,
      leaseTokenReference: context.lease.tokenReference,
      leaseTokenDigest: context.lease.tokenDigest,
      idempotencyKey,
      occurredAt: this.clock().toISOString(),
      expectedCurrentStatus,
    };
  }

  async started(context: FixtureConversionContext, idempotencyKey: string): Promise<void> {
    this.harness.transitions.submitStarted(
      {
        ...this.base(context, "csr_01ARZ3NDEKTSV4RRFFQ69G5FAV", idempotencyKey, "PENDING"),
        objectType: "CONVERSION_STARTED_REPORT",
        converter: context.converter,
      } as ConversionStartedReport,
      this.credential,
    );
  }

  async progress(
    context: FixtureConversionContext,
    progress: { percent: number; message: string },
    idempotencyKey: string,
  ): Promise<void> {
    const ids = ["cpr_01ARZ3NDEKTSV4RRFFQ69G5FAV", "cpr_01ARZ3NDEKTSV4RRFFQ69G5FAW"];
    this.harness.transitions.submitProgress(
      {
        ...this.base(context, ids[this.progressOrdinal++]!, idempotencyKey, "RUNNING"),
        objectType: "CONVERSION_PROGRESS_REPORT",
        progress,
      } as ConversionProgressReport,
      this.credential,
    );
  }

  async outputReady(
    context: FixtureConversionContext,
    evidence: FixtureUploadEvidence,
    idempotencyKey: string,
  ): Promise<void> {
    this.harness.transitions.submitOutputReady(
      {
        ...this.base(context, "cor_01ARZ3NDEKTSV4RRFFQ69G5FAV", idempotencyKey, "RUNNING"),
        objectType: "CONVERSION_OUTPUT_READY_REPORT",
        output: evidence,
      } as ConversionOutputReadyReport,
      this.credential,
    );
  }

  async failed(
    context: FixtureConversionContext,
    failure: { code: string; message: string; retryable: false },
    idempotencyKey: string,
  ): Promise<void> {
    this.harness.transitions.submitFailed(
      {
        ...this.base(context, "cfr_01ARZ3NDEKTSV4RRFFQ69G5FAV", idempotencyKey, "RUNNING"),
        objectType: "CONVERSION_FAILED_REPORT",
        failure,
      } as ConversionFailedReport,
      this.credential,
    );
  }
}

function validateInput(input: ManualFixtureRunnerInput): {
  inputPath: string;
  outputDirectory: string;
  executionKey: string;
  bytes: Uint8Array;
} {
  const inputPath = resolve(input.inputPath);
  const outputDirectory = resolve(input.outputDirectory);
  const executionKey = input.executionKey ?? "manual-fixture-run";
  if (!EXECUTION_KEY.test(executionKey)) {
    throw new ManualFixtureRunnerError(
      "MANUAL_FIXTURE_EXECUTION_KEY_INVALID",
      "executionKey contains unsupported characters or exceeds 160 characters",
    );
  }
  if (!existsSync(inputPath) || !statSync(inputPath).isFile()) {
    throw new ManualFixtureRunnerError(
      "MANUAL_FIXTURE_INPUT_NOT_FOUND",
      `Input file was not found: ${inputPath}`,
    );
  }
  const bytes = new Uint8Array(readFileSync(inputPath));
  if (bytes.byteLength === 0) {
    throw new ManualFixtureRunnerError(
      "MANUAL_FIXTURE_INPUT_EMPTY",
      "Input file must not be empty",
    );
  }
  if (bytes.byteLength > MAXIMUM_INPUT_BYTES) {
    throw new ManualFixtureRunnerError(
      "MANUAL_FIXTURE_INPUT_TOO_LARGE",
      `Input file exceeds ${MAXIMUM_INPUT_BYTES} bytes`,
    );
  }
  mkdirSync(outputDirectory, { recursive: true });
  if (existsSync(join(outputDirectory, "knowledge.sqlite"))) {
    throw new ManualFixtureRunnerError(
      "MANUAL_FIXTURE_OUTPUT_NOT_EMPTY",
      "Output directory already contains knowledge.sqlite",
    );
  }
  return { inputPath, outputDirectory, executionKey, bytes };
}

export async function runManualFixturePipeline(
  input: ManualFixtureRunnerInput,
): Promise<ManualFixtureRunnerSummary> {
  const validated = validateInput(input);
  const clock = input.clock ?? (() => new Date());
  const harness = new LocalIntegrationHarness({
    clock,
    rootDirectory: validated.outputDirectory,
  });

  try {
    const sources = new SqliteSourceRepository(harness.database, clock);
    const plans = new SqliteCollectionPlanRepository(harness.database, clock);
    const collectionRuns = new SqliteExecutionLedgerRepository(harness.database, clock);
    const workers = new SqliteWorkerRegistryRepository(harness.database, clock);
    const executions = new SqliteWorkerExecutionRepository(harness.database, clock);
    const artifacts = new SqliteRawArtifactRepository(
      harness.database,
      join(harness.rootDirectory, "raw-artifacts"),
      clock,
    );
    const converters = new SqliteConverterRegistryRepository(harness.database, clock);
    const suffix = randomUUID();

    const source = sources.create({
      workspaceId: WORKSPACE_ID,
      name: "Local manual fixture input",
      slug: `local-manual-${suffix}`,
      sourceType: "WEB",
      category: "USER_PROVIDED",
      authorityLevel: "SECONDARY_OFFICIAL",
      status: "ACTIVE",
      jurisdictions: [],
      languages: ["en-US"],
      connector: { connectorId: "crawl4ai-web", version: "1.0.0" },
      connectorConfig: {},
      canonicalUri: `file://${validated.inputPath}`,
      entrypoints: [{ uri: `file://${validated.inputPath}` }],
    });
    const plan = plans.create({
      workspaceId: WORKSPACE_ID,
      sourceId: source.id,
      name: "Local manual fixture plan",
      status: "ACTIVE",
      schedule: { mode: "MANUAL" },
      priority: "NORMAL",
      policy: {
        includePatterns: [],
        excludePatterns: [],
        maxDepth: 1,
        maxItems: 1,
        renderJavascript: false,
        fetchAttachments: false,
        respectRobots: true,
        rateLimitPerMinute: 1,
        timeoutSeconds: 30,
        retry: { maxAttempts: 1, backoffSeconds: 1 },
      },
      output: { artifactKinds: ["HTML"] },
    });
    collectionRuns.dispatchManual({ planId: plan.plan.id });

    const worker = workers.create({
      workspaceId: WORKSPACE_ID,
      displayName: "Local manual fixture worker",
      desiredState: "ACTIVE",
      runtime: { runtimeId: "local-manual-fixture", version: "1.0.0" },
      supportedJobTypes: ["WEB_CRAWL"],
      connectorBindings: [
        { connectorId: "crawl4ai-web", version: "1.0.0", capabilities: ["COLLECT"] },
      ],
      maxConcurrency: 1,
      labels: ["local", "manual", "conversion"],
    });
    workers.heartbeat(
      {
        workerId: worker.view.worker.id,
        observedAt: clock().toISOString(),
        runtimeVersion: "1.0.0",
        health: "HEALTHY",
        activeLeaseIds: [],
      },
      worker.credential,
    );
    const collectionClaim = workers.claim(worker.view.worker.id, worker.credential);
    executions.start(
      worker.view.worker.id,
      worker.credential,
      collectionClaim.lease!.id,
      collectionClaim.leaseToken!,
      {
        executor: { executorId: "local-manual-fixture", version: "1.0.0", mode: "FIXTURE" },
        idempotencyKey: `${validated.executionKey}:collection-start`,
      },
    );
    executions.markUploading(
      worker.view.worker.id,
      worker.credential,
      collectionClaim.lease!.id,
      collectionClaim.leaseToken!,
      { idempotencyKey: `${validated.executionKey}:collection-upload` },
    );

    const session = artifacts.createSession({
      workerId: worker.view.worker.id,
      credential: worker.credential,
      leaseId: collectionClaim.lease!.id,
      leaseToken: collectionClaim.leaseToken!,
      idempotencyKey: `${validated.executionKey}:artifact`,
      descriptor: {
        artifactKind: "TEXT",
        mimeType: "text/plain",
        originalName: basename(validated.inputPath),
        expectedSizeBytes: validated.bytes.byteLength,
        expectedSha256: sha256(validated.bytes),
        sourceUri: `file://${validated.inputPath}`,
        canonicalUri: `file://${validated.inputPath}`,
      },
    });
    await artifacts.uploadContent(
      worker.view.worker.id,
      worker.credential,
      collectionClaim.lease!.id,
      collectionClaim.leaseToken!,
      session.record.session.id,
      oneChunk(validated.bytes),
    );
    const finalized = (
      await artifacts.finalize(
        worker.view.worker.id,
        worker.credential,
        collectionClaim.lease!.id,
        collectionClaim.leaseToken!,
        session.record.session.id,
      )
    ).artifact.artifact;
    const artifact = { ...finalized, status: "READY_FOR_CONVERSION" as const };
    harness.database
      .prepare("UPDATE raw_artifacts SET status = ?, document_json = ? WHERE id = ?")
      .run(artifact.status, JSON.stringify(artifact), artifact.id);

    const profile = converters.createProfile({
      workspaceId: WORKSPACE_ID,
      sourceId: source.id,
      name: "Local text-to-Markdown profile",
      converter: { converterId: "builtin-text-markdown", version: "1.0.0" },
      input: { artifactKinds: ["TEXT"], mimePatterns: ["text/plain"] },
      outputFormat: "MARKDOWN",
      targetPathTemplate: "00_Inbox/{artifactId}.md",
      configuration: {},
      precedence: 1,
      autoConvert: false,
    });
    const activeProfile = converters.updateProfileStatus(profile.id, "ACTIVE", profile.updatedAt);
    const dispatched = harness.runs.dispatchManual({
      workspaceId: WORKSPACE_ID,
      rawArtifactId: artifact.id,
      conversionProfileId: activeProfile.id,
      requestedOutput: {
        format: "MARKDOWN",
        targetPathTemplate: activeProfile.targetPathTemplate,
      },
      trigger: "MANUAL",
      actor: { type: "ADMIN", id: "local-manual-runner" },
      idempotencyKey: `${validated.executionKey}:dispatch`,
    });

    const capability: ConversionWorkerCapability = {
      contractVersion: CONVERSION_RUNTIME_VERSION,
      objectType: "CONVERSION_WORKER_CAPABILITY",
      id: "cwc_01ARZ3NDEKTSV4RRFFQ69G5FAV",
      workerId: worker.view.worker.id,
      capabilityRevision: 1,
      supportedConverters: [{ converterId: "builtin-text-markdown", versions: ["1.0.0"] }],
      acceptedArtifactKinds: ["TEXT"],
      acceptedMimePatterns: ["text/plain"],
      supportedOutputFormats: ["MARKDOWN"],
      runtime: { runtimeId: "builtin-conversion-fixture", version: "1.0.0" },
      createdAt: clock().toISOString(),
    };
    harness.claims.registerCapability(capability);
    const request: ConversionClaimRequest = {
      contractVersion: CONVERSION_RUNTIME_VERSION,
      objectType: "CONVERSION_CLAIM_REQUEST",
      id: "ccr_01ARZ3NDEKTSV4RRFFQ69G5FAV",
      workspaceId: WORKSPACE_ID,
      workerId: worker.view.worker.id,
      workerCredentialId: "worker-credential-local-runner",
      capabilityRevision: 1,
      supportedConverters: capability.supportedConverters,
      maxAcceptedWork: 1,
      idempotencyKey: `${validated.executionKey}:claim`,
      requestedLeaseDurationSeconds: 120,
    };
    harness.reader.register(artifact.id, validated.bytes);

    const pipeline = new ControlledFixturePipeline(
      harness.controlPlane,
      harness.reader,
      harness.uploader,
      new RepositoryRuntimeClient(harness, worker.credential, clock),
    );
    const result = await pipeline.execute({
      claimRequest: request,
      executionKey: validated.executionKey,
    });
    if (result.status !== "COMPLETED" && result.status !== "FAILED") {
      throw new ManualFixtureRunnerError(
        "MANUAL_FIXTURE_TERMINAL_RESULT_MISSING",
        `Pipeline stopped with ${result.status}`,
      );
    }

    const inspection = harness.inspection.getByRun(WORKSPACE_ID, dispatched.record.run.id);
    if (!inspection?.stagingDocument || !inspection.verification) {
      throw new ManualFixtureRunnerError(
        "MANUAL_FIXTURE_INSPECTION_INCOMPLETE",
        "Terminal pipeline inspection evidence is incomplete",
      );
    }
    const observedPhase = inspection.observedPhase;
    if (observedPhase !== "COMPLETED" && observedPhase !== "FAILED") {
      throw new ManualFixtureRunnerError(
        "MANUAL_FIXTURE_OBSERVED_PHASE_INVALID",
        `Unexpected observed phase: ${observedPhase}`,
      );
    }

    return {
      status: result.status,
      workspaceId: WORKSPACE_ID,
      conversionRunId: result.conversionRunId,
      stagingDocumentId: result.stagingDocumentId,
      verificationOutcome: result.verificationOutcome,
      observedPhase,
      input: {
        fileName: basename(validated.inputPath),
        sizeBytes: validated.bytes.byteLength,
        sha256: sha256(validated.bytes),
      },
      output: {
        rootDirectory: harness.rootDirectory,
        databasePath: join(harness.rootDirectory, "knowledge.sqlite"),
        casDirectory: harness.casDirectory,
        targetPath: inspection.stagingDocument.targetPath,
        sizeBytes: inspection.stagingDocument.sizeBytes,
        sha256: inspection.stagingDocument.contentHash.value,
      },
    };
  } finally {
    harness.close();
  }
}

export function parseManualFixtureArguments(args: string[]): ManualFixtureRunnerInput {
  const values = new Map<string, string>();
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    if (!key?.startsWith("--") || value === undefined || value.startsWith("--")) {
      throw new ManualFixtureRunnerError(
        "MANUAL_FIXTURE_ARGUMENTS_INVALID",
        "Arguments must be provided as --input PATH --output-dir PATH [--execution-key KEY]",
      );
    }
    if (values.has(key)) {
      throw new ManualFixtureRunnerError(
        "MANUAL_FIXTURE_ARGUMENT_DUPLICATE",
        `Duplicate argument: ${key}`,
      );
    }
    values.set(key, value);
  }
  const allowed = new Set(["--input", "--output-dir", "--execution-key"]);
  const unknown = [...values.keys()].filter((key) => !allowed.has(key));
  if (unknown.length > 0) {
    throw new ManualFixtureRunnerError(
      "MANUAL_FIXTURE_ARGUMENT_UNKNOWN",
      `Unknown argument: ${unknown.join(", ")}`,
    );
  }
  const inputPath = values.get("--input");
  const outputDirectory = values.get("--output-dir");
  if (!inputPath || !outputDirectory) {
    throw new ManualFixtureRunnerError(
      "MANUAL_FIXTURE_ARGUMENT_REQUIRED",
      "Both --input and --output-dir are required",
    );
  }
  return {
    inputPath,
    outputDirectory,
    ...(values.get("--execution-key") ? { executionKey: values.get("--execution-key")! } : {}),
  };
}
