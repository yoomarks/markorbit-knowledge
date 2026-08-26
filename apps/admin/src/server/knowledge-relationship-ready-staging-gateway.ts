import { createHash, randomBytes } from "node:crypto";
import {
  CONVERSION_RUNTIME_VERSION,
  type ConversionOutputReadyReport,
  type ConversionStartedReport,
  type ConversionWorkerCapability,
} from "@markorbit/contracts";
import { RegistryConflictError, RegistryValidationError } from "@markorbit/persistence";
import type {
  KnowledgeRelationshipExportStagingGateway,
  KnowledgeRelationshipReadyStaging,
  KnowledgeRelationshipStagingInput,
} from "@markorbit/persistence/knowledge-relationship-vault-export";
import { enrichKnowledgeRelationshipMarkdown } from "@markorbit/persistence/knowledge-relationship-vault-export";
import { claimSpecificConversionRun } from "@markorbit/persistence/targeted-conversion-claim";
import { canonicalMarkdownFrontmatter } from "@markorbit/worker-runtime";
import { canonicalDocumentMetadata } from "./canonical-document-metadata";
import { ingestManualUpload } from "./manual-upload-ingestion";
import {
  getConversionRunLedgerRepository,
  getConversionRuntimeRepository,
  getConversionRuntimeTransitionRepository,
  getRawArtifactRepository,
  getRegistryDatabase,
  getSourceRepository,
  getStagingContentRepository,
  getStagingVerificationRepository,
  getVerifiedStagingFinalizer,
  getWorkerRegistryRepository,
} from "./source-registry";

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const CONVERTER_ID = "builtin-markdown-staging";
const CONVERTER_VERSION = "1.0.0";

function encodeBase32(value: bigint, length: number): string {
  let output = "";
  let remaining = value;
  for (let index = 0; index < length; index += 1) {
    output = CROCKFORD[Number(remaining & 31n)] + output;
    remaining >>= 5n;
  }
  return output;
}

function typedId(prefix: string, now = Date.now()): string {
  const timestamp = encodeBase32(BigInt(now), 10);
  const randomValue = BigInt(`0x${randomBytes(10).toString("hex")}`);
  return `${prefix}_${timestamp}${encodeBase32(randomValue, 16)}`;
}

function sha256(value: Uint8Array | string): string {
  return createHash("sha256").update(value).digest("hex");
}

async function* singleChunk(bytes: Uint8Array): AsyncIterable<Uint8Array> {
  yield bytes;
}

function existingReady(
  workspaceId: string,
  conversionRunId: string,
  sourceContentSha256: string,
): KnowledgeRelationshipReadyStaging | null {
  const staging = getStagingContentRepository().getByConversionRun(conversionRunId, workspaceId);
  if (!staging || staging.descriptor.status !== "READY") return null;
  return {
    stagingDocumentId: staging.descriptor.id,
    workspaceId,
    stagingTargetPath: staging.descriptor.targetPath,
    sourceContentSha256,
    contentSha256: staging.descriptor.contentHash.value,
  };
}

function disableWorker(workerId: string): void {
  const workers = getWorkerRegistryRepository();
  const current = workers.getById(workerId);
  if (current) {
    workers.update(workerId, { desiredState: "DISABLED" }, current.worker.updatedAt);
  }
}

/**
 * Production adapter for Knowledge relationship notes.
 *
 * The rendered note first enters the governed Manual Upload path as immutable MARKDOWN evidence.
 * Its exact AUTO_PROFILE ConversionRun is then claimed by an authenticated ephemeral conversion
 * worker. The generated output combines canonical markorbit provenance and Knowledge metadata in
 * one YAML block, passes normal Staging verification/finalization, and only then becomes eligible
 * for the existing Obsidian projection repository.
 */
export class ProductionKnowledgeRelationshipReadyStagingGateway
  implements KnowledgeRelationshipExportStagingGateway
{
  async stageReady(input: KnowledgeRelationshipStagingInput): Promise<KnowledgeRelationshipReadyStaging> {
    const sourceBytes = new TextEncoder().encode(input.markdown);
    const sourceContentSha256 = sha256(sourceBytes);
    const uploadKey = `kg-rel:${sha256(input.idempotencyKey).slice(0, 56)}`;
    const upload = await ingestManualUpload({
      workspaceId: input.workspaceId,
      originalName: `knowledge-relationship-${sourceContentSha256.slice(0, 16)}.md`,
      mimeType: "text/markdown",
      expectedSizeBytes: sourceBytes.byteLength,
      expectedSha256: sourceContentSha256,
      idempotencyKey: uploadKey,
      sourceName: `Knowledge relationship ${sourceContentSha256.slice(0, 12)}`,
      chunks: singleChunk(sourceBytes),
    });

    const conversionRuns = getConversionRunLedgerRepository();
    const candidates = conversionRuns
      .list({
        workspaceId: input.workspaceId,
        rawArtifactId: upload.artifact.id,
        converterId: CONVERTER_ID,
        trigger: "AUTO_PROFILE",
        limit: 100,
      })
      .items.filter((run) => run.converter.version === CONVERTER_VERSION);
    if (candidates.length !== 1) {
      throw new RegistryConflictError(
        "KNOWLEDGE_RELATIONSHIP_CONVERSION_CARDINALITY",
        "Relationship note must resolve to exactly one governed Markdown ConversionRun",
        { rawArtifactId: upload.artifact.id, conversionRunIds: candidates.map((run) => run.id) },
      );
    }
    const run = candidates[0];
    const ready = existingReady(input.workspaceId, run.id, sourceContentSha256);
    if (ready) return ready;
    if (run.status !== "PENDING") {
      throw new RegistryConflictError(
        "KNOWLEDGE_RELATIONSHIP_CONVERSION_IN_PROGRESS",
        `Relationship note ConversionRun is ${run.status} without READY staging`,
        { conversionRunId: run.id },
      );
    }

    const workers = getWorkerRegistryRepository();
    const worker = workers.create({
      workspaceId: input.workspaceId,
      displayName: `Knowledge relationship export ${run.id}`,
      desiredState: "ACTIVE",
      runtime: { runtimeId: "knowledge-relationship-export", version: "1.0.0" },
      supportedJobTypes: ["LOCAL_FILE_SCAN"],
      connectorBindings: [],
      maxConcurrency: 1,
      labels: ["knowledge-relationship-export", "ephemeral"],
      extensions: { "x-markorbit-purpose": "knowledge-relationship-ready-staging" },
    });
    const workerId = worker.view.worker.id;

    try {
      workers.heartbeat(
        {
          workerId,
          observedAt: new Date().toISOString(),
          runtimeVersion: "1.0.0",
          health: "HEALTHY",
          activeLeaseIds: [],
        },
        worker.credential,
      );
      const capability: ConversionWorkerCapability = {
        contractVersion: CONVERSION_RUNTIME_VERSION,
        objectType: "CONVERSION_WORKER_CAPABILITY",
        id: typedId("cwc"),
        workerId,
        capabilityRevision: 1,
        supportedConverters: [{ converterId: CONVERTER_ID, versions: [CONVERTER_VERSION] }],
        acceptedArtifactKinds: ["MARKDOWN"],
        acceptedMimePatterns: ["text/markdown"],
        supportedOutputFormats: ["MARKDOWN"],
        runtime: { runtimeId: "knowledge-relationship-export", version: "1.0.0" },
        createdAt: new Date().toISOString(),
      };
      getConversionRuntimeRepository().registerCapability(capability);
      workers.verifyCredential(workerId, worker.credential);
      const claim = claimSpecificConversionRun(
        getRegistryDatabase(),
        {
          contractVersion: CONVERSION_RUNTIME_VERSION,
          objectType: "CONVERSION_CLAIM_REQUEST",
          id: typedId("ccr"),
          workspaceId: input.workspaceId,
          workerId,
          workerCredentialId: `knowledge-relationship-${workerId}`,
          capabilityRevision: 1,
          supportedConverters: capability.supportedConverters,
          maxAcceptedWork: 1,
          idempotencyKey: `${input.idempotencyKey}:claim`,
          requestedLeaseDurationSeconds: 120,
        },
        run.id,
      ).result;
      if (
        claim.result !== "CLAIMED" ||
        !claim.lease ||
        !claim.stagingOutputUploadGrant ||
        claim.lease.conversionRunId !== run.id
      ) {
        throw new RegistryConflictError(
          "KNOWLEDGE_RELATIONSHIP_EXACT_CLAIM_FAILED",
          "Exact relationship ConversionRun could not be claimed",
        );
      }
      const lease = claim.lease;
      const grant = claim.stagingOutputUploadGrant;
      const source = getSourceRepository().getById(run.sourceId);
      const artifact = getRawArtifactRepository().getArtifact(run.rawArtifactId)?.artifact;
      if (!source || !artifact) {
        throw new RegistryValidationError("Relationship conversion provenance could not be resolved");
      }
      const canonicalFrontmatter = canonicalMarkdownFrontmatter(
        canonicalDocumentMetadata(run, artifact, source),
      );
      const enrichedMarkdown = enrichKnowledgeRelationshipMarkdown(
        canonicalFrontmatter,
        input.markdown,
      );
      const enrichedBytes = new TextEncoder().encode(enrichedMarkdown);
      const enrichedSha256 = sha256(enrichedBytes);
      const transitions = getConversionRuntimeTransitionRepository();
      const reportBase = {
        contractVersion: CONVERSION_RUNTIME_VERSION,
        workspaceId: input.workspaceId,
        workerId,
        workerCredentialId: `knowledge-relationship-${workerId}`,
        conversionRunId: run.id,
        conversionAttemptId: lease.conversionAttemptId,
        conversionLeaseId: lease.id,
        leaseGeneration: lease.generation,
        leaseTokenReference: lease.tokenReference,
        leaseTokenDigest: lease.tokenDigest,
        occurredAt: new Date().toISOString(),
      } as const;
      const startedReport: ConversionStartedReport = {
        ...reportBase,
        objectType: "CONVERSION_STARTED_REPORT",
        id: typedId("csr"),
        idempotencyKey: `${input.idempotencyKey}:started`,
        expectedCurrentStatus: "PENDING",
        converter: run.converter,
      };
      transitions.submitStarted(startedReport, worker.credential);
      const outputReport: ConversionOutputReadyReport = {
        ...reportBase,
        objectType: "CONVERSION_OUTPUT_READY_REPORT",
        id: typedId("cor"),
        idempotencyKey: `${input.idempotencyKey}:output`,
        expectedCurrentStatus: "RUNNING",
        output: {
          uploadGrantId: grant.id,
          targetPath: grant.normalizedTargetPath,
          sha256: enrichedSha256,
          sizeBytes: enrichedBytes.byteLength,
          mediaType: "text/markdown",
        },
      };
      transitions.submitOutputReady(outputReport, worker.credential);

      const staging = getStagingContentRepository().ingestGenerated({
        workspaceId: input.workspaceId,
        workerId,
        conversionRunId: run.id,
        conversionAttemptId: lease.conversionAttemptId,
        uploadGrantId: grant.id,
        idempotencyKey: `${input.idempotencyKey}:ingest`,
        title: input.title,
        content: enrichedBytes,
      });
      const verification = getStagingVerificationRepository().verifyGenerated({
        workspaceId: input.workspaceId,
        stagingDocumentId: staging.record.descriptor.id,
        idempotencyKey: `${input.idempotencyKey}:verify`,
      });
      if (
        verification.record.descriptor.status !== "READY" ||
        (verification.evidence.outcome !== "PASS" &&
          verification.evidence.outcome !== "PASS_WITH_WARNINGS")
      ) {
        throw new RegistryConflictError(
          "KNOWLEDGE_RELATIONSHIP_STAGING_NOT_READY",
          "Relationship note did not pass governed Staging verification",
          { outcome: verification.evidence.outcome },
        );
      }
      const finalized = getVerifiedStagingFinalizer().finalize({
        workspaceId: input.workspaceId,
        stagingDocumentId: staging.record.descriptor.id,
        idempotencyKey: `${input.idempotencyKey}:finalize`,
      });
      if (finalized.decision !== "COMPLETED") {
        throw new RegistryConflictError(
          "KNOWLEDGE_RELATIONSHIP_STAGING_FINALIZATION_FAILED",
          "Relationship note Staging finalization did not complete",
        );
      }
      const descriptor = verification.record.descriptor;
      if (descriptor.contentHash.value !== enrichedSha256) {
        throw new RegistryConflictError(
          "KNOWLEDGE_RELATIONSHIP_STAGING_HASH_MISMATCH",
          "Verified relationship Staging content hash changed unexpectedly",
        );
      }
      return {
        stagingDocumentId: descriptor.id,
        workspaceId: input.workspaceId,
        stagingTargetPath: descriptor.targetPath,
        sourceContentSha256,
        contentSha256: descriptor.contentHash.value,
      };
    } finally {
      disableWorker(workerId);
    }
  }
}
