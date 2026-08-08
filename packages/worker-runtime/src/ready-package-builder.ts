import type { ReadyPackage, ReadyPackageEvidence } from "@markorbit/contracts";

export type ReadyPackageInput = {
  id: string;
  workspaceId: string;
  artifactIds: string[];
  stagingDocumentId: string;
  digest: string;
};

export class ReadyPackageBuilder {
  create(input: ReadyPackageInput): ReadyPackage {
    const evidence: ReadyPackageEvidence = {
      artifactIds: input.artifactIds,
      stagingDocumentId: input.stagingDocumentId,
      digest: input.digest,
    };

    return {
      id: input.id,
      workspaceId: input.workspaceId,
      status: "CREATED",
      evidence,
      createdAt: new Date().toISOString(),
    };
  }

  build(input: ReadyPackageInput): ReadyPackage {
    return this.create(input);
  }
}
