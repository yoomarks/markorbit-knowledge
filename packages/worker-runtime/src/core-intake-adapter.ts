import type { CoreIntakeRequest, ReadyPackage } from "@markorbit/contracts";

export type CoreIntakeHandoff = {
  readyPackageId: string;
  sourceId: string;
  artifactId: string;
};

/**
 * Boundary adapter for handing a verified package toward MarkOrbit Core.
 * The default implementation is intentionally side-effect free; a production
 * transport can subclass or wrap this adapter without moving Core logic into
 * Knowledge.
 */
export class CoreIntakeAdapter {
  async accept(handoff: CoreIntakeHandoff): Promise<CoreIntakeHandoff> {
    return handoff;
  }
}

export function createCoreIntakeRequest(pkg: ReadyPackage): CoreIntakeRequest {
  return {
    readyPackageId: pkg.id,
    workspaceId: pkg.workspaceId,
    digest: pkg.evidence.digest,
    evidence: {
      artifactIds: pkg.evidence.artifactIds,
      stagingDocumentId: pkg.evidence.stagingDocumentId,
    },
    submittedAt: pkg.createdAt,
  };
}
