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
type RequestedProtocolVersion = "1.0" | "2.0";

function service(): SourceIntelligenceService {
  return new SourceIntelligenceService({
    sources: getSourceRepository(),
    graph: getSourceGraphRepository(),
    artifacts: getRawArtifactRepository(),
    intelligence: getSourceIntelligenceRepository(),
  });
}

function requestedProtocolVersion(value: unknown): RequestedProtocolVersion {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized || normalized === "1.0") return "1.0";
  if (normalized === "2.0") return "2.0";
  throw new RegistryValidationError("protocolVersion must be 1.0 or 2.0");
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
    const protocolVersion = requestedProtocolVersion(url.searchParams.get("protocolVersion"));
    if (sourceId && sourceIds) {
      throw new RegistryValidationError("Use sourceId or sourceIds, not both");
    }
    const intelligence = service();
    if (sourceId) {
      return NextResponse.json({
        assessment:
          protocolVersion === "2.0"
            ? intelligence.latestV2(sourceId)
            : intelligence.latest(sourceId),
      });
    }
    if (sourceIds) {
      return NextResponse.json({
        items: sourceIdsValue(sourceIds).map((id) => ({
          sourceId: id,
          assessment:
            protocolVersion === "2.0" ? intelligence.latestV2(id) : intelligence.latest(id),
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
    const protocolVersion = requestedProtocolVersion(body.protocolVersion);
    return NextResponse.json({
      assessment:
        protocolVersion === "2.0" ? service().assessV2(sourceId) : service().assess(sourceId),
    });
  } catch (error) {
    return apiError(error);
  }
}
