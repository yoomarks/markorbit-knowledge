import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ArtifactIngestionReceipt, ExecutionExecutor } from "@markorbit/contracts";
import { openRegistryDatabase, SqliteSourceRepository } from "@markorbit/persistence";
import { SqliteCollectionPlanRepository } from "@markorbit/persistence/collection-plans";
import { SqliteConnectorRepository } from "@markorbit/persistence/connectors";
import { SqliteExecutionLedgerRepository } from "@markorbit/persistence/execution-ledger";
import {
  SqliteRawArtifactRepository,
  type RawArtifactView,
} from "@markorbit/persistence/raw-artifacts";
import { SqliteWorkerExecutionRepository } from "@markorbit/persistence/worker-execution";
import { SqliteWorkerRegistryRepository } from "@markorbit/persistence/workers";
import { chromium } from "playwright-core";
import {
  extractTmclassHarPages,
  tmclassHtmlEntriesFromHar,
  type TmclassHarHtmlEntry,
  type TmclassHarPageCapture,
} from "./tmclass-har-extractor.js";
import { tmclassEvidenceFromHarCapture } from "./tmclass-har-knowledge-import.js";
import { projectTmclassPage } from "./tmclass-playwright-page-projector.js";

const MAX_HAR_BYTES = 250 * 1024 * 1024;
const CONNECTOR_ID = "tmclass-har";
const CONNECTOR_VERSION = "1.0.0";
const SOURCE_CANONICAL_URI = "https://euipo.europa.eu/ec2/";
const SOURCE_NAME = "EUIPO TMclass";
const PLAN_NAME = "EUIPO TMclass offline HAR import";
const EXECUTOR: ExecutionExecutor = {
  executorId: CONNECTOR_ID,
  version: CONNECTOR_VERSION,
  mode: "PRODUCTION",
};

type Options = {
  inputs: string[];
  output: string;
  browserExecutable: string;
  databasePath: string;
  artifactRoot: string;
  workspaceId: string;
};

function options(argv: string[]): Options {
  const inputs: string[] = [];
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === "--") continue;
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for ${flag}`);
    if (flag === "--input") inputs.push(path.resolve(value));
    else if (values.has(flag)) throw new Error(`Duplicate argument ${flag}`);
    else values.set(flag, value);
    index += 1;
  }
  if (inputs.length === 0) throw new Error("At least one --input HAR file is required");
  const required = (flag: string): string => {
    const value = values.get(flag)?.trim();
    if (!value) throw new Error(`${flag} is required`);
    return value;
  };
  const allowed = new Set([
    "--output",
    "--browser-executable",
    "--database",
    "--artifact-root",
    "--workspace-id",
  ]);
  const unknown = [...values.keys()].filter((flag) => !allowed.has(flag));
  if (unknown.length > 0) throw new Error(`Unsupported argument ${unknown[0]}`);
  return {
    inputs: [...new Set(inputs)],
    output: path.resolve(required("--output")),
    browserExecutable: path.resolve(required("--browser-executable")),
    databasePath: path.resolve(required("--database")),
    artifactRoot: path.resolve(required("--artifact-root")),
    workspaceId: required("--workspace-id"),
  };
}

async function loadCaptures(
  configured: Options,
): Promise<Array<{ entry: TmclassHarHtmlEntry; capture: TmclassHarPageCapture }>> {
  const browser = await chromium.launch({
    executablePath: configured.browserExecutable,
    headless: true,
    timeout: 30_000,
  });
  try {
    const context = await browser.newContext({ javaScriptEnabled: false, locale: "en-US" });
    await context.route("**/*", (route) => route.abort());
    const browserPage = await context.newPage();
    const page = {
      setContent: (html: string, wait: { waitUntil: "domcontentloaded"; timeout: number }) =>
        browserPage.setContent(html, wait),
      project: () => projectTmclassPage(browserPage),
    };
    const selected = new Map<
      string,
      { entry: TmclassHarHtmlEntry; capture: TmclassHarPageCapture }
    >();
    for (const input of configured.inputs) {
      const metadata = await stat(input);
      if (!metadata.isFile() || metadata.size > MAX_HAR_BYTES) {
        throw new Error(`HAR input is not a bounded file: ${path.basename(input)}`);
      }
      const har = JSON.parse(await readFile(input, "utf8")) as unknown;
      const entries = tmclassHtmlEntriesFromHar(har);
      const captures = await extractTmclassHarPages(har, page);
      const entryByIdentity = new Map(
        entries.map((entry) => [`${entry.sourceUri}\n${entry.responseSha256}`, entry]),
      );
      for (const capture of captures) {
        const identity = `${capture.sourceUri}\n${capture.responseSha256}`;
        const entry = entryByIdentity.get(identity);
        if (!entry) throw new Error("TMCLASS_HAR_CAPTURE_ENTRY_MISSING");
        if (!selected.has(identity)) selected.set(identity, { entry, capture });
      }
    }
    return [...selected.values()];
  } finally {
    await browser.close();
  }
}

async function* oneChunk(value: Uint8Array): AsyncIterable<Uint8Array> {
  yield value;
}

function importFingerprint(captures: readonly TmclassHarPageCapture[]): string {
  return createHash("sha256")
    .update(
      captures
        .map((capture) => `${capture.sourceUri}\n${capture.responseSha256}`)
        .sort()
        .join("\n"),
    )
    .digest("hex");
}

async function main(): Promise<void> {
  const configured = options(process.argv.slice(2));
  const loaded = await loadCaptures(configured);
  if (loaded.length === 0) throw new Error("No TMclass detail pages were captured");
  const database = openRegistryDatabase(configured.databasePath);
  try {
    const connectors = new SqliteConnectorRepository(database);
    if (!connectors.get(CONNECTOR_ID, CONNECTOR_VERSION)) {
      connectors.create({
        connectorId: CONNECTOR_ID,
        displayName: "EUIPO TMclass offline HAR",
        version: CONNECTOR_VERSION,
        sourceTypes: ["WEB"],
        runtime: "NODE",
        capabilities: ["COLLECT"],
        supportedJobTypes: ["WEB_CRAWL"],
        configurationSchema: { type: "object", additionalProperties: false },
        secretSchema: { type: "object", additionalProperties: false },
        outputArtifactKinds: ["HTML"],
        healthCheck: { mode: "WORKER_PROBE", timeoutSeconds: 30 },
        status: "ACTIVE",
      });
    }

    const sources = new SqliteSourceRepository(database);
    const source =
      sources
        .list({ workspaceId: configured.workspaceId, q: SOURCE_NAME, limit: 100 })
        .items.find((item) => item.canonicalUri === SOURCE_CANONICAL_URI) ??
      sources.create({
        workspaceId: configured.workspaceId,
        name: SOURCE_NAME,
        slug: "euipo-tmclass",
        sourceType: "WEB",
        category: "OFFICIAL_AUTHORITY",
        authorityLevel: "PRIMARY_OFFICIAL",
        status: "ACTIVE",
        jurisdictions: ["EM"],
        languages: ["en", "ja", "zh"],
        connector: { connectorId: CONNECTOR_ID, version: CONNECTOR_VERSION },
        connectorConfig: {},
        canonicalUri: SOURCE_CANONICAL_URI,
        entrypoints: [{ uri: SOURCE_CANONICAL_URI }],
      });

    const plans = new SqliteCollectionPlanRepository(database);
    const plan =
      plans
        .list({ sourceId: source.id, q: PLAN_NAME, limit: 100 })
        .items.find((item) => item.plan.name === PLAN_NAME) ??
      plans.create({
        workspaceId: configured.workspaceId,
        sourceId: source.id,
        name: PLAN_NAME,
        status: "ACTIVE",
        schedule: { mode: "MANUAL" },
        priority: "NORMAL",
        policy: {
          includePatterns: [],
          excludePatterns: [],
          maxDepth: 1,
          maxItems: 5_000,
          renderJavascript: false,
          fetchAttachments: false,
          respectRobots: true,
          rateLimitPerMinute: 1,
          timeoutSeconds: 30,
          retry: { maxAttempts: 1, backoffSeconds: 1 },
        },
        output: { artifactKinds: ["HTML"] },
      });

    const fingerprint = importFingerprint(loaded.map(({ capture }) => capture));
    const runs = new SqliteExecutionLedgerRepository(database);
    const dispatched = runs.dispatchManual({
      planId: plan.plan.id,
      idempotencyKey: `tmclass-har-${fingerprint}`,
    });
    if (dispatched.record.run.status === "COMPLETED") {
      throw new Error("TMCLASS_HAR_IMPORT_ALREADY_COMPLETED");
    }
    const job = dispatched.record.jobs[0];
    if (!job) throw new Error("TMCLASS_HAR_IMPORT_JOB_MISSING");

    const workers = new SqliteWorkerRegistryRepository(database);
    const worker = workers.create({
      workspaceId: configured.workspaceId,
      displayName: "EUIPO TMclass HAR importer",
      desiredState: "ACTIVE",
      runtime: { runtimeId: CONNECTOR_ID, version: CONNECTOR_VERSION },
      supportedJobTypes: ["WEB_CRAWL"],
      connectorBindings: [
        { connectorId: CONNECTOR_ID, version: CONNECTOR_VERSION, capabilities: ["COLLECT"] },
      ],
      maxConcurrency: 1,
      labels: ["tmclass", "offline-har"],
    });
    workers.heartbeat(
      {
        workerId: worker.view.worker.id,
        observedAt: new Date().toISOString(),
        runtimeVersion: CONNECTOR_VERSION,
        health: "HEALTHY",
        activeLeaseIds: [],
      },
      worker.credential,
    );
    const claim = workers.claimSpecific(worker.view.worker.id, worker.credential, job.id);
    if (!claim.lease || !claim.leaseToken || !claim.job) {
      throw new Error("TMCLASS_HAR_IMPORT_JOB_CLAIM_FAILED");
    }

    const executions = new SqliteWorkerExecutionRepository(database);
    executions.start(worker.view.worker.id, worker.credential, claim.lease.id, claim.leaseToken, {
      executor: EXECUTOR,
      idempotencyKey: `tmclass-har-${fingerprint}-start`,
    });
    executions.markUploading(
      worker.view.worker.id,
      worker.credential,
      claim.lease.id,
      claim.leaseToken,
      { idempotencyKey: `tmclass-har-${fingerprint}-uploading` },
    );

    const artifacts = new SqliteRawArtifactRepository(database, configured.artifactRoot);
    const finalized: Array<{
      capture: TmclassHarPageCapture;
      artifact: RawArtifactView;
      receipt: ArtifactIngestionReceipt;
    }> = [];
    for (const [index, item] of loaded.entries()) {
      const bytes = new TextEncoder().encode(item.entry.html);
      const routeName = new URL(item.capture.sourceUri).pathname
        .replace(/^\/ec2\//u, "")
        .replaceAll("/", "-");
      const session = artifacts.createSession({
        workerId: worker.view.worker.id,
        credential: worker.credential,
        leaseId: claim.lease.id,
        leaseToken: claim.leaseToken,
        idempotencyKey: `tmclass-har-${fingerprint}-artifact-${index + 1}`,
        descriptor: {
          artifactKind: "HTML",
          mimeType: "text/html;charset=UTF-8",
          originalName: `${routeName}.html`,
          expectedSizeBytes: bytes.byteLength,
          expectedSha256: item.capture.responseSha256,
          sourceUri: item.capture.sourceUri,
          canonicalUri: item.capture.sourceUri,
        },
      });
      await artifacts.uploadContent(
        worker.view.worker.id,
        worker.credential,
        claim.lease.id,
        claim.leaseToken,
        session.record.session.id,
        oneChunk(bytes),
      );
      const result = await artifacts.finalize(
        worker.view.worker.id,
        worker.credential,
        claim.lease.id,
        claim.leaseToken,
        session.record.session.id,
      );
      finalized.push({ capture: item.capture, artifact: result.artifact, receipt: result.receipt });
    }

    executions.markVerifying(
      worker.view.worker.id,
      worker.credential,
      claim.lease.id,
      claim.leaseToken,
      { idempotencyKey: `tmclass-har-${fingerprint}-verifying` },
    );
    executions.complete(
      worker.view.worker.id,
      worker.credential,
      claim.lease.id,
      claim.leaseToken,
      {
        idempotencyKey: `tmclass-har-${fingerprint}-complete`,
        receipt: {
          executor: EXECUTOR,
          outputKinds: ["HTML"],
          itemsObserved: finalized.length,
          bytesPrepared: finalized.reduce((sum, item) => sum + item.artifact.artifact.sizeBytes, 0),
          metadataOnly: false,
          artifactReceiptIds: finalized.map((item) => item.receipt.id),
          summary: `Imported ${finalized.length} exact TMclass HAR pages as immutable Knowledge RawArtifacts.`,
        },
      },
    );

    const evidence = finalized.map(({ capture, artifact }) =>
      tmclassEvidenceFromHarCapture(capture, {
        workspaceId: configured.workspaceId,
        sourceDefinitionId: source.id,
        collectionRunId: dispatched.record.run.id,
        rawArtifactId: artifact.artifact.id,
        artifactVersion: artifact.artifact.version,
        canonicalUri: artifact.artifact.canonicalUri ?? "",
        sha256: artifact.artifact.binaryHash.value,
      }),
    );
    await mkdir(path.dirname(configured.output), { recursive: true });
    await writeFile(
      configured.output,
      JSON.stringify(
        {
          contractVersion: "TMCLASS_SOURCE_EVIDENCE_BUNDLE_V1",
          objectType: "TMCLASS_SOURCE_EVIDENCE_BUNDLE",
          generatedAt: new Date().toISOString(),
          workspaceId: configured.workspaceId,
          sourceDefinitionId: source.id,
          collectionRunId: dispatched.record.run.id,
          evidenceCount: evidence.length,
          evidence,
        },
        null,
        2,
      ) + "\n",
      "utf8",
    );
    process.stdout.write(
      JSON.stringify({
        outcome: "TMCLASS_HAR_IMPORTED_TO_KNOWLEDGE",
        rawArtifactCount: finalized.length,
        evidenceCount: evidence.length,
        sourceDefinitionId: source.id,
        collectionRunId: dispatched.record.run.id,
      }) + "\n",
    );
  } finally {
    database.close();
  }
}

await main();
