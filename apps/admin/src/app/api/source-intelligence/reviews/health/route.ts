import { NextResponse } from "next/server";
import { RegistryValidationError } from "@markorbit/persistence";
import { apiError } from "@/server/api-errors";
import { resolveSourceIntelligenceBrowserReadAccess } from "@/server/source-intelligence-browser-access";
import { getSourceIntelligenceReviewService } from "@/server/source-intelligence-review-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function requireV2(value: string | null): void {
  if (value !== "2.0") {
    throw new RegistryValidationError(
      "protocolVersion=2.0 is required for D2.10 review queue operational health",
    );
  }
}

function sourceIdsValue(value: string | null): string[] {
  if (!value?.trim()) throw new RegistryValidationError("sourceIds is required");
  return value
    .split(",")
    .map((sourceId) => sourceId.trim())
    .filter(Boolean);
}

function optionalInteger(value: string | null, field: string): number | undefined {
  if (value === null || value === "") return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    throw new RegistryValidationError(`${field} must be an integer`);
  }
  return parsed;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    requireV2(url.searchParams.get("protocolVersion"));
    const sourceIds = sourceIdsValue(url.searchParams.get("sourceIds"));
    await resolveSourceIntelligenceBrowserReadAccess(request, sourceIds);
    const health = getSourceIntelligenceReviewService().health(sourceIds, {
      historyLimit: optionalInteger(url.searchParams.get("historyLimit"), "historyLimit"),
      reviewEventLimit: optionalInteger(
        url.searchParams.get("reviewEventLimit"),
        "reviewEventLimit",
      ),
    });
    return NextResponse.json({ health });
  } catch (error) {
    return apiError(error);
  }
}
