import type { CoreIntakeRequest, ReadyPackage } from "@markorbit/contracts";

export type CoreIntakeHandoff = {
  readyPackageId: string;
  sourceId: string;
  artifactId: string;
};

export type CoreIntakeRequestPreview = Omit<CoreIntakeRequest, "submittedAt">;

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

export function createCoreIntakeRequestPreview(
  pkg: ReadyPackage,
  coreWorkspaceId: string,
): CoreIntakeRequestPreview {
  return {
    readyPackageId: pkg.id,
    workspaceId: coreWorkspaceId,
    digest: pkg.evidence.digest,
    evidence: {
      artifactIds: pkg.evidence.artifactIds,
      stagingDocumentId: pkg.evidence.stagingDocumentId,
    },
  };
}

export function createCoreIntakeRequest(
  pkg: ReadyPackage,
  submittedAt: string,
  coreWorkspaceId: string,
): CoreIntakeRequest {
  return {
    ...createCoreIntakeRequestPreview(pkg, coreWorkspaceId),
    submittedAt,
  };
}
