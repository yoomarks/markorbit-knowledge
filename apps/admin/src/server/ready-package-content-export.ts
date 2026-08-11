import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  READY_PACKAGE_CONTENT_EXPORT_VERSION,
  assertReadyPackageContentExportV1,
  type ReadyPackageContentExportV1,
  type ReadyPackageEvidence,
} from "@markorbit/contracts";
import { RegistryConflictError, RegistryError, RegistryValidationError } from "@markorbit/persistence";
import type { RawArtifactRepository } from "@markorbit/persistence/raw-artifacts";
import type { ReadyPackageRegistryRepository } from "@markorbit/persistence/ready-packages";
import type { StagingContentRegistryRepository } from "@markorbit/persistence/staging-content";

export type ReadyPackageContentExportInput = {
  workspaceId: string;
  readyPackageId: string;
};

type ReadyPackageContentExportRepositories = {
  readyPackages: Pick<ReadyPackageRegistryRepository, "getById">;
  rawArtifacts: Pick<RawArtifactRepository, "getArtifact" | "contentPath">;
  staging: Pick<StagingContentRegistryRepository, "getDocument" | "readContent">;
};

type FrozenEvidence = Required<
  Pick<
    ReadyPackageEvidence,
    | "sourceId"
    | "conversionRunId"
    | "rawArtifactSha256"
    | "stagingSha256"
    | "verificationId"
    | "verificationOutcome"
    | "converter"
    | "capturedAt"
    | "legalTruthVerified"
  >
> & {
  artifactIds: [string];
  stagingDocumentId: string;
  digest: string;
};

function stable(value: unknown): string {
  if (value === undefined) return "null";
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .filter((key) => (value as Record<string, unknown>)[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stable((value as Record<string, unknown>)[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value: Uint8Array | string): string {
  return createHash("sha256").update(value).digest("hex");
}

async function hashFile(path: string): Promise<{ sha256: string; sizeBytes: number }> {
  const hash = createHash("sha256");
  let sizeBytes = 0;
  for await (const chunk of createReadStream(path)) {
    const bytes = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
    sizeBytes += bytes.byteLength;
    hash.update(bytes);
  }
  return { sha256: hash.digest("hex"), sizeBytes };
}

function requireFrozenEvidence(evidence: ReadyPackageEvidence): FrozenEvidence {
  if (
    evidence.artifactIds.length !== 1 ||
    !evidence.artifactIds[0] ||
    !evidence.stagingDocumentId ||
    !evidence.sourceId ||
    !evidence.conversionRunId ||
    !evidence.rawArtifactSha256 ||
    !evidence.stagingSha256 ||
    !evidence.verificationId ||
    !evidence.verificationOutcome ||
    !evidence.converter ||
    !evidence.capturedAt ||
    evidence.legalTruthVerified !== false
  ) {
    throw new RegistryConflictError(
      "READY_PACKAGE_CONTENT_EXPORT_EVIDENCE_INCOMPLETE",
      "ReadyPackage does not contain the frozen V1 evidence required for content export",
    );
  }
  return evidence as FrozenEvidence;
}

function verifyReadyPackageDigest(evidence: FrozenEvidence): void {
  const calculated = sha256(
    stable({
      artifactIds: evidence.artifactIds,
      stagingDocumentId: evidence.stagingDocumentId,
      sourceId: evidence.sourceId,
      conversionRunId: evidence.conversionRunId,
      rawArtifactSha256: evidence.rawArtifactSha256,
      stagingSha256: evidence.stagingSha256,
      verificationId: evidence.verificationId,
      verificationOutcome: evidence.verificationOutcome,
      converter: evidence.converter,
      capturedAt: evidence.capturedAt,
      legalTruthVerified: false,
    }),
  );
  if (calculated !== evidence.digest) {
    throw new RegistryConflictError(
      "READY_PACKAGE_CONTENT_EXPORT_DIGEST_MISMATCH",
      "ReadyPackage evidence no longer matches its frozen digest",
    );
  }
}

function sameConverter(
  left: { converterId: string; version: string },
  right: { converterId: string; version: string },
): boolean {
  return left.converterId === right.converterId && left.version === right.version;
}

export async function buildReadyPackageContentExportV1(
  input: ReadyPackageContentExportInput,
  repositories: ReadyPackageContentExportRepositories,
): Promise<ReadyPackageContentExportV1> {
  const workspaceId = input.workspaceId.trim();
  const readyPackageId = input.readyPackageId.trim();
  if (!workspaceId) throw new RegistryValidationError("workspaceId is required");
  if (!readyPackageId) throw new RegistryValidationError("readyPackageId is required");

  const readyPackage = repositories.readyPackages.getById(readyPackageId, workspaceId);
  if (!readyPackage) {
    throw new RegistryError(
      "READY_PACKAGE_NOT_FOUND",
      `ReadyPackage ${readyPackageId} was not found`,
    );
  }
  if (readyPackage.status !== "VERIFIED" && readyPackage.status !== "HANDED_OFF") {
    throw new RegistryConflictError(
      "READY_PACKAGE_CONTENT_EXPORT_NOT_VERIFIED",
      "ReadyPackage must be verified before content export",
    );
  }

  const evidence = requireFrozenEvidence(readyPackage.evidence);
  verifyReadyPackageDigest(evidence);
  const rawArtifactId = evidence.artifactIds[0];
  const rawArtifact = repositories.rawArtifacts.getArtifact(rawArtifactId);
  if (!rawArtifact || rawArtifact.artifact.workspaceId !== workspaceId) {
    throw new RegistryConflictError(
      "READY_PACKAGE_CONTENT_EXPORT_RAW_ARTIFACT_MISSING",
      "Frozen raw artifact evidence is unavailable in this workspace",
    );
  }
  if (
    rawArtifact.artifact.binaryHash.value !== evidence.rawArtifactSha256 ||
    rawArtifact.contentObject.sha256 !== evidence.rawArtifactSha256
  ) {
    throw new RegistryConflictError(
      "READY_PACKAGE_CONTENT_EXPORT_RAW_ARTIFACT_HASH_MISMATCH",
      "Raw artifact metadata no longer matches the ReadyPackage evidence",
    );
  }

  const rawContent = repositories.rawArtifacts.contentPath(rawArtifactId);
  if (
    rawContent.sizeBytes !== rawArtifact.artifact.sizeBytes ||
    rawContent.sizeBytes !== rawArtifact.contentObject.sizeBytes ||
    rawContent.mimeType !== rawArtifact.artifact.mimeType ||
    rawContent.originalName !== rawArtifact.artifact.originalName
  ) {
    throw new RegistryConflictError(
      "READY_PACKAGE_CONTENT_EXPORT_RAW_ARTIFACT_METADATA_MISMATCH",
      "Raw artifact content metadata no longer matches its registry record",
    );
  }
  const observedRaw = await hashFile(rawContent.path);
  if (
    observedRaw.sha256 !== evidence.rawArtifactSha256 ||
    observedRaw.sizeBytes !== rawContent.sizeBytes
  ) {
    throw new RegistryConflictError(
      "READY_PACKAGE_CONTENT_EXPORT_RAW_ARTIFACT_BYTES_MISMATCH",
      "Raw artifact bytes no longer match the frozen ReadyPackage evidence",
    );
  }

  const stagingRecord = repositories.staging.getDocument(evidence.stagingDocumentId, workspaceId);
  if (!stagingRecord) {
    throw new RegistryConflictError(
      "READY_PACKAGE_CONTENT_EXPORT_STAGING_MISSING",
      "Frozen staging document evidence is unavailable in this workspace",
    );
  }
  const descriptor = stagingRecord.descriptor;
  if (
    descriptor.workspaceId !== workspaceId ||
    descriptor.sourceId !== evidence.sourceId ||
    descriptor.rawArtifactId !== rawArtifactId ||
    descriptor.conversionRunId !== evidence.conversionRunId ||
    descriptor.outputFormat !== "MARKDOWN" ||
    descriptor.contentHash.algorithm !== "SHA-256" ||
    descriptor.contentHash.value !== evidence.stagingSha256 ||
    !sameConverter(descriptor.converter, evidence.converter)
  ) {
    throw new RegistryConflictError(
      "READY_PACKAGE_CONTENT_EXPORT_STAGING_PROVENANCE_MISMATCH",
      "Staging document no longer matches the frozen ReadyPackage provenance",
    );
  }

  const stagingBytes = repositories.staging.readContent(evidence.stagingDocumentId, workspaceId);
  if (
    sha256(stagingBytes) !== evidence.stagingSha256 ||
    stagingBytes.byteLength !== descriptor.sizeBytes
  ) {
    throw new RegistryConflictError(
      "READY_PACKAGE_CONTENT_EXPORT_STAGING_BYTES_MISMATCH",
      "Staging content no longer matches the frozen ReadyPackage evidence",
    );
  }

  let content: string;
  try {
    content = new TextDecoder("utf-8", { fatal: true }).decode(stagingBytes);
  } catch {
    throw new RegistryConflictError(
      "READY_PACKAGE_CONTENT_EXPORT_STAGING_ENCODING_INVALID",
      "Staging Markdown is not valid UTF-8",
    );
  }

  const exported: ReadyPackageContentExportV1 = {
    contractVersion: READY_PACKAGE_CONTENT_EXPORT_VERSION,
    objectType: "READY_PACKAGE_CONTENT_EXPORT",
    readyPackageId: readyPackage.id,
    knowledgeWorkspaceId: readyPackage.workspaceId,
    readyPackageDigest: evidence.digest,
    provenance: {
      sourceId: evidence.sourceId,
      conversionRunId: evidence.conversionRunId,
      verificationId: evidence.verificationId,
      verificationOutcome: evidence.verificationOutcome,
      capturedAt: evidence.capturedAt,
      converter: { ...evidence.converter },
      legalTruthVerified: false,
    },
    rawArtifact: {
      artifactId: rawArtifactId,
      sha256: evidence.rawArtifactSha256,
      sizeBytes: rawArtifact.artifact.sizeBytes,
      mimeType: rawArtifact.artifact.mimeType,
      originalName: rawArtifact.artifact.originalName,
    },
    stagingDocument: {
      documentId: evidence.stagingDocumentId,
      sha256: evidence.stagingSha256,
      sizeBytes: descriptor.sizeBytes,
      mediaType: "text/markdown",
      encoding: "utf-8",
      content,
    },
  };
  assertReadyPackageContentExportV1(exported);
  return exported;
}
