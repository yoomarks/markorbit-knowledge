import { NextResponse } from "next/server";
import { RegistryValidationError } from "@markorbit/persistence";
import { SqliteCollectionSchedulerRepository } from "@markorbit/persistence/collection-scheduler";
import { apiError, bearerCredential, readJson, requireRecord } from "@/server/api-errors";
import { getRegistryDatabase, getWorkerRegistryRepository } from "@/server/source-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function schedulerFailure(error: unknown) {
  const code =
    typeof error === "object" && error !== null && "code" in error && typeof error.code === "string"
      ? error.code
      : "SCHEDULER_TICK_FAILED";
  const message =
    error instanceof Error ? error.message.slice(0, 500) : "Unknown scheduler tick failure";
  return { code, message };
}

export async function POST(request: Request) {
  try {
    const credential = bearerCredential(request);
    const body = requireRecord(await readJson(request));
    if (typeof body.workerId !== "string") {
      throw new RegistryValidationError("workerId is required");
    }
    const workerId = body.workerId.trim();
    const workers = getWorkerRegistryRepository();

    // Authenticate before any scheduler side effect. Scheduler failures are isolated so
    // existing PENDING work remains claimable even if schedule reconciliation is degraded.
    workers.verifyCredential(workerId, credential);
    try {
      new SqliteCollectionSchedulerRepository(getRegistryDatabase()).tick();
    } catch (error) {
      console.error("collection_scheduler_tick_failed", schedulerFailure(error));
    }

    const result = workers.claim(workerId, credential);
    return NextResponse.json(result);
  } catch (error) {
    return apiError(error);
  }
}
