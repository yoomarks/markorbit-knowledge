import { NextResponse } from "next/server";
import type { SourceDefinition } from "@markorbit/contracts";
import { RegistryError } from "@markorbit/persistence";
import {
  evaluateSourceCoverage,
  getSourceCoverageTarget,
} from "@markorbit/persistence/source-coverage";
import { resolveAdminBrowserApiReadAccess } from "@/server/admin-browser-api-access";
import { apiError } from "@/server/api-errors";
import { getSourceRepository } from "@/server/source-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const target = getSourceCoverageTarget(id);
    if (!target) {
      throw new RegistryError(
        "SOURCE_COVERAGE_TARGET_NOT_FOUND",
        `Source coverage target ${id} was not found`,
      );
    }

    const assertedWorkspaceId = new URL(request.url).searchParams.get("workspaceId")?.trim();
    if (!assertedWorkspaceId) return NextResponse.json({ target });
    const { workspaceId } = await resolveAdminBrowserApiReadAccess(request, assertedWorkspaceId);

    const repository = getSourceRepository();
    const sources: SourceDefinition[] = [];
    let offset = 0;
    while (true) {
      const page = repository.list({ workspaceId, limit: 100, offset });
      sources.push(...page.items);
      offset += page.items.length;
      if (offset >= page.total || page.items.length === 0) break;
    }

    return NextResponse.json({
      target,
      workspaceId,
      registration: evaluateSourceCoverage(sources, [target])[0],
    });
  } catch (error) {
    return apiError(error);
  }
}
