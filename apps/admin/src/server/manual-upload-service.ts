import { createHash } from "node:crypto";
import { basename, extname } from "node:path";
import type { ArtifactKind, ExecutionActor, RawArtifact } from "@markorbit/contracts";
import { RegistryConflictError, RegistryValidationError } from "@markorbit/persistence";
import { SqliteManualUploadRequestRepository, manualUploadRequestFingerprint } from "@markorbit/persistence/manual-uploads";
import { ensureManualUploadProductionConnector, MANUAL_UPLOAD_PRODUCTION_CONNECTOR } from "./manual-upload-production-connector";
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

export const MANUAL_UPLOAD_MAX_BYTES = 25 * 1024 * 1024;

const ALLOWED_UPLOADS = {
  ".md": { mimeTypes: ["text/markdown", "text/plain"], artifactKind: "MARKDOWN" },
  ".txt": { mimeTypes: ["text/plain"], artifactKind: "TEXT" },
  ".pdf": { mimeTypes: ["application/pdf"], artifactKind: "PDF" },
  ".docx": {
    mimeTypes: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
    artifactKind: "DOCX",
  },
  ".csv": { mimeTypes: ["text/csv", "application/csv"], artifactKind: "CSV" },
  ".json": { mimeTypes: ["application/json", "text/json"], artifactKind: "JSON" },
} as const satisfies Record<
  string,
  { mimeTypes: readonly string[]; artifactKind: Extract<ArtifactKind, "MARKDOWN" | "TEXT" | "PDF" | "DOCX" | "CSV" | "JSON"> }
>;

type AllowedArtifactKind = (typeof ALLOWED_UPLOADS)[keyof typeof ALLOWED_UPLOADS]["artifactKind"];

export type ManualUploadCommand = {
  workspaceId: string;
  actor: ExecutionActor & { actorId: string };
  idempotencyKey: string;
  file: File;
};

export type ManualUploadResult = {
  requestId: string;
  replayed: boolean;
  artifact: RawArtifact;
  runId: string;
};

function clean(value: string, field: string, max = 200): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > max) {
    throw new RegistryValidationError(`${field} must contain 1 to ${max} characters`);
  }
  return normalized;
}

function safeName(value: string): string {
  const name = basename(value.replace(/[\u0000-\u001f\u007f]/g, "")).trim();
  if (!name || name === "." || name === "..") {
    throw new RegistryValidationError("Manual upload filename is invalid");
  }
  if (name !== value && (value.includes("/") || value.includes("\\"))) {
    throw new RegistryValidationError("Manual upload filename must not contain a path");
  }
  return name.slice(0, 255);
}

export function manualUploadPolicy(file: Pick<File, "name" | "type" | "size">): {
  originalName: string;
  mimeType: string;
  artifactKind: AllowedArtifactKind;
} {
  const originalName = safeName(file.name);
  if (!Number.isSafeInteger(file.size) || file.size <= 0 || file.size > MANUAL_UPLOAD_MAX_BYTES) {
    throw new RegistryValidationError(
      `Manual upload must contain 1 to ${MANUAL_UPLOAD_MAX_BYTES} bytes`,
    );
  }
  const extension = extname(originalName).toLowerCase() as keyof typeof ALLOWED_UPLOADS;
  const policy = ALLOWED_UPLOADS[extension];
  if (!policy) throw new RegistryValidationError("Manual upload file extension is not supported");
  const mimeType = clean(file.type, "file.type", 200).toLowerCase();
  if (!(policy.mimeTypes as readonly string[]).includes(mimeType)) {
    throw new RegistryValidationError(
      `Manual upload content type ${mimeType} does not match ${extension}`,
    );
  }
  return { originalName, mimeType, artifactKind: policy.artifactKind };
}

function defaultManualSource(workspaceId: string) {
  const sources = getSourceRepository();
  const existing = sources.list({ workspaceId, sourceType: "MANUAL_UPLOAD", limit: 100 }).items.find(
    (source) =>
      source.slug === "manual-uploads" &&
      source.connector.connectorId === MANUAL_UPLOAD_PRODUCTION_CONNECTOR.connectorId &&
      source.connector.version === MANUAL_UPLOAD_PRODUCTION_CONNECTOR.version,
  );
  if (existing) {
    if (existing.status !== "ACTIVE") {
      throw new RegistryConflictError(
        "MANUAL_UPLOAD_SOURCE_INACTIVE",
        "The governed Manual Upload source exists but is not ACTIVE",
      );
    }
    return existing;
  }
  return sources.create({
    workspaceId,
    name: "Manual Uploads",
    slug: "manual-uploads",
    sourceType: "MANUAL_UPLOAD",
    category: "USER_PROVIDED",
    authorityLevel: "UNKNOWN",
    status: "ACTIVE",
    jurisdictions: [],
    languages: [],
    connector: { ...MANUAL_UPLOAD_PRODUCTION_CONNECTOR },
    connectorConfig: {},
    entrypoints: [{ uri: `manual-upload://${workspaceId}/`, label: "Governed operator uploads" }],
    tags: ["manual-upload", "user-provided"],
    extensions: { "x-markorbit-governed-ingress": true },
  });
}

function defaultManualPlan(sourceId: string, workspaceId: string) {
  const plans = getCollectionPlanRepository();
  const existing = plans.listForSource(sourceId).find(
    (record) => record.plan.extensions?.["x-markorbit-manual-upload-plan"] === true,
  );
  if (existing) {
    if (existing.plan.status !== "ACTIVE") {
      throw new RegistryConflictError(
        "MANUAL_UPLOAD_PLAN_INACTIVE",
        "The governed Manual Upload plan exists but is not ACTIVE",
      );
    }
    return existing.plan;
  }
  return plans.create({
    workspaceId,
    sourceId,
    name: "Manual Upload — governed single-file ingestion",
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
      timeoutSeconds: 120,
      retry: { maxAttempts: 1, backoffSeconds: 0 },
    },
    output: { artifactKinds: ["MARKDOWN", "TEXT", "PDF", "DOCX", "CSV", "JSON"] },
    extensions: { "x-markorbit-manual-upload-plan": true },
  }).plan;
}

async function oneChunk(bytes: Uint8Array): Promise<AsyncIterable<Uint8Array>> {
  return (async function* () {
    yield bytes;
  })();
}

export async function ingestManualUpload(command: ManualUploadCommand): Promise<ManualUploadResult> {
  const workspaceId = clean(command.workspaceId, "workspaceId", 80);
  const idempotencyKey = clean(command.idempotencyKey, "idempotencyKey", 128);
  const actorId = clean(command.actor.actorId, "actor.actorId", 200);
  if (command.actor.actorType !== "LOCAL_ADMIN" && command.actor.actorType !== "API_CLIENT") {
    throw new RegistryValidationError("Manual upload requires LOCAL_ADMIN or API_CLIENT authority");
  }
  const policy = manualUploadPolicy(command.file);
  const bytes = new Uint8Array(await command.file.arrayBuffer());
  if (bytes.byteLength !== command.file.size) {
    throw new RegistryConflictError(
      "MANUAL_UPLOAD_SIZE_CHANGED",
      "Manual upload size changed while reading the file",
    );
  }
  const fileSha256 = createHash("sha256").update(bytes).digest("hex");

  ensureManualUploadProductionConnector(getConnectorRepository());
  const source = defaultManualSource(workspaceId);
  if (source.workspaceId !== workspaceId) {
    throw new RegistryConflictError(
      "MANUAL_UPLOAD_WORKSPACE_MISMATCH",
      "Manual Upload source is outside the requested Workspace",
    );
  }
  const plan = defaultManualPlan(source.id, workspaceId);
  const requestFingerprint = manualUploadRequestFingerprint({
    workspaceId,
    sourceId: source.id,
    originalName: policy.originalName,
    mimeType: policy.mimeType,
    artifactKind: policy.artifactKind,
    fileSizeBytes: bytes.byteLength,
    fileSha256,
    actorType: command.actor.actorType,
    actorId,
  });
  const requests = new SqliteManualUploadRequestRepository(getRegistryDatabase());
  let prepared = requests.prepare({
    workspaceId,
    sourceId: source.id,
    idempotencyKey,
    requestSha256: requestFingerprint,
    fileSha256,
    fileSizeBytes: bytes.byteLength,
    originalName: policy.originalName,
    mimeType: policy.mimeType,
    artifactKind: policy.artifactKind,
    actorType: command.actor.actorType,
    actorId,
  });

  if (prepared.record.status === "COMPLETED" && prepared.record.artifactId && prepared.record.runId) {
    const prior = getRawArtifactRepository().getArtifact(prepared.record.artifactId);
    if (!prior) {
      throw new RegistryConflictError(
        "MANUAL_UPLOAD_EVIDENCE_MISSING",
        "Completed manual upload no longer resolves to its immutable RawArtifact",
      );
    }
    return {
      requestId: prepared.record.requestId,
      replayed: true,
      artifact: prior.artifact,
      runId: prepared.record.runId,
    };
  }

  const ledger = getExecutionLedgerRepository();
  let runId = prepared.record.runId;
  if (!runId) {
    const dispatch = ledger.dispatchManual({
      planId: plan.id,
      requestedBy: { actorType: command.actor.actorType, actorId },
      idempotencyKey: `manual-upload-${prepared.record.requestId}`.slice(0, 128),
    });
    runId = dispatch.record.run.id;
    prepared = { record: requests.bindRun(prepared.record.requestId, runId), replayed: prepared.replayed };
  }

  const priorArtifact = getRawArtifactRepository().list({ runId, limit: 10 }).items[0];
  if (priorArtifact) {
    const session = getRawArtifactRepository().getSession(priorArtifact.sessionId);
    if (!session?.receipt) {
      throw new RegistryConflictError(
        "MANUAL_UPLOAD_EVIDENCE_INCOMPLETE",
        "Manual upload RawArtifact is missing its finalized receipt",
      );
    }
    requests.complete(prepared.record.requestId, priorArtifact.artifact.id, session.receipt.id);
    return {
      requestId: prepared.record.requestId,
      replayed: true,
      artifact: priorArtifact.artifact,
      runId,
    };
  }

  const workers = getWorkerRegistryRepository();
  workers.reapExpired();
  getWorkerExecutionRepository().reconcileExpired();
  const worker = workers.create({
    workspaceId,
    displayName: `Manual Upload ${prepared.record.requestId}`,
    runtime: { runtimeId: "manual-upload-admin", version: "1.0.0" },
    supportedJobTypes: ["LOCAL_FILE_SCAN"],
    connectorBindings: [
      {
        connectorId: MANUAL_UPLOAD_PRODUCTION_CONNECTOR.connectorId,
        version: MANUAL_UPLOAD_PRODUCTION_CONNECTOR.version,
        capabilities: ["COLLECT", "IMPORT"],
      },
    ],
    maxConcurrency: 1,
    labels: ["manual-upload", "ephemeral-admin-worker"],
    extensions: {
      "x-markorbit-manual-upload-request-id": prepared.record.requestId,
      "x-markorbit-actor-id": actorId,
    },
  });
  workers.heartbeat(
    {
      workerId: worker.view.worker.id,
      observedAt: new Date().toISOString(),
      runtimeVersion: worker.view.worker.runtime.version,
      health: "HEALTHY",
      activeLeaseIds: [],
    },
    worker.credential,
  );
  const claimed = workers.claim(worker.view.worker.id, worker.credential);
  if (!claimed.job || !claimed.lease || !claimed.leaseToken || claimed.job.runId !== runId) {
    throw new RegistryConflictError(
      "MANUAL_UPLOAD_JOB_NOT_AVAILABLE",
      "The governed Manual Upload run is not currently claimable; retry after lease reconciliation",
    );
  }

  const executions = getWorkerExecutionRepository();
  const executor = { executorId: "manual-upload-admin", version: "1.0.0", mode: "PRODUCTION" } as const;
  executions.start(worker.view.worker.id, worker.credential, claimed.lease.id, claimed.leaseToken, {
    executor,
    idempotencyKey: `manual-upload-start-${prepared.record.requestId}`.slice(0, 128),
  });
  executions.markUploading(
    worker.view.worker.id,
    worker.credential,
    claimed.lease.id,
    claimed.leaseToken,
    { idempotencyKey: `manual-upload-uploading-${prepared.record.requestId}`.slice(0, 128) },
  );

  const artifacts = getRawArtifactRepository();
  const sessionResult = artifacts.createSession({
    workerId: worker.view.worker.id,
    credential: worker.credential,
    leaseId: claimed.lease.id,
    leaseToken: claimed.leaseToken,
    descriptor: {
      artifactKind: policy.artifactKind,
      mimeType: policy.mimeType,
      originalName: policy.originalName,
      expectedSizeBytes: bytes.byteLength,
      expectedSha256: fileSha256,
      sourceUri: `manual-upload://${workspaceId}/${prepared.record.requestId}/${encodeURIComponent(policy.originalName)}`,
    },
    idempotencyKey: `manual-upload-artifact-${prepared.record.requestId}`.slice(0, 128),
  });
  await artifacts.uploadContent(
    worker.view.worker.id,
    worker.credential,
    claimed.lease.id,
    claimed.leaseToken,
    sessionResult.record.session.id,
    await oneChunk(bytes),
  );
  executions.markVerifying(
    worker.view.worker.id,
    worker.credential,
    claimed.lease.id,
    claimed.leaseToken,
    { idempotencyKey: `manual-upload-verifying-${prepared.record.requestId}`.slice(0, 128) },
  );
  const finalized = await artifacts.finalize(
    worker.view.worker.id,
    worker.credential,
    claimed.lease.id,
    claimed.leaseToken,
    sessionResult.record.session.id,
  );
  executions.complete(worker.view.worker.id, worker.credential, claimed.lease.id, claimed.leaseToken, {
    idempotencyKey: `manual-upload-complete-${prepared.record.requestId}`.slice(0, 128),
    receipt: {
      executor,
      outputKinds: [policy.artifactKind],
      itemsObserved: 1,
      bytesPrepared: bytes.byteLength,
      metadataOnly: false,
      artifactReceiptIds: [finalized.receipt.id],
      summary: `Governed manual upload by ${command.actor.actorType}:${actorId}`,
    },
  });
  requests.complete(prepared.record.requestId, finalized.artifact.artifact.id, finalized.receipt.id);
  return {
    requestId: prepared.record.requestId,
    replayed: prepared.replayed || finalized.replayed,
    artifact: finalized.artifact.artifact,
    runId,
  };
}
