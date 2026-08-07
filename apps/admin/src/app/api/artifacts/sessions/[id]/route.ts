import { NextResponse } from "next/server";
import { ArtifactSessionNotFoundError } from "@markorbit/persistence/raw-artifacts";
import { apiError } from "@/server/api-errors";
import { getRawArtifactRepository } from "@/server/source-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const record = getRawArtifactRepository().getSession(id);
    if (!record) throw new ArtifactSessionNotFoundError(id);
    return NextResponse.json({ record });
  } catch (error) {
    return apiError(error);
  }
}
