import { createHash } from "node:crypto";
import type { ArtifactIngestionReceipt, ArtifactUploadDescriptor } from "@markorbit/contracts";
import {
  CollectionAcquisitionError,
  type AcquiredCollectionArtifact,
  type ArtifactBackedExecutionClient,
  type ArtifactBackedExecutionContext,
} from "./artifact-backed-collection-executor";

export type StreamingArtifactWriteResult = {
  artifactId: string;
  canonicalUri: string;
  contentSha256: string;
  sizeBytes: number;
  reused: boolean;
  receipt?: ArtifactIngestionReceipt;
};

function sha256(content: Uint8Array | string): string {
  return createHash("sha256").update(content).digest("hex");
}
function canonicalUri(artifact: AcquiredCollectionArtifact): string {
  const value = artifact.canonicalUri?.trim();
  if (!value) {
    throw new CollectionAcquisitionError(
      "STREAM_ARTIFACT_CANONICAL_URI_REQUIRED",
      "Streaming artifact ingestion requires canonicalUri",
      false,
    );
  }
  return value;
}

export function streamingArtifactIdempotencyKey(artifact: AcquiredCollectionArtifact): string {
  const canonical = canonicalUri(artifact);
  const contentSha256 = sha256(artifact.content);
  return "stream-artifact-" + sha256(canonical).slice(0, 16) + "-" + contentSha256.slice(0, 16);
}

function assertArtifactAllowed(
  context: ArtifactBackedExecutionContext,
  artifact: AcquiredCollectionArtifact,
): void {
  if (!context.job.planSnapshot.output.artifactKinds.includes(artifact.artifactKind)) {
    throw new CollectionAcquisitionError(
      "ARTIFACT_KIND_NOT_AUTHORIZED",
      `Artifact kind ${artifact.artifactKind} is outside the immutable CollectionPlan snapshot`,
      false,
    );
  }
  if (artifact.content.byteLength <= 0) {
    throw new CollectionAcquisitionError(
      "EMPTY_ARTIFACT_NOT_ALLOWED",
      "Streaming artifact ingestion cannot finalize empty content",
      false,
    );
  }
}

function descriptorFor(
  artifact: AcquiredCollectionArtifact,
  parentArtifactIds: readonly string[],
): ArtifactUploadDescriptor {
  return {
    artifactKind: artifact.artifactKind,
    mimeType: artifact.mimeType,
    originalName: artifact.originalName,
    expectedSizeBytes: artifact.content.byteLength,
    expectedSha256: sha256(artifact.content),
    sourceUri: artifact.sourceUri,
    ...(artifact.canonicalUri ? { canonicalUri: artifact.canonicalUri } : {}),
    ...(artifact.publishedAt ? { publishedAt: artifact.publishedAt } : {}),
    ...(parentArtifactIds.length > 0 ? { parentArtifactIds: [...new Set(parentArtifactIds)] } : {}),
  };
}

function artifactId(value: string): string {
  const normalized = value.trim();
  if (!/^art_[0-9A-HJKMNP-TV-Z]{26}$/u.test(normalized)) {
    throw new TypeError("artifactId must satisfy the RawArtifact id format");
  }
  return normalized;
}

export class StreamingArtifactWriter {
  private readonly knownArtifactIds = new Map<string, string>();

  constructor(
    private readonly context: ArtifactBackedExecutionContext,
    private readonly client: ArtifactBackedExecutionClient,
  ) {
    if (!context.leaseToken) {
      throw new CollectionAcquisitionError(
        "LEASE_TOKEN_REQUIRED",
        "Streaming artifact ingestion requires a Worker lease token",
        false,
      );
    }
    if (!client.checkArtifactContent) {
      throw new CollectionAcquisitionError(
        "STREAM_ARTIFACT_IDENTITY_CHECK_REQUIRED",
        "Streaming artifact ingestion requires canonical content identity checks",
        false,
      );
    }
  }

  remember(canonical: string, durableArtifactId: string): void {
    const normalizedCanonical = canonical.trim();
    if (!normalizedCanonical) throw new TypeError("canonicalUri is required");
    this.knownArtifactIds.set(normalizedCanonical, artifactId(durableArtifactId));
  }

  knownArtifactId(canonical: string): string | null {
    return this.knownArtifactIds.get(canonical.trim()) ?? null;
  }

  retainCanonicalUris(canonicalUris: readonly string[]): void {
    const keep = new Set(canonicalUris.map((value) => value.trim()).filter(Boolean));
    for (const key of this.knownArtifactIds.keys()) {
      if (!keep.has(key)) this.knownArtifactIds.delete(key);
    }
  }

  private resolveParentArtifactIds(artifact: AcquiredCollectionArtifact): string[] {
    const resolved = new Set(artifact.parentArtifactIds ?? []);
    const missing: string[] = [];
    for (const parentCanonical of artifact.parentCanonicalUris ?? []) {
      const id = this.knownArtifactIds.get(parentCanonical);
      if (!id) missing.push(parentCanonical);
      else resolved.add(id);
    }
    if (missing.length > 0) {
      throw new CollectionAcquisitionError(
        "STREAM_ARTIFACT_PARENT_NOT_DURABLE",
        `Streaming artifact parents are not durable in this checkpoint: ${missing.join(", ")}`,
        false,
      );
    }
    return [...resolved];
  }

  async write(artifact: AcquiredCollectionArtifact): Promise<StreamingArtifactWriteResult> {
    assertArtifactAllowed(this.context, artifact);
    const canonical = canonicalUri(artifact);
    const contentSha256 = sha256(artifact.content);
    const parentArtifactIds = this.resolveParentArtifactIds(artifact);
    const identity = await this.client.checkArtifactContent!(this.context, {
      artifactKind: artifact.artifactKind,
      canonicalUri: canonical,
      sha256: contentSha256,
    });
    if (identity.unchanged && identity.latestArtifactId) {
      this.remember(canonical, identity.latestArtifactId);
      return {
        artifactId: identity.latestArtifactId,
        canonicalUri: canonical,
        contentSha256,
        sizeBytes: artifact.content.byteLength,
        reused: true,
      };
    }

    const session = await this.client.createArtifactSession(
      this.context,
      descriptorFor(artifact, parentArtifactIds),
      streamingArtifactIdempotencyKey(artifact),
    );
    await this.client.uploadArtifactContent(this.context, session.id, artifact.content);
    const receipt = await this.client.finalizeArtifact(this.context, session.id);
    if (
      receipt.contentSha256 !== contentSha256 ||
      receipt.sizeBytes !== artifact.content.byteLength
    ) {
      throw new CollectionAcquisitionError(
        "STREAM_ARTIFACT_FINALIZE_MISMATCH",
        "Finalized streaming artifact receipt does not match submitted content",
        false,
      );
    }
    this.remember(canonical, receipt.artifactId);
    return {
      artifactId: receipt.artifactId,
      canonicalUri: canonical,
      contentSha256,
      sizeBytes: artifact.content.byteLength,
      reused: false,
      receipt,
    };
  }
}
