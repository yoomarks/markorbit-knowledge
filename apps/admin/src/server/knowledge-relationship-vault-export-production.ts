import { createHash } from "node:crypto";
import {
  CONVERSION_RUNTIME_VERSION,
  type ConversionFailedReport,
  type ConversionOutputReadyReport,
  type ConversionProgressReport,
  type ConversionStartedReport,
  type RuntimeReportBase,
} from "@markorbit/contracts";
import {
  RegistryConflictError,
  RegistryError,
  RegistryValidationError,
} from "@markorbit/persistence";
import type {
  KnowledgeRelationshipExportStagingGateway,
  KnowledgeRelationshipReadyStaging,
  KnowledgeRelationshipStagingInput,
} from "@markorbit/persistence/knowledge-relationship-vault-export";
import {
  PRODUCTION_MARKDOWN_STAGING_CONVERTER,
  ProductionMarkdownStagingExecutor,
  productionRuntimeId,
  type ProductionConversionRuntimeClient,
  type ProductionMarkdownStagingContext,
  type ProductionRawArtifactReader,
  type ProductionStagingUploader,
  type ProductionStagingUploadEvidence,
} from "@markorbit/worker-runtime";
import { canonicalDocumentMetadata } from "./canonical-document-metadata";
import { ingestManualUpload } from "./manual-upload-ingestion";
import { ensureM3CanonicalDocumentConverters } from "./m3-converter-bootstrap";
import { ProductionConversionWorkerService } from "./production-conversion-worker-service";
import {
  getConnectorRepository,
  getConversionRunLedgerRepository,
  getConversionRuntimeRepository,
  getConverterRegistryRepository,
  getRawArtifactRepository,
  getSourceRepository,
  getStagingContentRepository,
  getWorkerRegistryRepository,
} from "./source-registry";

const MANUAL_CONNECTOR_ID = "builtin-manual-upload";
const MANUAL_CONNECTOR_VERSION = "1.0.0";
const RUNTIME_ID = "kg004-relationship-export";

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function stableKey(input: KnowledgeRelationshipStagingInput): string {
  return sha256(
    [input.workspaceId, input.idempotencyKey, input.targetPath, sha256(input.markdown)].join("\u001f"),
  );
}

function ensureManualConnector(): void {
  const connectors = getConnectorRepository();
  if (connectors.get(MANUAL_CONNECTOR_ID, MANUAL_CONNECTOR_VERSION)) return;
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
    outputArtifactKinds: [
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
    ],
    healthCheck: { mode: "NONE", timeoutSeconds: 1 },
    status: "ACTIVE",
    extensions: { "x-markorbit-system-connector": "manual-upload" },
  });
}

function ensureRelationshipSource(input: KnowledgeRelationshipStagingInput, key: string) {
  ensureManualConnector();
  const sources = getSourceRepository();
  const slug = `kg004-${key.slice(0, 24)}`;
  const existing = sources
    .list({ workspaceId: input.workspaceId, sourceType: "MANUAL_UPLOAD", q: slug, limit: 100 })
    .items.find((source) => source.slug === slug);
  if (existing) {
    if (
      existing.workspaceId !== input.workspaceId ||
      existing.sourceType !== "MANUAL_UPLOAD" ||
      existing.status !== "ACTIVE" ||
      existing.connector.connectorId !== MANUAL_CONNECTOR_ID ||
      existing.connector.version !== MANUAL_CONNECTOR_VERSION
    ) {
      throw new RegistryConflictError(
        "KG004_EXPORT_SOURCE_CONFLICT",
        "Existing KG-004 export Source is not compatible with governed Manual Upload",
      );
    }
    return existing;
  }

  const entrypoint = `manual-upload://${input.workspaceId}/${slug}`;
  try {
    return sources.create({
      workspaceId: input.workspaceId,
      name: `Knowledge relationship export: ${input.title}`.slice(0, 300),
      slug,
      sourceType: "MANUAL_UPLOAD",
      category: "USER_PROVIDED",
      authorityLevel: "UNKNOWN",
      status: "ACTIVE",
      jurisdictions: [],
      languages: [],
      connector: { connectorId: MANUAL_CONNECTOR_ID, version: MANUAL_CONNECTOR_VERSION },
      connectorConfig: {},
      canonicalUri: entrypoint,
      entrypoints: [{ uri: entrypoint, label: input.title.slice(0, 300) }],
      tags: ["manual-file", "knowledge-relationship-export"],
      extensions: {
        "x-markorbit-ingress": "manual-file",
        "x-markorbit-purpose": "knowledge-relationship-vault-export",
      },
    });
  } catch (error) {
    if (error instanceof RegistryConflictError && error.code === "SOURCE_SLUG_CONFLICT") {
      const raced = sources
        .list({ workspaceId: input.workspaceId, sourceType: "MANUAL_UPLOAD", q: slug, limit: 100 })
        .items.find((source) => source.slug === slug);
      if (raced) return raced;
    }
    throw error;
  }
}

function ensureRelationshipProfile(
  input: KnowledgeRelationshipStagingInput,
  sourceId: string,
  key: string,
) {
  const converters = getConverterRegistryRepository();
  ensureM3CanonicalDocumentConverters(converters);
  const name = `KG-004 relationship export ${key.slice(0, 24)}`;
  const existing = converters
    .listProfiles({ workspaceId: input.workspaceId, sourceId, q: name, limit: 100 })
    .items.find((profile) => profile.name === name);
  if (existing) {
    if (
      existing.sourceId !== sourceId ||
      existing.converter.converterId !== PRODUCTION_MARKDOWN_STAGING_CONVERTER.converterId ||
      existing.converter.version !== PRODUCTION_MARKDOWN_STAGING_CONVERTER.version ||
      existing.targetPathTemplate !== input.targetPath ||
      existing.outputFormat !== "MARKDOWN" ||
      !existing.autoConvert ||
      existing.status !== "ACTIVE"
    ) {
      throw new RegistryConflictError(
        "KG004_EXPORT_PROFILE_CONFLICT",
        "Existing KG-004 conversion profile does not match the requested target path",
      );
    }
    return existing;
  }

  return converters.createProfile({
    workspaceId: input.workspaceId,
    sourceId,
    name,
    status: "ACTIVE",
    converter: { ...PRODUCTION_MARKDOWN_STAGING_CONVERTER },
    input: { artifactKinds: ["MARKDOWN"], mimePatterns: ["text/markdown"] },
    outputFormat: "MARKDOWN",
    targetPathTemplate: input.targetPath,
    configuration: {},
    precedence: 1000,
    autoConvert: true,
  });
}

function existingReady(
  input: KnowledgeRelationshipStagingInput,
  rawArtifactId: string,
  conversionProfileId: string,
): KnowledgeRelationshipReadyStaging | null {
  const runs = getConversionRunLedgerRepository().list({
    workspaceId: input.workspaceId,
    rawArtifactId,
    conversionProfileId,
    limit: 100,
  });
  const completed = runs.items.find((run) => run.status === "COMPLETED");
  if (!completed) return null;
  const record = getStagingContentRepository().getByConversionRun(completed.id, input.workspaceId);
  if (!record || record.descriptor.status !== "READY") return null;
  const descriptor = record.descriptor;
  if (descriptor.targetPath !== input.targetPath) {
    throw new RegistryConflictError(
      "KG004_READY_TARGET_PATH_MISMATCH",
      "Existing READY staging path does not match the requested relationship note path",
    );
  }
  return {
    stagingDocumentId: descriptor.id,
    workspaceId: input.workspaceId,
    targetPath: descriptor.targetPath,
    sourceContentSha256: sha256(input.markdown),
    contentSha256: descriptor.contentHash.value,
  };
}

function requireTargetRun(
  workspaceId: string,
  rawArtifactId: string,
  conversionProfileId: string,
) {
  const runs = getConversionRunLedgerRepository().list({
    workspaceId,
    rawArtifactId,
    conversionProfileId,
    limit: 100,
  });
  const pending = runs.items.find((run) => run.status === "PENDING");
  if (!pending) {
    const active = runs.items.find((run) => ["RUNNING", "VERIFYING"].includes(run.status));
    if (active) {
      throw new RegistryConflictError(
        "KG004_CONVERSION_ALREADY_IN_PROGRESS",
        `Relationship export conversion ${active.id} is already ${active.status}`,
      );
    }
    throw new RegistryError(
      "KG004_CONVERSION_RUN_NOT_FOUND",
      "Manual Upload did not create the expected relationship export ConversionRun",
    );
  }
  return pending;
}

function assertQueueIsolation(workspaceId: string, targetRunId: string): void {
  const compatible = getConversionRunLedgerRepository().list({
    workspaceId,
    converterId: PRODUCTION_MARKDOWN_STAGING_CONVERTER.converterId,
    status: "PENDING",
    limit: 100,
  });
  if (compatible.total !== 1 || compatible.items[0]?.id !== targetRunId) {
    throw new RegistryConflictError(
      "KG004_CONVERSION_QUEUE_NOT_ISOLATED",
      "KG-004 production export refuses to claim while another compatible Markdown conversion is pending",
      { targetRunId, compatiblePendingRuns: compatible.total },
    );
  }
}

class InProcessProductionConversionClient
  implements ProductionRawArtifactReader, ProductionStagingUploader, ProductionConversionRuntimeClient
{
  constructor(
    private readonly service: ProductionConversionWorkerService,
    private readonly credential: string,
  ) {}

  async read(grant: ProductionMarkdownStagingContext["inputGrant"]): Promise<Uint8Array> {
    return this.service.readInput(grant.id, grant.workerId, this.credential).bytes;
  }

  async upload(
    context: ProductionMarkdownStagingContext,
    content: Uint8Array,
    evidence: ProductionStagingUploadEvidence,
    idempotencyKey: string,
  ) {
    return this.service.commitStaging(
      {
        workspaceId: context.workspaceId,
        workerId: context.workerId,
        conversionRunId: context.conversionRunId,
        conversionAttemptId: context.conversionAttemptId,
        uploadGrantId: evidence.uploadGrantId,
        idempotencyKey,
        content,
      },
      this.credential,
    );
  }

  async started(context: ProductionMarkdownStagingContext, idempotencyKey: string): Promise<void> {
    const report: ConversionStartedReport = {
      ...this.reportBase(context, "CONVERSION_STARTED_REPORT", idempotencyKey, "PENDING", "csr"),
      objectType: "CONVERSION_STARTED_REPORT",
      converter: context.converter,
    };
    this.service.submitReport(report, this.credential);
  }

  async progress(
    context: ProductionMarkdownStagingContext,
    progress: { percent: number; message: string },
    idempotencyKey: string,
  ): Promise<void> {
    const report: ConversionProgressReport = {
      ...this.reportBase(context, "CONVERSION_PROGRESS_REPORT", idempotencyKey, "RUNNING", "cpr"),
      objectType: "CONVERSION_PROGRESS_REPORT",
      progress,
    };
    this.service.submitReport(report, this.credential);
  }

  async outputReady(
    context: ProductionMarkdownStagingContext,
    evidence: ProductionStagingUploadEvidence,
    idempotencyKey: string,
  ): Promise<void> {
    const report: ConversionOutputReadyReport = {
      ...this.reportBase(context, "CONVERSION_OUTPUT_READY_REPORT", idempotencyKey, "RUNNING", "cor"),
      objectType: "CONVERSION_OUTPUT_READY_REPORT",
      output: evidence,
    };
    this.service.submitReport(report, this.credential);
  }

  async failed(
    context: ProductionMarkdownStagingContext,
    failure: { code: string; message: string; retryable: false },
    idempotencyKey: string,
  ): Promise<void> {
    const report: ConversionFailedReport = {
      ...this.reportBase(context, "CONVERSION_FAILED_REPORT", idempotencyKey, "RUNNING", "cfr"),
      objectType: "CONVERSION_FAILED_REPORT",
      failure,
    };
    this.service.submitReport(report, this.credential);
  }

  private reportBase(
    context: ProductionMarkdownStagingContext,
    objectType: RuntimeReportBase["objectType"],
    idempotencyKey: string,
    expectedCurrentStatus: RuntimeReportBase["expectedCurrentStatus"],
    prefix: string,
  ): RuntimeReportBase {
    return {
      contractVersion: CONVERSION_RUNTIME_VERSION,
      objectType,
      id: productionRuntimeId(prefix),
      workspaceId: context.workspaceId,
      workerId: context.workerId,
      workerCredentialId: `worker-ref:${context.workerId}`,
      conversionRunId: context.conversionRunId,
      conversionAttemptId: context.conversionAttemptId,
      conversionLeaseId: context.lease.id,
      leaseGeneration: context.lease.generation,
      leaseTokenReference: context.lease.tokenReference,
      leaseTokenDigest: context.lease.tokenDigest,
      idempotencyKey,
      occurredAt: new Date().toISOString(),
      expectedCurrentStatus,
    };
  }
}

export class ProductionKnowledgeRelationshipExportStagingGateway
  implements KnowledgeRelationshipExportStagingGateway
{
  async stageReady(
    input: KnowledgeRelationshipStagingInput,
  ): Promise<KnowledgeRelationshipReadyStaging> {
    const bytes = new TextEncoder().encode(input.markdown);
    if (!input.markdown.trim()) {
      throw new RegistryValidationError("Knowledge relationship export Markdown must not be empty");
    }
    const key = stableKey(input);
    const source = ensureRelationshipSource(input, key);
    const profile = ensureRelationshipProfile(input, source.id, key);
    const originalName = `kg004-${key.slice(0, 32)}.md`;
    const upload = await ingestManualUpload({
      workspaceId: input.workspaceId,
      sourceId: source.id,
      originalName,
      mimeType: "text/markdown",
      expectedSizeBytes: bytes.byteLength,
      expectedSha256: sha256(bytes),
      idempotencyKey: input.idempotencyKey,
      chunks: (async function* () {
        yield bytes;
      })(),
    });

    const ready = existingReady(input, upload.artifact.id, profile.id);
    if (ready) return ready;
    if (upload.autoConversion.status === "FAILED" || upload.autoConversion.status === "NOT_APPLICABLE") {
      throw new RegistryConflictError(
        "KG004_AUTO_CONVERSION_NOT_DISPATCHED",
        `Relationship export automatic conversion did not dispatch: ${upload.autoConversion.status}`,
      );
    }

    const run = requireTargetRun(input.workspaceId, upload.artifact.id, profile.id);
    assertQueueIsolation(input.workspaceId, run.id);

    const workers = getWorkerRegistryRepository();
    const worker = workers.create({
      workspaceId: input.workspaceId,
      displayName: `KG-004 relationship export ${run.id}`,
      runtime: { runtimeId: RUNTIME_ID, version: "1.0.0" },
      supportedJobTypes: ["LOCAL_FILE_SCAN"],
      connectorBindings: [],
      maxConcurrency: 1,
      labels: ["kg-004", "conversion", "ephemeral"],
      extensions: { "x-markorbit-purpose": "knowledge-relationship-vault-export" },
    });
    const workerId = worker.view.worker.id;
    const credential = worker.credential;
    const runtime = getConversionRuntimeRepository();
    const capability = runtime.registerCapability({
      contractVersion: CONVERSION_RUNTIME_VERSION,
      objectType: "CONVERSION_WORKER_CAPABILITY",
      id: productionRuntimeId("cwc"),
      workerId,
      capabilityRevision: 1,
      supportedConverters: [
        {
          converterId: PRODUCTION_MARKDOWN_STAGING_CONVERTER.converterId,
          versions: [PRODUCTION_MARKDOWN_STAGING_CONVERTER.version],
        },
      ],
      acceptedArtifactKinds: ["MARKDOWN"],
      acceptedMimePatterns: ["text/markdown"],
      supportedOutputFormats: ["MARKDOWN"],
      runtime: { runtimeId: RUNTIME_ID, version: "1.0.0" },
      createdAt: new Date().toISOString(),
      extensions: { "x-markorbit-purpose": "knowledge-relationship-vault-export" },
    });
    const service = new ProductionConversionWorkerService();

    try {
      const claim = service.claim(
        {
          contractVersion: CONVERSION_RUNTIME_VERSION,
          objectType: "CONVERSION_CLAIM_REQUEST",
          id: productionRuntimeId("ccr"),
          workspaceId: input.workspaceId,
          workerId,
          workerCredentialId: `worker-ref:${workerId}`,
          capabilityRevision: capability.capability.capabilityRevision,
          supportedConverters: capability.capability.supportedConverters,
          maxAcceptedWork: 1,
          idempotencyKey: `kg004-claim-${key.slice(0, 48)}`,
          requestedLeaseDurationSeconds: 120,
        },
        credential,
      );
      const claimed = claim.result;
      if (
        claimed.result !== "CLAIMED" ||
        !claimed.lease ||
        !claimed.converter ||
        !claimed.executionSummary ||
        !claimed.rawArtifactReadGrant ||
        !claimed.stagingOutputUploadGrant
      ) {
        throw new RegistryConflictError(
          "KG004_CONVERSION_CLAIM_EMPTY",
          "KG-004 conversion worker did not receive the expected relationship export run",
        );
      }
      if (claimed.executionSummary.conversionRunId !== run.id) {
        throw new RegistryConflictError(
          "KG004_CONVERSION_CLAIM_MISMATCH",
          "KG-004 conversion worker claimed a different ConversionRun",
        );
      }

      const runRecord = getConversionRunLedgerRepository().getById(run.id, input.workspaceId);
      const artifactRecord = getRawArtifactRepository().getArtifact(upload.artifact.id);
      const sourceRecord = getSourceRepository().getById(source.id);
      if (!runRecord || !artifactRecord || !sourceRecord) {
        throw new RegistryError(
          "KG004_CONVERSION_PROVENANCE_NOT_FOUND",
          "Relationship export conversion provenance could not be reloaded",
        );
      }
      const context: ProductionMarkdownStagingContext = {
        workspaceId: input.workspaceId,
        workerId,
        conversionRunId: run.id,
        conversionAttemptId: claimed.lease.conversionAttemptId,
        rawArtifactId: upload.artifact.id,
        sourceId: source.id,
        documentMetadata: canonicalDocumentMetadata(
          runRecord.run,
          artifactRecord.artifact,
          sourceRecord,
        ),
        lease: claimed.lease,
        converter: claimed.converter,
        inputGrant: claimed.rawArtifactReadGrant,
        outputGrant: claimed.stagingOutputUploadGrant,
      };
      const client = new InProcessProductionConversionClient(service, credential);
      const execution = await new ProductionMarkdownStagingExecutor().execute(
        context,
        client,
        client,
        client,
      );
      if (
        !execution ||
        execution.commit.stagingStatus !== "READY" ||
        execution.commit.finalizationDecision !== "COMPLETED"
      ) {
        throw new RegistryConflictError(
          "KG004_STAGING_NOT_READY",
          "Relationship export conversion did not produce finalized READY staging",
        );
      }
      const staging = getStagingContentRepository().getDocument(
        execution.commit.stagingDocumentId,
        input.workspaceId,
      );
      if (!staging || staging.descriptor.status !== "READY") {
        throw new RegistryConflictError(
          "KG004_READY_STAGING_NOT_FOUND",
          "Finalized relationship export READY staging could not be reloaded",
        );
      }
      if (staging.descriptor.targetPath !== input.targetPath) {
        throw new RegistryConflictError(
          "KG004_READY_TARGET_PATH_MISMATCH",
          "Finalized relationship export target path differs from the rendered artifact path",
        );
      }
      return {
        stagingDocumentId: staging.descriptor.id,
        workspaceId: input.workspaceId,
        targetPath: staging.descriptor.targetPath,
        sourceContentSha256: sha256(input.markdown),
        contentSha256: staging.descriptor.contentHash.value,
      };
    } finally {
      try {
        runtime.deactivateCapability(capability.capability.id);
      } catch {
        // Preserve primary result/failure; durable capability state remains inspectable.
      }
      try {
        const current = workers.getById(workerId);
        if (current) workers.update(workerId, { desiredState: "DISABLED" }, current.worker.updatedAt);
      } catch {
        // Preserve primary result/failure; durable Worker state remains inspectable.
      }
    }
  }
}
