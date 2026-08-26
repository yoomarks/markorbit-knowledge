import { createHash } from "node:crypto";
import {
  CONVERSION_RUNTIME_VERSION,
  normalizeStagingTargetPath,
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
  type ProductionMarkdownStagingContext,
  type ProductionStagingUploadEvidence,
} from "@markorbit/worker-runtime";
import { canonicalDocumentMetadata } from "./canonical-document-metadata";
import { ingestManualUpload } from "./manual-upload-ingestion";
import { ProductionConversionWorkerService } from "./production-conversion-worker-service";
import {
  getConnectorRepository,
  getConversionRunLedgerRepository,
  getConversionRuntimeRepository,
  getConverterRegistryRepository,
  getRawArtifactRepository,
  getRegistryDatabase,
  getSourceRepository,
  getStagingContentRepository,
  getWorkerRegistryRepository,
} from "./source-registry";

const MANUAL_CONNECTOR_ID = "builtin-manual-upload";
const MANUAL_CONNECTOR_VERSION = "1.0.0";
const RUNTIME_ID = "admin-knowledge-relationship-export";
const RUNTIME_VERSION = "1.0.0";
const ALL_MANUAL_ARTIFACT_KINDS = [
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
] as const;

function sha256(value: Uint8Array | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function normalizedTargetPath(value: string): string {
  const normalized = normalizeStagingTargetPath(value);
  if (!normalized)
    throw new RegistryValidationError("Knowledge relationship targetPath is invalid");
  return normalized;
}

function sourceSlug(workspaceId: string, idempotencyKey: string): string {
  return `manual-${sha256(`${workspaceId}:${idempotencyKey}`).slice(0, 24)}`;
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
      outputArtifactKinds: [...ALL_MANUAL_ARTIFACT_KINDS],
      healthCheck: { mode: "NONE", timeoutSeconds: 1 },
      status: "ACTIVE",
      extensions: { "x-markorbit-system-connector": "manual-upload" },
    });
  } catch (error) {
    if (
      error instanceof RegistryConflictError &&
      error.code === "CONNECTOR_VERSION_CONFLICT" &&
      connectors.get(MANUAL_CONNECTOR_ID, MANUAL_CONNECTOR_VERSION)
    ) {
      return;
    }
    throw error;
  }
}

function ensureRelationshipSource(input: KnowledgeRelationshipStagingInput) {
  ensureManualConnector();
  const sources = getSourceRepository();
  const slug = sourceSlug(input.workspaceId, input.idempotencyKey);
  const existing = sources
    .list({ workspaceId: input.workspaceId, sourceType: "MANUAL_UPLOAD", q: slug, limit: 100 })
    .items.find((source) => source.slug === slug);
  if (existing) return existing;

  const entrypoint = `manual-upload://${input.workspaceId}/${slug}`;
  try {
    return sources.create({
      workspaceId: input.workspaceId,
      name: input.title,
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
      entrypoints: [{ uri: entrypoint, label: input.title }],
      tags: ["manual-file", "user-provided", "knowledge-relationship-export"],
      extensions: {
        "x-markorbit-ingress": "manual-file",
        "x-markorbit-purpose": "knowledge-relationship-export",
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

function ensureRelationshipProfile(workspaceId: string, sourceId: string, targetPath: string) {
  const converters = getConverterRegistryRepository();
  const name = `Knowledge relationship staging ${sha256(`${sourceId}:${targetPath}`).slice(0, 16)}`;
  const existing = converters
    .listProfiles({ workspaceId, sourceId, q: name, limit: 100 })
    .items.find((profile) => profile.name === name);
  if (existing) {
    if (
      existing.converter.converterId !== PRODUCTION_MARKDOWN_STAGING_CONVERTER.converterId ||
      existing.converter.version !== PRODUCTION_MARKDOWN_STAGING_CONVERTER.version ||
      existing.targetPathTemplate !== targetPath ||
      existing.status !== "ACTIVE" ||
      !existing.autoConvert
    ) {
      throw new RegistryConflictError(
        "KNOWLEDGE_RELATIONSHIP_PROFILE_MISMATCH",
        "Existing relationship staging profile does not match the requested target",
      );
    }
    return existing;
  }
  return converters.createProfile({
    workspaceId,
    sourceId,
    name,
    status: "ACTIVE",
    converter: PRODUCTION_MARKDOWN_STAGING_CONVERTER,
    input: { artifactKinds: ["MARKDOWN"], mimePatterns: ["text/markdown"] },
    outputFormat: "MARKDOWN",
    targetPathTemplate: targetPath,
    configuration: {},
    precedence: 10_000,
    autoConvert: true,
  });
}

async function* oneChunk(content: Uint8Array): AsyncIterable<Uint8Array> {
  yield content;
}

function findConversionRun(workspaceId: string, rawArtifactId: string, profileId: string) {
  const runs = getConversionRunLedgerRepository().list({
    workspaceId,
    rawArtifactId,
    conversionProfileId: profileId,
    converterId: PRODUCTION_MARKDOWN_STAGING_CONVERTER.converterId,
    trigger: "AUTO_PROFILE",
    limit: 10,
  }).items;
  const matches = runs.filter(
    (run) =>
      run.converter.version === PRODUCTION_MARKDOWN_STAGING_CONVERTER.version &&
      run.conversionProfileId === profileId,
  );
  if (matches.length !== 1) {
    throw new RegistryConflictError(
      "KNOWLEDGE_RELATIONSHIP_CONVERSION_RUN_CARDINALITY",
      "Knowledge relationship export requires exactly one bound ConversionRun",
    );
  }
  return matches[0];
}

function assertSafeClaimCandidate(workspaceId: string, expectedRunId: string): void {
  const row = getRegistryDatabase()
    .prepare(
      `SELECT r.id
         FROM conversion_runs r
        WHERE r.workspace_id = ?
          AND r.status = 'PENDING'
          AND r.converter_id = ?
          AND r.converter_version = ?
          AND NOT EXISTS (
            SELECT 1 FROM conversion_leases l
             WHERE l.conversion_run_id = r.id AND l.status = 'ACTIVE'
          )
        ORDER BY r.created_at ASC, r.id ASC
        LIMIT 1`,
    )
    .get(
      workspaceId,
      PRODUCTION_MARKDOWN_STAGING_CONVERTER.converterId,
      PRODUCTION_MARKDOWN_STAGING_CONVERTER.version,
    ) as { id: string } | undefined;
  if (!row || row.id !== expectedRunId) {
    throw new RegistryConflictError(
      "KNOWLEDGE_RELATIONSHIP_CONVERSION_RUN_NOT_CLAIMABLE",
      "Another compatible Markdown ConversionRun is ahead of this export; refusing to steal work",
    );
  }
}

function reportBase(
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

function existingReady(
  workspaceId: string,
  conversionRunId: string,
  targetPath: string,
  sourceContentSha256: string,
): KnowledgeRelationshipReadyStaging | null {
  const staging = getStagingContentRepository().getByConversionRun(conversionRunId, workspaceId);
  if (!staging || staging.descriptor.status !== "READY") return null;
  if (staging.descriptor.targetPath !== targetPath) {
    throw new RegistryConflictError(
      "KNOWLEDGE_RELATIONSHIP_STAGING_TARGET_MISMATCH",
      "Existing READY staging target does not match the relationship note target",
    );
  }
  return {
    stagingDocumentId: staging.descriptor.id,
    workspaceId,
    targetPath,
    sourceContentSha256,
    contentSha256: staging.descriptor.contentHash.value,
  };
}

export class ProductionKnowledgeRelationshipReadyStagingGateway implements KnowledgeRelationshipExportStagingGateway {
  async stageReady(
    input: KnowledgeRelationshipStagingInput,
  ): Promise<KnowledgeRelationshipReadyStaging> {
    const targetPath = normalizedTargetPath(input.targetPath);
    const bytes = new TextEncoder().encode(input.markdown);
    if (bytes.byteLength === 0) {
      throw new RegistryValidationError("Knowledge relationship Markdown must not be empty");
    }
    const sourceContentSha256 = sha256(bytes);
    const source = ensureRelationshipSource(input);
    const profile = ensureRelationshipProfile(input.workspaceId, source.id, targetPath);
    const upload = await ingestManualUpload({
      workspaceId: input.workspaceId,
      sourceId: source.id,
      originalName: targetPath.split("/").at(-1) ?? "knowledge-relationship.md",
      mimeType: "text/markdown",
      expectedSizeBytes: bytes.byteLength,
      expectedSha256: sourceContentSha256,
      idempotencyKey: input.idempotencyKey,
      chunks: oneChunk(bytes),
    });
    if (upload.artifact.binaryHash.value !== sourceContentSha256) {
      throw new RegistryConflictError(
        "KNOWLEDGE_RELATIONSHIP_RAW_ARTIFACT_MISMATCH",
        "Manual Upload did not preserve the rendered relationship note bytes",
      );
    }

    const run = findConversionRun(input.workspaceId, upload.artifact.id, profile.id);
    const replay = existingReady(input.workspaceId, run.id, targetPath, sourceContentSha256);
    if (replay) return replay;
    if (run.status !== "PENDING") {
      throw new RegistryConflictError(
        "KNOWLEDGE_RELATIONSHIP_CONVERSION_RUN_INCOMPLETE",
        `ConversionRun ${run.id} is ${run.status} without READY staging`,
      );
    }
    assertSafeClaimCandidate(input.workspaceId, run.id);

    const workers = getWorkerRegistryRepository();
    const conversionRuntime = getConversionRuntimeRepository();
    const workerCreation = workers.create({
      workspaceId: input.workspaceId,
      displayName: `Knowledge relationship export ${run.id}`,
      runtime: { runtimeId: RUNTIME_ID, version: RUNTIME_VERSION },
      supportedJobTypes: ["LOCAL_FILE_SCAN"],
      connectorBindings: [
        {
          connectorId: MANUAL_CONNECTOR_ID,
          version: MANUAL_CONNECTOR_VERSION,
          capabilities: ["IMPORT"],
        },
      ],
      maxConcurrency: 1,
      labels: ["knowledge-relationship-export", "ephemeral"],
      extensions: { "x-markorbit-purpose": "knowledge-relationship-export" },
    });
    const workerId = workerCreation.view.worker.id;
    const credential = workerCreation.credential;
    const capability = conversionRuntime.registerCapability({
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
      runtime: { runtimeId: RUNTIME_ID, version: RUNTIME_VERSION },
      createdAt: new Date().toISOString(),
      extensions: { "x-markorbit-purpose": "knowledge-relationship-export" },
    });

    try {
      workers.heartbeat(
        {
          workerId,
          observedAt: new Date().toISOString(),
          runtimeVersion: RUNTIME_VERSION,
          health: "HEALTHY",
          activeLeaseIds: [],
        },
        credential,
      );
      const service = new ProductionConversionWorkerService();
      const claimId = productionRuntimeId("ccr");
      const claim = service.claim(
        {
          contractVersion: CONVERSION_RUNTIME_VERSION,
          objectType: "CONVERSION_CLAIM_REQUEST",
          id: claimId,
          workspaceId: input.workspaceId,
          workerId,
          workerCredentialId: `worker-ref:${workerId}`,
          capabilityRevision: 1,
          supportedConverters: [
            {
              converterId: PRODUCTION_MARKDOWN_STAGING_CONVERTER.converterId,
              versions: [PRODUCTION_MARKDOWN_STAGING_CONVERTER.version],
            },
          ],
          maxAcceptedWork: 1,
          idempotencyKey: `knowledge-relationship-claim:${claimId}`,
          requestedLeaseDurationSeconds: 300,
        },
        credential,
      ).result;
      if (
        claim.result !== "CLAIMED" ||
        !claim.lease ||
        !claim.executionSummary ||
        !claim.converter ||
        !claim.rawArtifactReadGrant ||
        !claim.stagingOutputUploadGrant ||
        claim.executionSummary.conversionRunId !== run.id
      ) {
        throw new RegistryConflictError(
          "KNOWLEDGE_RELATIONSHIP_CONVERSION_CLAIM_MISMATCH",
          "Production conversion worker did not claim the expected relationship ConversionRun",
        );
      }

      const currentRun = getConversionRunLedgerRepository().getById(run.id, input.workspaceId);
      const artifact = getRawArtifactRepository().getArtifact(run.rawArtifactId);
      const currentSource = getSourceRepository().getById(run.sourceId);
      if (!currentRun || !artifact || !currentSource) {
        throw new RegistryError(
          "KNOWLEDGE_RELATIONSHIP_CONVERSION_CONTEXT_MISSING",
          "Conversion provenance disappeared before relationship staging",
        );
      }
      const context: ProductionMarkdownStagingContext = {
        workspaceId: input.workspaceId,
        workerId,
        conversionRunId: run.id,
        conversionAttemptId: claim.lease.conversionAttemptId,
        rawArtifactId: run.rawArtifactId,
        sourceId: run.sourceId,
        documentMetadata: canonicalDocumentMetadata(
          currentRun.run,
          artifact.artifact,
          currentSource,
        ),
        lease: claim.lease,
        converter: claim.converter,
        inputGrant: claim.rawArtifactReadGrant,
        outputGrant: claim.stagingOutputUploadGrant,
      };
      if (context.outputGrant.normalizedTargetPath !== targetPath) {
        throw new RegistryConflictError(
          "KNOWLEDGE_RELATIONSHIP_UPLOAD_TARGET_MISMATCH",
          "Conversion output grant does not preserve the requested relationship target path",
        );
      }

      const runtimeClient = {
        started: async (ctx: ProductionMarkdownStagingContext, key: string) => {
          const report: ConversionStartedReport = {
            ...reportBase(ctx, "CONVERSION_STARTED_REPORT", key, "PENDING", "csr"),
            objectType: "CONVERSION_STARTED_REPORT",
            converter: ctx.converter,
          };
          service.submitReport(report, credential);
        },
        progress: async (
          ctx: ProductionMarkdownStagingContext,
          progress: { percent: number; message: string },
          key: string,
        ) => {
          const report: ConversionProgressReport = {
            ...reportBase(ctx, "CONVERSION_PROGRESS_REPORT", key, "RUNNING", "cpr"),
            objectType: "CONVERSION_PROGRESS_REPORT",
            progress,
          };
          service.submitReport(report, credential);
        },
        outputReady: async (
          ctx: ProductionMarkdownStagingContext,
          output: ProductionStagingUploadEvidence,
          key: string,
        ) => {
          const report: ConversionOutputReadyReport = {
            ...reportBase(ctx, "CONVERSION_OUTPUT_READY_REPORT", key, "RUNNING", "cor"),
            objectType: "CONVERSION_OUTPUT_READY_REPORT",
            output,
          };
          service.submitReport(report, credential);
        },
        failed: async (
          ctx: ProductionMarkdownStagingContext,
          failure: { code: string; message: string; retryable: false },
          key: string,
        ) => {
          const report: ConversionFailedReport = {
            ...reportBase(ctx, "CONVERSION_FAILED_REPORT", key, "RUNNING", "cfr"),
            objectType: "CONVERSION_FAILED_REPORT",
            failure,
          };
          service.submitReport(report, credential);
        },
      };
      const executor = new ProductionMarkdownStagingExecutor();
      const result = await executor.execute(
        context,
        {
          read: async (grant) => service.readInput(grant.id, workerId, credential).bytes,
        },
        {
          upload: async (ctx, content, evidence, key) => {
            if (evidence.targetPath !== targetPath || evidence.sha256 !== sha256(content)) {
              throw new RegistryConflictError(
                "KNOWLEDGE_RELATIONSHIP_OUTPUT_EVIDENCE_MISMATCH",
                "Production conversion output evidence does not match the generated staging bytes",
              );
            }
            return service.commitStaging(
              {
                workspaceId: ctx.workspaceId,
                workerId: ctx.workerId,
                conversionRunId: ctx.conversionRunId,
                conversionAttemptId: ctx.conversionAttemptId,
                uploadGrantId: evidence.uploadGrantId,
                idempotencyKey: key,
                content,
              },
              credential,
            );
          },
        },
        runtimeClient,
      );
      if (
        !result ||
        result.commit.stagingStatus !== "READY" ||
        result.commit.finalizationDecision !== "COMPLETED"
      ) {
        throw new RegistryConflictError(
          "KNOWLEDGE_RELATIONSHIP_STAGING_NOT_READY",
          "Production conversion did not produce verified READY staging",
        );
      }
      const ready = getStagingContentRepository().getDocument(
        result.commit.stagingDocumentId,
        input.workspaceId,
      );
      if (
        !ready ||
        ready.descriptor.status !== "READY" ||
        ready.descriptor.targetPath !== targetPath
      ) {
        throw new RegistryConflictError(
          "KNOWLEDGE_RELATIONSHIP_READY_EVIDENCE_MISSING",
          "Verified READY staging evidence could not be re-read after finalization",
        );
      }
      return {
        stagingDocumentId: ready.descriptor.id,
        workspaceId: input.workspaceId,
        targetPath,
        sourceContentSha256,
        contentSha256: ready.descriptor.contentHash.value,
      };
    } finally {
      try {
        conversionRuntime.deactivateCapability(capability.capability.id);
      } catch {
        // Preserve the primary export result or failure; stale capability remains auditable.
      }
      try {
        const current = workers.getById(workerId);
        if (current) {
          workers.update(workerId, { desiredState: "DISABLED" }, current.worker.updatedAt);
        }
      } catch {
        // Preserve the primary export result or failure; worker remains auditable.
      }
    }
  }
}
