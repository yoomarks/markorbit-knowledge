import { NextResponse } from "next/server";
import {
  SOURCE_COVERAGE_CATALOG_STATES,
  SOURCE_COVERAGE_FAMILIES,
  SOURCE_COVERAGE_PROTOCOL_VERSION,
  SOURCE_COVERAGE_TIERS,
  type SourceCoverageCatalogState,
  type SourceCoverageFamily,
  type SourceCoverageTier,
} from "@markorbit/contracts";
import { RegistryValidationError } from "@markorbit/persistence";
import {
  evaluateSourceCoverage,
  listSourceCoverageTargets,
  summarizeSourceCoverage,
} from "@markorbit/persistence/source-coverage";
import { resolveAdminBrowserApiReadAccess } from "@/server/admin-browser-api-access";
import { apiError } from "@/server/api-errors";
import { listAllWorkspaceSources } from "@/server/source-pagination";
import { getSourceRepository } from "@/server/source-registry";

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

export async function GET(request: Request) {
  try {
    const search = new URL(request.url).searchParams;
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
    const jurisdiction = search.get("jurisdiction")?.trim() || undefined;
    const assertedWorkspaceId = search.get("workspaceId")?.trim() || undefined;

    const targets = listSourceCoverageTargets({
      jurisdiction,
      family,
      coverageTier,
      catalogState,
    });
    const response: Record<string, unknown> = {
      protocolVersion: SOURCE_COVERAGE_PROTOCOL_VERSION,
      targets,
      summary: summarizeSourceCoverage(targets),
    };

    if (assertedWorkspaceId) {
      const { workspaceId } = await resolveAdminBrowserApiReadAccess(request, assertedWorkspaceId);
      const sources = listAllWorkspaceSources(getSourceRepository(), workspaceId);
      response.registration = evaluateSourceCoverage(sources, targets);
      response.workspaceId = workspaceId;
    }

    return NextResponse.json(response);
  } catch (error) {
    return apiError(error);
  }
}
