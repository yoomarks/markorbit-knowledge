import { createHash, randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  CONVERSION_RUNTIME_VERSION,
  type ConversionOutputReadyReport,
  type ConversionStartedReport,
  type ConversionWorkerCapability,
} from "@markorbit/contracts";
import { canonicalMarkdownFrontmatter } from "@markorbit/worker-runtime";
import { canonicalDocumentMetadata } from "../canonical-document-metadata";
import { ingestManualUpload } from "../manual-upload-ingestion";
import { ProductionConversionWorkerService } from "../production-conversion-worker-service";
import {
  getConversionRunLedgerRepository,
  getConversionRuntimeRepository,
  getRawArtifactRepository,
  getReadyPackageRepository,
  getRegistryDatabase,
  getRetrievalIndexRepository,
  getSourceRepository,
  getWorkspaceRepository,
  getWorkerRegistryRepository,
} from "../source-registry";

const tempRoot = mkdtempSync(join(tmpdir(), "markorbit-workspace-file-knowledge-"));

function sha256(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

async function* chunks(value: Uint8Array): AsyncIterable<Uint8Array> {
  yield value;
}
beforeAll(() => {
  process.env.MARKORBIT_KNOWLEDGE_DB_PATH = join(tempRoot, "knowledge.sqlite");
  process.env.MARKORBIT_ARTIFACT_STORE_PATH = join(tempRoot, "artifacts");
  process.env.MARKORBIT_STAGING_STORE_PATH = join(tempRoot, "staging");
  process.env.MARKORBIT_MANUAL_UPLOAD_MAX_BYTES = String(1024 * 1024);
});

afterAll(() => {
  getRegistryDatabase().close();
  delete (globalThis as typeof globalThis & { markorbitRegistries?: unknown }).markorbitRegistries;
  delete process.env.MARKORBIT_KNOWLEDGE_DB_PATH;
  delete process.env.MARKORBIT_ARTIFACT_STORE_PATH;
  delete process.env.MARKORBIT_STAGING_STORE_PATH;
  delete process.env.MARKORBIT_MANUAL_UPLOAD_MAX_BYTES;
  rmSync(tempRoot, { recursive: true, force: true });
});

describe("Workspace File Knowledge E2E", () => {
  it("turns a private uploaded file into Workspace-scoped Retrieval Knowledge", async () => {
    const workspace = getWorkspaceRepository().create({
      slug: `file-knowledge-${randomUUID()}`,
      name: "Private File Knowledge Workspace",
    });
    const body = Buffer.from(
      "OrbitPriceEvidence: private workspace agent price is USD 199 per class.",
      "utf8",
    );
    const uploaded = await ingestManualUpload({
      workspaceId: workspace.id,
      originalName: "workspace-pricing.txt",
      sourceName: "Workspace Pricing Evidence",
      mimeType: "text/plain",
      expectedSizeBytes: body.byteLength,
      expectedSha256: sha256(body),
      idempotencyKey: "workspace-file-knowledge-upload",
      chunks: chunks(body),
    });

    expect(uploaded.artifact.workspaceId).toBe(workspace.id);
    expect(uploaded.autoConversion.status).toBe("ENQUEUED");
    if (uploaded.autoConversion.status !== "ENQUEUED") {
      throw new Error("Expected Manual Upload to enqueue conversion");
    }

    const conversionRuns = getConversionRunLedgerRepository();
    const run = conversionRuns.list({
      workspaceId: workspace.id,
      rawArtifactId: uploaded.artifact.id,
      limit: 10,
    }).items[0];
    expect(run).toBeDefined();
    if (!run) return;
    const workers = getWorkerRegistryRepository();
    const worker = workers.create({
      workspaceId: workspace.id,
      displayName: "Workspace File Conversion Worker",
      desiredState: "ACTIVE",
      runtime: { runtimeId: "workspace-file-conversion", version: "1.0.0" },
      supportedJobTypes: ["LOCAL_FILE_SCAN"],
      connectorBindings: [
        { connectorId: "builtin-manual-upload", version: "1.0.0", capabilities: ["COLLECT"] },
      ],
      maxConcurrency: 1,
      labels: ["workspace-file-knowledge-e2e"],
    });
    workers.heartbeat(
      {
        workerId: worker.view.worker.id,
        observedAt: new Date().toISOString(),
        runtimeVersion: "1.0.0",
        health: "HEALTHY",
        activeLeaseIds: [],
      },
      worker.credential,
    );
    const runtime = getConversionRuntimeRepository();
    const capability: ConversionWorkerCapability = {
      contractVersion: CONVERSION_RUNTIME_VERSION,
      objectType: "CONVERSION_WORKER_CAPABILITY",
      id: "cwc_01ARZ3NDEKTSV4RRFFQ69G5FAV",
      workerId: worker.view.worker.id,
      capabilityRevision: 1,
      supportedConverters: [
        { converterId: run.converter.converterId, versions: [run.converter.version] },
      ],
      acceptedArtifactKinds: ["TEXT"],
      acceptedMimePatterns: ["text/plain"],
      supportedOutputFormats: ["MARKDOWN"],
      runtime: { runtimeId: "workspace-file-conversion", version: "1.0.0" },
      createdAt: new Date().toISOString(),
    };
    runtime.registerCapability(capability);

    const service = new ProductionConversionWorkerService();
    const claim = service.claim(
      {
        contractVersion: CONVERSION_RUNTIME_VERSION,
        objectType: "CONVERSION_CLAIM_REQUEST",
        id: "ccr_01ARZ3NDEKTSV4RRFFQ69G5FAV",
        workspaceId: workspace.id,
        workerId: worker.view.worker.id,
        workerCredentialId: "workspace-file-worker-credential",
        capabilityRevision: 1,
        supportedConverters: capability.supportedConverters,
        maxAcceptedWork: 1,
        idempotencyKey: "workspace-file-claim",
        requestedLeaseDurationSeconds: 120,
      },
      worker.credential,
    ).result;
    expect(claim.result).toBe("CLAIMED");
    const lease = claim.lease!;
    const readGrant = claim.rawArtifactReadGrant!;
    const uploadGrant = claim.stagingOutputUploadGrant!;

    const inputBytes = service.readInput(readGrant.id, worker.view.worker.id, worker.credential);
    expect(new TextDecoder().decode(inputBytes.bytes)).toBe(body.toString("utf8"));
    const reportBase = {
      contractVersion: CONVERSION_RUNTIME_VERSION,
      workspaceId: workspace.id,
      workerId: worker.view.worker.id,
      workerCredentialId: "workspace-file-worker-credential",
      conversionRunId: run.id,
      conversionAttemptId: lease.conversionAttemptId,
      conversionLeaseId: lease.id,
      leaseGeneration: lease.generation,
      leaseTokenReference: lease.tokenReference,
      leaseTokenDigest: lease.tokenDigest,
      occurredAt: new Date().toISOString(),
    } as const;
    const started: ConversionStartedReport = {
      ...reportBase,
      objectType: "CONVERSION_STARTED_REPORT",
      id: "csr_01ARZ3NDEKTSV4RRFFQ69G5FAV",
      idempotencyKey: "workspace-file-started",
      expectedCurrentStatus: "PENDING",
      converter: run.converter,
    };
    expect(service.submitReport(started, worker.credential).run.status).toBe("RUNNING");
    const source = getSourceRepository().getById(uploaded.sourceId)!;
    const artifact = getRawArtifactRepository().getArtifact(run.rawArtifactId)!.artifact;
    const metadata = canonicalDocumentMetadata(run, artifact, source);
    const markdown = new TextEncoder().encode(
      `${canonicalMarkdownFrontmatter(metadata)}\n# Workspace Pricing Evidence\n\n${body.toString("utf8")}\n`,
    );
    const outputReady: ConversionOutputReadyReport = {
      ...reportBase,
      objectType: "CONVERSION_OUTPUT_READY_REPORT",
      id: "cor_01ARZ3NDEKTSV4RRFFQ69G5FAV",
      idempotencyKey: "workspace-file-output-ready",
      expectedCurrentStatus: "RUNNING",
      output: {
        uploadGrantId: uploadGrant.id,
        targetPath: uploadGrant.normalizedTargetPath,
        sha256: sha256(markdown),
        sizeBytes: markdown.byteLength,
        mediaType: "text/markdown",
      },
    };
    expect(service.submitReport(outputReady, worker.credential).run.status).toBe("VERIFYING");
    const committed = service.commitStaging(
      {
        workspaceId: workspace.id,
        workerId: worker.view.worker.id,
        conversionRunId: run.id,
        conversionAttemptId: lease.conversionAttemptId,
        uploadGrantId: uploadGrant.id,
        idempotencyKey: "workspace-file-staging-commit",
        content: markdown,
      },
      worker.credential,
    );
    expect(committed.finalizationDecision).toBe("COMPLETED");
    expect(committed.readyPackageId).toBeTruthy();
    expect(getReadyPackageRepository().list(workspace.id)).toHaveLength(1);

    const retrieval = getRetrievalIndexRepository().search({
      workspaceId: workspace.id,
      query: "OrbitPriceEvidence",
      limit: 10,
    });
    expect(retrieval.items).toHaveLength(1);
    expect(retrieval.items[0]?.document.sourceId).toBe(uploaded.sourceId);
    expect(retrieval.items[0]?.document.workspaceId).toBe(workspace.id);
  });
});
