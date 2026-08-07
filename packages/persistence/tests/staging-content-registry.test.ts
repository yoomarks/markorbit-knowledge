import { createHash, randomUUID } from "node:crypto";
import { existsSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  CONVERSION_RUNTIME_VERSION,
  type ConversionClaimRequest,
  type ConversionOutputReadyReport,
  type ConversionStartedReport,
  type ConversionWorkerCapability,
  type RuntimeReportBase,
} from "@markorbit/contracts";
import { SqliteCollectionPlanRepository } from "../src/collection-plan-registry";
import { SqliteWorkerExecutionRepository } from "../src/controlled-worker-execution";
import { SqliteConverterRegistryRepository } from "../src/converter-registry";
import { SqliteConversionRunLedgerRepository } from "../src/conversion-run-ledger";
import { SqliteConversionRuntimePersistenceRepository } from "../src/conversion-runtime-persistence";
import { SqliteConversionRuntimeTransitionRepository } from "../src/conversion-runtime-transitions";
import { SqliteExecutionLedgerRepository } from "../src/execution-ledger";
import { listAppliedMigrations, openRegistryDatabase, SqliteSourceRepository } from "../src/index";
import { SqliteRawArtifactRepository } from "../src/raw-artifact-registry";
import { SqliteWorkerRegistryRepository } from "../src/safe-worker-registry";
import {
  SqliteStagingContentRegistryRepository,
  ensureStagingContentRegistry,
} from "../src/staging-content-registry";
import {
  SqliteStagingVerificationRepository,
  ensureStagingVerification,
} from "../src/staging-verification";

const workspaceId = "wsp_01ARZ3NDEKTSV4RRFFQ69G5FAV";
const cleanupPaths: string[] = [];
afterEach(() =>
  cleanupPaths.splice(0).forEach((path) => rmSync(path, { recursive: true, force: true })),
);
const sha256 = (value: Uint8Array | string) => createHash("sha256").update(value).digest("hex");
async function* oneChunk(value: Uint8Array) {
  yield value;
}

async function fixture(
  databasePath = ":memory:",
  mode:
    | "valid"
    | "warning"
    | "malformed"
    | "duplicate"
    | "unsafe"
    | "invalid-utf8"
    | "empty-body" = "valid",
) {
  const current = Date.parse("2026-07-18T02:00:00Z");
  const clock = () => new Date(current);
  const database = openRegistryDatabase(databasePath);
  const artifactRoot = join(tmpdir(), `markorbit-staging-artifacts-${randomUUID()}`);
  const stagingRoot = join(tmpdir(), `markorbit-staging-content-${randomUUID()}`);
  cleanupPaths.push(artifactRoot, stagingRoot);
  const sources = new SqliteSourceRepository(database, clock);
  const plans = new SqliteCollectionPlanRepository(database, clock);
  const executionRuns = new SqliteExecutionLedgerRepository(database, clock);
  const workers = new SqliteWorkerRegistryRepository(database, clock);
  const executions = new SqliteWorkerExecutionRepository(database, clock);
  const artifacts = new SqliteRawArtifactRepository(database, artifactRoot, clock);
  const converters = new SqliteConverterRegistryRepository(database, clock);
  const conversionRuns = new SqliteConversionRunLedgerRepository(database, clock);
  const runtime = new SqliteConversionRuntimePersistenceRepository(database, clock);
  const transitions = new SqliteConversionRuntimeTransitionRepository(database, clock);

  const source = sources.create({
    workspaceId,
    name: "Staging fixture",
    slug: `staging-fixture-${randomUUID()}`,
    sourceType: "WEB",
    category: "OFFICIAL_AUTHORITY",
    authorityLevel: "PRIMARY_OFFICIAL",
    status: "ACTIVE",
    jurisdictions: ["US"],
    languages: ["en-US"],
    connector: { connectorId: "crawl4ai-web", version: "1.0.0" },
    connectorConfig: {},
    canonicalUri: "https://example.com",
    entrypoints: [{ uri: "https://example.com" }],
  });
  const plan = plans.create({
    workspaceId,
    sourceId: source.id,
    name: "Plan",
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
  executionRuns.dispatchManual({ planId: plan.plan.id });
  const worker = workers.create({
    workspaceId,
    displayName: "Staging Worker",
    desiredState: "ACTIVE",
    runtime: { runtimeId: "fixture-worker", version: "1.0.0" },
    supportedJobTypes: ["WEB_CRAWL"],
    connectorBindings: [
      { connectorId: "crawl4ai-web", version: "1.0.0", capabilities: ["COLLECT"] },
    ],
    maxConcurrency: 1,
    labels: ["conversion"],
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
      executor: { executorId: "fixture", version: "1.0.0", mode: "FIXTURE" },
      idempotencyKey: "start",
    },
  );
  executions.markUploading(
    worker.view.worker.id,
    worker.credential,
    collectionClaim.lease!.id,
    collectionClaim.leaseToken!,
    { idempotencyKey: "uploading" },
  );
  const inputBytes = new TextEncoder().encode("<html>staging</html>");
  const session = artifacts.createSession({
    workerId: worker.view.worker.id,
    credential: worker.credential,
    leaseId: collectionClaim.lease!.id,
    leaseToken: collectionClaim.leaseToken!,
    idempotencyKey: "artifact",
    descriptor: {
      artifactKind: "HTML",
      mimeType: "text/html",
      originalName: "page.html",
      expectedSizeBytes: inputBytes.length,
      expectedSha256: sha256(inputBytes),
      sourceUri: "https://example.com/page",
      canonicalUri: "https://example.com/page",
    },
  });
  await artifacts.uploadContent(
    worker.view.worker.id,
    worker.credential,
    collectionClaim.lease!.id,
    collectionClaim.leaseToken!,
    session.record.session.id,
    oneChunk(inputBytes),
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
  database
    .prepare("UPDATE raw_artifacts SET status = ?, document_json = ? WHERE id = ?")
    .run(artifact.status, JSON.stringify(artifact), artifact.id);

  const profile = converters.createProfile({
    workspaceId,
    sourceId: source.id,
    name: "HTML profile",
    converter: { converterId: "builtin-html-markdown", version: "1.0.0" },
    input: { artifactKinds: ["HTML"], mimePatterns: ["text/html"] },
    outputFormat: "MARKDOWN",
    targetPathTemplate: "00_Inbox/{artifactId}.md",
    configuration: { preserveLinks: true },
    precedence: 1,
    autoConvert: false,
  });
  const activeProfile = converters.updateProfileStatus(profile.id, "ACTIVE", profile.updatedAt);
  const dispatched = conversionRuns.dispatchManual({
    workspaceId,
    rawArtifactId: artifact.id,
    conversionProfileId: activeProfile.id,
    requestedOutput: {
      format: "MARKDOWN",
      targetPathTemplate: activeProfile.targetPathTemplate,
    },
    trigger: "MANUAL",
    actor: { type: "ADMIN", id: "tester" },
    idempotencyKey: "staging-dispatch",
  });
  const capability: ConversionWorkerCapability = {
    contractVersion: CONVERSION_RUNTIME_VERSION,
    objectType: "CONVERSION_WORKER_CAPABILITY",
    id: "cwc_01ARZ3NDEKTSV4RRFFQ69G5FAV",
    workerId: worker.view.worker.id,
    capabilityRevision: 1,
    supportedConverters: [{ converterId: "builtin-html-markdown", versions: ["1.0.0"] }],
    acceptedArtifactKinds: ["HTML"],
    acceptedMimePatterns: ["text/html"],
    supportedOutputFormats: ["MARKDOWN"],
    runtime: { runtimeId: "builtin-conversion-fixture", version: "1.0.0" },
    createdAt: clock().toISOString(),
  };
  runtime.registerCapability(capability);
  const claimRequest: ConversionClaimRequest = {
    contractVersion: CONVERSION_RUNTIME_VERSION,
    objectType: "CONVERSION_CLAIM_REQUEST",
    id: "ccr_01ARZ3NDEKTSV4RRFFQ69G5FAV",
    workspaceId,
    workerId: worker.view.worker.id,
    workerCredentialId: "worker-credential-fixture",
    capabilityRevision: 1,
    supportedConverters: capability.supportedConverters,
    maxAcceptedWork: 1,
    idempotencyKey: "staging-claim",
    requestedLeaseDurationSeconds: 120,
  };
  const claim = runtime.claim(claimRequest).result;
  const lease = claim.lease!;
  const reportBase: RuntimeReportBase = {
    contractVersion: CONVERSION_RUNTIME_VERSION,
    objectType: "CONVERSION_PROGRESS_REPORT",
    id: "cpr_01ARZ3NDEKTSV4RRFFQ69G5FAV",
    workspaceId,
    workerId: worker.view.worker.id,
    workerCredentialId: "worker-credential-fixture",
    conversionRunId: dispatched.record.run.id,
    conversionAttemptId: lease.conversionAttemptId,
    conversionLeaseId: lease.id,
    leaseGeneration: lease.generation,
    leaseTokenReference: lease.tokenReference,
    leaseTokenDigest: lease.tokenDigest,
    idempotencyKey: "base",
    occurredAt: clock().toISOString(),
    expectedCurrentStatus: "PENDING",
  };
  const started = {
    ...reportBase,
    objectType: "CONVERSION_STARTED_REPORT",
    id: "csr_01ARZ3NDEKTSV4RRFFQ69G5FAV",
    idempotencyKey: "staging-started",
    converter: dispatched.record.run.converter,
  } as ConversionStartedReport;
  transitions.submitStarted(started, worker.credential);
  const validFrontmatter = [
    "---",
    "markorbit:",
    `  workspaceId: ${JSON.stringify(workspaceId)}`,
    `  sourceId: ${JSON.stringify(source.id)}`,
    `  rawArtifactId: ${JSON.stringify(artifact.id)}`,
    `  conversionRunId: ${JSON.stringify(dispatched.record.run.id)}`,
    `  conversionAttemptId: ${JSON.stringify(lease.conversionAttemptId)}`,
    `  converterId: ${JSON.stringify(dispatched.record.run.converter.converterId)}`,
    `  converterVersion: ${JSON.stringify(dispatched.record.run.converter.version)}`,
    `  inputSha256: ${JSON.stringify(artifact.binaryHash.value)}`,
    ...(mode === "warning" ? ['title: "extra field"'] : []),
    ...(mode === "duplicate" ? [`  workspaceId: ${JSON.stringify(workspaceId)}`] : []),
    ...(mode === "unsafe" ? ["danger: &anchor value"] : []),
    "---",
    "",
    ...(mode === "empty-body" ? [] : ["# Generated"]),
    "",
  ].join("\n");
  const markdown =
    mode === "invalid-utf8"
      ? new Uint8Array([0xff, 0xfe, 0xfd])
      : new TextEncoder().encode(
          mode === "malformed" ? '---\nmarkorbit:\n  workspaceId: "broken"' : validFrontmatter,
        );
  const output = {
    ...reportBase,
    objectType: "CONVERSION_OUTPUT_READY_REPORT",
    id: "cor_01ARZ3NDEKTSV4RRFFQ69G5FAV",
    idempotencyKey: "staging-output",
    occurredAt: clock().toISOString(),
    expectedCurrentStatus: "RUNNING",
    output: {
      uploadGrantId: claim.stagingOutputUploadGrant!.id,
      targetPath: claim.stagingOutputUploadGrant!.normalizedTargetPath,
      sha256: sha256(markdown),
      sizeBytes: markdown.byteLength,
      mediaType: "text/markdown",
    },
  } as ConversionOutputReadyReport;
  transitions.submitOutputReady(output, worker.credential);
  const registry = new SqliteStagingContentRegistryRepository(database, stagingRoot, clock);
  return {
    database,
    databasePath,
    stagingRoot,
    clock,
    worker,
    run: dispatched.record.run,
    claim,
    markdown,
    registry,
  };
}

function ingestInput(env: Awaited<ReturnType<typeof fixture>>, key = "staging-ingest") {
  return {
    workspaceId,
    workerId: env.worker.view.worker.id,
    conversionRunId: env.run.id,
    conversionAttemptId: env.claim.lease!.conversionAttemptId,
    uploadGrantId: env.claim.stagingOutputUploadGrant!.id,
    idempotencyKey: key,
    title: "Generated staging fixture",
    content: env.markdown,
  };
}

describe("Immutable Staging content CAS and registry", () => {
  it("applies migration 0012 idempotently", () => {
    const database = openRegistryDatabase(":memory:");
    const root = join(tmpdir(), `markorbit-staging-migration-${randomUUID()}`);
    cleanupPaths.push(root);
    ensureStagingContentRegistry(database);
    ensureStagingContentRegistry(database);
    expect(listAppliedMigrations(database)).toContain("0012_staging_content_registry");
    const tables = database
      .prepare(
        `SELECT name FROM sqlite_master WHERE type = 'table' AND name IN
         ('staging_content_objects','staging_documents','staging_content_ingest_idempotency')`,
      )
      .all();
    expect(tables).toHaveLength(3);
    database.close();
  });

  it("persists immutable Markdown and a GENERATED descriptor", async () => {
    const env = await fixture();
    const result = env.registry.ingestGenerated(ingestInput(env));
    expect(result.replayed).toBe(false);
    expect(result.contentCreated).toBe(true);
    expect(result.record.descriptor.status).toBe("GENERATED");
    expect(result.record.descriptor.contentHash.value).toBe(sha256(env.markdown));
    expect(result.record.descriptor.contentAddressedRef).toBe(`cas:sha256:${sha256(env.markdown)}`);
    expect(result.record.descriptor.targetPath).toBe(
      env.claim.stagingOutputUploadGrant!.normalizedTargetPath,
    );
    expect(env.registry.readContent(result.record.descriptor.id, workspaceId)).toEqual(
      env.markdown,
    );
    expect(env.registry.listDocuments({ workspaceId }).total).toBe(1);
    env.database.close();
  });

  it("replays identical ingest without duplicating CAS or descriptor rows", async () => {
    const env = await fixture();
    const first = env.registry.ingestGenerated(ingestInput(env));
    const replay = env.registry.ingestGenerated(ingestInput(env));
    expect(replay.replayed).toBe(true);
    expect(replay.record.descriptor.id).toBe(first.record.descriptor.id);
    expect(
      Number(
        (
          env.database.prepare("SELECT COUNT(*) AS count FROM staging_content_objects").get() as {
            count: number;
          }
        ).count,
      ),
    ).toBe(1);
    expect(
      Number(
        (
          env.database.prepare("SELECT COUNT(*) AS count FROM staging_documents").get() as {
            count: number;
          }
        ).count,
      ),
    ).toBe(1);
    env.database.close();
  });

  it("rejects idempotency reuse and output evidence mismatches", async () => {
    const env = await fixture();
    env.registry.ingestGenerated(ingestInput(env));
    expect(() =>
      env.registry.ingestGenerated({
        ...ingestInput(env),
        title: "Different title",
      }),
    ).toThrow(/idempotency/i);
    expect(() =>
      env.registry.ingestGenerated({
        ...ingestInput(env, "different-content"),
        content: new TextEncoder().encode("different"),
      }),
    ).toThrow(/evidence/i);
    env.database.close();
  });

  it("enforces Workspace isolation and detects CAS tampering", async () => {
    const env = await fixture();
    const result = env.registry.ingestGenerated(ingestInput(env));
    expect(
      env.registry.getDocument(result.record.descriptor.id, "wsp_01ARZ3NDEKTSV4RRFFQ69G5FAW"),
    ).toBeNull();
    const digest = result.record.descriptor.contentHash.value;
    const casPath = join(env.stagingRoot, "sha256", digest.slice(0, 2), `${digest}.md`);
    expect(existsSync(casPath)).toBe(true);
    writeFileSync(casPath, "tampered");
    expect(() => env.registry.readContent(result.record.descriptor.id, workspaceId)).toThrow(
      /integrity/i,
    );
    env.database.close();
  });

  it("survives database restart with the same immutable CAS", async () => {
    const databasePath = join(tmpdir(), `markorbit-staging-${randomUUID()}.sqlite`);
    cleanupPaths.push(databasePath, `${databasePath}-wal`, `${databasePath}-shm`);
    const env = await fixture(databasePath);
    const result = env.registry.ingestGenerated(ingestInput(env));
    const documentId = result.record.descriptor.id;
    const stagingRoot = env.stagingRoot;
    env.database.close();
    const reopened = openRegistryDatabase(databasePath);
    const registry = new SqliteStagingContentRegistryRepository(reopened, stagingRoot);
    expect(registry.getDocument(documentId, workspaceId)?.descriptor.status).toBe("GENERATED");
    expect(registry.readContent(documentId, workspaceId)).toEqual(env.markdown);
    reopened.close();
  });
});

describe("Staging Verification Pipeline v1", () => {
  it("applies migration 0013 idempotently", () => {
    const database = openRegistryDatabase(":memory:");
    const root = join(tmpdir(), `markorbit-staging-verification-${randomUUID()}`);
    cleanupPaths.push(root);
    const registry = new SqliteStagingContentRegistryRepository(database, root);
    ensureStagingVerification(database);
    ensureStagingVerification(database);
    expect(listAppliedMigrations(database)).toContain("0013_staging_verification_pipeline");
    const tables = database
      .prepare(
        `SELECT name FROM sqlite_master WHERE type = 'table' AND name IN
         ('staging_document_verifications','staging_verification_idempotency')`,
      )
      .all();
    expect(tables).toHaveLength(2);
    expect(registry.listDocuments({ workspaceId }).total).toBe(0);
    database.close();
  });

  it("verifies deterministic fixture Markdown as READY/PASS without completing the run", async () => {
    const env = await fixture();
    const generated = env.registry.ingestGenerated(ingestInput(env));
    const verifier = new SqliteStagingVerificationRepository(
      env.database,
      env.registry,
      env.clock,
      () => "stv_01ARZ3NDEKTSV4RRFFQ69G5FAV",
    );
    const result = verifier.verifyGenerated({
      workspaceId,
      stagingDocumentId: generated.record.descriptor.id,
      idempotencyKey: "verify-pass",
    });
    expect(result.record.descriptor.status).toBe("READY");
    expect(result.evidence.outcome).toBe("PASS");
    expect(result.record.descriptor.frontmatterSummary.fieldCount).toBe(8);
    expect(result.record.descriptor.frontmatterSummary.fields.map((field) => field.key)).toEqual(
      [...result.record.descriptor.frontmatterSummary.fields.map((field) => field.key)].sort(),
    );
    const run = JSON.parse(
      (
        env.database
          .prepare("SELECT document_json FROM conversion_runs WHERE id = ?")
          .get(env.run.id) as {
          document_json: string;
        }
      ).document_json,
    ) as { status: string };
    expect(run.status).toBe("VERIFYING");
    expect(verifier.getByDocument(generated.record.descriptor.id, workspaceId)?.id).toBe(
      result.evidence.id,
    );
    env.database.close();
  });

  it("maps bounded extra fields to READY/PASS_WITH_WARNINGS", async () => {
    const env = await fixture(":memory:", "warning");
    const generated = env.registry.ingestGenerated(ingestInput(env));
    const verifier = new SqliteStagingVerificationRepository(env.database, env.registry, env.clock);
    const result = verifier.verifyGenerated({
      workspaceId,
      stagingDocumentId: generated.record.descriptor.id,
      idempotencyKey: "verify-warning",
    });
    expect(result.record.descriptor.status).toBe("READY");
    expect(result.evidence.outcome).toBe("PASS_WITH_WARNINGS");
    expect(result.evidence.checks).toContainEqual(
      expect.objectContaining({ code: "FRONTMATTER_EXTRA_FIELDS", status: "WARN" }),
    );
    env.database.close();
  });

  it.each(["malformed", "duplicate", "unsafe", "invalid-utf8", "empty-body"] as const)(
    "persists %s Markdown as BLOCKED/FAIL",
    async (mode) => {
      const env = await fixture(":memory:", mode);
      const generated = env.registry.ingestGenerated(ingestInput(env));
      const verifier = new SqliteStagingVerificationRepository(
        env.database,
        env.registry,
        env.clock,
      );
      const result = verifier.verifyGenerated({
        workspaceId,
        stagingDocumentId: generated.record.descriptor.id,
        idempotencyKey: `verify-${mode}`,
      });
      expect(result.record.descriptor.status).toBe("BLOCKED");
      expect(result.evidence.outcome).toBe("FAIL");
      expect(result.evidence.checks.some((item) => item.status === "FAIL")).toBe(true);
      env.database.close();
    },
  );

  it.each([
    ["sourceId", "src_01ARZ3NDEKTSV4RRFFQ69G5FAW", "SOURCE_BINDING_VALID"],
    ["rawArtifactId", "art_01ARZ3NDEKTSV4RRFFQ69G5FAW", "RAW_ARTIFACT_BINDING_VALID"],
  ] as const)("blocks a persisted %s binding mismatch", async (field, replacement, checkCode) => {
    const env = await fixture();
    const generated = env.registry.ingestGenerated(ingestInput(env));
    const descriptor = { ...generated.record.descriptor, [field]: replacement };
    env.database
      .prepare("UPDATE staging_documents SET document_json = ? WHERE id = ?")
      .run(JSON.stringify(descriptor), descriptor.id);
    const verifier = new SqliteStagingVerificationRepository(env.database, env.registry, env.clock);
    const result = verifier.verifyGenerated({
      workspaceId,
      stagingDocumentId: descriptor.id,
      idempotencyKey: `verify-${field}`,
    });
    expect(result.record.descriptor.status).toBe("BLOCKED");
    expect(result.evidence.checks).toContainEqual(
      expect.objectContaining({ code: checkCode, status: "FAIL" }),
    );
    env.database.close();
  });

  it("replays identical verification and rejects later conflicting or terminal decisions", async () => {
    const env = await fixture();
    const generated = env.registry.ingestGenerated(ingestInput(env));
    const verifier = new SqliteStagingVerificationRepository(env.database, env.registry, env.clock);
    const input = {
      workspaceId,
      stagingDocumentId: generated.record.descriptor.id,
      idempotencyKey: "verify-replay",
    };
    const first = verifier.verifyGenerated(input);
    const replay = verifier.verifyGenerated(input);
    expect(replay.replayed).toBe(true);
    expect(replay.evidence.id).toBe(first.evidence.id);
    expect(() => verifier.verifyGenerated({ ...input, idempotencyKey: "verify-second" })).toThrow(
      /terminal verification decision/i,
    );
    env.database.close();
  });

  it("keeps CAS tampering as an operational integrity error", async () => {
    const env = await fixture();
    const generated = env.registry.ingestGenerated(ingestInput(env));
    const digest = generated.record.descriptor.contentHash.value;
    const casPath = join(env.stagingRoot, "sha256", digest.slice(0, 2), `${digest}.md`);
    writeFileSync(casPath, "tampered");
    const verifier = new SqliteStagingVerificationRepository(env.database, env.registry, env.clock);
    expect(() =>
      verifier.verifyGenerated({
        workspaceId,
        stagingDocumentId: generated.record.descriptor.id,
        idempotencyKey: "verify-tampered",
      }),
    ).toThrow(/integrity/i);
    expect(verifier.getByDocument(generated.record.descriptor.id, workspaceId)).toBeNull();
    env.database.close();
  });

  it("preserves verification evidence and descriptor state across database restart", async () => {
    const databasePath = join(tmpdir(), `markorbit-staging-verification-${randomUUID()}.sqlite`);
    cleanupPaths.push(databasePath, `${databasePath}-wal`, `${databasePath}-shm`);
    const env = await fixture(databasePath);
    const generated = env.registry.ingestGenerated(ingestInput(env));
    const verifier = new SqliteStagingVerificationRepository(env.database, env.registry, env.clock);
    const result = verifier.verifyGenerated({
      workspaceId,
      stagingDocumentId: generated.record.descriptor.id,
      idempotencyKey: "verify-restart",
    });
    const root = env.stagingRoot;
    env.database.close();
    const reopened = openRegistryDatabase(databasePath);
    const registry = new SqliteStagingContentRegistryRepository(reopened, root);
    const reopenedVerifier = new SqliteStagingVerificationRepository(reopened, registry);
    expect(
      registry.getDocument(generated.record.descriptor.id, workspaceId)?.descriptor.status,
    ).toBe("READY");
    expect(reopenedVerifier.getVerification(result.evidence.id, workspaceId)?.outcome).toBe("PASS");
    reopened.close();
  });
});
