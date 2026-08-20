import type { CoverageTarget } from "./source-coverage-bootstrap";

export type SupplyCapabilityGap = {
  targetId: string;
  code: "STRUCTURED_ENDPOINT_NOT_CAPTURED";
  expectedArtifactKinds: string[];
};

export function structuredSupplyCapabilityGap(target: CoverageTarget): SupplyCapabilityGap | null {
  const missingStructuredKinds = target.acquisition.fetchAttachmentsHint
    ? []
    : target.acquisition.expectedArtifactKinds.filter((kind) => kind === "JSON");
  if (missingStructuredKinds.length === 0) return null;
  return {
    targetId: target.id,
    code: "STRUCTURED_ENDPOINT_NOT_CAPTURED",
    expectedArtifactKinds: missingStructuredKinds,
  };
}

export function foundationalSupplyCapabilityGaps(
  targets: readonly CoverageTarget[],
): SupplyCapabilityGap[] {
  return targets
    .map(structuredSupplyCapabilityGap)
    .filter((gap): gap is SupplyCapabilityGap => gap !== null);
}

export function assertFoundationalTargetDispatchable(target: CoverageTarget): void {
  const gap = structuredSupplyCapabilityGap(target);
  if (!gap) return;
  throw new Error(
    `Foundational target ${target.id} cannot be dispatched while ${gap.code} is unresolved (${gap.expectedArtifactKinds.join(", ")})`,
  );
}
