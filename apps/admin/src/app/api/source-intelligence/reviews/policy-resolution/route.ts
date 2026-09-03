import { RegistryValidationError } from "@markorbit/persistence";
import { apiError } from "@/server/api-errors";
import { resolveSourceIntelligenceBrowserReadAccess } from "@/server/source-intelligence-browser-access";
import { getSourceIntelligenceReviewService } from "@/server/source-intelligence-review-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function csvValues(value: string | null): string[] {
  if (!value?.trim()) return [];
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    if (url.searchParams.get("protocolVersion") !== "2.0") {
      throw new RegistryValidationError(
        "protocolVersion=2.0 is required for D2.17 historical policy resolution",
      );
    }
    const sourceIds = csvValues(url.searchParams.get("sourceIds"));
    if (!sourceIds.length) throw new RegistryValidationError("sourceIds is required");
    await resolveSourceIntelligenceBrowserReadAccess(request, sourceIds);
    const asOf = url.searchParams.get("asOf");
    if (!asOf) throw new RegistryValidationError("asOf is required");
    return Response.json({
      historicalPolicyResolution: getSourceIntelligenceReviewService().historicalPolicyResolution(
        sourceIds,
        asOf,
      ),
    });
  } catch (error) {
    return apiError(error);
  }
}
