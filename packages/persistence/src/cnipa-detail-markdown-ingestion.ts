import { createHash } from "node:crypto";
import type { ArtifactUploadDescriptor } from "@markorbit/contracts";
import type { RawArtifactRepository, RawArtifactView } from "./raw-artifact-repository";
import {
  cnipaDetailQueueCanonicalUri,
  type CnipaDetailDocumentKind,
} from "./cnipa-detail-enrichment-queue";
import { RegistryValidationError } from "./index";

export type CnipaEnrichedMarkdownIngestionRepository = Pick<
  RawArtifactRepository,
  "createSession" | "uploadContent" | "finalize"
>;

export type CnipaEnrichedMarkdownExecutionContext = {
  workerId: string;
  credential: string;
  leaseId: string;
  leaseToken: string;
};

export type CnipaEnrichedMarkdownInput = {
  documentKind: CnipaDetailDocumentKind;
  sourceRecordId: string;
  detailCanonicalUri: string;
  logicalDocumentUri: string;
  listMarkdownArtifactId: string;
  listRawArtifactId: string;
  detailRawArtifactId: string;
  markdownContent: Uint8Array;
};

function sha256(value: Uint8Array | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function required(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new RegistryValidationError(label + " is required");
  return normalized;
}

function expectedLogicalUri(documentKind: CnipaDetailDocumentKind, sourceRecordId: string): string {
  return "cnipa://judgment/" + documentKind + "/" + encodeURIComponent(sourceRecordId);
}

function byteStream(value: Uint8Array): AsyncIterable<Uint8Array> {
  return {
    async *[Symbol.asyncIterator]() {
      yield value;
    },
  };
}

function descriptor(
  input: CnipaEnrichedMarkdownInput,
  markdownSha256: string,
): ArtifactUploadDescriptor {
  const sourceRecordId = required(input.sourceRecordId, "sourceRecordId");
  const expectedDetailUri = cnipaDetailQueueCanonicalUri(input.documentKind, sourceRecordId);
  if (input.detailCanonicalUri !== expectedDetailUri) {
    throw new RegistryValidationError(
      "CNIPA DETAIL canonical URI does not match enrichment identity",
    );
  }
  const logicalUri = expectedLogicalUri(input.documentKind, sourceRecordId);
  if (input.logicalDocumentUri !== logicalUri) {
    throw new RegistryValidationError(
      "CNIPA logical document URI does not match enrichment identity",
    );
  }
  if (input.markdownContent.byteLength === 0) {
    throw new RegistryValidationError("CNIPA enriched Markdown content must not be empty");
  }
  const parentArtifactIds = [
    required(input.listMarkdownArtifactId, "listMarkdownArtifactId"),
    required(input.listRawArtifactId, "listRawArtifactId"),
    required(input.detailRawArtifactId, "detailRawArtifactId"),
  ];
  if (new Set(parentArtifactIds).size !== parentArtifactIds.length) {
    throw new RegistryValidationError(
      "CNIPA enriched Markdown parents must be distinct immutable artifacts",
    );
  }
  const identityHash = sha256(input.documentKind + "\u0000" + sourceRecordId).slice(0, 20);
  return {
    artifactKind: "MARKDOWN",
    mimeType: "text/markdown;charset=UTF-8",
    originalName:
      "cnipa-" +
      input.documentKind.toLowerCase().replaceAll("_", "-") +
      "-document-" +
      identityHash +
      ".md",
    expectedSizeBytes: input.markdownContent.byteLength,
    expectedSha256: markdownSha256,
    sourceUri:
      "markorbit+cnipa://detail-enrichment/" +
      input.documentKind +
      "/" +
      encodeURIComponent(sourceRecordId),
    canonicalUri: logicalUri,
    parentArtifactIds,
  };
}

export async function ingestCnipaEnrichedMarkdown(input: {
  repository: CnipaEnrichedMarkdownIngestionRepository;
  execution: CnipaEnrichedMarkdownExecutionContext;
  enrichment: CnipaEnrichedMarkdownInput;
}): Promise<{ artifact: RawArtifactView; sha256: string }> {
  const contentSha256 = sha256(input.enrichment.markdownContent);
  const uploadDescriptor = descriptor(input.enrichment, contentSha256);
  const sourceRecordId = required(input.enrichment.sourceRecordId, "sourceRecordId");
  const identityHash = sha256(input.enrichment.documentKind + "\u0000" + sourceRecordId).slice(
    0,
    16,
  );
  const created = input.repository.createSession({
    ...input.execution,
    descriptor: uploadDescriptor,
    idempotencyKey: "cnipa-detail-markdown:" + identityHash + ":" + contentSha256,
  });
  const sessionId = created.record.session.id;
  await input.repository.uploadContent(
    input.execution.workerId,
    input.execution.credential,
    input.execution.leaseId,
    input.execution.leaseToken,
    sessionId,
    byteStream(input.enrichment.markdownContent),
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
      "Finalized CNIPA enriched Markdown SHA-256 does not match source bytes",
    );
  }
  return { artifact: finalized.artifact, sha256: contentSha256 };
}
