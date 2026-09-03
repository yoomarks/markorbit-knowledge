import { NextResponse } from "next/server";
import { RegistryValidationError } from "@markorbit/persistence";
import { apiError, readJson, requireRecord } from "@/server/api-errors";
import { resolveOperatorServiceMutationAccess } from "@/server/operator-service-api-access";
import { SourceCompatibilityLiveCanaryImportService } from "@/server/source-compatibility-live-canary-import";
import { getRegistryDatabase } from "@/server/source-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    resolveOperatorServiceMutationAccess(request);
    const body = requireRecord(await readJson(request));
    if (!("summary" in body)) {
      throw new RegistryValidationError("summary is required");
    }
    const result = new SourceCompatibilityLiveCanaryImportService(getRegistryDatabase()).import(
      body.summary,
    );
    return NextResponse.json(result);
  } catch (error) {
    return apiError(error);
  }
}
