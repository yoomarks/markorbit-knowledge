import { NextResponse } from "next/server";
import { SqliteSourceCompatibilityObservationRepository } from "@markorbit/persistence/source-compatibility-observations";
import { parseRepresentativeLiveCanarySummary } from "@markorbit/persistence/source-compatibility-import";
import { apiError } from "@/server/api-errors";
import { getRegistryDatabase } from "@/server/source-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as unknown;
    const inputs = parseRepresentativeLiveCanarySummary(body);
    const repository = new SqliteSourceCompatibilityObservationRepository(getRegistryDatabase());
    const recorded = repository.recordMany(inputs);
    return NextResponse.json({
      version: "SOURCE_COMPATIBILITY_INTAKE_V1",
      recorded: recorded.length,
      observedAt: recorded[0]?.observedAt ?? null,
      states: recorded.reduce(
        (counts, item) => {
          counts[item.state] += 1;
          return counts;
        },
        { PASS: 0, DEGRADED: 0, BLOCKED: 0 },
      ),
    });
  } catch (error) {
    return apiError(error);
  }
}
