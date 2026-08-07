export type CoreIntakeStatus = "RECEIVED" | "ACCEPTED" | "REJECTED";

export type CoreIntakeRequest = {
  readyPackageId: string;
  workspaceId: string;
  digest: string;
  evidence: {
    artifactIds: string[];
    stagingDocumentId: string;
  };
  submittedAt: string;
};

export type CoreIntakeResult = {
  intakeId: string;
  status: CoreIntakeStatus;
  readyPackageId: string;
};
