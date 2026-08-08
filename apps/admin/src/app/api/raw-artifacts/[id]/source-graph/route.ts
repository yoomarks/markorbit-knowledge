import { NextResponse } from "next/server";
import { apiError } from "@/server/api-errors";
import { extractRawArtifactIntoSourceGraph } from "@/server/raw-artifact-source-graph";
import { getRawArtifactRepository, getSourceGraphRepository } from "@/server/source-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const result = await extractRawArtifactIntoSourceGraph(
      id,
      getRawArtifactRepository(),
      getSourceGraphRepository(),
    );
    return NextResponse.json({ result });
  } catch (error) {
    return apiError(error);
  }
}
