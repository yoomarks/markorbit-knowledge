import { NextResponse } from "next/server";
import { RegistryValidationError } from "@markorbit/persistence";
import { apiError, readJson, requireRecord } from "@/server/api-errors";
import { SourceIntelligenceService } from "@/server/source-intelligence-service";
import {
  getRawArtifactRepository,
  getSourceGraphRepository,
  getSourceIntelligenceRepository,
  getSourceRepository,
} from "@/server/source-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function service(): SourceIntelligenceService {
  return new SourceIntelligenceService({
    sources: getSourceRepository(),
    graph: getSourceGraphRepository(),
    artifacts: getRawArtifactRepository(),
    intelligence: getSourceIntelligenceRepository(),
  });
}

export async function GET(request: Request) {
  try {
    const sourceId = new URL(request.url).searchParams.get("sourceId")?.trim();
    if (!sourceId) throw new RegistryValidationError("sourceId query parameter is required");
    return NextResponse.json({ assessment: service().latest(sourceId) });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = requireRecord(await readJson(request));
    const sourceId = typeof body.sourceId === "string" ? body.sourceId.trim() : "";
    if (!sourceId) throw new RegistryValidationError("sourceId is required");
    return NextResponse.json({ assessment: service().assess(sourceId) });
  } catch (error) {
    return apiError(error);
  }
}
