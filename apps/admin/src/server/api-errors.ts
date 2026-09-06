import { NextResponse } from "next/server";
import {
  RegistryConflictError,
  RegistryError,
  RegistryNotFoundError,
  RegistryValidationError,
} from "@markorbit/persistence";
import { CollectionPlanNotFoundError } from "@markorbit/persistence/collection-plans";
import { ConnectorNotFoundError } from "@markorbit/persistence/connectors";
import {
  ConversionProfileNotFoundError,
  ConverterNotFoundError,
} from "@markorbit/persistence/converters";
import { ExecutionRunNotFoundError } from "@markorbit/persistence/execution-ledger";
import { ExecutionAttemptNotFoundError } from "@markorbit/persistence/worker-execution";
import {
  ArtifactSessionNotFoundError,
  RawArtifactNotFoundError,
} from "@markorbit/persistence/raw-artifacts";
import {
  LeaseNotFoundError,
  WorkerAuthenticationError,
  WorkerAuthorizationError,
  WorkerNotFoundError,
} from "@markorbit/persistence/workers";
import { CaseProducerAccessError } from "./case-producer-auth";
import { ControlPlaneOwnerAccessError } from "./control-plane-owner-auth";
import { CoreIntakeTransportError } from "./core-intake-http-transport";

export type ApiErrorEnvelope = {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
};

export function apiError(error: unknown): NextResponse<ApiErrorEnvelope> {
  if (error instanceof ControlPlaneOwnerAccessError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message } },
      { status: error.httpStatus },
    );
  }
  if (error instanceof CaseProducerAccessError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message } },
      { status: error.httpStatus },
    );
  }
  if (error instanceof CoreIntakeTransportError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message } },
      { status: error.httpStatus },
    );
  }
  if (error instanceof WorkerAuthenticationError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message, details: error.details } },
      { status: 401 },
    );
  }
  if (error instanceof WorkerAuthorizationError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message, details: error.details } },
      { status: 403 },
    );
  }
  if (error instanceof RegistryValidationError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message, details: error.details } },
      { status: 400 },
    );
  }
  if (
    error instanceof RegistryNotFoundError ||
    error instanceof ConnectorNotFoundError ||
    error instanceof ConverterNotFoundError ||
    error instanceof ConversionProfileNotFoundError ||
    error instanceof CollectionPlanNotFoundError ||
    error instanceof ExecutionRunNotFoundError ||
    error instanceof ExecutionAttemptNotFoundError ||
    error instanceof WorkerNotFoundError ||
    error instanceof LeaseNotFoundError ||
    error instanceof ArtifactSessionNotFoundError ||
    error instanceof RawArtifactNotFoundError
  ) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message, details: error.details } },
      { status: 404 },
    );
  }
  if (error instanceof RegistryConflictError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message, details: error.details } },
      { status: 409 },
    );
  }
  if (error instanceof RegistryError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message, details: error.details } },
      { status: 400 },
    );
  }

  console.error("Unhandled Knowledge Registry API error", error);
  return NextResponse.json(
    { error: { code: "INTERNAL_ERROR", message: "The Knowledge Registry request failed." } },
    { status: 500 },
  );
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    const length = request.headers.get("content-length");
    if (length && Number(length) > 262_144) {
      throw new RegistryValidationError("Request body exceeds the 256 KiB limit");
    }
    return await request.json();
  } catch (error) {
    if (error instanceof RegistryValidationError) throw error;
    throw new RegistryValidationError("Request body must be valid JSON");
  }
}

export function requireRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new RegistryValidationError("Request body must be a JSON object");
  }
  return value as Record<string, unknown>;
}

export function bearerCredential(request: Request): string {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) throw new WorkerAuthenticationError();
  const credential = authorization.slice("Bearer ".length).trim();
  if (!credential) throw new WorkerAuthenticationError();
  return credential;
}

export function leaseToken(request: Request): string {
  const token = request.headers.get("x-lease-token")?.trim();
  if (!token) throw new WorkerAuthenticationError("Lease token is missing or invalid");
  return token;
}

export function workerIdHeader(request: Request): string {
  const workerId = request.headers.get("x-worker-id")?.trim();
  if (!workerId) throw new WorkerAuthenticationError("Worker ID is missing or invalid");
  return workerId;
}
