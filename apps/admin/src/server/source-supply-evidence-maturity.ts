import {
  EVIDENCE_MATURITY_STAGES,
  type EvidenceMaturityStage,
  type SourceIntelligenceAssessmentV2,
  type SourceSupplyEvidenceMaturityHealth,
  type SourceSupplyIntelligenceCoverageState,
} from "@markorbit/contracts";
import { RegistryConflictError } from "@markorbit/persistence";
import type { SourceSupplyHealthListResult } from "@markorbit/persistence/source-supply-health";

export type SourceSupplyEvidenceMaturityReader = {
  latestV2(sourceId: string): SourceIntelligenceAssessmentV2 | null;
};

function emptyStageCounts(): Record<EvidenceMaturityStage, number> {
  return Object.fromEntries(EVIDENCE_MATURITY_STAGES.map((stage) => [stage, 0])) as Record<
    EvidenceMaturityStage,
    number
  >;
}

function coverageState(
  registeredSourceCount: number,
  assessedSourceCount: number,
): SourceSupplyIntelligenceCoverageState {
  if (registeredSourceCount === 0) return "UNREGISTERED";
  if (assessedSourceCount === 0) return "UNASSESSED";
  if (assessedSourceCount === registeredSourceCount) return "COMPLETE";
  return "PARTIAL";
}

export function projectSourceSupplyEvidenceMaturity(
  workspaceId: string,
  sourceIds: readonly string[],
  intelligence: SourceSupplyEvidenceMaturityReader,
): SourceSupplyEvidenceMaturityHealth {
  const uniqueSourceIds = [...new Set(sourceIds)].sort();
  const byStage = emptyStageCounts();
  const unassessedSourceIds: string[] = [];
  let assessedSourceCount = 0;
  let latestAssessedAt: string | null = null;

  for (const sourceId of uniqueSourceIds) {
    const assessment = intelligence.latestV2(sourceId);
    if (!assessment) {
      unassessedSourceIds.push(sourceId);
      continue;
    }
    if (assessment.workspaceId !== workspaceId || assessment.sourceId !== sourceId) {
      throw new RegistryConflictError(
        "SOURCE_SUPPLY_INTELLIGENCE_SCOPE_MISMATCH",
        `Source Intelligence assessment ${assessment.id} does not match ${workspaceId}/${sourceId}`,
      );
    }
    assessedSourceCount += 1;
    byStage[assessment.evidenceMaturity.stage] += 1;
    if (!latestAssessedAt || assessment.assessedAt > latestAssessedAt) {
      latestAssessedAt = assessment.assessedAt;
    }
  }

  return {
    coverageState: coverageState(uniqueSourceIds.length, assessedSourceCount),
    registeredSourceCount: uniqueSourceIds.length,
    assessedSourceCount,
    unassessedSourceIds,
    latestAssessedAt,
    byStage,
  };
}

/**
 * Adds advisory evidence-maturity observations to the existing supply read
 * model. The function deliberately preserves state, gaps, compatibility and
 * topology exactly as supplied; Source Intelligence does not authorize or
 * schedule acquisition here.
 */
export function enrichSourceSupplyHealthWithEvidenceMaturity(
  result: SourceSupplyHealthListResult,
  intelligence: SourceSupplyEvidenceMaturityReader,
): SourceSupplyHealthListResult {
  const byIntelligenceCoverage: Record<SourceSupplyIntelligenceCoverageState, number> = {
    UNREGISTERED: 0,
    UNASSESSED: 0,
    PARTIAL: 0,
    COMPLETE: 0,
  };
  const items = result.items.map((item) => {
    const evidenceMaturity = projectSourceSupplyEvidenceMaturity(
      item.workspaceId,
      item.sourceIds,
      intelligence,
    );
    byIntelligenceCoverage[evidenceMaturity.coverageState] += 1;
    return { ...item, evidenceMaturity };
  });

  return {
    ...result,
    items,
    summary: {
      ...result.summary,
      byIntelligenceCoverage,
    },
  };
}
