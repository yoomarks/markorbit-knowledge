import { NextResponse } from "next/server";
import {
  SOURCE_COVERAGE_CATALOG_STATES,
  SOURCE_COVERAGE_FAMILIES,
  SOURCE_COVERAGE_PROTOCOL_VERSION,
  SOURCE_COVERAGE_TIERS,
  type SourceCoverageCatalogState,
  type SourceCoverageFamily,
  type SourceCoverageTier,
  type SourceDefinition,
} from "@markorbit/contracts";
import { RegistryValidationError } from "@markorbit/persistence";
import {
  evaluateSourceCoverage,
  listSourceCoverageTargets,
  summarizeSourceCoverage,
} from "@markorbit/persistence/source-coverage";
import { apiError } from "@/server/api-errors";
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

function listWorkspaceSources(workspaceId: string): SourceDefinition[] {
  const repository = getSourceRepository();
  const sources: SourceDefinition[] = [];
  let offset = 0;
  while (true) {
    const page = repository.list({ workspaceId, limit: 100, offset });
    sources.push(...page.items);
    offset += page.items.length;
    if (offset >= page.total || page.items.length === 0) return sources;
  }
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
    const workspaceId = search.get("workspaceId")?.trim() || undefined;

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

    if (workspaceId) {
      const sources = listWorkspaceSources(workspaceId);
      response.registration = evaluateSourceCoverage(sources, targets);
      response.workspaceId = workspaceId;
    }

    return NextResponse.json(response);
  } catch (error) {
    return apiError(error);
  }
}
