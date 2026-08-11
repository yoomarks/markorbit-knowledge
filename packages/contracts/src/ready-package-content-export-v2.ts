import type { CanonicalDownstreamVaultImportOriginV1 } from "./canonical-downstream-document-v1";

export const READY_PACKAGE_CONTENT_EXPORT_V2_VERSION = "2.0" as const;
export const READY_PACKAGE_CONTENT_EXPORT_V2_OBJECT_TYPE = "READY_PACKAGE_CONTENT_EXPORT" as const;

export type ReadyPackageContentExportV2 = {
  contractVersion: typeof READY_PACKAGE_CONTENT_EXPORT_V2_VERSION;
  objectType: typeof READY_PACKAGE_CONTENT_EXPORT_V2_OBJECT_TYPE;
  readyPackageId: string;
  knowledgeWorkspaceId: string;
  readyPackageDigest: string;
  canonicalDocument: {
    documentId: string;
    promotedAt: string;
  };
  provenance: {
    origin: CanonicalDownstreamVaultImportOriginV1;
    legalTruthVerified: false;
  };
  content: {
    sha256: string;
    sizeBytes: number;
    contentAddressedRef: string;
    mediaType: "text/markdown";
    encoding: "utf-8";
    content: string;
  };
};

const SHA256 = /^[a-f0-9]{64}$/u;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(value);
  return keys.length === expected.length && expected.every((key) => keys.includes(key));
}

function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function isVaultImportOrigin(value: unknown): value is CanonicalDownstreamVaultImportOriginV1 {
  if (!isRecord(value) || !isRecord(value.binding)) return false;
  if (
    !exactKeys(value, [
      "kind",
      "inspectionRunId",
      "importIntentId",
      "importExecutionId",
      "vaultStagingDocumentId",
      "verificationId",
      "verificationOutcome",
      "finalizationId",
      "rootFingerprintSha256",
      "binding",
      "vaultRelativePath",
      "bindingRelativePath",
      "observedAt",
      "reviewedAt",
      "importedAt",
      "verifiedAt",
    ]) ||
    !exactKeys(value.binding, ["bindingId", "revision", "relativeRoot"])
  ) {
    return false;
  }
  return (
    value.kind === "VAULT_IMPORT" &&
    typeof value.inspectionRunId === "string" &&
    value.inspectionRunId.startsWith("vin_") &&
    typeof value.importIntentId === "string" &&
    value.importIntentId.startsWith("vmi_") &&
    typeof value.importExecutionId === "string" &&
    value.importExecutionId.startsWith("vie_") &&
    typeof value.vaultStagingDocumentId === "string" &&
    value.vaultStagingDocumentId.startsWith("vst_") &&
    typeof value.verificationId === "string" &&
    value.verificationId.startsWith("vsv_") &&
    (value.verificationOutcome === "PASS" || value.verificationOutcome === "PASS_WITH_WARNINGS") &&
    typeof value.finalizationId === "string" &&
    value.finalizationId.startsWith("vsf_") &&
    typeof value.rootFingerprintSha256 === "string" &&
    SHA256.test(value.rootFingerprintSha256) &&
    typeof value.binding.bindingId === "string" &&
    value.binding.bindingId.startsWith("vlt_") &&
    typeof value.binding.revision === "number" &&
    Number.isSafeInteger(value.binding.revision) &&
    value.binding.revision > 0 &&
    typeof value.binding.relativeRoot === "string" &&
    value.binding.relativeRoot.length > 0 &&
    typeof value.vaultRelativePath === "string" &&
    value.vaultRelativePath.length > 0 &&
    typeof value.bindingRelativePath === "string" &&
    value.bindingRelativePath.length > 0 &&
    isTimestamp(value.observedAt) &&
    isTimestamp(value.reviewedAt) &&
    isTimestamp(value.importedAt) &&
    isTimestamp(value.verifiedAt)
  );
}

export function isReadyPackageContentExportV2(
  value: unknown,
): value is ReadyPackageContentExportV2 {
  if (
    !isRecord(value) ||
    !exactKeys(value, [
      "contractVersion",
      "objectType",
      "readyPackageId",
      "knowledgeWorkspaceId",
      "readyPackageDigest",
      "canonicalDocument",
      "provenance",
      "content",
    ]) ||
    !isRecord(value.canonicalDocument) ||
    !isRecord(value.provenance) ||
    !isRecord(value.content) ||
    !exactKeys(value.canonicalDocument, ["documentId", "promotedAt"]) ||
    !exactKeys(value.provenance, ["origin", "legalTruthVerified"]) ||
    !exactKeys(value.content, [
      "sha256",
      "sizeBytes",
      "contentAddressedRef",
      "mediaType",
      "encoding",
      "content",
    ])
  ) {
    return false;
  }

  return (
    value.contractVersion === READY_PACKAGE_CONTENT_EXPORT_V2_VERSION &&
    value.objectType === READY_PACKAGE_CONTENT_EXPORT_V2_OBJECT_TYPE &&
    typeof value.readyPackageId === "string" &&
    value.readyPackageId.startsWith("rdp_") &&
    typeof value.knowledgeWorkspaceId === "string" &&
    value.knowledgeWorkspaceId.startsWith("wsp_") &&
    typeof value.readyPackageDigest === "string" &&
    SHA256.test(value.readyPackageDigest) &&
    typeof value.canonicalDocument.documentId === "string" &&
    value.canonicalDocument.documentId.startsWith("cdd_") &&
    isTimestamp(value.canonicalDocument.promotedAt) &&
    isVaultImportOrigin(value.provenance.origin) &&
    value.provenance.legalTruthVerified === false &&
    typeof value.content.sha256 === "string" &&
    SHA256.test(value.content.sha256) &&
    typeof value.content.sizeBytes === "number" &&
    Number.isSafeInteger(value.content.sizeBytes) &&
    value.content.sizeBytes >= 0 &&
    value.content.contentAddressedRef === `cas:sha256:${value.content.sha256}` &&
    value.content.mediaType === "text/markdown" &&
    value.content.encoding === "utf-8" &&
    typeof value.content.content === "string"
  );
}

export function assertReadyPackageContentExportV2(
  value: unknown,
): asserts value is ReadyPackageContentExportV2 {
  if (!isReadyPackageContentExportV2(value)) {
    throw new TypeError("Invalid ReadyPackageContentExportV2");
  }
}

export function serializeReadyPackageContentExportV2(value: ReadyPackageContentExportV2): string {
  assertReadyPackageContentExportV2(value);
  return JSON.stringify({
    contractVersion: value.contractVersion,
    objectType: value.objectType,
    readyPackageId: value.readyPackageId,
    knowledgeWorkspaceId: value.knowledgeWorkspaceId,
    readyPackageDigest: value.readyPackageDigest,
    canonicalDocument: {
      documentId: value.canonicalDocument.documentId,
      promotedAt: value.canonicalDocument.promotedAt,
    },
    provenance: {
      origin: {
        kind: value.provenance.origin.kind,
        inspectionRunId: value.provenance.origin.inspectionRunId,
        importIntentId: value.provenance.origin.importIntentId,
        importExecutionId: value.provenance.origin.importExecutionId,
        vaultStagingDocumentId: value.provenance.origin.vaultStagingDocumentId,
        verificationId: value.provenance.origin.verificationId,
        verificationOutcome: value.provenance.origin.verificationOutcome,
        finalizationId: value.provenance.origin.finalizationId,
        rootFingerprintSha256: value.provenance.origin.rootFingerprintSha256,
        binding: {
          bindingId: value.provenance.origin.binding.bindingId,
          revision: value.provenance.origin.binding.revision,
          relativeRoot: value.provenance.origin.binding.relativeRoot,
        },
        vaultRelativePath: value.provenance.origin.vaultRelativePath,
        bindingRelativePath: value.provenance.origin.bindingRelativePath,
        observedAt: value.provenance.origin.observedAt,
        reviewedAt: value.provenance.origin.reviewedAt,
        importedAt: value.provenance.origin.importedAt,
        verifiedAt: value.provenance.origin.verifiedAt,
      },
      legalTruthVerified: false,
    },
    content: {
      sha256: value.content.sha256,
      sizeBytes: value.content.sizeBytes,
      contentAddressedRef: value.content.contentAddressedRef,
      mediaType: "text/markdown",
      encoding: "utf-8",
      content: value.content.content,
    },
  } satisfies ReadyPackageContentExportV2);
}
