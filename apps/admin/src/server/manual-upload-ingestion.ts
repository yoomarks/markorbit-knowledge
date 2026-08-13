import { createHash } from "node:crypto";
import type { ArtifactKind, RawArtifact, SourceDefinition } from "@markorbit/contracts";
import {
  RegistryConflictError,
  RegistryError,
  RegistryValidationError,
} from "@markorbit/persistence";
import { claimSpecificJob } from "@markorbit/persistence/targeted-worker-claim";
import { dispatchAutomaticConversionForArtifact } from "./raw-artifact-auto-conversion";
import {
  getCollectionPlanRepository,
  getConnectorRepository,
  getExecutionLedgerRepository,
  getRawArtifactRepository,
  getRegistryDatabase,
  getSourceRepository,
  getWorkerExecutionRepository,
  getWorkerRegistryRepository,
} from "./source-registry";

const MANUAL_CONNECTOR_ID = "builtin-manual-upload";
const MANUAL_CONNECTOR_VERSION = "1.0.0";
const MANUAL_SOURCE_TAG = "manual-file";
const MANUAL_PLAN_MARKER = "manual-upload";
const MANUAL_EXECUTOR = {
  executorId: "admin-manual-upload",
  version: "1.0.0",
  mode: "PRODUCTION" as const,
};
const DEFAULT_MANUAL_UPLOAD_MAX_BYTES = 25 * 1024 * 1024;

const EXACT_MIME_KIND = new Map<string, ArtifactKind>([
  ["text/markdown", "MARKDOWN"],
  ["text/html", "HTML"],
  ["application/xhtml+xml", "HTML"],
  ["application/pdf", "PDF"],
  ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "DOCX"],
  ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "XLSX"],
  ["text/csv", "CSV"],
  ["application/csv", "CSV"],
  ["application/json", "JSON"],
  ["text/json", "JSON"],
  ["application/xml", "XML"],
  ["text/xml", "XML"],
  ["message/rfc822", "EMAIL"],
  ["text/plain", "TEXT"],
]);
const ALLOWED_IMAGE_MIME = new Set(["image/png", "image/jpeg", "image/webp", "image/tiff"]);
const MANUAL_OUTPUT_KINDS: ArtifactKind[] = [
  "MARKDOWN",
  "HTML",
  "PDF",
  "DOCX",
  "XLSX",
  "CSV",
  "JSON",
  "XML",
  "EMAIL",
  "TEXT",
  "IMAGE",
];

export type ManualUploadInput = {
  workspaceId: string;
  originalName: string;
  mimeType: string;
  expectedSizeBytes: number;
  expectedSha256: string;
  idempotencyKey: string;
  chunks: AsyncIterable<Uint8Array>;
  sourceId?: string;
  sourceName?: string;
  jurisdictions?: string[];
  languages?: string[];
  relatedSourceId?: string;
};

export type ManualUploadResult = {
  artifact: RawArtifact;
  replayed: boolean;
  runId: string;
  sourceId: string;
  sourceName: string;
  autoConversion:
    | { status: "NOT_APPLICABLE" | "ALREADY_PROCESSED" | "ENQUEUED" | "REPLAYED" }
    | { status: "FAILED"; code: string };
};

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function operationKey(prefix: string, workspaceId: string, idempotencyKey: string): string {
  return `${prefix}:${digest(`${workspaceId}:${idempotencyKey}`).slice(0, 48)}`;
}

function normalizedWorkspaceId(value: string): string {
  const workspaceId = value.trim();
  if (!/^wsp_[0-9A-HJKMNP-TV-Z]{26}$/.test(workspaceId)) {
    throw new RegistryValidationError("A valid workspaceId is required for Manual Upload");
  }
  const exists = getRegistryDatabase()
    .prepare("SELECT 1 AS present FROM workspaces WHERE id = ?")
    .get(workspaceId) as { present: number } | undefined;
  if (!exists) {
    throw new RegistryError("WORKSPACE_NOT_FOUND", `Workspace ${workspaceId} was not found`);
  }
  return workspaceId;
}

function normalizedIdempotencyKey(value: string): string {
  const key = value.trim();
  if (key.length < 1 || key.length > 128) {
    throw new RegistryValidationError("Idempotency-Key must contain 1 to 128 characters");
  }
  return key;
}

export function manualUploadMaxBytes(): number {
  const configured = process.env.MARKORBIT_MANUAL_UPLOAD_MAX_BYTES?.trim();
  if (!configured) return DEFAULT_MANUAL_UPLOAD_MAX_BYTES;
  const parsed = Number(configured);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new RegistryValidationError(
      "MARKORBIT_MANUAL_UPLOAD_MAX_BYTES must be a positive safe integer",
    );
  }
  return parsed;
}

export function normalizeManualUploadFilename(value: string): string {
  const name = value.trim();
  if (!name || name.length > 255) {
    throw new RegistryValidationError("Manual Upload filename must contain 1 to 255 characters");
  }
  if (/[\u0000-\u001f\u007f]/.test(name)) {
    throw new RegistryValidationError("Manual Upload filename contains control characters");
  }
  if (name === "." || name === ".." || name.includes("/") || name.includes("\\")) {
    throw new RegistryValidationError("Manual Upload filename must not contain a path");
  }
  return name;
}

export function deriveManualSourceName(filename: string): string {
  const normalized = normalizeManualUploadFilename(filename);
  const dot = normalized.lastIndexOf(".");
  const withoutExtension = dot > 0 ? normalized.slice(0, dot) : normalized;
  const cleaned = withoutExtension.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  return cleaned || normalized;
}

export function artifactKindForManualUploadMime(value: string): ArtifactKind {
  const mimeType = value.trim().toLowerCase();
  const exact = EXACT_MIME_KIND.get(mimeType);
  if (exact) return exact;
  if (ALLOWED_IMAGE_MIME.has(mimeType)) return "IMAGE";
  throw new RegistryValidationError(
    `Manual Upload media type ${mimeType || "(empty)"} is not supported`,
  );
}

function normalizeExpectedSize(value: number): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RegistryValidationError("Manual Upload size must be a positive safe integer");
  }
  const maximum = manualUploadMaxBytes();
  if (value > maximum) {
    throw new RegistryValidationError(`Manual Upload exceeds the ${maximum} byte limit`);
  }
  return value;
}

function normalizeExpectedSha256(value: string): string {
  const sha256 = value.trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(sha256)) {
    throw new RegistryValidationError("Manual Upload requires a lowercase SHA-256 digest");
  }
  return sha256;
}

function normalizeList(values: string[] | undefined, upperCase = false): string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))].map((value) =>
    upperCase ? value.toUpperCase() : value,
  );
}

async function* boundedChunks(
  chunks: AsyncIterable<Uint8Array>,
  maxBytes: number,
): AsyncIterable<Uint8Array> {
  let observedBytes = 0;
  for await (const chunk of chunks) {
    observedBytes += chunk.byteLength;
    if (observedBytes > maxBytes) {
      throw new RegistryValidationError(`Manual Upload exceeds the ${maxBytes} byte limit`);
    }
    if (chunk.byteLength > 0) yield chunk;
  }
}

function ensureManualConnector(): void {
  const connectors = getConnectorRepository();
  if (connectors.get(MANUAL_CONNECTOR_ID, MANUAL_CONNECTOR_VERSION)) return;
  try {
    connectors.create({
      connectorId: MANUAL_CONNECTOR_ID,
      displayName: "Built-in Manual Upload",
      version: MANUAL_CONNECTOR_VERSION,
      sourceTypes: ["MANUAL_UPLOAD"],
      runtime: "LOCAL_AGENT",
      capabilities: ["COLLECT", "IMPORT"],
      supportedJobTypes: ["LOCAL_FILE_SCAN"],
      configurationSchema: { type: "object", properties: {}, additionalProperties: false },
      secretSchema: { type: "object", properties: {}, additionalProperties: false },
      outputArtifactKinds: MANUAL_OUTPUT_KINDS,
      healthCheck: { mode: "NONE", timeoutSeconds: 1 },
      status: "ACTIVE",
      extensions: { "x-markorbit-system-connector": "manual-upload" },
    });
  } catch (error) {
    if (
      !(error instanceof RegistryConflictError) ||
      error.code !== "CONNECTOR_VERSION_CONFLICT" ||
      !connectors.get(MANUAL_CONNECTOR_ID, MANUAL_CONNECTOR_VERSION)
    ) {
      throw error;
    }
  }
}

function validateRelatedSource(workspaceId: string, relatedSourceId: string | undefined): string | null {
  const id = relatedSourceId?.trim();
  if (!id) return null;
  const related = getSourceRepository().getById(id);
  if (!related) {
    throw new RegistryError("SOURCE_NOT_FOUND", `Related Source ${id} was not found`);
  }
  if (related.workspaceId !== workspaceId) {
    throw new RegistryConflictError(
      "MANUAL_UPLOAD_RELATED_SOURCE_WORKSPACE_MISMATCH",
      "Related Source must belong to the same Workspace",
    );
  }
  return related.id;
}

function validateExistingManualSource(workspaceId: string, sourceId: string): SourceDefinition {
  const source = getSourceRepository().getById(sourceId);
  if (!source) throw new RegistryError("SOURCE_NOT_FOUND", `Source ${sourceId} was not found`);
  if (source.workspaceId !== workspaceId) {
    throw new RegistryConflictError(
      "MANUAL_UPLOAD_SOURCE_WORKSPACE_MISMATCH",
      "Manual file Source must belong to the requested Workspace",
    );
  }
  if (
    source.sourceType !== "MANUAL_UPLOAD" ||
    source.connector.connectorId !== MANUAL_CONNECTOR_ID ||
    source.connector.version !== MANUAL_CONNECTOR_VERSION
  ) {
    throw new RegistryConflictError(
      "MANUAL_UPLOAD_SOURCE_INCOMPATIBLE",
      "Files can only be added directly to a MANUAL_UPLOAD Source bound to the Manual Upload connector",
    );
  }
  if (source.status !== "ACTIVE") {
    throw new RegistryConflictError(
      "MANUAL_UPLOAD_SOURCE_INACTIVE",
      "Files can only be added to an ACTIVE Manual Upload Source",
    );
  }
  return source;
}

function ensureManualSource(
  workspaceId: string,
  idempotencyKey: string,
  originalName: string,
  input: Pick<ManualUploadInput, "sourceId" | "sourceName" | "jurisdictions" | "languages" | "relatedSourceId">,
): SourceDefinition {
  ensureManualConnector();
  if (input.sourceId?.trim()) {
    return validateExistingManualSource(workspaceId, input.sourceId.trim());
  }

  const sources = getSourceRepository();
  const slug = `manual-${digest(`${workspaceId}:${idempotencyKey}`).slice(0, 24)}`;
  const existing = sources
    .list({ workspaceId, sourceType: "MANUAL_UPLOAD", q: slug, limit: 100 })
    .items.find((source) => source.slug === slug);
  if (existing) return validateExistingManualSource(workspaceId, existing.id);

  const requestedName = input.sourceName?.trim();
  const sourceName = requestedName || deriveManualSourceName(originalName);
  if (!sourceName || sourceName.length > 300) {
    throw new RegistryValidationError("Manual file Source name must contain 1 to 300 characters");
  }
  const relatedSourceId = validateRelatedSource(workspaceId, input.relatedSourceId);
  const jurisdictions = normalizeList(input.jurisdictions, true);
  const languages = normalizeList(input.languages);
  const entrypoint = `manual-upload://${workspaceId}/${slug}`;

  try {
    return sources.create({
      workspaceId,
      name: sourceName,
      slug,
      sourceType: "MANUAL_UPLOAD",
      category: "USER_PROVIDED",
      authorityLevel: "UNKNOWN",
      status: "ACTIVE",
      jurisdictions,
      languages,
      connector: { connectorId: MANUAL_CONNECTOR_ID, version: MANUAL_CONNECTOR_VERSION },
      connectorConfig: {},
      canonicalUri: entrypoint,
      entrypoints: [{ uri: entrypoint, label: sourceName }],
      tags: [MANUAL_SOURCE_TAG, "user-provided"],
      extensions: {
        "x-markorbit-ingress": "manual-file",
        ...(relatedSourceId
          ? {
              "x-markorbit-related-source-id": relatedSourceId,
              "x-markorbit-source-relationship": "RELATED_PUBLICATION",
            }
          : {}),
      },
    });
  } catch (error) {
    if (error instanceof RegistryConflictError && error.code === "SOURCE_SLUG_CONFLICT") {
      const raced = sources
        .list({ workspaceId, sourceType: "MANUAL_UPLOAD", q: slug, limit: 100 })
        .items.find((source) => source.slug === slug);
      if (raced) return validateExistingManualSource(workspaceId, raced.id);
    }
    throw error;
  }
}

function ensureManualPlan(workspaceId: string, source: SourceDefinition) {
  const plans = getCollectionPlanRepository();
  const existing = plans
    .listForSource(source.id)
    .find(
      ({ plan }) =>
        plan.status === "ACTIVE" &&
        plan.extensions?.["x-markorbit-system-plan"] === MANUAL_PLAN_MARKER,
    );
  if (existing) {
    if (!source.defaultCollectionPlanId) {
      plans.setSourceDefaultPlan(source.id, existing.plan.id, source.updatedAt);
    }
    return existing.plan;
  }

  const plan = plans.create({
    workspaceId,
    sourceId: source.id,
    name: "Manual file import",
    status: "ACTIVE",
    schedule: { mode: "MANUAL" },
    priority: "NORMAL",
    policy: {
      includePatterns: [],
      excludePatterns: [],
      maxDepth: 0,
      maxItems: 1,
      renderJavascript: false,
      fetchAttachments: false,
      respectRobots: false,
      rateLimitPerMinute: 60,
      timeoutSeconds: 300,
      retry: { maxAttempts: 1, backoffSeconds: 0 },
    },
    output: { artifactKinds: MANUAL_OUTPUT_KINDS },
    extensions: { "x-markorbit-system-plan": MANUAL_PLAN_MARKER },
  }).plan;
  if (!source.defaultCollectionPlanId) {
    plans.setSourceDefaultPlan(source.id, plan.id, source.updatedAt);
  }
  return plan;
}

function assertReplayMatches(
  artifact: RawArtifact,
  input: {
    workspaceId: string;
    originalName: string;
    mimeType: string;
    artifactKind: ArtifactKind;
    sizeBytes: number;
    sha256: string;
  },
): void {
  const matches =
    artifact.workspaceId === input.workspaceId &&
    artifact.originalName === input.originalName &&
    artifact.mimeType === input.mimeType &&
    artifact.artifactKind === input.artifactKind &&
    artifact.sizeBytes === input.sizeBytes &&
    artifact.binaryHash.value === input.sha256;
  if (!matches) {
    throw new RegistryConflictError(
      "MANUAL_UPLOAD_IDEMPOTENCY_CONFLICT",
      "Idempotency-Key was reused with different Manual Upload bytes or metadata",
    );
  }
}

function completedReplay(
  workspaceId: string,
  runId: string,
  expected: {
    originalName: string;
    mimeType: string;
    artifactKind: ArtifactKind;
    sizeBytes: number;
    sha256: string;
  },
): RawArtifact | null {
  const artifacts = getRawArtifactRepository().list({ workspaceId, runId, limit: 2 }).items;
  if (artifacts.length === 0) return null;
  if (artifacts.length !== 1) {
    throw new RegistryConflictError(
      "MANUAL_UPLOAD_REPLAY_AMBIGUOUS",
      "Completed Manual Upload run has unexpected artifact cardinality",
    );
  }
  const artifact = artifacts[0].artifact;
  assertReplayMatches(artifact, { workspaceId, ...expected });
  return artifact;
}

function autoConversion(
  artifactId: string,
  workspaceId: string,
): ManualUploadResult["autoConversion"] {
  try {
    const result = dispatchAutomaticConversionForArtifact(artifactId, workspaceId);
    return { status: result.status };
  } catch (error) {
    return {
      status: "FAILED",
      code: error instanceof RegistryError ? error.code : "AUTO_CONVERSION_DISPATCH_FAILED",
    };
  }
}

export async function ingestManualUpload(input: ManualUploadInput): Promise<ManualUploadResult> {
  const workspaceId = normalizedWorkspaceId(input.workspaceId);
  const idempotencyKey = normalizedIdempotencyKey(input.idempotencyKey);
  const originalName = normalizeManualUploadFilename(input.originalName);
  const mimeType = input.mimeType.trim().toLowerCase();
  const artifactKind = artifactKindForManualUploadMime(mimeType);
  const expectedSizeBytes = normalizeExpectedSize(input.expectedSizeBytes);
  const expectedSha256 = normalizeExpectedSha256(input.expectedSha256);
  const maximumBytes = manualUploadMaxBytes();

  const source = ensureManualSource(workspaceId, idempotencyKey, originalName, input);
  const plan = ensureManualPlan(workspaceId, source);
  const runDispatch = getExecutionLedgerRepository().dispatchManual({
    planId: plan.id,
    requestedBy: { actorType: "LOCAL_ADMIN", actorId: "manual-upload" },
    idempotencyKey: operationKey("manual-upload-run", workspaceId, idempotencyKey),
  });
  const run = runDispatch.record.run;
  const targetJob = runDispatch.record.jobs[0];
  if (!targetJob || runDispatch.record.jobs.length !== 1) {
    throw new RegistryConflictError(
      "MANUAL_UPLOAD_JOB_CARDINALITY",
      "Manual Upload requires exactly one governed Job",
    );
  }

  if (runDispatch.replayed) {
    const replayedArtifact = completedReplay(workspaceId, run.id, {
      originalName,
      mimeType,
      artifactKind,
      sizeBytes: expectedSizeBytes,
      sha256: expectedSha256,
    });
    if (replayedArtifact) {
      return {
        artifact: replayedArtifact,
        replayed: true,
        runId: run.id,
        sourceId: source.id,
        sourceName: source.name,
        autoConversion: autoConversion(replayedArtifact.id, workspaceId),
      };
    }
    if (run.status !== "PENDING" || targetJob.status !== "PENDING") {
      throw new RegistryConflictError(
        "MANUAL_UPLOAD_IN_PROGRESS_OR_INCOMPLETE",
        "This Manual Upload idempotency key already has an unfinished execution",
        { runId: run.id, status: run.status, jobStatus: targetJob.status },
      );
    }
  }

  const workers = getWorkerRegistryRepository();
  const executions = getWorkerExecutionRepository();
  const artifacts = getRawArtifactRepository();
  const workerCreation = workers.create({
    workspaceId,
    displayName: `Manual upload ${run.id}`,
    runtime: { runtimeId: "admin-manual-upload", version: "1.0.0" },
    supportedJobTypes: ["LOCAL_FILE_SCAN"],
    connectorBindings: [
      {
        connectorId: MANUAL_CONNECTOR_ID,
        version: MANUAL_CONNECTOR_VERSION,
        capabilities: ["COLLECT", "IMPORT"],
      },
    ],
    maxConcurrency: 1,
    labels: ["manual-upload", "ephemeral"],
    extensions: { "x-markorbit-purpose": "manual-upload-ingestion" },
  });
  const workerId = workerCreation.view.worker.id;
  const credential = workerCreation.credential;
  let leaseId: string | null = null;
  let leaseToken: string | null = null;
  let sessionId: string | null = null;

  try {
    workers.heartbeat(
      {
        workerId,
        observedAt: new Date().toISOString(),
        runtimeVersion: "1.0.0",
        health: "HEALTHY",
        activeLeaseIds: [],
      },
      credential,
    );
    const claim = claimSpecificJob(getRegistryDatabase(), workerId, credential, targetJob.id);
    if (!claim.job || !claim.lease || !claim.leaseToken || claim.job.runId !== run.id) {
      throw new RegistryConflictError(
        "MANUAL_UPLOAD_JOB_CLAIM_FAILED",
        "Manual Upload execution could not claim its governed Job",
      );
    }
    leaseId = claim.lease.id;
    leaseToken = claim.leaseToken;

    executions.start(workerId, credential, leaseId, leaseToken, {
      executor: MANUAL_EXECUTOR,
      idempotencyKey: operationKey("manual-start", workspaceId, idempotencyKey),
    });

    const session = artifacts.createSession({
      workerId,
      credential,
      leaseId,
      leaseToken,
      idempotencyKey: operationKey("manual-artifact", workspaceId, idempotencyKey),
      descriptor: {
        artifactKind,
        mimeType,
        originalName,
        expectedSizeBytes,
        expectedSha256,
        sourceUri: `manual-upload://${workspaceId}/${source.id}/${encodeURIComponent(originalName)}?sha256=${expectedSha256}`,
      },
    });
    sessionId = session.record.session.id;

    executions.markUploading(workerId, credential, leaseId, leaseToken, {
      idempotencyKey: operationKey("manual-uploading", workspaceId, idempotencyKey),
    });
    await artifacts.uploadContent(
      workerId,
      credential,
      leaseId,
      leaseToken,
      sessionId,
      boundedChunks(input.chunks, maximumBytes),
    );
    executions.markVerifying(workerId, credential, leaseId, leaseToken, {
      idempotencyKey: operationKey("manual-verifying", workspaceId, idempotencyKey),
    });
    const finalized = await artifacts.finalize(
      workerId,
      credential,
      leaseId,
      leaseToken,
      sessionId,
    );
    executions.complete(workerId, credential, leaseId, leaseToken, {
      idempotencyKey: operationKey("manual-complete", workspaceId, idempotencyKey),
      receipt: {
        executor: MANUAL_EXECUTOR,
        outputKinds: [artifactKind],
        itemsObserved: 1,
        bytesPrepared: expectedSizeBytes,
        metadataOnly: false,
        artifactReceiptIds: [finalized.receipt.id],
        summary: `Manual file imported through Source ${source.id}`,
      },
    });

    const currentWorker = workers.getById(workerId);
    if (currentWorker) {
      workers.update(workerId, { desiredState: "DISABLED" }, currentWorker.worker.updatedAt);
    }

    return {
      artifact: finalized.artifact.artifact,
      replayed: false,
      runId: run.id,
      sourceId: source.id,
      sourceName: source.name,
      autoConversion: autoConversion(finalized.artifact.artifact.id, workspaceId),
    };
  } catch (error) {
    if (sessionId && leaseId && leaseToken) {
      try {
        artifacts.abort(
          workerId,
          credential,
          leaseId,
          leaseToken,
          sessionId,
          "Manual Upload failed",
        );
      } catch {
        // Preserve the primary failure. The durable ingestion/session state remains inspectable.
      }
    }
    if (leaseId && leaseToken) {
      try {
        executions.fail(workerId, credential, leaseId, leaseToken, {
          code: "MANUAL_UPLOAD_FAILED",
          message: error instanceof Error ? error.message.slice(0, 1000) : "Manual Upload failed",
          retryable: false,
          idempotencyKey: operationKey("manual-failed", workspaceId, idempotencyKey),
        });
      } catch {
        // Preserve the primary failure.
      }
    }
    try {
      const currentWorker = workers.getById(workerId);
      if (currentWorker) {
        workers.update(workerId, { desiredState: "DISABLED" }, currentWorker.worker.updatedAt);
      }
    } catch {
      // Preserve the primary failure.
    }
    throw error;
  }
}
