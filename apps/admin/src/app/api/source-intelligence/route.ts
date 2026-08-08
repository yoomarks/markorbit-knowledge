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

const MAX_BATCH_SOURCE_IDS = 100;

function service(): SourceIntelligenceService {
  return new SourceIntelligenceService({
    sources: getSourceRepository(),
    graph: getSourceGraphRepository(),
    artifacts: getRawArtifactRepository(),
    intelligence: getSourceIntelligenceRepository(),
  });
}

function sourceIdsValue(value: string): string[] {
  const sourceIds = [
    ...new Set(
      value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];
  if (sourceIds.length === 0) {
    throw new RegistryValidationError("sourceIds must contain at least one source id");
  }
  if (sourceIds.length > MAX_BATCH_SOURCE_IDS) {
    throw new RegistryValidationError(`sourceIds supports at most ${MAX_BATCH_SOURCE_IDS} ids`);
  }
  return sourceIds;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const sourceId = url.searchParams.get("sourceId")?.trim();
    const sourceIds = url.searchParams.get("sourceIds")?.trim();
    if (sourceId && sourceIds) {
      throw new RegistryValidationError("Use sourceId or sourceIds, not both");
    }
    const intelligence = service();
    if (sourceId) {
      return NextResponse.json({ assessment: intelligence.latest(sourceId) });
    }
    if (sourceIds) {
      return NextResponse.json({
        items: sourceIdsValue(sourceIds).map((id) => ({
          sourceId: id,
          assessment: intelligence.latest(id),
        })),
      });
    }
    throw new RegistryValidationError("sourceId or sourceIds query parameter is required");
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
