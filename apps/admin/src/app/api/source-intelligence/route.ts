import { NextResponse } from "next/server";
import { RegistryValidationError } from "@markorbit/persistence";
import { buildSourceIntelligenceCrossSourceObservationSummaryV2 } from "@markorbit/worker-runtime";
import { apiError, readJson, requireRecord } from "@/server/api-errors";
import {
  resolveSourceIntelligenceBrowserMutationAccess,
  resolveSourceIntelligenceBrowserReadAccess,
} from "@/server/source-intelligence-browser-access";
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
const DEFAULT_HISTORY_LIMIT = 20;
const MAX_HISTORY_LIMIT = 100;
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

function booleanQueryValue(name: string, value: string | null): boolean {
  if (value === null || value === "" || value === "false") return false;
  if (value === "true") return true;
  throw new RegistryValidationError(`${name} must be true or false`);
}

function historyLimitValue(value: string | null): number {
  if (value === null || value === "") return DEFAULT_HISTORY_LIMIT;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_HISTORY_LIMIT) {
    throw new RegistryValidationError(
      `historyLimit must be an integer between 1 and ${MAX_HISTORY_LIMIT}`,
    );
  }
  return parsed;
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
    const includeHistory = booleanQueryValue(
      "includeHistory",
      url.searchParams.get("includeHistory"),
    );
    const includeSummary = booleanQueryValue(
      "includeSummary",
      url.searchParams.get("includeSummary"),
    );
    const historyLimitRequested = url.searchParams.has("historyLimit");
    if (sourceId && sourceIds) {
      throw new RegistryValidationError("Use sourceId or sourceIds, not both");
    }
    if (historyLimitRequested && !includeHistory) {
      throw new RegistryValidationError("historyLimit requires includeHistory=true");
    }
    if (includeHistory && (protocolVersion !== "2.0" || (!sourceId && !sourceIds))) {
      throw new RegistryValidationError(
        "includeHistory requires sourceId or sourceIds with protocolVersion=2.0",
      );
    }
    if (
      includeSummary &&
      (protocolVersion !== "2.0" || !sourceIds || sourceId || !includeHistory)
    ) {
      throw new RegistryValidationError(
        "includeSummary requires sourceIds, protocolVersion=2.0, and includeHistory=true",
      );
    }
    const historyLimit = historyLimitValue(url.searchParams.get("historyLimit"));
    const intelligence = service();
    if (sourceId) {
      await resolveSourceIntelligenceBrowserReadAccess(request, [sourceId]);
      return NextResponse.json({
        assessment:
          protocolVersion === "2.0"
            ? intelligence.latestV2(sourceId)
            : intelligence.latest(sourceId),
        ...(includeHistory ? { history: intelligence.historyV2(sourceId, historyLimit) } : {}),
      });
    }
    if (sourceIds) {
      const ids = sourceIdsValue(sourceIds);
      await resolveSourceIntelligenceBrowserReadAccess(request, ids);
      if (includeHistory) {
        const items = ids.map((id) => ({
          sourceId: id,
          assessment: intelligence.latestV2(id),
          history: intelligence.historyV2(id, historyLimit),
        }));
        return NextResponse.json({
          items,
          ...(includeSummary
            ? {
                summary: buildSourceIntelligenceCrossSourceObservationSummaryV2(
                  items.map((item) => item.history),
                ),
              }
            : {}),
        });
      }
      return NextResponse.json({
        items: ids.map((id) => ({
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
    await resolveSourceIntelligenceBrowserMutationAccess(request, [sourceId]);
    const protocolVersion = requestedProtocolVersion(body.protocolVersion);
    return NextResponse.json({
      assessment:
        protocolVersion === "2.0" ? service().assessV2(sourceId) : service().assess(sourceId),
    });
  } catch (error) {
    return apiError(error);
  }
}
