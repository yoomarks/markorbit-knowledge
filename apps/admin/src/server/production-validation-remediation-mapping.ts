import { getSourceCoverageTarget } from "@markorbit/persistence/source-coverage";

export type ProductionValidationRemediationTarget = {
  id: string;
  jurisdiction: string;
};

export function exactFoundationalRemediationTarget(
  target: ProductionValidationRemediationTarget,
): ProductionValidationRemediationTarget | null {
  const coverage = getSourceCoverageTarget(target.id);
  if (!coverage) return null;
  if (coverage.catalogState !== "ACTIVE" || coverage.coverageTier !== "FOUNDATIONAL") return null;
  if (coverage.jurisdiction !== target.jurisdiction.trim().toUpperCase()) return null;
  return { id: coverage.id, jurisdiction: coverage.jurisdiction };
}
