import type { CoreIntakeRequest, ReadyPackage } from "@markorbit/contracts";

export type CoreIntakeHandoff = {
  readyPackageId: string;
  sourceId: string;
  artifactId: string;
};

/**
 * Boundary adapter for handing a verified package toward MarkOrbit Core.
 * The default implementation is side-effect free; a production transport can
 * replace it without moving Core interpretation or decision logic into Knowledge.
 */
export class CoreIntakeAdapter {
  accept(input: ReadyPackage | CoreIntakeHandoff): CoreIntakeHandoff {
    if ("evidence" in input) {
      return {
        readyPackageId: input.id,
        sourceId: "ready-package",
        artifactId: input.evidence.artifactIds[0] ?? "",
      };
    }
    return input;
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
