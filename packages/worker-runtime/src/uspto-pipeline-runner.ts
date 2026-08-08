import { createHash } from "node:crypto";
import { type RawArtifact } from "./raw-artifact-schema";
import { type ArtifactStoragePort } from "./artifact-storage-port";
import { UsptoSourceParser } from "./uspto-source-parser";
import { UsptoSourceNormalizer } from "./uspto-source-normalizer";

export interface UsptoPipelineEnvelope {
  sourceId?: string;
  workspaceId?: string;
  payload?: unknown;
}

export interface UsptoPipelineOutput {
  artifact: RawArtifact;
  record: ReturnType<UsptoSourceNormalizer["normalize"]>;
}

function splitInput(input: unknown): {
  sourceId: string;
  workspaceId: string;
  payload: unknown;
} {
  if (typeof input === "object" && input !== null && "payload" in input) {
    const envelope = input as UsptoPipelineEnvelope;
    return {
      sourceId: envelope.sourceId ?? "USPTO",
      workspaceId: envelope.workspaceId ?? "wsp_00000000000000000000000000",
      payload: envelope.payload,
    };
  }

  return {
    sourceId: "USPTO",
    workspaceId: "wsp_00000000000000000000000000",
    payload: input,
  };
}

export class UsptoPipelineRunner {
  private readonly parser = new UsptoSourceParser();
  private readonly normalizer = new UsptoSourceNormalizer();

  constructor(private readonly storage?: ArtifactStoragePort) {}

  async run(input: unknown): Promise<UsptoPipelineOutput> {
    const envelope = splitInput(input);
    const parsed = await this.parser.parse(envelope.payload);
    const record = this.normalizer.normalize(parsed);
    const serialized = JSON.stringify(parsed);
    const digest = createHash("sha256").update(serialized).digest("hex");
    const now = new Date().toISOString();
    const artifactId = `art_${digest.slice(0, 26).toUpperCase()}`;

    const artifact: RawArtifact = {
      schemaVersion: "1.0",
      objectType: "RAW_ARTIFACT",
      id: artifactId,
      workspaceId: envelope.workspaceId,
      sourceId: envelope.sourceId,
      version: 1,
      artifactKind: "JSON",
      mimeType: "application/json",
      originalName: "uspto-source-record.json",
      storage: {
        provider: "REMOTE_REFERENCE",
        uri: `memory://uspto/${artifactId}`,
      },
      binaryHash: {
        algorithm: "SHA-256",
        value: digest,
      },
      contentHash: {
        algorithm: "SHA-256",
        value: digest,
      },
      sizeBytes: Buffer.byteLength(serialized),
      capturedAt: now,
      collector: {
        connectorId: "uspto-source-adapter",
        connectorVersion: "0.1.0",
      },
      provenance: {
        sourceUri: "https://www.uspto.gov/",
      },
      status: "RECEIVED",
      createdAt: now,
    };

    if (this.storage) {
      await this.storage.store(artifact);
    }

    return { artifact, record };
  }
}
