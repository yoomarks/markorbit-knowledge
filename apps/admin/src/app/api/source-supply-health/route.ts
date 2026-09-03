import { NextResponse } from "next/server";
import {
  SOURCE_COVERAGE_CATALOG_STATES,
  SOURCE_COVERAGE_FAMILIES,
  SOURCE_COVERAGE_TIERS,
  SOURCE_SUPPLY_HEALTH_STATES,
  type SourceCoverageCatalogState,
  type SourceCoverageFamily,
  type SourceCoverageTier,
  type SourceSupplyHealthState,
} from "@markorbit/contracts";
import { RegistryValidationError } from "@markorbit/persistence";
import { SqliteOperationalSupplyHealthRepository } from "@markorbit/persistence/source-compatibility-supply-health";
import { resolveAdminBrowserApiReadAccess } from "@/server/admin-browser-api-access";
import { apiError } from "@/server/api-errors";
import { SourceIntelligenceService } from "@/server/source-intelligence-service";
import { enrichSourceSupplyHealthWithEvidenceMaturity } from "@/server/source-supply-evidence-maturity";
import {
  getRawArtifactRepository,
  getRegistryDatabase,
  getSourceGraphRepository,
  getSourceIntelligenceRepository,
  getSourceRepository,
} from "@/server/source-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function enumFilter<T extends string>(
  value: string | null,
  allowed: readonly T[],
  name: string,
): T | undefined {
  const normalized = value?.trim();
  if (!normalized) return undefined;
  if (!allowed.includes(normalized as T)) {
    throw new RegistryValidationError(`${name} query parameter is invalid`);
  }
  return normalized as T;
}

function intelligenceService(): SourceIntelligenceService {
  return new SourceIntelligenceService({
    sources: getSourceRepository(),
    graph: getSourceGraphRepository(),
    artifacts: getRawArtifactRepository(),
    intelligence: getSourceIntelligenceRepository(),
  });
}

export async function GET(request: Request) {
  try {
    const search = new URL(request.url).searchParams;
    const assertedWorkspaceId = search.get("workspaceId")?.trim() || undefined;
    const { workspaceId } = await resolveAdminBrowserApiReadAccess(request, assertedWorkspaceId);
    const jurisdiction = search.get("jurisdiction")?.trim() || undefined;
    const targetId = search.get("targetId")?.trim() || undefined;
    const family = enumFilter<SourceCoverageFamily>(
      search.get("family"),
      SOURCE_COVERAGE_FAMILIES,
      "family",
    );
    const coverageTier = enumFilter<SourceCoverageTier>(
      search.get("coverageTier"),
      SOURCE_COVERAGE_TIERS,
      "coverageTier",
    );
    const catalogState = enumFilter<SourceCoverageCatalogState>(
      search.get("catalogState"),
      SOURCE_COVERAGE_CATALOG_STATES,
      "catalogState",
    );
    const state = enumFilter<SourceSupplyHealthState>(
      search.get("state"),
      SOURCE_SUPPLY_HEALTH_STATES,
      "state",
    );

    const repository = new SqliteOperationalSupplyHealthRepository(getRegistryDatabase());
    const supply = repository.list({
      workspaceId,
      jurisdiction,
      family,
      coverageTier,
      catalogState,
      targetId,
      state,
    });
    return NextResponse.json(
      enrichSourceSupplyHealthWithEvidenceMaturity(supply, intelligenceService()),
    );
  } catch (error) {
    return apiError(error);
  }
}
