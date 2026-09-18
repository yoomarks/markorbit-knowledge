import { createHash } from "node:crypto";
import type { ArtifactUploadDescriptor } from "@markorbit/contracts";
import type { RawArtifactRepository, RawArtifactView } from "./raw-artifact-repository";
import {
  cnipaDetailQueueCanonicalUri,
  type CnipaDetailDocumentKind,
} from "./cnipa-detail-enrichment-queue";
import { RegistryValidationError } from "./index";

export type CnipaDetailRawArtifactIngestionRepository = Pick<
  RawArtifactRepository,
  "createSession" | "uploadContent" | "finalize"
>;

export type CnipaDetailRawArtifactExecutionContext = {
  workerId: string;
  credential: string;
  leaseId: string;
  leaseToken: string;
};

export type CnipaDetailRawArtifactInput = {
  documentKind: CnipaDetailDocumentKind;
  sourceRecordId: string;
  detailCanonicalUri: string;
  sourceUri: string;
  observedAt: string;
  mimeType: string;
  content: Uint8Array;
};

export type CnipaDetailRawArtifactIngestionResult = {
  artifact: RawArtifactView;
  sha256: string;
};

function sha256(value: Uint8Array | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function byteStream(value: Uint8Array): AsyncIterable<Uint8Array> {
  return {
    async *[Symbol.asyncIterator]() {
      yield value;
    },
  };
}

function validateInput(input: CnipaDetailRawArtifactInput): string {
  const sourceRecordId = input.sourceRecordId.trim();
  if (!sourceRecordId) throw new RegistryValidationError("sourceRecordId is required");
  const expectedUri = cnipaDetailQueueCanonicalUri(input.documentKind, sourceRecordId);
  if (input.detailCanonicalUri !== expectedUri) {
    throw new RegistryValidationError(
      "CNIPA DETAIL canonical URI does not match document identity",
    );
  }
  if (!input.sourceUri.trim()) {
    throw new RegistryValidationError("CNIPA DETAIL sourceUri is required");
  }
  const observedAt = new Date(input.observedAt);
  if (Number.isNaN(observedAt.getTime())) {
    throw new RegistryValidationError("CNIPA DETAIL observedAt must be an ISO timestamp");
  }
  if (!input.mimeType.toLowerCase().includes("json")) {
    throw new RegistryValidationError("CNIPA DETAIL RawArtifact must preserve JSON evidence");
  }
  if (input.content.byteLength === 0) {
    throw new RegistryValidationError("CNIPA DETAIL RawArtifact content must not be empty");
  }
  return sourceRecordId;
}

function descriptor(
  input: CnipaDetailRawArtifactInput,
  sourceRecordId: string,
  contentSha256: string,
): ArtifactUploadDescriptor {
  const identityHash = sha256(`${input.documentKind}\u0000${sourceRecordId}`).slice(0, 20);
  return {
    artifactKind: "JSON",
    mimeType: input.mimeType,
    originalName: `cnipa-detail-${input.documentKind.toLowerCase().replaceAll("_", "-")}-${identityHash}.json`,
    expectedSizeBytes: input.content.byteLength,
    expectedSha256: contentSha256,
    sourceUri: input.sourceUri,
    canonicalUri: input.detailCanonicalUri,
  };
}

export async function ingestCnipaDetailAsRawArtifact(input: {
  repository: CnipaDetailRawArtifactIngestionRepository;
  execution: CnipaDetailRawArtifactExecutionContext;
  detail: CnipaDetailRawArtifactInput;
}): Promise<CnipaDetailRawArtifactIngestionResult> {
  const sourceRecordId = validateInput(input.detail);
  const contentSha256 = sha256(input.detail.content);
  const identityHash = sha256(`${input.detail.documentKind}\u0000${sourceRecordId}`).slice(0, 16);
  const created = input.repository.createSession({
    ...input.execution,
    descriptor: descriptor(input.detail, sourceRecordId, contentSha256),
    idempotencyKey: `cnipa-detail:${identityHash}:${contentSha256}`,
  });
  const sessionId = created.record.session.id;
  await input.repository.uploadContent(
    input.execution.workerId,
    input.execution.credential,
    input.execution.leaseId,
    input.execution.leaseToken,
    sessionId,
    byteStream(input.detail.content),
  );
  const finalized = await input.repository.finalize(
    input.execution.workerId,
    input.execution.credential,
    input.execution.leaseId,
    input.execution.leaseToken,
    sessionId,
  );
  if (finalized.artifact.contentObject.sha256 !== contentSha256) {
    throw new RegistryValidationError(
      "Finalized CNIPA DETAIL RawArtifact SHA-256 does not match source bytes",
    );
  }
  return { artifact: finalized.artifact, sha256: contentSha256 };
}
