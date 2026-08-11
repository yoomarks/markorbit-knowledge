import type { CanonicalDownstreamVaultImportOriginV1 } from "./canonical-downstream-document-v1";

export const READY_PACKAGE_V2_CONTRACT_VERSION = "2.0" as const;
export const READY_PACKAGE_V2_OBJECT_TYPE = "READY_PACKAGE" as const;
export const READY_PACKAGE_V2_STATUS = "VERIFIED" as const;

export type ReadyPackageV2ContentEvidence = {
  sha256: string;
  sizeBytes: number;
  contentAddressedRef: string;
  mediaType: "text/markdown";
  encoding: "utf-8";
};

export type ReadyPackageV2Evidence = {
  canonicalDocumentId: string;
  canonicalPromotedAt: string;
  origin: CanonicalDownstreamVaultImportOriginV1;
  content: ReadyPackageV2ContentEvidence;
  digest: string;
  legalTruthVerified: false;
};

export type ReadyPackageV2 = {
  contractVersion: typeof READY_PACKAGE_V2_CONTRACT_VERSION;
  objectType: typeof READY_PACKAGE_V2_OBJECT_TYPE;
  id: string;
  workspaceId: string;
  status: typeof READY_PACKAGE_V2_STATUS;
  evidence: ReadyPackageV2Evidence;
  createdAt: string;
};
