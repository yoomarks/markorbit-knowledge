import { NextResponse } from "next/server";
import { isConversionClaimRequest } from "@markorbit/contracts";
import { RegistryConflictError, RegistryValidationError } from "@markorbit/persistence";
import { apiError, bearerCredential, readJson } from "@/server/api-errors";
import {
  reconcileConversionFailures,
  type ConversionFailureReconciliationResult,
} from "@/server/conversion-failure-recovery";
import { ProductionConversionWorkerService } from "@/server/production-conversion-worker-service";
import { getWorkerRegistryRepository } from "@/server/source-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type FailureRecoveryStatus =
  | ConversionFailureReconciliationResult
  | {
      status: "DEFERRED";
      workspaceId: string;
      reason: "FAILURE_RECOVERY_SCAN_FAILED";
    };

export async function POST(request: Request) {
  try {
    const credential = bearerCredential(request);
    const body = await readJson(request);
    if (!isConversionClaimRequest(body)) {
      throw new RegistryValidationError("Invalid Conversion Runtime claim request");
    }

    // Authenticate before recovery so an untrusted claim request cannot trigger control-plane work.
    const worker = getWorkerRegistryRepository().verifyCredential(body.workerId, credential);
    if (worker.workspaceId !== body.workspaceId) {
      throw new RegistryConflictError(
        "CONVERSION_WORKER_WORKSPACE_MISMATCH",
        "Worker credential belongs to another Workspace",
      );
    }

    let failureRecovery: FailureRecoveryStatus;
    try {
      failureRecovery = reconcileConversionFailures(body.workspaceId, { limit: 25 });
    } catch {
      // Recovery is derived control-plane work and must not prevent already-queued work from claim.
      failureRecovery = {
        status: "DEFERRED",
        workspaceId: body.workspaceId,
        reason: "FAILURE_RECOVERY_SCAN_FAILED",
      };
    }

    return NextResponse.json({
      ...new ProductionConversionWorkerService().claim(body, credential),
      failureRecovery,
    });
  } catch (error) {
    return apiError(error);
  }
}
