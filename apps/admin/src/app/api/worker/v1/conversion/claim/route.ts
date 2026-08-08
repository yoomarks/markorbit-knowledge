import { NextResponse } from "next/server";
import { isConversionClaimRequest } from "@markorbit/contracts";
import { RegistryValidationError } from "@markorbit/persistence";
import { apiError, bearerCredential, readJson } from "@/server/api-errors";
import { ProductionConversionWorkerService } from "@/server/production-conversion-worker-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const credential = bearerCredential(request);
    const body = await readJson(request);
    if (!isConversionClaimRequest(body)) {
      throw new RegistryValidationError("Invalid Conversion Runtime claim request");
    }
    return NextResponse.json(new ProductionConversionWorkerService().claim(body, credential));
  } catch (error) {
    return apiError(error);
  }
}
