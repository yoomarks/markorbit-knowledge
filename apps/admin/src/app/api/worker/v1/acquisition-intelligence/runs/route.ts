import { NextResponse } from "next/server";
import { RegistryValidationError } from "@markorbit/persistence";
import { apiError, bearerCredential, readJson, requireRecord } from "@/server/api-errors";
import { recordAcquisitionIntelligenceWorkerIntake } from "@/server/acquisition-intelligence-worker-intake";
import {
  getExecutionLedgerRepository,
  getRegistryDatabase,
  getWorkerExecutionRepository,
  getWorkerRegistryRepository,
} from "@/server/source-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const credential = bearerCredential(request);
    const body = requireRecord(await readJson(request));
    if (typeof body.workerId !== "string") {
      throw new RegistryValidationError("workerId is required");
    }
    if (!("evidence" in body)) {
      throw new RegistryValidationError("evidence is required");
    }

    return NextResponse.json(
      recordAcquisitionIntelligenceWorkerIntake(
        {
          workerId: body.workerId,
          credential,
          evidence: body.evidence,
        },
        {
          database: getRegistryDatabase(),
          workers: getWorkerRegistryRepository(),
          runs: getExecutionLedgerRepository(),
          executions: getWorkerExecutionRepository(),
        },
      ),
    );
  } catch (error) {
    return apiError(error);
  }
}
