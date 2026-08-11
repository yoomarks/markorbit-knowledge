export const CANONICAL_DOWNSTREAM_DOCUMENT_CONTRACT_VERSION = "1.0" as const;
export const CANONICAL_DOWNSTREAM_DOCUMENT_OBJECT_TYPE = "CANONICAL_DOWNSTREAM_DOCUMENT" as const;
export const CANONICAL_DOWNSTREAM_DOCUMENT_STATUS = "READY" as const;
export const CANONICAL_DOWNSTREAM_ORIGIN_KIND = "VAULT_IMPORT" as const;

export type CanonicalDownstreamVaultImportOriginV1 = {
  kind: typeof CANONICAL_DOWNSTREAM_ORIGIN_KIND;
  inspectionRunId: string;
  importIntentId: string;
  importExecutionId: string;
  vaultStagingDocumentId: string;
  verificationId: string;
  verificationOutcome: "PASS" | "PASS_WITH_WARNINGS";
  finalizationId: string;
  rootFingerprintSha256: string;
  binding: {
    bindingId: string;
    revision: number;
    relativeRoot: string;
  };
  vaultRelativePath: string;
  bindingRelativePath: string;
  observedAt: string;
  reviewedAt: string;
  importedAt: string;
  verifiedAt: string;
};

export type CanonicalDownstreamDocumentV1 = {
  contractVersion: typeof CANONICAL_DOWNSTREAM_DOCUMENT_CONTRACT_VERSION;
  objectType: typeof CANONICAL_DOWNSTREAM_DOCUMENT_OBJECT_TYPE;
  id: string;
  workspaceId: string;
  status: typeof CANONICAL_DOWNSTREAM_DOCUMENT_STATUS;
  origin: CanonicalDownstreamVaultImportOriginV1;
  content: {
    sha256: string;
    sizeBytes: number;
    contentAddressedRef: string;
    mediaType: "text/markdown";
    encoding: "utf-8";
  };
  legalTruthVerified: false;
  promotedAt: string;
};
