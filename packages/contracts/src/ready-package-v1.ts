export type ReadyPackageStatus = "CREATED" | "VERIFIED" | "HANDED_OFF";

export type ReadyPackageEvidence = {
  artifactIds: string[];
  stagingDocumentId: string;
  digest: string;
};

export type ReadyPackage = {
  id: string;
  workspaceId: string;
  status: ReadyPackageStatus;
  evidence: ReadyPackageEvidence;
  createdAt: string;
};
