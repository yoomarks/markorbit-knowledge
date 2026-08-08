import { NextResponse } from "next/server";
import {
  isConversionFailedReport,
  isConversionOutputReadyReport,
  isConversionProgressReport,
  isConversionStartedReport,
} from "@markorbit/contracts";
import { RegistryValidationError } from "@markorbit/persistence";
import { apiError, bearerCredential, readJson } from "@/server/api-errors";
import { ProductionConversionWorkerService } from "@/server/production-conversion-worker-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const credential = bearerCredential(request);
    const body = await readJson(request);
    if (
      !isConversionStartedReport(body) &&
      !isConversionProgressReport(body) &&
      !isConversionOutputReadyReport(body) &&
      !isConversionFailedReport(body)
    ) {
      throw new RegistryValidationError("Invalid Conversion Runtime report");
    }
    const result = new ProductionConversionWorkerService().submitReport(body, credential);
    return NextResponse.json(result);
  } catch (error) {
    return apiError(error);
  }
}
