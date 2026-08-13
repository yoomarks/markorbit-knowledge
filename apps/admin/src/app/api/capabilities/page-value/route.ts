import { NextResponse } from "next/server";
import { RegistryValidationError } from "@markorbit/persistence";
import { apiError, readJson, requireRecord } from "@/server/api-errors";
import { getPageValueCapabilityService } from "@/server/page-value-capability-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function candidateIds(value: unknown): string[] {
  if (!Array.isArray(value)) {
    throw new RegistryValidationError("candidateIds must be an array");
  }
  return value.map((item) => {
    if (typeof item !== "string") {
      throw new RegistryValidationError("candidateIds must contain strings");
    }
    return item;
  });
}

export function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const ids = url.searchParams.getAll("candidateId");
    const service = getPageValueCapabilityService();
    return NextResponse.json({
      status: service.status(),
      latest: ids.length > 0 ? service.latest(ids) : {},
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = requireRecord(await readJson(request));
    if (body.locale !== undefined && typeof body.locale !== "string") {
      throw new RegistryValidationError("locale must be a string");
    }
    if (body.objective !== undefined && typeof body.objective !== "string") {
      throw new RegistryValidationError("objective must be a string");
    }
    if (body.maxResults !== undefined && typeof body.maxResults !== "number") {
      throw new RegistryValidationError("maxResults must be a number");
    }
    const result = await getPageValueCapabilityService().screen({
      candidateIds: candidateIds(body.candidateIds),
      ...(typeof body.locale === "string" ? { locale: body.locale } : {}),
      ...(typeof body.objective === "string" ? { objective: body.objective } : {}),
      ...(typeof body.maxResults === "number" ? { maxResults: body.maxResults } : {}),
    });
    return NextResponse.json({
      status: getPageValueCapabilityService().status(),
      response: result.response,
      latest: Object.fromEntries(result.records.map((record) => [record.candidateId, record])),
    });
  } catch (error) {
    return apiError(error);
  }
}
