export type ReadyPackageStatus = "CREATED" | "VERIFIED" | "HANDED_OFF";

export type ReadyPackageEvidence = {
  artifactIds: string[];
  stagingDocumentId: string;
  digest: string;
  sourceId?: string;
  conversionRunId?: string;
  rawArtifactSha256?: string;
  stagingSha256?: string;
  verificationId?: string;
  verificationOutcome?: "PASS" | "PASS_WITH_WARNINGS";
  converter?: { converterId: string; version: string };
  capturedAt?: string;
  legalTruthVerified?: false;
};

export type ReadyPackage = {
  id: string;
  workspaceId: string;
  status: ReadyPackageStatus;
  evidence: ReadyPackageEvidence;
  createdAt: string;
  verifiedAt?: string;
  handedOffAt?: string;
};
