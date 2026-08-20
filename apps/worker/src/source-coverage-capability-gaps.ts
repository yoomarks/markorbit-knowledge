import type { CoverageTarget } from "./source-coverage-bootstrap";

const WEB_PAGE_ARTIFACT_KINDS = new Set(["HTML", "MARKDOWN"]);
const WEB_ATTACHMENT_ARTIFACT_KINDS = new Set([
  "PDF",
  "DOCX",
  "XLSX",
  "CSV",
  "JSON",
  "XML",
  "EMAIL",
  "IMAGE",
  "TEXT",
]);

export type SupplyCapabilityGap = {
  targetId: string;
  code: "STRUCTURED_ENDPOINT_NOT_CAPTURED";
  expectedArtifactKinds: string[];
};

export function webCapturableArtifactKinds(target: CoverageTarget): string[] {
  const capturable = new Set(WEB_PAGE_ARTIFACT_KINDS);
  if (target.acquisition.fetchAttachmentsHint) {
    for (const kind of WEB_ATTACHMENT_ARTIFACT_KINDS) capturable.add(kind);
  }
  return [...capturable].sort();
}

export function structuredSupplyCapabilityGap(target: CoverageTarget): SupplyCapabilityGap | null {
  const capturable = new Set(webCapturableArtifactKinds(target));
  const missingArtifactKinds = target.acquisition.expectedArtifactKinds.filter(
    (kind) => !capturable.has(kind),
  );
  if (missingArtifactKinds.length === 0) return null;
  return {
    targetId: target.id,
    code: "STRUCTURED_ENDPOINT_NOT_CAPTURED",
    expectedArtifactKinds: missingArtifactKinds,
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
