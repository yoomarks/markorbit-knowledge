import { createHash } from "node:crypto";
import type { RawArtifact } from "./raw-artifact-schema";
import type { ArtifactStoragePort } from "./artifact-storage-port";

export type LegacyRawArtifactCandidate = {
  id: string;
  sourceId: string;
  contentType: string;
  payload: string;
  metadata?: Record<string, unknown>;
  capturedAt: string;
};

function isCanonicalArtifact(
  artifact: RawArtifact | LegacyRawArtifactCandidate,
): artifact is RawArtifact {
  return "objectType" in artifact && artifact.objectType === "RAW_ARTIFACT";
}

function normalizeLegacyArtifact(artifact: LegacyRawArtifactCandidate): RawArtifact {
  const digest = createHash("sha256").update(artifact.payload).digest("hex");
  return {
    schemaVersion: "1.0",
    objectType: "RAW_ARTIFACT",
    id: artifact.id,
    workspaceId: "wsp_00000000000000000000000000",
    sourceId: artifact.sourceId,
    version: 1,
    artifactKind: "JSON",
    mimeType: artifact.contentType,
    originalName: `${artifact.id}.json`,
    storage: {
      provider: "REMOTE_REFERENCE",
      uri: `memory://artifact/${artifact.id}`,
    },
    binaryHash: {
      algorithm: "SHA-256",
      value: digest,
    },
    contentHash: {
      algorithm: "SHA-256",
      value: digest,
    },
    sizeBytes: Buffer.byteLength(artifact.payload),
    capturedAt: artifact.capturedAt,
    collector: {
      connectorId: "legacy-memory-artifact",
      connectorVersion: "0.1.0",
    },
    provenance: {
      sourceUri: `memory://source/${artifact.sourceId}`,
    },
    status: "RECEIVED",
    createdAt: artifact.capturedAt,
  };
}

export class MemoryArtifactStorage implements ArtifactStoragePort {
  private readonly items = new Map<string, RawArtifact>();

  async store(artifact: RawArtifact): Promise<void> {
    this.items.set(artifact.id, artifact);
  }

  async put(artifact: RawArtifact | LegacyRawArtifactCandidate): Promise<void> {
    await this.store(isCanonicalArtifact(artifact) ? artifact : normalizeLegacyArtifact(artifact));
  }

  async get(id: string): Promise<RawArtifact | undefined> {
    return this.items.get(id);
  }
}
