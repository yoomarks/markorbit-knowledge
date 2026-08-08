import { NextResponse } from "next/server";
import { RegistryNotFoundError } from "@markorbit/persistence";
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

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const source = getSourceRepository().getById(id);
    if (!source) throw new RegistryNotFoundError(id);
    const graph = findCompatibleSourceGraph(getSourceGraphRepository(), source);
    return NextResponse.json({ sourceId: id, graph });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const source = getSourceRepository().getById(id);
    if (!source) throw new RegistryNotFoundError(id);
    const graph = withRegistryTransaction(() =>
      projectLegacyWebSource(getSourceGraphRepository(), source),
    );
    return NextResponse.json({ sourceId: id, graph }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
