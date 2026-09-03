import { RegistryValidationError } from "@markorbit/persistence";
import { buildSourceIntelligenceHistoricalPolicyComparisonV2 } from "@markorbit/worker-runtime";
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
        "protocolVersion=2.0 is required for D2.18 historical policy comparison",
      );
    }
    const sourceIds = csvValues(url.searchParams.get("sourceIds"));
    if (!sourceIds.length) throw new RegistryValidationError("sourceIds is required");
    await resolveSourceIntelligenceBrowserReadAccess(request, sourceIds);
    const fromAsOf = url.searchParams.get("fromAsOf");
    const toAsOf = url.searchParams.get("toAsOf");
    if (!fromAsOf) throw new RegistryValidationError("fromAsOf is required");
    if (!toAsOf) throw new RegistryValidationError("toAsOf is required");
    if (Date.parse(fromAsOf) >= Date.parse(toAsOf)) {
      throw new RegistryValidationError("fromAsOf must be earlier than toAsOf");
    }
    const service = getSourceIntelligenceReviewService();
    const from = service.historicalPolicyResolution(sourceIds, fromAsOf);
    const to = service.historicalPolicyResolution(sourceIds, toAsOf);
    return Response.json({
      historicalPolicyComparison: buildSourceIntelligenceHistoricalPolicyComparisonV2({
        from,
        to,
        generatedAt: new Date().toISOString(),
      }),
    });
  } catch (error) {
    return apiError(error);
  }
}
