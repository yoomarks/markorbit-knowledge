export const VAULT_IMPORT_INTENT_CONTRACT_VERSION = "1.0" as const;
export const VAULT_IMPORT_INTENT_OBJECT_TYPE = "VAULT_IMPORT_INTENT" as const;
export const VAULT_IMPORT_INTENT_ACTION = "IMPORT_TO_STAGING" as const;
export const VAULT_IMPORT_INTENT_STATE = "PENDING_EXECUTION" as const;

export type VaultImportIntentBindingSnapshotV1 = {
  bindingId: string;
  revision: number;
  relativeRoot: string;
};

export type VaultImportIntentInspectionSnapshotV1 = {
  inspectionRunId: string;
  rootFingerprintSha256: string;
  observedAt: string;
  binding: VaultImportIntentBindingSnapshotV1;
};

export type VaultImportIntentCandidateSnapshotV1 = {
  vaultRelativePath: string;
  bindingRelativePath: string;
  observedSha256: string;
  sizeBytes: number;
};

export type VaultImportIntentV1 = {
  contractVersion: typeof VAULT_IMPORT_INTENT_CONTRACT_VERSION;
  objectType: typeof VAULT_IMPORT_INTENT_OBJECT_TYPE;
  id: string;
  workspaceId: string;
  idempotencyKey: string;
  inspection: VaultImportIntentInspectionSnapshotV1;
  candidate: VaultImportIntentCandidateSnapshotV1;
  action: typeof VAULT_IMPORT_INTENT_ACTION;
  state: typeof VAULT_IMPORT_INTENT_STATE;
  reviewNote?: string;
  reviewedAt: string;
};
