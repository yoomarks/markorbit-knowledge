export const VAULT_EXPORT_CONTRACT_VERSION = "1.0" as const;
export const VAULT_EXPORT_OBJECT_TYPE = "VAULT_EXPORT_RUN" as const;

export const VAULT_EXPORT_STATES = ["PENDING", "SUCCEEDED"] as const;
export type VaultExportState = (typeof VAULT_EXPORT_STATES)[number];

export const VAULT_EXPORT_DISPOSITIONS = ["WRITTEN", "ALREADY_PRESENT"] as const;
export type VaultExportDisposition = (typeof VAULT_EXPORT_DISPOSITIONS)[number];

export type VaultExportBindingSnapshotV1 = {
  bindingId: string;
  revision: number;
  relativeRoot: string;
};

export type VaultExportStagingSnapshotV1 = {
  stagingDocumentId: string;
  contentSha256: string;
  targetPath: string;
};

export type VaultExportReceiptV1 = {
  vaultRelativePath: string;
  contentSha256: string;
  disposition: VaultExportDisposition;
  recordedAt: string;
};

export type VaultExportRunV1 = {
  contractVersion: typeof VAULT_EXPORT_CONTRACT_VERSION;
  objectType: typeof VAULT_EXPORT_OBJECT_TYPE;
  id: string;
  workspaceId: string;
  idempotencyKey: string;
  rootFingerprintSha256: string;
  binding: VaultExportBindingSnapshotV1;
  staging: VaultExportStagingSnapshotV1;
  state: VaultExportState;
  preparedAt: string;
  updatedAt: string;
  projectionReceipt?: VaultExportReceiptV1;
  result?: VaultExportReceiptV1;
};
