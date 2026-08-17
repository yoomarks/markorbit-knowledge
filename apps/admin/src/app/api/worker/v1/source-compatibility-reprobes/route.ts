import { NextResponse } from "next/server";
import { SOURCE_COMPATIBILITY_STATES, type SourceCompatibilityState } from "@markorbit/contracts";
import { RegistryValidationError } from "@markorbit/persistence";
import { apiError, bearerCredential, readJson, requireRecord } from "@/server/api-errors";
import { getRegistryDatabase, getWorkerRegistryRepository } from "@/server/source-registry";
import {
  SOURCE_COMPATIBILITY_REPROBE_WORKER_API_VERSION,
  completeSourceCompatibilityReprobeExecution,
  failSourceCompatibilityReprobeExecution,
  startSourceCompatibilityReprobeExecution,
} from "@/server/source-compatibility-reprobe-executions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new RegistryValidationError(`${field} is required`);
  }
  return value.trim();
}

export async function POST(request: Request) {
  try {
    const credential = bearerCredential(request);
    const body = requireRecord(await readJson(request));
    const operation = requiredString(body.operation, "operation");
    const workerId = requiredString(body.workerId, "workerId");
    const dependencies = {
      database: getRegistryDatabase(),
      workers: getWorkerRegistryRepository(),
    };

    if (operation === "START") {
      const execution = startSourceCompatibilityReprobeExecution(
        {
          workerId,
          credential,
          intentId: requiredString(body.intentId, "intentId"),
          executedByActorId: requiredString(body.executedByActorId, "executedByActorId"),
          idempotencyKey: requiredString(body.idempotencyKey, "idempotencyKey"),
        },
        dependencies,
      );
      return NextResponse.json(
        { version: SOURCE_COMPATIBILITY_REPROBE_WORKER_API_VERSION, execution },
        { status: execution.replayed ? 200 : 201 },
      );
    }

    if (operation === "COMPLETE") {
      const state = requiredString(body.state, "state") as SourceCompatibilityState;
      if (!SOURCE_COMPATIBILITY_STATES.includes(state)) {
        throw new RegistryValidationError("state is invalid");
      }
      const execution = completeSourceCompatibilityReprobeExecution(
        {
          workerId,
          credential,
          executionId: requiredString(body.executionId, "executionId"),
          observedAt: requiredString(body.observedAt, "observedAt"),
          state,
        },
        dependencies,
      );
      return NextResponse.json({
        version: SOURCE_COMPATIBILITY_REPROBE_WORKER_API_VERSION,
        execution,
      });
    }

    if (operation === "FAIL") {
      const execution = failSourceCompatibilityReprobeExecution(
        {
          workerId,
          credential,
          executionId: requiredString(body.executionId, "executionId"),
          errorCode: requiredString(body.errorCode, "errorCode"),
          errorMessage: requiredString(body.errorMessage, "errorMessage"),
        },
        dependencies,
      );
      return NextResponse.json({
        version: SOURCE_COMPATIBILITY_REPROBE_WORKER_API_VERSION,
        execution,
      });
    }

    throw new RegistryValidationError("operation must be START, COMPLETE or FAIL");
  } catch (error) {
    return apiError(error);
  }
}
