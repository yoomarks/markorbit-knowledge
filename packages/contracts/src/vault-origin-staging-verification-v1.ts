export const VAULT_ORIGIN_STAGING_VERIFICATION_CONTRACT_VERSION = "1.0" as const;
export const VAULT_ORIGIN_STAGING_VERIFICATION_OBJECT_TYPE =
  "VAULT_ORIGIN_STAGING_VERIFICATION" as const;
export const VAULT_ORIGIN_STAGING_VERIFIER = {
  verifierId: "builtin-vault-origin-staging-verifier",
  version: "1.0.0",
} as const;

export const VAULT_ORIGIN_STAGING_VERIFICATION_OUTCOMES = [
  "PASS",
  "PASS_WITH_WARNINGS",
  "FAIL",
] as const;
export type VaultOriginStagingVerificationOutcome =
  (typeof VAULT_ORIGIN_STAGING_VERIFICATION_OUTCOMES)[number];

export type VaultOriginStagingVerificationCheckV1 = {
  code: string;
  status: "PASS" | "WARN" | "FAIL";
  message?: string;
};

export type VaultOriginStagingVerificationEvidenceV1 = {
  contractVersion: typeof VAULT_ORIGIN_STAGING_VERIFICATION_CONTRACT_VERSION;
  objectType: typeof VAULT_ORIGIN_STAGING_VERIFICATION_OBJECT_TYPE;
  id: string;
  workspaceId: string;
  vaultStagingDocumentId: string;
  importIntentId: string;
  verifier: typeof VAULT_ORIGIN_STAGING_VERIFIER;
  contentSha256: string;
  sizeBytes: number;
  outcome: VaultOriginStagingVerificationOutcome;
  checks: VaultOriginStagingVerificationCheckV1[];
  warnings: string[];
  createdAt: string;
};

export const VAULT_ORIGIN_STAGING_FINALIZATION_CONTRACT_VERSION = "1.0" as const;
export const VAULT_ORIGIN_STAGING_FINALIZATION_OBJECT_TYPE =
  "VAULT_ORIGIN_STAGING_FINALIZATION" as const;
export const VAULT_ORIGIN_STAGING_FINALIZATION_STATES = ["VERIFIED", "BLOCKED"] as const;
export type VaultOriginStagingFinalizationState =
  (typeof VAULT_ORIGIN_STAGING_FINALIZATION_STATES)[number];

export type VaultOriginStagingFinalizationV1 = {
  contractVersion: typeof VAULT_ORIGIN_STAGING_FINALIZATION_CONTRACT_VERSION;
  objectType: typeof VAULT_ORIGIN_STAGING_FINALIZATION_OBJECT_TYPE;
  id: string;
  workspaceId: string;
  vaultStagingDocumentId: string;
  importIntentId: string;
  verificationId: string;
  contentSha256: string;
  state: VaultOriginStagingFinalizationState;
  finalizedAt: string;
};
