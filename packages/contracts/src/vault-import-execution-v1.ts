export const VAULT_ORIGIN_STAGING_CONTRACT_VERSION = "1.0" as const;
export const VAULT_ORIGIN_STAGING_OBJECT_TYPE = "VAULT_ORIGIN_STAGING_DOCUMENT" as const;
export const VAULT_ORIGIN_STAGING_STATUS = "IMPORTED_UNVERIFIED" as const;

export const VAULT_IMPORT_EXECUTION_CONTRACT_VERSION = "1.0" as const;
export const VAULT_IMPORT_EXECUTION_OBJECT_TYPE = "VAULT_IMPORT_EXECUTION" as const;
export const VAULT_IMPORT_EXECUTION_STATES = ["PENDING", "SUCCEEDED", "REJECTED"] as const;
export type VaultImportExecutionState = (typeof VAULT_IMPORT_EXECUTION_STATES)[number];

export const VAULT_IMPORT_REJECTION_CODES = [
  "VAULT_IMPORT_SOURCE_MISSING",
  "VAULT_IMPORT_SOURCE_CHANGED",
] as const;
export type VaultImportRejectionCode = (typeof VAULT_IMPORT_REJECTION_CODES)[number];

export type VaultImportExecutionBindingSnapshotV1 = {
  bindingId: string;
  revision: number;
  relativeRoot: string;
};

export type VaultImportExecutionCandidateSnapshotV1 = {
  vaultRelativePath: string;
  bindingRelativePath: string;
  observedSha256: string;
  sizeBytes: number;
};

export type VaultOriginStagingDocumentV1 = {
  contractVersion: typeof VAULT_ORIGIN_STAGING_CONTRACT_VERSION;
  objectType: typeof VAULT_ORIGIN_STAGING_OBJECT_TYPE;
  id: string;
  workspaceId: string;
  importIntentId: string;
  inspectionRunId: string;
  binding: VaultImportExecutionBindingSnapshotV1;
  vaultRelativePath: string;
  bindingRelativePath: string;
  contentHash: { algorithm: "SHA-256"; value: string };
  sizeBytes: number;
  contentAddressedRef: string;
  mediaType: "text/markdown";
  encoding: "utf-8";
  status: typeof VAULT_ORIGIN_STAGING_STATUS;
  importedAt: string;
};

export type VaultImportStagingReceiptV1 = {
  vaultStagingDocumentId: string;
  contentSha256: string;
  sizeBytes: number;
  contentAddressedRef: string;
  recordedAt: string;
};

export type VaultImportRejectionV1 = {
  code: VaultImportRejectionCode;
  recordedAt: string;
};

export type VaultImportExecutionV1 = {
  contractVersion: typeof VAULT_IMPORT_EXECUTION_CONTRACT_VERSION;
  objectType: typeof VAULT_IMPORT_EXECUTION_OBJECT_TYPE;
  id: string;
  workspaceId: string;
  importIntentId: string;
  state: VaultImportExecutionState;
  rootFingerprintSha256: string;
  binding: VaultImportExecutionBindingSnapshotV1;
  candidate: VaultImportExecutionCandidateSnapshotV1;
  preparedAt: string;
  updatedAt: string;
  stagingReceipt?: VaultImportStagingReceiptV1;
  rejection?: VaultImportRejectionV1;
  result?: VaultImportStagingReceiptV1;
};
