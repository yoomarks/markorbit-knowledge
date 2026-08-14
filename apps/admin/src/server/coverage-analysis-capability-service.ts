import {
  COVERAGE_ANALYSIS_CAPABILITY_ID,
  COVERAGE_ANALYSIS_CAPABILITY_VERSION,
  isCoverageAnalysisResponseV1,
  type CoverageAnalysisCategoryV1,
  type CoverageAnalysisRequestV1,
  type CoverageAnalysisResponseV1,
} from "@markorbit/contracts";
import { DEFAULT_WORKSPACE, RegistryError, RegistryValidationError } from "@markorbit/persistence";
import { capabilityConnectionStatus, invokeCapability } from "./capability-client";
import { getSourceCoverageSnapshot } from "./source-coverage-service";

const DEFAULT_OBJECTIVE =
  "Explain the factual acquisition coverage represented by the supplied coverage snapshot. Identify strengths, gaps and practical next acquisition steps. Do not make legal conclusions, infer content quality, or treat catalog completeness as authority or correctness.";

export type CoverageAnalysisCapabilityStatus = {
  capability: typeof COVERAGE_ANALYSIS_CAPABILITY_ID;
  configured: boolean;
  endpoint?: string;
};

function normalizeJurisdiction(value: string): string {
  const jurisdiction = value.trim();
  if (!jurisdiction) throw new RegistryValidationError("jurisdiction is required");
  if (jurisdiction.length > 64) {
    throw new RegistryValidationError("jurisdiction must not exceed 64 characters");
  }
  return jurisdiction;
}

function categoriesFor(
  targets: ReturnType<typeof getSourceCoverageSnapshot>["items"][number]["targets"],
): CoverageAnalysisCategoryV1[] {
  const active = targets.filter((target) => target.catalogState === "ACTIVE");
  const families = [...new Set(active.map((target) => target.family))].sort();
  return families.map((family) => {
    const familyTargets = active.filter((target) => target.family === family);
    return {
      category: family,
      targetCount: familyTargets.length,
      coveredCount: familyTargets.filter((target) => target.state === "REGISTERED").length,
      missingLabels: familyTargets
        .filter((target) => target.state === "UNREGISTERED")
        .map((target) => target.displayName)
        .sort(),
    };
  });
}

function validateResponse(value: unknown): CoverageAnalysisResponseV1 {
  if (!isCoverageAnalysisResponseV1(value)) {
    throw new RegistryError(
      "COVERAGE_ANALYSIS_CAPABILITY_INVALID_RESPONSE",
      "Coverage analysis capability returned an invalid v1 response",
    );
  }
  if (Number.isNaN(Date.parse(value.generatedAt))) {
    throw new RegistryError(
      "COVERAGE_ANALYSIS_CAPABILITY_INVALID_TIMESTAMP",
      "Coverage analysis capability returned an invalid generatedAt timestamp",
    );
  }
  return { ...value, generatedAt: new Date(value.generatedAt).toISOString() };
}

export class CoverageAnalysisCapabilityService {
  status(): CoverageAnalysisCapabilityStatus {
    const connection = capabilityConnectionStatus(COVERAGE_ANALYSIS_CAPABILITY_ID);
    return {
      capability: COVERAGE_ANALYSIS_CAPABILITY_ID,
      configured: connection.configured,
      ...(connection.endpoint ? { endpoint: connection.endpoint } : {}),
    };
  }

  async analyze(input: {
    workspaceId?: string;
    jurisdiction: string;
    locale?: string;
    objective?: string;
  }): Promise<{
    request: CoverageAnalysisRequestV1;
    response: CoverageAnalysisResponseV1;
  }> {
    const jurisdiction = normalizeJurisdiction(input.jurisdiction);
    const workspaceId = input.workspaceId?.trim() || DEFAULT_WORKSPACE.id;
    const snapshot = getSourceCoverageSnapshot(workspaceId);
    const item = snapshot.items.find((candidate) => candidate.jurisdiction === jurisdiction);
    if (!item) {
      throw new RegistryError(
        "SOURCE_COVERAGE_JURISDICTION_NOT_FOUND",
        `Jurisdiction ${jurisdiction} was not found in the source coverage snapshot`,
      );
    }

    const request: CoverageAnalysisRequestV1 = {
      version: COVERAGE_ANALYSIS_CAPABILITY_VERSION,
      capability: COVERAGE_ANALYSIS_CAPABILITY_ID,
      locale: input.locale?.trim() || "zh-CN",
      objective: input.objective?.trim() || DEFAULT_OBJECTIVE,
      scope: {
        scopeId: jurisdiction,
        label: jurisdiction,
        kind: "JURISDICTION",
      },
      facts: {
        sourceCount: item.sourceCount,
        activeSourceCount: item.activeSourceCount,
        targetCount: item.targetCount,
        coveredTargetCount: item.registeredTargetCount,
        foundationalTargetCount: item.foundational.total,
        coveredFoundationalTargetCount: item.foundational.registered,
        completenessPercent: item.completenessPercent,
        categories: categoriesFor(item.targets),
      },
    };

    const response = await invokeCapability({
      capabilityId: COVERAGE_ANALYSIS_CAPABILITY_ID,
      request,
      errorCodePrefix: "COVERAGE_ANALYSIS_CAPABILITY",
      validate: validateResponse,
    });
    return { request, response };
  }
}

let singleton: CoverageAnalysisCapabilityService | null = null;

export function getCoverageAnalysisCapabilityService(): CoverageAnalysisCapabilityService {
  singleton ??= new CoverageAnalysisCapabilityService();
  return singleton;
}
