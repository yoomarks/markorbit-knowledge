import { NextResponse } from "next/server";
import { RegistryNotFoundError } from "@markorbit/persistence";
import {
  assertAdminBrowserResourceWorkspace,
  resolveAdminBrowserApiMutationAccess,
  resolveAdminBrowserApiReadAccess,
} from "@/server/admin-browser-api-access";
import { apiError } from "@/server/api-errors";
import {
  getSourceGraphRepository,
  getSourceRepository,
  withRegistryTransaction,
} from "@/server/source-registry";
import {
  findCompatibleSourceGraph,
  projectLegacyWebSource,
} from "@/server/source-graph-compatibility";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const source = getSourceRepository().getById(id);
    if (!source) throw new RegistryNotFoundError(id);
    const { principal } = await resolveAdminBrowserApiReadAccess(request, source.workspaceId);
    assertAdminBrowserResourceWorkspace(principal, source.workspaceId);
    const graph = findCompatibleSourceGraph(getSourceGraphRepository(), source);
    return NextResponse.json({ sourceId: id, graph });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const source = getSourceRepository().getById(id);
    if (!source) throw new RegistryNotFoundError(id);
    const { principal } = await resolveAdminBrowserApiMutationAccess(request, source.workspaceId);
    assertAdminBrowserResourceWorkspace(principal, source.workspaceId);
    const graph = withRegistryTransaction(() =>
      projectLegacyWebSource(getSourceGraphRepository(), source),
    );
    return NextResponse.json({ sourceId: id, graph }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
