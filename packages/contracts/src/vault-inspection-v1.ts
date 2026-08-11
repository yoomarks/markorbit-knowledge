export const VAULT_INSPECTION_CONTRACT_VERSION = "1.0" as const;
export const VAULT_INSPECTION_OBJECT_TYPE = "VAULT_INSPECTION_RUN" as const;

export const VAULT_INSPECTION_CLASSIFICATIONS = [
  "UNCHANGED",
  "IMPORT_CANDIDATE",
  "CONFLICT",
  "MISSING",
] as const;
export type VaultInspectionClassification = (typeof VAULT_INSPECTION_CLASSIFICATIONS)[number];

export const VAULT_FRONTMATTER_STATUSES = [
  "NONE",
  "PARSED_SIMPLE",
  "UNSUPPORTED",
  "MALFORMED",
] as const;
export type VaultFrontmatterStatus = (typeof VAULT_FRONTMATTER_STATUSES)[number];

export type VaultInspectionBindingSnapshotV1 = {
  bindingId: string;
  revision: number;
  relativeRoot: string;
};

export type VaultInspectionManagedExportV1 = {
  exportRunId: string;
  stagingDocumentId: string;
  contentSha256: string;
};

export type VaultInspectionFrontmatterV1 = {
  status: VaultFrontmatterStatus;
  keys: string[];
  fields: Record<string, string>;
};

export type VaultInspectionCandidateV1 = {
  vaultRelativePath: string;
  bindingRelativePath: string;
  classification: VaultInspectionClassification;
  observedSha256?: string;
  sizeBytes?: number;
  managedExport?: VaultInspectionManagedExportV1;
  frontmatter: VaultInspectionFrontmatterV1;
  wikiLinks: string[];
};

export type VaultInspectionRunV1 = {
  contractVersion: typeof VAULT_INSPECTION_CONTRACT_VERSION;
  objectType: typeof VAULT_INSPECTION_OBJECT_TYPE;
  id: string;
  workspaceId: string;
  rootFingerprintSha256: string;
  binding: VaultInspectionBindingSnapshotV1;
  candidates: VaultInspectionCandidateV1[];
  observedAt: string;
};
