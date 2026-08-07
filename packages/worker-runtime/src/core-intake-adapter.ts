import type { CoreIntakeRequest, ReadyPackage } from "@markorbit/contracts";

export function createCoreIntakeRequest(pkg: ReadyPackage): CoreIntakeRequest {
  return {
    readyPackageId: pkg.id,
    workspaceId: pkg.workspaceId,
    evidence: pkg.evidence,
    createdAt: pkg.createdAt,
  };
}
