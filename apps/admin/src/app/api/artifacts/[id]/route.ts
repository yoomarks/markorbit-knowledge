import { NextResponse } from "next/server";
import { RawArtifactNotFoundError } from "@markorbit/persistence/raw-artifacts";
import { apiError } from "@/server/api-errors";
import { getRawArtifactRepository } from "@/server/source-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const artifact = getRawArtifactRepository().getArtifact(id);
    if (!artifact) throw new RawArtifactNotFoundError(id);
    return NextResponse.json({ artifact });
  } catch (error) {
    return apiError(error);
  }
}
