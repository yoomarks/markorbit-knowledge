import { NextResponse } from "next/server";
import { RegistryValidationError } from "@markorbit/persistence";
import { apiError, bearerCredential, readJson, requireRecord } from "@/server/api-errors";
import { getWorkerRegistryRepository } from "@/server/source-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const credential = bearerCredential(request);
    const body = requireRecord(await readJson(request));
    if (typeof body.workerId !== "string") {
      throw new RegistryValidationError("workerId is required");
    }
    const result = getWorkerRegistryRepository().claim(body.workerId.trim(), credential);
    return NextResponse.json(result);
  } catch (error) {
    return apiError(error);
  }
}
