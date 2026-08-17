import { NextResponse } from "next/server";
import { RegistryValidationError } from "@markorbit/persistence";
import { apiError, bearerCredential, readJson, requireRecord } from "@/server/api-errors";
import {
  getRegistryDatabase,
  getWorkerRegistryRepository,
} from "@/server/source-registry";
import { recordSourceCompatibilityWorkerIntake } from "@/server/source-compatibility-worker-intake";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const credential = bearerCredential(request);
    const body = requireRecord(await readJson(request));
    if (typeof body.workerId !== "string") {
      throw new RegistryValidationError("workerId is required");
    }
    if (!("summary" in body)) {
      throw new RegistryValidationError("summary is required");
    }

    return NextResponse.json(
      recordSourceCompatibilityWorkerIntake(
        {
          workerId: body.workerId,
          credential,
          summary: body.summary,
        },
        {
          database: getRegistryDatabase(),
          workers: getWorkerRegistryRepository(),
        },
      ),
    );
  } catch (error) {
    return apiError(error);
  }
}
