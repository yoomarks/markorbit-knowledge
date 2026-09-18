import { createHash } from "node:crypto";
import type { ArtifactUploadDescriptor } from "@markorbit/contracts";
import type { RawArtifactRepository, RawArtifactView } from "@markorbit/persistence/raw-artifacts";
import type { CnipaDetailMarkdownEnrichmentV1 } from "@markorbit/worker-runtime/cnipa-detail-markdown-enrichment";

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

export type CnipaEnrichedMarkdownIngestionResult = {
  artifact: RawArtifactView;
  sha256: string;
};

const SHA256 = /^[a-f0-9]{64}$/;

function sha256(value: Uint8Array | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function required(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} is required`);
  return normalized;
}

function byteStream(value: Uint8Array): AsyncIterable<Uint8Array> {
  return {
    async *[Symbol.asyncIterator]() {
      yield value;
    },
  };
}

function validateSeed(seed: CnipaDetailMarkdownEnrichmentV1): {
  content: Uint8Array;
  listArtifactId: string;
  detailArtifactId: string;
} {
  const listArtifactId = required(seed.listArtifactId, "listArtifactId");
  const detailArtifactId = required(seed.detailArtifactId, "detailArtifactId");
  if (listArtifactId === detailArtifactId) {
    throw new Error("CNIPA enriched Markdown requires distinct LIST and DETAIL parent artifacts");
  }
  if (
    !SHA256.test(seed.baseMarkdownSha256) ||
    !SHA256.test(seed.detailBodySha256) ||
    !SHA256.test(seed.enrichedMarkdownSha256)
  ) {
    throw new Error("CNIPA enriched Markdown seed contains an invalid SHA-256");
  }
  const content = new TextEncoder().encode(seed.markdownBody);
  if (sha256(content) !== seed.enrichedMarkdownSha256) {
    throw new Error("CNIPA enriched Markdown bytes do not match seed SHA-256");
  }
  if (!seed.logicalDocumentUri.startsWith("cnipa://judgment/")) {
    throw new Error("CNIPA enriched Markdown logical document URI is invalid");
  }
  return { content, listArtifactId, detailArtifactId };
}

function descriptor(
  seed: CnipaDetailMarkdownEnrichmentV1,
  content: Uint8Array,
  parents: readonly [string, string],
): ArtifactUploadDescriptor {
  const identity = sha256(
    `${seed.documentKind}\u0000${seed.sourceRecordId}\u0000${seed.logicalDocumentUri}`,
  ).slice(0, 20);
  return {
    artifactKind: "MARKDOWN",
    mimeType: "text/markdown",
    originalName: `cnipa-enriched-${seed.documentKind.toLowerCase().replaceAll("_", "-")}-${identity}.md`,
    expectedSizeBytes: content.byteLength,
    expectedSha256: seed.enrichedMarkdownSha256,
    sourceUri: seed.logicalDocumentUri,
    canonicalUri: seed.logicalDocumentUri,
    parentArtifactIds: [...parents],
  };
}

export async function ingestCnipaEnrichedMarkdown(input: {
  repository: CnipaEnrichedMarkdownIngestionRepository;
  execution: CnipaEnrichedMarkdownExecutionContext;
  enrichment: CnipaDetailMarkdownEnrichmentV1;
}): Promise<CnipaEnrichedMarkdownIngestionResult> {
  const validated = validateSeed(input.enrichment);
  const parentArtifactIds: [string, string] = [
    validated.listArtifactId,
    validated.detailArtifactId,
  ];
  const identityHash = sha256(
    [
      input.enrichment.logicalDocumentUri,
      validated.listArtifactId,
      validated.detailArtifactId,
      input.enrichment.baseMarkdownSha256,
      input.enrichment.detailBodySha256,
    ].join("\u0000"),
  ).slice(0, 20);
  const created = input.repository.createSession({
    ...input.execution,
    descriptor: descriptor(input.enrichment, validated.content, parentArtifactIds),
    idempotencyKey: `cnipa-enriched-md:${identityHash}:${input.enrichment.enrichedMarkdownSha256}`,
  });
  const sessionId = created.record.session.id;
  await input.repository.uploadContent(
    input.execution.workerId,
    input.execution.credential,
    input.execution.leaseId,
    input.execution.leaseToken,
    sessionId,
    byteStream(validated.content),
  );
  const finalized = await input.repository.finalize(
    input.execution.workerId,
    input.execution.credential,
    input.execution.leaseId,
    input.execution.leaseToken,
    sessionId,
  );
  if (finalized.artifact.contentObject.sha256 !== input.enrichment.enrichedMarkdownSha256) {
    throw new Error("Finalized CNIPA enriched Markdown SHA-256 does not match seed");
  }
  return {
    artifact: finalized.artifact,
    sha256: input.enrichment.enrichedMarkdownSha256,
  };
}
