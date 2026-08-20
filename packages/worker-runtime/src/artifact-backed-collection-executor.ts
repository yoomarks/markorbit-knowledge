import { createHash } from "node:crypto";
import type {
  ArtifactIngestionReceipt,
  ArtifactIngestionSession,
  ArtifactKind,
  ArtifactUploadDescriptor,
  ExecutionAttempt,
  ExecutionExecutor,
  ExecutionReceipt,
  Job,
  JobLease,
} from "@markorbit/contracts";

export type ArtifactBackedExecutionContext = {
  workerId: string;
  job: Job;
  lease: JobLease;
  leaseToken: string;
};

export type AcquiredCollectionArtifact = {
  artifactKind: ArtifactKind;
  mimeType: string;
  originalName: string;
  sourceUri: string;
  canonicalUri?: string;
  publishedAt?: string;
  parentCanonicalUris?: string[];
  content: Uint8Array;
};

export type ArtifactContentIdentityCheck = {
  artifactKind: ArtifactKind;
  canonicalUri: string;
  sha256: string;
};

export type ArtifactContentIdentityResult = {
  unchanged: boolean;
  latestArtifactId: string | null;
  latestSha256: string | null;
};

export class CollectionAcquisitionError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly retryable: boolean,
  ) {
    super(message);
    this.name = "CollectionAcquisitionError";
  }
}

export class CollectionNotModifiedSignal extends CollectionAcquisitionError {
  constructor(
    public readonly canonicalUri: string,
    message = "Remote representation is unchanged",
  ) {
    super("HTTP_NOT_MODIFIED", message, false);
    this.name = "CollectionNotModifiedSignal";
  }
}

export interface CollectionArtifactAcquirer {
  readonly executor: ExecutionExecutor;
  acquire(context: ArtifactBackedExecutionContext): Promise<AcquiredCollectionArtifact[]>;
}

export interface ArtifactBackedExecutionClient {
  start(
    context: ArtifactBackedExecutionContext,
    executor: ExecutionExecutor,
    idempotencyKey: string,
  ): Promise<ExecutionAttempt>;
  checkArtifactContent?(
    context: ArtifactBackedExecutionContext,
    input: ArtifactContentIdentityCheck,
  ): Promise<ArtifactContentIdentityResult>;
  uploading(context: ArtifactBackedExecutionContext, idempotencyKey: string): Promise<void>;
  createArtifactSession(
    context: ArtifactBackedExecutionContext,
    descriptor: ArtifactUploadDescriptor,
    idempotencyKey: string,
  ): Promise<ArtifactIngestionSession>;
  uploadArtifactContent(
    context: ArtifactBackedExecutionContext,
    sessionId: string,
    content: Uint8Array,
  ): Promise<void>;
  finalizeArtifact(
    context: ArtifactBackedExecutionContext,
    sessionId: string,
  ): Promise<ArtifactIngestionReceipt>;
  verifying(context: ArtifactBackedExecutionContext, idempotencyKey: string): Promise<void>;
  complete(
    context: ArtifactBackedExecutionContext,
    receipt: ExecutionReceipt,
    idempotencyKey: string,
  ): Promise<void>;
  fail(
    context: ArtifactBackedExecutionContext,
    failure: { code: string; message: string; retryable: boolean },
    idempotencyKey: string,
  ): Promise<void>;
}

function digest(content: Uint8Array): string {
  return createHash("sha256").update(content).digest("hex");
}

function failureFrom(error: unknown): { code: string; message: string; retryable: boolean } {
  if (error instanceof CollectionAcquisitionError) {
    return { code: error.code, message: error.message, retryable: error.retryable };
  }
  return {
    code: "PRODUCTION_COLLECTION_FAILED",
    message: error instanceof Error ? error.message : "Production collection failed",
    retryable: false,
  };
}

function assertArtifactAllowed(job: Job, artifact: AcquiredCollectionArtifact): void {
  if (!job.planSnapshot.output.artifactKinds.includes(artifact.artifactKind)) {
    throw new CollectionAcquisitionError(
      "ARTIFACT_KIND_NOT_AUTHORIZED",
      `Artifact kind ${artifact.artifactKind} is outside the immutable CollectionPlan snapshot`,
      false,
    );
  }
  if (artifact.content.byteLength <= 0) {
    throw new CollectionAcquisitionError(
      "EMPTY_ARTIFACT_NOT_ALLOWED",
      "Artifact-backed collection cannot finalize empty content",
      false,
    );
  }
}

function descriptorFor(
  artifact: AcquiredCollectionArtifact,
  parentArtifactIds: string[] = [],
): ArtifactUploadDescriptor {
  return {
    artifactKind: artifact.artifactKind,
    mimeType: artifact.mimeType,
    originalName: artifact.originalName,
    expectedSizeBytes: artifact.content.byteLength,
    expectedSha256: digest(artifact.content),
    sourceUri: artifact.sourceUri,
    ...(artifact.canonicalUri ? { canonicalUri: artifact.canonicalUri } : {}),
    ...(artifact.publishedAt ? { publishedAt: artifact.publishedAt } : {}),
    ...(parentArtifactIds.length > 0 ? { parentArtifactIds } : {}),
  };
}

function isChangeWatch(context: ArtifactBackedExecutionContext): boolean {
  const schedule = context.job.planSnapshot.schedule;
  return context.job.jobType === "PAGE_UPDATE_CHECK" || schedule?.mode === "CHANGE_WATCH";
}

function addArtifactIdentity(
  identities: Map<string, Set<string>>,
  canonicalUri: string | undefined,
  artifactId: string | null | undefined,
): void {
  if (!canonicalUri || !artifactId) return;
  const values = identities.get(canonicalUri) ?? new Set<string>();
  values.add(artifactId);
  identities.set(canonicalUri, values);
}

function isLineageChild(artifact: AcquiredCollectionArtifact): boolean {
  return (artifact.parentCanonicalUris?.length ?? 0) > 0;
}

async function selectChangedArtifacts(
  context: ArtifactBackedExecutionContext,
  acquired: AcquiredCollectionArtifact[],
  client: ArtifactBackedExecutionClient,
): Promise<{
  changed: AcquiredCollectionArtifact[];
  unchangedCount: number;
  lineageRefreshCount: number;
  knownArtifactIdsByCanonicalUri: Map<string, Set<string>>;
}> {
  const knownArtifactIdsByCanonicalUri = new Map<string, Set<string>>();
  if (!isChangeWatch(context) || !client.checkArtifactContent) {
    return {
      changed: acquired,
      unchangedCount: 0,
      lineageRefreshCount: 0,
      knownArtifactIdsByCanonicalUri,
    };
  }

  const changed: AcquiredCollectionArtifact[] = [];
  const unchanged: AcquiredCollectionArtifact[] = [];
  for (const artifact of acquired) {
    if (!artifact.canonicalUri) {
      changed.push(artifact);
      continue;
    }
    try {
      const result = await client.checkArtifactContent(context, {
        artifactKind: artifact.artifactKind,
        canonicalUri: artifact.canonicalUri,
        sha256: digest(artifact.content),
      });
      if (result.unchanged) {
        unchanged.push(artifact);
        addArtifactIdentity(
          knownArtifactIdsByCanonicalUri,
          artifact.canonicalUri,
          result.latestArtifactId,
        );
      } else {
        changed.push(artifact);
      }
    } catch {
      // Change detection is an optimization, never an evidence gate. If the
      // control plane cannot compare identity, preserve the previous behavior
      // and ingest the acquired bytes as a new immutable artifact version.
      changed.push(artifact);
    }
  }

  // Attachment lineage is version-specific evidence. If a parent page changes,
  // an unchanged child attachment must still be re-observed so its new immutable
  // RawArtifact version can point at the new parent RawArtifact identity. The CAS
  // keeps the identical child bytes deduplicated; only provenance/version evidence
  // is refreshed. Without this promotion, attachment diffs would falsely interpret
  // unchanged attachments as removed from the new page version.
  const changedParentCanonicalUris = new Set(
    changed
      .filter((artifact) => !isLineageChild(artifact))
      .map((artifact) => artifact.canonicalUri)
      .filter((value): value is string => Boolean(value)),
  );
  const lineageRefresh: AcquiredCollectionArtifact[] = [];
  const stillUnchanged: AcquiredCollectionArtifact[] = [];
  for (const artifact of unchanged) {
    const parentChanged = (artifact.parentCanonicalUris ?? []).some((parentUri) =>
      changedParentCanonicalUris.has(parentUri),
    );
    if (parentChanged) lineageRefresh.push(artifact);
    else stillUnchanged.push(artifact);
  }
  changed.push(...lineageRefresh);

  return {
    changed,
    unchangedCount: stillUnchanged.length,
    lineageRefreshCount: lineageRefresh.length,
    knownArtifactIdsByCanonicalUri,
  };
}

function orderedForLineage(artifacts: AcquiredCollectionArtifact[]): AcquiredCollectionArtifact[] {
  const parents = artifacts.filter((artifact) => !isLineageChild(artifact));
  const children = artifacts.filter((artifact) => isLineageChild(artifact));
  return [...parents, ...children];
}

function resolveParentArtifactIds(
  artifact: AcquiredCollectionArtifact,
  identities: Map<string, Set<string>>,
): string[] {
  const parentUris = artifact.parentCanonicalUris ?? [];
  if (parentUris.length === 0) return [];
  const resolved = new Set<string>();
  const unresolved: string[] = [];
  for (const parentUri of parentUris) {
    const values = identities.get(parentUri);
    if (!values || values.size === 0) {
      unresolved.push(parentUri);
      continue;
    }
    for (const value of values) resolved.add(value);
  }
  if (unresolved.length > 0) {
    throw new CollectionAcquisitionError(
      "ATTACHMENT_PARENT_ARTIFACT_UNRESOLVED",
      `Attachment parent lineage could not resolve immutable RawArtifact identity for ${unresolved.join(", ")}`,
      false,
    );
  }
  return [...resolved].sort();
}

/**
 * Executes an already-claimed Job behind the Worker lease boundary.
 *
 * This class deliberately does not claim Jobs and does not know how a Connector
 * acquires content. Lease ownership stays in Worker Protocol v1, while a reviewed
 * Connector implementation is injected through CollectionArtifactAcquirer.
 */
export class ArtifactBackedCollectionExecutor {
  constructor(
    private readonly acquirer: CollectionArtifactAcquirer,
    private readonly client: ArtifactBackedExecutionClient,
  ) {}

  async execute(context: ArtifactBackedExecutionContext): Promise<ExecutionReceipt | null> {
    if (!context.leaseToken) {
      throw new CollectionAcquisitionError(
        "LEASE_TOKEN_REQUIRED",
        "Artifact-backed execution requires a Worker lease token",
        false,
      );
    }

    const prefix = `artifact-${context.lease.id}`;
    let started = false;
    try {
      await this.client.start(context, this.acquirer.executor, `${prefix}-start`);
      started = true;

      const acquired = await this.acquirer.acquire(context);
      if (acquired.length === 0) {
        throw new CollectionAcquisitionError(
          "NO_ARTIFACTS_PRODUCED",
          "Connector completed without producing artifact evidence",
          false,
        );
      }
      acquired.forEach((artifact) => assertArtifactAllowed(context.job, artifact));
      const selection = await selectChangedArtifacts(context, acquired, this.client);

      await this.client.uploading(context, `${prefix}-uploading`);
      if (selection.changed.length === 0) {
        await this.client.verifying(context, `${prefix}-verifying`);
        const receipt: ExecutionReceipt = {
          executor: this.acquirer.executor,
          outputKinds: [...new Set(acquired.map((artifact) => artifact.artifactKind))],
          itemsObserved: acquired.length,
          bytesPrepared: 0,
          metadataOnly: true,
          summary: `Change watch observed ${acquired.length} artifact(s); all content identities match the latest immutable RawArtifact versions.`,
        };
        await this.client.complete(context, receipt, `${prefix}-complete`);
        return receipt;
      }

      const receipts: ArtifactIngestionReceipt[] = [];
      let bytesPrepared = 0;
      const ordered = orderedForLineage(selection.changed);
      for (const [index, artifact] of ordered.entries()) {
        const parentArtifactIds = resolveParentArtifactIds(
          artifact,
          selection.knownArtifactIdsByCanonicalUri,
        );
        const descriptor = descriptorFor(artifact, parentArtifactIds);
        const session = await this.client.createArtifactSession(
          context,
          descriptor,
          `${prefix}-artifact-${index + 1}`,
        );
        await this.client.uploadArtifactContent(context, session.id, artifact.content);
        const finalized = await this.client.finalizeArtifact(context, session.id);
        receipts.push(finalized);
        addArtifactIdentity(
          selection.knownArtifactIdsByCanonicalUri,
          artifact.canonicalUri,
          finalized.artifactId,
        );
        bytesPrepared += artifact.content.byteLength;
      }

      await this.client.verifying(context, `${prefix}-verifying`);
      const lineageSummary =
        selection.lineageRefreshCount > 0
          ? ` ${selection.lineageRefreshCount} unchanged child artifact(s) were re-observed to preserve attachment lineage to changed parent versions.`
          : "";
      const receipt: ExecutionReceipt = {
        executor: this.acquirer.executor,
        outputKinds: [...new Set(selection.changed.map((artifact) => artifact.artifactKind))],
        itemsObserved: selection.changed.length,
        bytesPrepared,
        metadataOnly: false,
        artifactReceiptIds: receipts.map((item) => item.id),
        summary: isChangeWatch(context)
          ? `Artifact-backed change watch finalized ${receipts.length} immutable artifact observation(s) and skipped ${selection.unchangedCount} unchanged artifact(s).${lineageSummary}`
          : `Artifact-backed collection finalized ${receipts.length} immutable artifact receipt(s).`,
      };
      await this.client.complete(context, receipt, `${prefix}-complete`);
      return receipt;
    } catch (error) {
      if (started && error instanceof CollectionNotModifiedSignal) {
        await this.client.uploading(context, `${prefix}-uploading`);
        await this.client.verifying(context, `${prefix}-verifying`);
        const receipt: ExecutionReceipt = {
          executor: this.acquirer.executor,
          outputKinds: [...context.job.planSnapshot.output.artifactKinds],
          itemsObserved: 0,
          bytesPrepared: 0,
          metadataOnly: true,
          summary: `HTTP change watch confirmed no modification for ${error.canonicalUri}; no response body or RawArtifact upload was required.`,
        };
        await this.client.complete(context, receipt, `${prefix}-complete`);
        return receipt;
      }
      if (started) {
        const failure = failureFrom(error);
        try {
          await this.client.fail(context, failure, `${prefix}-fail`);
        } catch {
          // Preserve the original execution error. The control plane remains the
          // authority for terminal-state reconciliation if failure reporting itself fails.
        }
      }
      throw error;
    }
  }
}
