import { NextResponse } from "next/server";
import {
  isExecutionExecutor,
  isExecutionReceipt,
  type ExecutionExecutor,
  type ExecutionReceipt,
} from "@markorbit/contracts";
import { RegistryValidationError } from "@markorbit/persistence";
import { apiError, bearerCredential, leaseToken, readJson, requireRecord } from "./api-errors";
import { getWorkerExecutionRepository } from "./source-registry";

export type WorkerExecutionOperation = "start" | "uploading" | "verifying" | "complete" | "fail";

function requireString(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new RegistryValidationError(`${key} is required`);
  }
  return value.trim();
}

function assertOnlyKeys(body: Record<string, unknown>, keys: readonly string[]): void {
  const allowed = new Set(keys);
  const unknown = Object.keys(body).filter((key) => !allowed.has(key));
  if (unknown.length > 0) {
    throw new RegistryValidationError("Unknown execution request fields", { unknown });
  }
}

export async function handleWorkerExecution(
  request: Request,
  leaseId: string,
  operation: WorkerExecutionOperation,
) {
  try {
    const credential = bearerCredential(request);
    const token = leaseToken(request);
    const body = requireRecord(await readJson(request));
    const workerId = requireString(body, "workerId");
    const idempotencyKey = requireString(body, "idempotencyKey");
    const repository = getWorkerExecutionRepository();

    if (operation === "start") {
      assertOnlyKeys(body, ["workerId", "idempotencyKey", "executor"]);
      if (!isExecutionExecutor(body.executor)) {
        throw new RegistryValidationError("executor must satisfy Worker Execution Protocol v1");
      }
      return NextResponse.json(
        repository.start(workerId, credential, leaseId, token, {
          executor: body.executor as ExecutionExecutor,
          idempotencyKey,
        }),
      );
    }

    if (operation === "uploading") {
      assertOnlyKeys(body, ["workerId", "idempotencyKey"]);
      return NextResponse.json(
        repository.markUploading(workerId, credential, leaseId, token, { idempotencyKey }),
      );
    }

    if (operation === "verifying") {
      assertOnlyKeys(body, ["workerId", "idempotencyKey"]);
      return NextResponse.json(
        repository.markVerifying(workerId, credential, leaseId, token, { idempotencyKey }),
      );
    }

    if (operation === "complete") {
      assertOnlyKeys(body, ["workerId", "idempotencyKey", "receipt"]);
      if (!isExecutionReceipt(body.receipt)) {
        throw new RegistryValidationError("receipt must satisfy Worker Execution Protocol v1");
      }
      return NextResponse.json(
        repository.complete(workerId, credential, leaseId, token, {
          receipt: body.receipt as ExecutionReceipt,
          idempotencyKey,
        }),
      );
    }

    assertOnlyKeys(body, ["workerId", "idempotencyKey", "code", "message", "retryable"]);
    if (typeof body.retryable !== "boolean") {
      throw new RegistryValidationError("retryable must be a boolean");
    }
    return NextResponse.json(
      repository.fail(workerId, credential, leaseId, token, {
        code: requireString(body, "code"),
        message: requireString(body, "message"),
        retryable: body.retryable,
        idempotencyKey,
      }),
    );
  } catch (error) {
    return apiError(error);
  }
}
